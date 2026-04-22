/* ─── Shared Types ─── */

export type WLItem = { pet_name: string; priority: number; min_value: number; mutations?: Record<string, number> };
export type Config = { whitelisted: WLItem[]; blacklisted: string[]; version: string };

export interface Meta {
  totalListings: number;
  totalBrainrots: number;
  uniqueBrainrots: number;
  totalSellers: number;
  totalQty: number;
  avgPrice: number;
  medianPrice: number;
  totalValue: number;
  trendingCount: number;
  verifiedListings: number;
  lastScrapeAt: string;
  lastScrape: string | null;
  totalSoldLast30d: number;
  scrapedPages: number;
  recordCount?: number;
  uniqueCombos?: number;
  scrapeRuns?: { status: string; totalListings?: number; completed_at?: string; started_at?: string; pages_scraped?: number }[];
}

export interface BrainrotCombo {
  mut?: string;
  mutation?: string;
  ms: string;
  n?: number;
  count?: number;
  min?: number;
  minPrice?: number;
  max?: number;
  maxPrice?: number;
  med?: number;
  medianPrice?: number;
  avg?: number;
  avgPrice?: number;
  qty?: number;
  totalQty?: number;
  exactMs?: number[];
  exactMsMin?: number;
  exactMsMax?: number;
  sellers?: ComboSeller[];
}

export interface ComboSeller {
  name: string;
  price: number;
  verified?: boolean;
  qty?: number;
  rating?: number;
  feedback?: number;
  deliveryTime?: string;
}

export interface Brainrot {
  rarity: string;
  listingCount: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  medianPrice: number;
  totalQty: number;
  sellerCount: number;
  mutationCount: number;
  msCount: number;
  combos: BrainrotCombo[];
  onWatchlist: boolean;
  onBlacklist: boolean;
  priority: number;
  minValue: number;
  trendingListings: number;
  imageUrl: string;
  verifiedListings: number;
  exactMsValues: number[];
  bestCombos: BrainrotCombo[];
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  exactMsMin?: number;
  exactMsMedian?: number;
  exactMsMax?: number;
}

export interface Recommendation {
  name: string;
  rarity: string;
  tier: string;
  score: number;
  listings: number;
  min: number;
  max: number;
  med: number;
  avg: number;
  qty?: number;
  sellers: number;
  roiPct: number;
  soldCount: number;
  imageUrl: string;
  bestCombos: BrainrotCombo[];
  onWatchlist?: boolean;
  onBlacklist?: boolean;
  trendingListings: number;
  verifiedListings: number;
  sellerCount?: number;
  mutationCount?: number;
  demandScore?: number;
  scarcityScore?: number;
  spreadScore?: number;
  depthScore?: number;
  valueScore?: number;
  wlBonus?: number;
  farmScore?: number;
  flipScore?: number;
  // From buildRecommendations
  rarityWeight?: number;
  wlPriority?: number;
  soldAvgPrice?: number;
  p10?: number;
  p25?: number;
  p75?: number;
  p90?: number;
  totalQty?: number;
  combos?: number;
  mutations?: string[];
  exactMsMin?: number;
  exactMsMax?: number;
  exactMsMedian?: number;
}

export interface Seller {
  name: string;
  count: number;
  listings?: number;
  verified: boolean;
  uniquePets: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  totalValue?: number;
  rating: number;
  feedbackCount: number;
  positive: number;
  negative: number;
  disputeRatio: number;
  warranty: boolean;
  sellerId: string;
  joined: string | null;
  trustScore: number;
}

export interface SoldItem {
  offer_id: string;
  name: string;
  rarity: string;
  mutation: string;
  ms: string;
  price: number;
  quantity: number;
  seller: string;
  image_url: string;
  imageUrl?: string;
  first_seen_at: string;
  sold_at: string;
  soldAt?: string;
}

export interface PriceHistoryPoint {
  name: string;
  rarity: string;
  mutation: string;
  ms: string;
  min_price: number;
  max_price: number;
  avg_price: number;
  median_price: number;
  listing_count: number;
  total_qty: number;
  snapshot_date: string;
}

export interface MarketChange {
  name: string;
  type: string;
  detail: string;
  color: string;
  detected_at: string;
  rarity?: string;
  mutation?: string;
  ms?: string;
  price?: number;
  quantity?: number;
  seller?: string;
}

export interface RarityStats {
  count: number;
  totalQty: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
}

export interface TrendingItem {
  name: string;
  rarity: string;
  mutation: string;
  ms: string;
  price: number;
  seller: string;
  verified: boolean;
  image_url: string;
  offer_id: string;
}

export interface RawListing {
  offer_id: string;
  name: string;
  rarity: string;
  mutation: string;
  ms: string;
  price: number;
  quantity: number;
  seller: string;
  verified: boolean;
  image_url: string;
  is_trending: boolean;
}

export interface DashData {
  meta: Meta;
  brainrots: Record<string, Brainrot>;
  rarityStats: Record<string, RarityStats>;
  rarityDist: { name: string; count: number; color: string }[];
  mutationDist: { name: string; count: number; color: string }[];
  priceBuckets: { range: string; count: number }[];
  mutationStats: Record<string, { count: number; avgPrice: number; minPrice: number; maxPrice: number }>;
  msStats: Record<string, { count: number; avgPrice: number; minPrice: number; maxPrice: number }>;
  topSellers: Seller[];
  watchlist: { found: Recommendation[]; missing: { pet_name: string; priority: number; min_value: number }[] };
  recommendations: Recommendation[];
  rawListings: RawListing[];
  priceHistory: PriceHistoryPoint[];
  marketChanges: { delisted: MarketChange[]; newItems: MarketChange[] };
  soldArchive: { recent: SoldItem[]; byName: Record<string, { count: number; lastSold: string; avgPrice: number; totalValue: number }>; totalAllTime: number };
  trending: TrendingItem[];
  config: { whitelisted: WLItem[]; blacklisted: string[] };
}

export type TabId = 'overview' | 'brainrots' | 'detail' | 'recs' | 'watchlist' | 'sellers' | 'sold' | 'trending' | 'mutations' | 'user' | 'config' | 'raw';

export interface MutationAdvisory {
  mutation: string;
  multiplier: number;
  medianPrice: number;
  baseMedPrice: number;
  priceRatio: number;
  listings: number;
  recommendedOverride: number;
  needsOverride: boolean;
}
