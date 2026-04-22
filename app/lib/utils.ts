import type { Config, WLItem, MutationAdvisory, Recommendation } from './types';
import { RARITY_ORDER, RARITY_WEIGHT, MUTATION_MULTIPLIERS } from './constants';

/* ─── Rarity Helpers (shared by ConfigTab + UserDashTab) ─── */
export const getRarityWeight = (r: string) => RARITY_WEIGHT[r] ?? 7;

/**
 * Unified priority calculator — used by BOTH ConfigTab and page.tsx addToWL.
 * Lower number = higher priority (0 is first).
 *
 * Formula: rarity weight provides the primary tier (0-10), then strategy score
 * and market data refine within that tier. Items with the same rarity are
 * differentiated by their score/sold data.
 *
 * Output range: 0–100 (clamped). OG items with high scores → ~0, Common items
 * with low scores → ~100.
 */
export function computePriority(rec: { rarity?: string; score?: number; soldCount?: number; med?: number } | null | undefined): number {
  if (!rec) return 50;
  const rarityW = getRarityWeight(rec.rarity || '');
  // Rarity contributes 0-70 (weight 0-10 * 7)
  const rarityComponent = rarityW * 7;
  // Score contributes 0-20 (inverted: higher score = lower priority number)
  const score = rec.score ?? 0;
  const scoreComponent = Math.max(0, 20 - Math.min(20, score * 0.2));
  // Sold count contributes 0-10 (more sold = lower priority number = higher priority)
  const sold = rec.soldCount ?? 0;
  const soldComponent = Math.max(0, 10 - Math.min(10, Math.log2(sold + 1) * 2));
  const priority = Math.round(rarityComponent + scoreComponent + soldComponent);
  return Math.max(0, Math.min(100, priority));
}

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
export function smartMinValue(rec?: { min?: number; med?: number; p10?: number; p25?: number; rarity?: string; flipScore?: number; listings?: number; medianPrice?: number; minPrice?: number } | null): number {
  if (!rec) return 1000000;

  const { rarity } = rec;

  // OG, Admin — always 1M gems (buy everything, these are always valuable)
  if (rarity === 'OG' || rarity === 'Admin') return 1000000;

  // Brainrot God — always 1M gems (high rarity, always worth sniping)
  if (rarity === 'Brainrot God') return 1000000;

  // For other rarities, calculate based on median price in USD
  // Use medianPrice (from Brainrot) or med (from Recommendation)
  const med = rec.med ?? (rec as any).medianPrice ?? 0;
  const min = rec.min ?? (rec as any).minPrice ?? 0;

  // If no price data, default to 1M
  if (med <= 0 && min <= 0) return 1000000;

  const price = med > 0 ? med : min;

  // Price-to-gems conversion thresholds:
  // These are gem min_values that make sense for the auto-joiner
  // Higher median price = higher gem threshold to avoid junk listings
  //
  // $500+  → 1B gems  (ultra-premium combos like La Romantic Grande)
  // $200+  → 700M gems
  // $100+  → 500M gems
  // $50+   → 400M gems
  // $20+   → 300M gems
  // $10+   → 200M gems
  // $5+    → 100M gems
  // $2+    → 1M gems (floor — buy anything)
  // <$2    → 1M gems (floor)

  if (price >= 500) return 1000000000;
  if (price >= 200) return 700000000;
  if (price >= 100) return 500000000;
  if (price >= 50) return 400000000;
  if (price >= 20) return 300000000;
  if (price >= 10) return 200000000;
  if (price >= 5) return 100000000;
  return 1000000;
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

    // Use smartMinValue-style tiered conversion for the mutation's USD price.
    // This ensures mutation overrides use the same USD→gems logic as base items.
    // We create a synthetic rec with the mutation's median price to get accurate gems.
    const recommendedOverride = smartMinValue({ med: avgMed, rarity: rec.rarity });

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
