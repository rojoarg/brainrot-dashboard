import type { Config, WLItem, MutationAdvisory, Recommendation } from './types';
import { RARITY_ORDER, RARITY_WEIGHT, MUTATION_MULTIPLIERS } from './constants';

/* ─── Rarity Helpers (shared by ConfigTab + UserDashTab) ─── */
export const getRarityWeight = (r: string) => RARITY_WEIGHT[r] ?? 7;

/**
 * Returns the highest mutation median price for a recommendation.
 * Used to catch valuable mutations even when the base pet is cheap.
 * e.g. Money Money Puggy base=$1 but Cursed=$30 → returns 30.
 */
export function getMaxMutationPrice(rec: Recommendation | null | undefined): number {
  if (!rec?.bestCombos || rec.bestCombos.length === 0) return 0;
  let max = 0;
  for (const c of rec.bestCombos) {
    const m = c.mut || c.mutation || 'None';
    if (m === 'None') continue;
    const med = c.med ?? c.medianPrice ?? 0;
    if (isFinite(med) && med > max) max = med;
  }
  return max;
}

/**
 * Returns a summary of mutation data for display.
 * Aggregates properly per mutation (averages prices across combos for same mutation),
 * consistent with how getMutationAdvisory calculates.
 */
export function getMutationSummary(rec: Recommendation | null | undefined): { count: number; maxPrice: number; maxName: string; totalListings: number } {
  if (!rec?.bestCombos || rec.bestCombos.length === 0) return { count: 0, maxPrice: 0, maxName: '', totalListings: 0 };
  // Group combos by mutation name, then average prices per mutation
  const byMut: Record<string, { prices: number[]; listings: number }> = {};
  for (const c of rec.bestCombos) {
    const m = c.mut || c.mutation || 'None';
    if (m === 'None') continue;
    if (!byMut[m]) byMut[m] = { prices: [], listings: 0 };
    const med = c.med ?? c.medianPrice ?? 0;
    if (isFinite(med) && med > 0) byMut[m].prices.push(med);
    byMut[m].listings += c.n ?? c.count ?? 0;
  }
  let count = 0;
  let maxPrice = 0;
  let maxName = '';
  let totalListings = 0;
  for (const [mut, data] of Object.entries(byMut)) {
    count++;
    totalListings += data.listings;
    const avgPrice = data.prices.length > 0 ? data.prices.reduce((s, p) => s + p, 0) / data.prices.length : 0;
    if (avgPrice > maxPrice) {
      maxPrice = avgPrice;
      maxName = mut;
    }
  }
  return { count, maxPrice, maxName, totalListings };
}

/**
 * Unified priority calculator — used by BOTH ConfigTab and page.tsx addToWL.
 * Lower number = higher priority (0 is first).
 *
 * Formula: PRICE is the primary signal (more expensive = higher priority for the
 * auto-joiner since these are the items worth spending gems on). Score and sold
 * count refine within price tiers. Rarity is a minor tiebreaker.
 *
 * Output range: 0–100 (clamped). $6000 Headless Horseman → ~0, $1 junk → ~90+.
 */
export function computePriority(rec: { rarity?: string; score?: number; soldCount?: number; med?: number; bestCombos?: any[] } | null | undefined): number {
  if (!rec) return 50;
  // Use the HIGHER of base median or max mutation price for priority calc.
  // A pet with base=$1 but Cursed=$30 should have priority ~35, not ~80.
  const baseMed = isFinite(rec.med ?? 0) ? (rec.med ?? 0) : 0;
  const maxMut = getMaxMutationPrice(rec as any);
  const med = Math.max(baseMed, maxMut);
  // Price contributes 0-60 (inverted: higher price = lower number = higher priority)
  const priceComponent = med >= 500 ? 0 : med >= 200 ? 10 : med >= 100 ? 15
    : med >= 50 ? 25 : med >= 20 ? 35 : med >= 10 ? 40
    : med >= 5 ? 45 : med >= 2 ? 50 : 60;
  // Score contributes 0-20 (inverted: higher score = lower priority number)
  const score = isFinite(rec.score ?? 0) ? (rec.score ?? 0) : 0;
  const scoreComponent = Math.max(0, 20 - Math.min(20, score * 0.2));
  // Sold count contributes 0-10 (more sold = lower priority number)
  const sold = isFinite(rec.soldCount ?? 0) ? (rec.soldCount ?? 0) : 0;
  const soldComponent = Math.max(0, 10 - Math.min(10, Math.log2(sold + 1) * 2));
  // Rarity is just a minor tiebreaker (0-10)
  const rarityW = getRarityWeight(rec.rarity || '');
  const rarityComponent = rarityW; // 0-10 direct, not multiplied
  const priority = Math.round(priceComponent + scoreComponent + soldComponent + rarityComponent);
  return Math.max(0, Math.min(100, priority));
}

/**
 * Master sort: price tier → rarity (tiebreaker) → strategy-specific sort.
 * Higher-value items float to the top. Rarity only matters between items
 * in the same price range — a $50 Legendary beats a $1 Secret.
 */
export function masterSort(a: Recommendation, b: Recommendation, stratSort: (a: Recommendation, b: Recommendation) => number): number {
  // Price tier: group into tiers so $500 items always beat $20 items
  const priceTier = (med: number) => med >= 500 ? 0 : med >= 100 ? 1 : med >= 20 ? 2 : med >= 5 ? 3 : 4;
  const pa = priceTier(a.med ?? 0);
  const pb = priceTier(b.med ?? 0);
  if (pa !== pb) return pa - pb;
  // Within same price tier, rarity is a tiebreaker
  const ra = getRarityWeight(a.rarity);
  const rb = getRarityWeight(b.rarity);
  if (ra !== rb) return ra - rb;
  // Then strategy sort
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
 * Gem budget mode — different strategies need different gem tiers.
 *
 * 'default'  = All-Star, Sniper, Whale, Trending, Diversified
 *              Full gem budgets for competitive buying
 * 'farmer'   = Farmer
 *              Uses p25 pricing, tighter gem budgets (volume focus)
 * 'budget'   = Budget
 *              Tightest gem budgets, only buy cheap deals
 * 'flipper'  = Flipper
 *              Uses min price, moderate budgets (buy low)
 */
export type GemMode = 'default' | 'farmer' | 'budget' | 'flipper';

/**
 * Smart min_value calculator — determines the gem budget for the auto-joiner.
 *
 * INVERTED logic: expensive USD items get LOW gem thresholds (always buy —
 * a $440 Skibidi Toilet is a goldmine at any gem price). Cheap USD items get
 * HIGHER gem thresholds because they're commonly traded for gems in-game.
 *
 * Strategy-aware: Farmer/Budget use tighter, more appropriate tiers.
 * Premium items ($20+) ALWAYS get 1M across all strategies — these are
 * no-brainer grabs regardless of strategy.
 *
 * @param rec Recommendation or Brainrot with price data
 * @param priceOverride Optional: override which price to use for tier calc
 * @param mode Strategy gem mode — controls which tier table to use
 * @returns min_value in gems (always ≥ 1,000,000)
 */
export function smartMinValue(
  rec?: { min?: number; med?: number; p10?: number; p25?: number; rarity?: string; flipScore?: number; listings?: number; medianPrice?: number; minPrice?: number } | null,
  priceOverride?: number,
  mode: GemMode = 'default'
): number {
  if (!rec) return 1000000;

  // Use medianPrice (from Brainrot) or med (from Recommendation)
  const med = rec.med ?? (rec as any).medianPrice ?? 0;
  const min = rec.min ?? (rec as any).minPrice ?? 0;

  // If no price data, default to 1M (floor)
  if (med <= 0 && min <= 0) return 1000000;

  // Strategy-aware price selection:
  // - Farmer uses p25 (25th percentile — realistic cheap price, avoids lowball outliers)
  // - Flipper uses min (buy the cheapest listing)
  // - Budget uses p25 if available, else min
  // - Default uses median
  let price: number;
  if (priceOverride != null && priceOverride > 0) {
    price = priceOverride;
  } else if (mode === 'farmer') {
    price = rec.p25 ?? rec.min ?? med;
  } else if (mode === 'flipper') {
    price = rec.min ?? med;
  } else if (mode === 'budget') {
    price = rec.p25 ?? rec.min ?? med;
  } else {
    price = med > 0 ? med : min;
  }

  // ═══ UNIVERSAL RULE: Premium items are ALWAYS worth grabbing ═══
  // A $40 Dragon, $440 Skibidi Toilet, $200 Meowl — these are goldmines
  // at ANY gem price. Every strategy should grab these at 1M (floor).
  if (price >= 20) return 1000000;

  // ═══ STRATEGY-SPECIFIC GEM TIERS ═══

  if (mode === 'farmer') {
    // Farmer = VOLUME buying, cheap items, conservative gem spend.
    // A $5 Garama shouldn't cost 1.5B gems to farm — that's All-Star money.
    // Farmer buys in bulk at modest gem prices.
    //
    // $10-20  → 50M    (solid finds, worth moderate gems)
    // $5-10   → 100M   (bread and butter farming range)
    // $2-5    → 300M   (cheap farm targets)
    // <$2     → 50M    (filler)
    if (price >= 10) return 50000000;
    if (price >= 5) return 100000000;
    if (price >= 2) return 300000000;
    return 50000000;
  }

  if (mode === 'budget') {
    // Budget = CHEAPEST possible gem spend, high ROI focus.
    // Even tighter than Farmer — only spend gems when the deal is great.
    //
    // $10-20  → 50M
    // $5-10   → 50M
    // $2-5    → 100M
    // $1-2    → 50M
    if (price >= 5) return 50000000;
    if (price >= 2) return 100000000;
    return 50000000;
  }

  if (mode === 'flipper') {
    // Flipper = buy low sell high, moderate gem spend.
    // Slightly lower than default since you're targeting underpriced listings.
    //
    // $10-20  → 500M
    // $5-10   → 1B
    // $2-5    → 1.5B
    // <$2     → 1M
    if (price >= 10) return 500000000;
    if (price >= 5) return 1000000000;
    if (price >= 2) return 1500000000;
    return 1000000;
  }

  // ═══ DEFAULT (All-Star, Sniper, Whale, Trending, Diversified) ═══
  // Full competitive gem budgets for serious buying.
  //
  // $10-20  → 1B    (good items — standard gem budget)
  // $5-10   → 1.5B  (mid-range trades)
  // $2-5    → 2B    (cheap common trades — max gem budget)
  // <$2     → 1M    (junk floor — shouldn't be in config)
  if (price >= 10) return 1000000000;
  if (price >= 5) return 1500000000;
  if (price >= 2) return 2000000000;
  return 1000000;
}

/* ─── Mutation Advisory ─── */
/**
 * Analyzes ALL mutations for a recommendation and returns advisory data.
 *
 * Key change from v2: ALL mutations with listings are included (not just 1.5x overrides).
 * Each mutation gets its own gem budget based on its own median price, because
 * mutations can fundamentally change an item's value (e.g., Cyber Garama vs base Garama
 * can be 5-10x different).
 *
 * `needsOverride` is now true for ANY mutation with at least 1 listing AND a different
 * price from base, ensuring the config always has per-mutation gem budgets.
 *
 * @param rec Recommendation with bestCombos data
 * @param gemMode Optional gem mode for strategy-aware gem pricing
 * @returns Array of mutation advisories, sorted by price ratio (highest first)
 */
export function getMutationAdvisory(rec: Recommendation, gemMode: GemMode = 'default'): MutationAdvisory[] {
  if (!rec?.bestCombos || rec.bestCombos.length === 0) return [];

  const baseCombos = rec.bestCombos.filter(c => c.mut === 'None' || !c.mut);
  let baseMed = baseCombos.length > 0
    ? baseCombos.reduce((s, c) => s + (c.med || 0), 0) / baseCombos.length
    : rec.med || rec.min || 0;

  // If base price is 0 but mutations exist, don't bail — mutations still need gem budgets.
  // Use 0.01 as floor to prevent division-by-zero in priceRatio.
  if (baseMed <= 0) baseMed = 0.01;

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

    // Each mutation gets its OWN gem budget based on its own median price.
    // Strategy-aware: Farmer mutations get Farmer gem tiers, etc.
    const recommendedOverride = smartMinValue({ med: avgMed, rarity: rec.rarity }, undefined, gemMode);

    advisories.push({
      mutation: mut,
      multiplier,
      medianPrice: avgMed,
      baseMedPrice: baseMed,
      priceRatio: Math.round(priceRatio * 10) / 10,
      listings: totalListings,
      recommendedOverride,
      // Include ALL mutations with listings — mutations are fundamentally
      // different items that need their own gem budgets, not just overrides
      // at extreme price ratios. Even a 1.2x mutation should have its own budget.
      needsOverride: totalListings >= 1,
    });
  }

  return advisories.sort((a, b) => b.priceRatio - a.priceRatio);
}

/* ─── Config Helpers ─── */
export const buildConfigJSON = (config: Config, recommendations?: Recommendation[], gemMode: GemMode = 'default') => ({
  blacklisted: config.blacklisted || [],
  whitelisted: config.whitelisted.map((w: WLItem, i: number) => {
    const base: { pet_name: string; priority: number; min_value: number; mutations?: Record<string, number> } = {
      pet_name: w.pet_name,
      priority: w.priority ?? i,
      min_value: w.min_value || 1000000,
    };
    // Include mutations: either from the WLItem itself or computed from recommendations.
    // ALL mutations with listings get individual gem budgets — mutations are
    // fundamentally different items that can be worth wildly different amounts.
    if (w.mutations && Object.keys(w.mutations).length > 0) {
      base.mutations = w.mutations;
    } else if (recommendations) {
      const rec = recommendations.find(r => r.name.toLowerCase() === w.pet_name.toLowerCase());
      if (rec) {
        const advisory = getMutationAdvisory(rec, gemMode);
        const withOverrides = advisory.filter(a => a.needsOverride);
        if (withOverrides.length > 0) {
          base.mutations = {};
          for (const o of withOverrides) {
            base.mutations[o.mutation] = o.recommendedOverride;
          }
        }
      }
    }
    return base;
  }),
  version: '1.0',
});

export const downloadConfigJSON = (config: Config, toast?: (msg: string) => void, recommendations?: Recommendation[], gemMode: GemMode = 'default') => {
  const exportObj = buildConfigJSON(config, recommendations, gemMode);
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
