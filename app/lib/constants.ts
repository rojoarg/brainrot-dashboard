import type { TabId } from './types';

export const TABS: { id: TabId; label: string; accent?: boolean }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'brainrots', label: 'All Brainrots' },
  { id: 'detail', label: 'Detail' },
  { id: 'recs', label: 'What to Steal', accent: true },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'sellers', label: 'Sellers' },
  { id: 'sold', label: 'Sold / Delisted' },
  { id: 'trending', label: 'Trending' },
  { id: 'mutations', label: 'Mutations & M/s' },
  { id: 'user', label: '👤 Dashboard' },
  { id: 'config', label: 'Config', accent: true },
  { id: 'raw', label: 'Raw Data' },
];

export const RARITY_COLORS: Record<string, string> = {
  Common: '#78909c', Uncommon: '#66bb6a', Rare: '#42a5f5', Epic: '#ab47bc', Legendary: '#ffa726',
  Mythical: '#ef5350', Secret: '#7c4dff', OG: '#26a69a', Festive: '#66bb6a',
  Admin: '#ff5252', 'Brainrot God': '#ffd740', Taco: '#ffab40', Valentines: '#f48fb1',
};

export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythical', 'Secret', 'OG', 'Festive', 'Valentines', 'Taco', 'Admin', 'Brainrot God'];

export const TIER_CLS: Record<string, string> = { S: 'tier-S', A: 'tier-A', B: 'tier-B', C: 'tier-C', D: 'tier-D' };

export const MUTATION_MULTIPLIERS: Record<string, number> = {
  'None': 1, 'Lava': 6, 'Galaxy': 7, 'Yin Yang': 7.5,
  'Radioactive': 8.5, 'Extinct': 0, 'Cursed': 9, 'Rainbow': 10,
  'Divine': 10, 'Cyber': 11,
};

export const MUTATION_COLORS: Record<string, string> = {
  'Lava': '#ff4500', 'Galaxy': '#7c4dff', 'Yin Yang': '#e0e0e0',
  'Radioactive': '#76ff03', 'Extinct': '#78909c', 'Cursed': '#00e676',
  'Rainbow': '#ff4081', 'Divine': '#ffd740', 'Cyber': '#00e5ff',
};

// Lower = higher priority. OG/Brainrot God are the most valuable.
export const RARITY_WEIGHT: Record<string, number> = {
  'OG': 0, 'Brainrot God': 0, Admin: 1, Secret: 2, Mythical: 3,
  Legendary: 4, Taco: 5, Valentines: 5, Festive: 5,
  Epic: 6, Rare: 7, Uncommon: 8, Common: 9,
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
};
