import type { TabId } from './types';

// Visible navigation. 'detail' is intentionally NOT here — it's a drill-in
// view opened by clicking a brainrot anywhere, with its own back button.
// Removed in the v4 redesign: '👤 Dashboard' (duplicated Overview/Watchlist)
// and 'Raw Data' (Export All covers it; Detail shows per-pet listings).
export const TABS: { id: TabId; label: string; accent?: boolean }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'brainrots', label: 'Market' },
  { id: 'recs', label: 'What to Steal', accent: true },
  { id: 'trending', label: 'Trending' },
  { id: 'mutations', label: 'Mutations' },
  { id: 'sellers', label: 'Sellers' },
  { id: 'sold', label: 'Sold' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'config', label: 'Config', accent: true },
];

export const RARITY_COLORS: Record<string, string> = {
  Common: '#78909c', Uncommon: '#66bb6a', Rare: '#42a5f5', Epic: '#ab47bc', Legendary: '#ffa726',
  Mythical: '#ef5350', Secret: '#7c4dff', OG: '#26a69a', Festive: '#66bb6a',
  Admin: '#ff5252', 'Brainrot God': '#ffd740', Taco: '#ffab40', Valentines: '#f48fb1',
};

export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythical', 'Secret', 'OG', 'Festive', 'Valentines', 'Taco', 'Admin', 'Brainrot God'];

export const TIER_CLS: Record<string, string> = { S: 'tier-S', A: 'tier-A', B: 'tier-B', C: 'tier-C', D: 'tier-D' };

// Full in-game mutation table (June 2026). Eldorado spells "Yin-Yang" with
// a hyphen in listing data — keep BOTH keys so lookups never miss.
// Disco (12x) is confirmed in game data but unreleased.
// Phantom: brand new (June 11 2026) — multiplier is an ESTIMATE until
// confirmed (no listings or guides exist yet); the scraper captures any
// Phantom listings automatically the moment they appear on Eldorado.
export const MUTATION_MULTIPLIERS: Record<string, number> = {
  'None': 1, 'Extinct': 1, 'Gold': 1.25, 'Diamond': 1.5, 'Bloodrot': 2,
  'Candy': 4, 'Lava': 6, 'Galaxy': 7, 'Yin Yang': 7.5, 'Yin-Yang': 7.5,
  'Radioactive': 8.5, 'Cursed': 9, 'Rainbow': 10, 'Divine': 10,
  'Cyber': 11, 'Disco': 12, 'Phantom': 12,
};

export const MUTATION_COLORS: Record<string, string> = {
  'Gold': '#ffd700', 'Diamond': '#b9f2ff', 'Bloodrot': '#d32f2f', 'Candy': '#ff80ab',
  'Lava': '#ff4500', 'Galaxy': '#7c4dff', 'Yin Yang': '#e0e0e0', 'Yin-Yang': '#e0e0e0',
  'Radioactive': '#76ff03', 'Extinct': '#78909c', 'Cursed': '#00e676',
  'Rainbow': '#ff4081', 'Divine': '#ffd740', 'Cyber': '#00e5ff', 'Disco': '#e040fb',
  'Phantom': '#90a4ae',
};

// Lower = higher priority. OG is always #1, Brainrot God is #2.
export const RARITY_WEIGHT: Record<string, number> = {
  'OG': 0, 'Brainrot God': 1, Admin: 2, Secret: 3, Mythical: 4,
  Legendary: 5, Taco: 6, Valentines: 6, Festive: 6,
  Epic: 7, Rare: 8, Uncommon: 9, Common: 10,
};

// Rarity score bonus for recommendation engine (added to base score)
export const RARITY_SCORE_BONUS: Record<string, number> = {
  'OG': 35, 'Brainrot God': 35, Admin: 30, Secret: 25, Mythical: 20,
  Legendary: 15, Taco: 12, Valentines: 12, Festive: 12,
  Epic: 8, Rare: 4, Uncommon: 1, Common: 0,
};

// Rarity tier floor — minimum tier a rarity can be assigned
// Ensures OG pets never drop below B-tier even with low market activity
export const RARITY_TIER_FLOOR: Record<string, string> = {
  'OG': 'A', 'Brainrot God': 'A', Admin: 'A', Secret: 'B', Mythical: 'B',
  Legendary: 'C', Taco: 'C', Valentines: 'C', Festive: 'C',
  Epic: 'D', Rare: 'D', Uncommon: 'D', Common: 'D',
};
