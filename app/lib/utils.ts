import type { Config, WLItem, MutationAdvisory, Recommendation } from './types';
import { RARITY_ORDER, RARITY_WEIGHT, MUTATION_MULTIPLIERS } from './constants';

/* ─── Rarity Helpers (shared by ConfigTab + UserDashTab) ─── */
export const getRarityWeight = (r: string) => RARITY_WEIGHT[r] ?? 6;

/**
 * Master sort: rarity tier → sold count → strategy-specific sort.
 * OGs/Secrets/premium rarities always float to the top across ALL strategies.
 */
export function masterSort(a: Recommendation, b: Recommendation, stratSort: (a: Recommendation, b: Recommendation) => number): number {
  const ra = getRarityWeight(a.rarity);
  const rb = getRarityWeight(b.rarity);
  if (ra !== rb) return ra - rb;
  const soldDiff = (b.soldCount || 0) - (a.soldCount || 0);
  if (soldDiff !== 0) return soldDiff;
  return stratSort(a, b);
}

/* ─── Formatters ─── */
export const fmt = (n: number) => {
  if (n == null || isNaN(n) || !isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return sign + (abs >= 1e6 ? (abs / 1e6).toFixed(1) + 'M' : abs >= 1e3 ? (abs / 1e3).toFixed(1) + 'K' : abs.toFixed(abs < 10 ? 2 : 0));
};

export const fmtPrice = (n: number) => '$' + (n == null || isNaN(n) || !isFinite(n) ? '0.00' : n >= 1000 ? fmt(n) : n.toFixed(2));

export const fmtMinValue = (v: number) => {
  if (v >= 1e9) return (v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return v.toString();
};

export const timeAgo = (d: string) => {
  if (!d) return '—';
  const t = new Date(d).getTime();
  if (isNaN(t)) return '—';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 0) return '—';
  return m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago';
};

export const raritySort = (a: string, b: string) =>
  (RARITY_ORDER.indexOf(a) === -1 ? 99 : RARITY_ORDER.indexOf(a)) -
  (RARITY_ORDER.indexOf(b) === -1 ? 99 : RARITY_ORDER.indexOf(b));

/**
 * Smart min_value calculator — determines the threshold below which the auto-joiner
 * should buy. Uses market data to find deals: targets the p25 price (25th percentile)
 * so you're buying in the bottom quartile of listings.
 *
 * For high-value rarities (OG, Secret, Mythical): more aggressive — uses p10-p25
 * For common items: conservative — uses min price with small buffer
 * For items with good flip potential: uses min + small buffer to catch underpriced listings
 *
 * @param rec Recommendation object with price data and metadata
 * @returns min_value in gems (always ≥ 1,000,000 = $100 floor)
 */
export function smartMinValue(rec?: { min?: number; med?: number; p10?: number; p25?: number; rarity?: string; flipScore?: number; listings?: number } | null): number {
  if (!rec) return 1000000;

  const { min, med, p10, p25, rarity, flipScore, listings } = rec;

  // If no meaningful price data, default high (won't filter anything)
  // min and med must be positive numbers to calculate meaningful targets
  if (min == null || min <= 0 || med == null || med <= 0) return 1000000;

  const RARITY_AGGRESSION: Record<string, number> = {
    'OG': 0.85, 'Brainrot God': 0.85, Admin: 0.80, Secret: 0.75, Mythical: 0.70,
    Legendary: 0.60, Taco: 0.55, Valentines: 0.55, Festive: 0.55,
    Epic: 0.45, Rare: 0.35, Uncommon: 0.25, Common: 0.15,
  };

  const aggression = (rarity ? RARITY_AGGRESSION[rarity] : undefined) ?? 0.3;

  // Base: blend between p25 and median, weighted by aggression
  // High aggression (OG) = closer to median (willing to pay more)
  // Low aggression (Common) = closer to min (only buy cheap)
  const baseTarget = (p25 ?? 0) > 0
    ? (p25 ?? 0) * (1 - aggression) + med * aggression
    : min * (1 + aggression * 0.5);

  // Flip bonus: if flip score is high, widen the buy range slightly
  const flipBonus = (flipScore ?? 0) > 5 ? 1.15 : (flipScore ?? 0) > 3 ? 1.08 : 1.0;

  // Liquidity penalty: if very few listings, be more conservative
  const listingCount = Math.max(0, listings ?? 0);
  const liquidityFactor = listingCount >= 10 ? 1.0 : listingCount >= 3 ? 0.9 : 0.75;

  const target = baseTarget * flipBonus * liquidityFactor;

  // min_value is in gems — 1,000,000 is the absolute floor for all items
  // The calculated target is a USD price, convert to gems (* 10000) and enforce 1M floor
  if (!isFinite(target) || isNaN(target)) return 1000000;
  return Math.max(Math.round(target * 10000), 1000000);
}

/* ─── Mutation Advisory ─── */
export function getMutationAdvisory(rec: Recommendation): MutationAdvisory[] {
  if (!rec?.bestCombos || rec.bestCombos.length === 0) return [];

  const baseCombos = rec.bestCombos.filter(c => c.mut === 'None' || !c.mut);
  const baseMed = baseCombos.length > 0
    ? baseCombos.reduce((s, c) => s + (c.med || 0), 0) / baseCombos.length
    : rec.med || rec.min || 0;

  if (baseMed <= 0) return [];

  const advisories: MutationAdvisory[] = [];
  const byMut: Record<string, typeof rec.bestCombos> = {};
  for (const c of rec.bestCombos) {
    const m = c.mut || 'None';
    if (m === 'None') continue;
    if (!byMut[m]) byMut[m] = [];
    byMut[m].push(c);
  }

  for (const [mut, combos] of Object.entries(byMut)) {
    if (combos.length === 0) continue;
    const totalListings = combos.reduce((s, c) => s + (c.n || 0), 0);
    const avgMed = combos.reduce((s, c) => s + (c.med || 0), 0) / combos.length;
    const priceRatio = baseMed > 0 ? avgMed / baseMed : 1;
    if (!isFinite(priceRatio) || isNaN(priceRatio)) continue;
    const multiplier = MUTATION_MULTIPLIERS[mut] || 0;
    const safePriceRatio = Math.max(1, Math.min(priceRatio, 20));
    const recommendedOverride = Math.max(Math.round(avgMed * safePriceRatio * 10000), 1000000);

    advisories.push({
      mutation: mut,
      multiplier,
      medianPrice: avgMed,
      baseMedPrice: baseMed,
      priceRatio: Math.round(priceRatio * 10) / 10,
      listings: totalListings,
      recommendedOverride,
      needsOverride: priceRatio >= 1.5 && totalListings >= 1,
    });
  }

  return advisories.sort((a, b) => b.priceRatio - a.priceRatio);
}

/* ─── Config Helpers ─── */
export const buildConfigJSON = (config: Config, recommendations?: Recommendation[]) => ({
  blacklisted: config.blacklisted || [],
  whitelisted: config.whitelisted.map((w: WLItem, i: number) => {
    const base: { pet_name: string; priority: number; min_value: number; mutations?: Record<string, number> } = {
      pet_name: w.pet_name,
      priority: w.priority ?? i,
      min_value: w.min_value || 1000000,
    };
    // Include mutations: either from the WLItem itself or computed from recommendations
    if (w.mutations && Object.keys(w.mutations).length > 0) {
      base.mutations = w.mutations;
    } else if (recommendations) {
      const rec = recommendations.find(r => r.name.toLowerCase() === w.pet_name.toLowerCase());
      if (rec) {
        const advisory = getMutationAdvisory(rec);
        const overrides = advisory.filter(a => a.needsOverride);
        if (overrides.length > 0) {
          base.mutations = {};
          for (const o of overrides) {
            base.mutations[o.mutation] = o.recommendedOverride;
          }
        }
      }
    }
    return base;
  }),
  version: '1.0',
});

export const downloadConfigJSON = (config: Config, toast?: (msg: string) => void, recommendations?: Recommendation[]) => {
  const exportObj = buildConfigJSON(config, recommendations);
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brainrot-config-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const mutCount = exportObj.whitelisted.filter(w => w.mutations && Object.keys(w.mutations).length > 0).length;
  if (toast) toast(`Exported ${exportObj.whitelisted.length} items` + (mutCount > 0 ? ` (${mutCount} with mutation overrides)` : ''));
};

export function exportData(data: unknown, filename: string, type: 'json' | 'csv' = 'json') {
  let content: string;
  let mime: string;
  if (type === 'csv') {
    if (!Array.isArray(data) || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const escapeCSV = (val: unknown) => {
      const str = String(val ?? '');
      // Escape double quotes by doubling them, then wrap in quotes
      const escaped = str.replace(/"/g, '""');
      // Prefix formula-like cells with tab to prevent CSV injection in spreadsheet apps
      if (/^[=+@\-\t\r]/.test(escaped)) return '"' + "'" + escaped + '"';
      return '"' + escaped + '"';
    };
    const rows = data.map((row: Record<string, unknown>) => headers.map(h => escapeCSV(row[h])).join(','));
    content = [headers.join(','), ...rows].join('\n');
    mime = 'text/csv';
  } else {
    content = JSON.stringify(data, null, 2);
    mime = 'application/json';
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.${type}`; a.click();
  URL.revokeObjectURL(url);
}
