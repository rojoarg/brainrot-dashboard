import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { RARITY_WEIGHT, RARITY_SCORE_BONUS, RARITY_TIER_FLOOR } from '../../lib/constants';

export const revalidate = 300;

// ─── Simple in-memory rate limiter ───
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 15; // 15 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}
// Periodic cleanup of stale entries (every 5 min)
if (typeof globalThis !== 'undefined') {
  const cleanup = () => {
    const now = Date.now();
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key);
    }
  };
  setInterval(cleanup, 5 * 60_000).unref?.();
}

// ─── Types ───
interface SellerStats {
  count: number; verified: boolean; uniquePets: Set<string>;
  minPrice: number; maxPrice: number; totalPrice: number;
  rating: number; feedbackCount: number; positive: number; negative: number;
  disputeRatio: number; warranty: boolean; sellerId: string; joined: string | null;
}

// ─── Paginated fetch helper ───
async function fetchAllListings(): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 200; // safety cap: 200K listings max
  const results: any[] = [];
  let page = 0;
  let consecutiveErrors = 0;
  while (page < MAX_PAGES) {
    const { data, error } = await supabase
      .from('brainrot_listings')
      .select('*')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order('id');
    if (error) {
      consecutiveErrors++;
      console.error(`fetchAllListings page ${page} error:`, error.message);
      if (consecutiveErrors >= 3) {
        console.error('fetchAllListings: 3 consecutive errors, aborting with partial data');
        break;
      }
      page++;
      continue;
    }
    consecutiveErrors = 0;
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return results;
}

export async function GET(request: Request) {
  try {
  // Rate limiting
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait before refreshing.' }, { status: 429 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // ─── Parallel fetch all data sources ───
  const [
    allListings,
    { data: watchlist },
    { data: blacklist },
    { data: scrapeRuns },
    { data: priceHistory },
    { data: marketChanges },
    { data: soldArchive },
    { count: totalSoldCount },
  ] = await Promise.all([
    fetchAllListings(),
    supabase.from('brainrot_watchlist').select('*').order('priority'),
    supabase.from('brainrot_blacklist').select('*'),
    supabase.from('brainrot_scrape_runs').select('*').order('started_at', { ascending: false }).limit(20),
    supabase.from('brainrot_price_history').select('*').gte('snapshot_date', thirtyDaysAgo.toISOString().split('T')[0]).order('snapshot_date'),
    supabase.from('brainrot_market_changes').select('*').gte('detected_at', sevenDaysAgo.toISOString()).order('detected_at', { ascending: false }).limit(2000),
    supabase.from('brainrot_sold_archive').select('*').gte('sold_at', thirtyDaysAgo.toISOString()).order('sold_at', { ascending: false }).limit(2000),
    supabase.from('brainrot_sold_archive').select('*', { count: 'exact', head: true }),
  ]);

  const lastRun = scrapeRuns?.find((r: any) => r.status === 'completed');

  // ─── Build lookup maps ───
  const wlMap: Record<string, any> = {};
  (watchlist || []).forEach((w: any) => { wlMap[w.pet_name.toLowerCase()] = w; });
  const blSet: Set<string> = new Set((blacklist || []).map((b: any) => b.pet_name.toLowerCase()));

  // ─── Aggregate all data ───
  const brainrots: Record<string, any> = {};
  const sellers: Record<string, SellerStats> = {};
  const rarityStats: Record<string, any> = {};
  const mutationStats: Record<string, any> = {};
  const msStats: Record<string, any> = {};
  let trendingCount = 0;

  for (const l of allListings) {
    const { name, rarity, mutation, ms, price, quantity, seller, verified } = l;
    if (!name || name === 'Other' || /^\d+$/.test(name) || name.length <= 2) continue;

    if (l.is_trending) trendingCount++;

    // ─── Brainrot aggregation ───
    if (!brainrots[name]) {
      brainrots[name] = {
        rarity,
        listingCount: 0,
        minPrice: Infinity,
        maxPrice: 0,
        totalPrice: 0,
        totalQty: 0,
        prices: [] as number[],
        exactMsValues: [] as number[],
        sellerSet: new Set<string>(),
        mutationSet: new Set<string>(),
        msSet: new Set<string>(),
        combos: {} as Record<string, any>,
        onWatchlist: name.toLowerCase() in wlMap,
        onBlacklist: blSet.has(name.toLowerCase()),
        priority: wlMap[name.toLowerCase()]?.priority ?? -1,
        minValue: Number(wlMap[name.toLowerCase()]?.min_value) || 1000000,
        trendingListings: 0,
        imageUrl: '',
        verifiedListings: 0,
      };
    }
    const b = brainrots[name];
    b.listingCount++;
    b.minPrice = Math.min(b.minPrice, price);
    b.maxPrice = Math.max(b.maxPrice, price);
    b.totalPrice += price;
    b.totalQty += quantity;
    b.prices.push(price);
    b.sellerSet.add(seller);
    b.mutationSet.add(mutation);
    b.msSet.add(ms);
    if (l.exact_ms != null) b.exactMsValues.push(l.exact_ms);
    if (l.is_trending) b.trendingListings++;
    if (l.verified) b.verifiedListings++;
    if (!b.imageUrl && l.image_url) b.imageUrl = l.image_url;

    // Combo (mutation + ms)
    const ck = `${mutation}|${ms}`;
    if (!b.combos[ck]) {
      b.combos[ck] = {
        mutation, ms, minPrice: Infinity, maxPrice: 0,
        count: 0, totalQty: 0, totalPrice: 0,
        prices: [] as number[],
        exactMsValues: [] as number[],
        sellers: [] as any[],
      };
    }
    const c = b.combos[ck];
    c.count++;
    c.minPrice = Math.min(c.minPrice, price);
    c.maxPrice = Math.max(c.maxPrice, price);
    c.totalQty += quantity;
    c.totalPrice += price;
    c.prices.push(price);
    if (l.exact_ms != null) c.exactMsValues.push(l.exact_ms);
    if (c.sellers.length < 8) {
      c.sellers.push({
        name: seller, price, verified, qty: quantity,
        rating: l.seller_rating, feedback: l.seller_feedback_count,
        deliveryTime: l.delivery_time,
      });
    } else if (price < c.sellers[c.sellers.length - 1].price) {
      c.sellers[c.sellers.length - 1] = {
        name: seller, price, verified, qty: quantity,
        rating: l.seller_rating, feedback: l.seller_feedback_count,
        deliveryTime: l.delivery_time,
      };
      c.sellers.sort((a: any, b: any) => a.price - b.price);
    }

    // ─── Seller stats ───
    if (!sellers[seller]) {
      sellers[seller] = {
        count: 0, verified: false, uniquePets: new Set(),
        minPrice: Infinity, maxPrice: 0, totalPrice: 0,
        rating: 0, feedbackCount: 0, positive: 0, negative: 0,
        disputeRatio: 0, warranty: false, sellerId: '', joined: null,
      };
    }
    const s = sellers[seller];
    s.count++;
    s.verified = s.verified || verified;
    s.uniquePets.add(name);
    s.minPrice = Math.min(s.minPrice, price);
    s.maxPrice = Math.max(s.maxPrice, price);
    s.totalPrice += price;
    if (l.seller_rating > s.rating) {
      s.rating = l.seller_rating;
      s.feedbackCount = l.seller_feedback_count || 0;
      s.positive = l.seller_positive || 0;
      s.negative = l.seller_negative || 0;
      s.disputeRatio = l.seller_dispute_ratio || 0;
      s.warranty = l.seller_warranty || false;
      s.sellerId = l.seller_id || '';
      s.joined = l.seller_joined || null;
    }

    // ─── Rarity stats ───
    if (!rarityStats[rarity]) rarityStats[rarity] = { count: 0, minPrice: Infinity, maxPrice: 0, totalPrice: 0, totalQty: 0, uniquePets: new Set() };
    rarityStats[rarity].count++;
    rarityStats[rarity].minPrice = Math.min(rarityStats[rarity].minPrice, price);
    rarityStats[rarity].maxPrice = Math.max(rarityStats[rarity].maxPrice, price);
    rarityStats[rarity].totalPrice += price;
    rarityStats[rarity].totalQty += quantity;
    rarityStats[rarity].uniquePets.add(name);

    // ─── Mutation stats ───
    if (!mutationStats[mutation]) mutationStats[mutation] = { count: 0, minPrice: Infinity, maxPrice: 0, totalPrice: 0, uniquePets: new Set() };
    mutationStats[mutation].count++;
    mutationStats[mutation].minPrice = Math.min(mutationStats[mutation].minPrice, price);
    mutationStats[mutation].maxPrice = Math.max(mutationStats[mutation].maxPrice, price);
    mutationStats[mutation].totalPrice += price;
    mutationStats[mutation].uniquePets.add(name);

    // ─── M/s stats ───
    if (!msStats[ms]) msStats[ms] = { count: 0, minPrice: Infinity, maxPrice: 0, totalPrice: 0, uniquePets: new Set() };
    msStats[ms].count++;
    msStats[ms].minPrice = Math.min(msStats[ms].minPrice, price);
    msStats[ms].maxPrice = Math.max(msStats[ms].maxPrice, price);
    msStats[ms].totalPrice += price;
    msStats[ms].uniquePets.add(name);
  }

  // ─── Compute percentiles and finalize brainrots ───
  for (const [, b] of Object.entries(brainrots)) {
    if (b.minPrice === Infinity) b.minPrice = 0;
    b.prices.sort((a: number, b: number) => a - b);
    const n = b.prices.length;
    b.avgPrice = n > 0 ? Math.round((b.totalPrice / n) * 100) / 100 : 0;
    const pct = (p: number) => b.prices[Math.max(0, Math.min(Math.floor(n * p), n - 1))];
    b.medianPrice = n > 0 ? pct(0.5) : 0;
    b.p10 = n > 0 ? pct(0.1) : 0;
    b.p25 = n > 0 ? pct(0.25) : 0;
    b.p75 = n > 0 ? pct(0.75) : 0;
    b.p90 = n > 0 ? pct(0.9) : 0;
    b.sellerCount = b.sellerSet.size;
    b.mutationCount = b.mutationSet.size;
    b.mutations = Array.from(b.mutationSet);
    b.msCount = b.msSet.size;
    b.msValues = Array.from(b.msSet);

    // Exact M/s stats
    if (b.exactMsValues.length > 0) {
      b.exactMsValues.sort((a: number, c: number) => a - c);
      b.exactMsMin = b.exactMsValues[0];
      b.exactMsMax = b.exactMsValues[b.exactMsValues.length - 1];
      b.exactMsMedian = b.exactMsValues[Math.floor(b.exactMsValues.length / 2)];
    }
    delete b.prices;
    delete b.exactMsValues;
    delete b.sellerSet;
    delete b.mutationSet;
    delete b.msSet;
    // Filter combo values to remove Infinity (JSON.stringify safety)
    for (const c of Object.values(b.combos) as any[]) {
      if (c.minPrice === Infinity || !isFinite(c.minPrice)) c.minPrice = 0;
      if (c.maxPrice === -Infinity || !isFinite(c.maxPrice)) c.maxPrice = 0;
      c.prices.sort((a: number, z: number) => a - z);
      const cn = c.prices.length;
      c.avgPrice = cn > 0 ? Math.round((c.totalPrice / cn) * 100) / 100 : 0;
      c.medianPrice = cn > 0 ? c.prices[Math.max(0, Math.min(Math.floor(cn / 2), cn - 1))] : 0;
      if (c.exactMsValues.length > 0) {
        c.exactMsValues.sort((a: number, z: number) => a - z);
        c.exactMsMin = c.exactMsValues[0];
        c.exactMsMax = c.exactMsValues[Math.max(0, c.exactMsValues.length - 1)];
      }
      // Sort sellers by price (insertion order during aggregation is arbitrary)
      c.sellers.sort((x: any, y: any) => x.price - y.price);
      delete c.prices;
      delete c.exactMsValues;
    }
  }

  // ─── Finalize stats ───
  const finalizeStats = (stats: Record<string, any>) => {
    for (const s of Object.values(stats) as any[]) {
      if (s.minPrice === Infinity) s.minPrice = 0;
      if (s.maxPrice === -Infinity || !isFinite(s.maxPrice)) s.maxPrice = 0;
      s.avgPrice = s.count > 0 ? Math.round((s.totalPrice / s.count) * 100) / 100 : 0;
      if (isNaN(s.avgPrice) || !isFinite(s.avgPrice)) s.avgPrice = 0;
      if (s.uniquePets) {
        s.uniquePetCount = s.uniquePets.size;
        s.petNames = Array.from(s.uniquePets).slice(0, 50);
        delete s.uniquePets;
      }
    }
  };
  finalizeStats(rarityStats);
  finalizeStats(mutationStats);
  finalizeStats(msStats);

  // ─── Top sellers with full trust data ───
  const topSellers = Object.entries(sellers)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 300)
    .map(([name, s]) => ({
      name,
      listings: s.count,
      verified: s.verified,
      uniquePets: s.uniquePets?.size ?? 0,
      minPrice: s.minPrice === Infinity ? 0 : Math.round(s.minPrice * 100) / 100,
      maxPrice: Math.round(s.maxPrice * 100) / 100,
      avgPrice: s.count > 0 ? Math.round((s.totalPrice / s.count) * 100) / 100 : 0,
      totalValue: Math.round(s.totalPrice * 100) / 100,
      rating: Math.round(s.rating * 100) / 100,
      feedbackCount: s.feedbackCount,
      positive: s.positive,
      negative: s.negative,
      disputeRatio: isFinite(s.disputeRatio) ? Math.round(s.disputeRatio * 10000) / 100 : 0,
      warranty: s.warranty,
      joined: s.joined,
      trustScore: computeTrustScore(s),
    }));

  // ─── Watchlist analysis ───
  // Build lowercase→original-case lookup for O(1) matching
  const brainrotNameMap: Record<string, string> = {};
  for (const key of Object.keys(brainrots)) {
    brainrotNameMap[key.toLowerCase()] = key;
  }

  const wlFound: any[] = [];
  const wlMissing: any[] = [];
  for (const w of watchlist || []) {
    const nameKey = brainrotNameMap[w.pet_name.toLowerCase()];
    // min_value in gems: 1M gems = $100 floor. If not set, use floor.
    const minValue = Number(w.min_value) || 1000000;
    if (nameKey) {
      const b = brainrots[nameKey];
      wlFound.push({
        name: nameKey, priority: w.priority, minValue,
        rarity: b.rarity, imageUrl: b.imageUrl,
        minPrice: Math.round(b.minPrice * 100) / 100,
        maxPrice: Math.round(b.maxPrice * 100) / 100,
        avgPrice: b.avgPrice, medianPrice: b.medianPrice,
        listings: b.listingCount, combos: Object.keys(b.combos).length,
        sellerCount: b.sellerCount, totalQty: b.totalQty,
        trendingListings: b.trendingListings,
      });
    } else {
      wlMissing.push({ name: w.pet_name, priority: w.priority, minValue });
    }
  }

  // ─── Sold archive summary ───
  const soldByName: Record<string, { count: number; totalValue: number; lastSold: string; avgPrice: number }> = {};
  for (const s of soldArchive || []) {
    if (!soldByName[s.name]) soldByName[s.name] = { count: 0, totalValue: 0, lastSold: '', avgPrice: 0 };
    soldByName[s.name].count++;
    soldByName[s.name].totalValue += Number(s.price) || 0;
    if (!soldByName[s.name].lastSold || s.sold_at > soldByName[s.name].lastSold) {
      soldByName[s.name].lastSold = s.sold_at;
    }
  }
  for (const v of Object.values(soldByName)) {
    v.avgPrice = v.count > 0 ? Math.round((v.totalValue / v.count) * 100) / 100 : 0;
  }

  // ─── Recommendations ───
  const recs = buildRecommendations(brainrots, wlMap, blSet, soldByName);

  // ─── Distribution charts ───
  const rarityDist = Object.entries(rarityStats)
    .map(([name, s]) => ({ name, count: s.count, pets: s.uniquePetCount, avgPrice: s.avgPrice }))
    .sort((a, b) => b.count - a.count);

  const mutationDist = Object.entries(mutationStats)
    .map(([name, s]) => ({ name, count: s.count, pets: s.uniquePetCount, avgPrice: s.avgPrice }))
    .sort((a, b) => b.count - a.count);

  const priceBuckets = [
    { label: '<$0.50', min: 0, max: 0.5, count: 0 },
    { label: '$0.50-1', min: 0.5, max: 1, count: 0 },
    { label: '$1-2', min: 1, max: 2, count: 0 },
    { label: '$2-5', min: 2, max: 5, count: 0 },
    { label: '$5-10', min: 5, max: 10, count: 0 },
    { label: '$10-25', min: 10, max: 25, count: 0 },
    { label: '$25-50', min: 25, max: 50, count: 0 },
    { label: '$50-100', min: 50, max: 100, count: 0 },
    { label: '$100-250', min: 100, max: 250, count: 0 },
    { label: '$250-500', min: 250, max: 500, count: 0 },
    { label: '$500-1k', min: 500, max: 1000, count: 0 },
    { label: '$1k+', min: 1000, max: 999999999, count: 0 },
  ];
  for (const l of allListings) {
    const p = Number(l.price) || 0;
    if (isFinite(p) && p >= 0) {
      for (const bucket of priceBuckets) {
        if (p >= bucket.min && p < bucket.max) { bucket.count++; break; }
      }
    }
  }

  // ─── Raw listings (ALL, compact format) ───
  const rawAll = allListings
    .filter(l => l.name && l.price > 0 && isFinite(l.price))
    .sort((a, b) => (b.price || 0) - (a.price || 0))
    .slice(0, 8000)
    .map(l => ({
      n: l.name, r: l.rarity, m: l.mutation, ms: l.ms,
      ems: isFinite(l.exact_ms) ? l.exact_ms : null, p: Math.round(l.price * 100) / 100,
      q: l.quantity || 0, s: l.seller, v: l.verified,
      oid: l.offer_id, img: l.image_url || '',
      t: l.is_trending || false,
      sr: isFinite(l.seller_rating) ? Math.round(l.seller_rating * 10) / 10 : 0,
      dt: l.delivery_time || '',
    }));

  // ─── Trending items ───
  const trendingItems = allListings
    .filter(l => l.is_trending && isFinite(l.price))
    .sort((a, b) => (b.price || 0) - (a.price || 0))
    .slice(0, 100)
    .map(l => ({
      name: l.name, rarity: l.rarity, mutation: l.mutation, ms: l.ms,
      price: l.price, seller: l.seller, verified: l.verified,
      imageUrl: l.image_url, exactMs: isFinite(l.exact_ms) ? l.exact_ms : null,
    }));

  // ─── Config data ───
  const configData = {
    whitelisted: (watchlist || []).map((w: any) => {
      const item: { pet_name: string; priority: number; min_value: number; mutations?: Record<string, number> } = {
        pet_name: w.pet_name,
        priority: w.priority,
        min_value: Number(w.min_value) || 1000000,
      };
      if (w.mutations && typeof w.mutations === 'object' && Object.keys(w.mutations).length > 0) {
        item.mutations = w.mutations;
      }
      return item;
    }),
    blacklisted: (blacklist || []).map((b: any) => b.pet_name),
  };

  // Sanitize stats objects: convert Set→Array, filter Infinity/NaN (JSON.stringify safety)
  const sanitizeValue = (v: any, seen = new WeakSet()): any => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'bigint' || typeof v === 'symbol') return null;
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    if (v instanceof Date) return v.toISOString();
    // Circular reference guard
    if (typeof v === 'object') {
      if (seen.has(v)) return null;
      seen.add(v);
    }
    if (v instanceof Set) return Array.from(v).map(x => sanitizeValue(x, seen));
    if (Array.isArray(v)) return v.map(x => sanitizeValue(x, seen));
    if (typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, val]) => [k, sanitizeValue(val, seen)])
      );
    }
    return v;
  };

  const sanitizeStats = (stats: Record<string, any>): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(stats)) {
      result[k] = sanitizeValue(v);
    }
    return result;
  };

  const sanitizedRarityStats = sanitizeStats(rarityStats);
  const sanitizedMutationStats = sanitizeStats(mutationStats);
  const sanitizedMsStats = sanitizeStats(msStats);

  return NextResponse.json({
    meta: {
      totalListings: allListings.length,
      uniqueBrainrots: Object.keys(brainrots).length,
      uniqueCombos: Object.values(brainrots).reduce((s: number, b: any) => s + Object.keys(b.combos).length, 0),
      totalSellers: Object.keys(sellers).length,
      totalQty: allListings.reduce((s, l) => s + (l.quantity || 0), 0),
      trendingCount,
      totalSoldAllTime: totalSoldCount || 0,
      totalSoldLast30d: (soldArchive || []).length,
      lastScrape: lastRun?.completed_at || null,
      recordCount: lastRun?.record_count || 0,
      scrapeRuns: (scrapeRuns || []).map((r: any) => ({
        id: r.id,
        status: r.status,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        totalListings: r.total_listings,
        totalBrainrots: r.total_brainrots,
        totalSellers: r.total_sellers,
        pagesScraped: r.pages_scraped,
        pagesFailed: r.pages_failed,
        totalQty: r.total_qty,
        delistedCount: r.delisted_count,
        newCount: r.new_count,
        trendingCount: r.trending_count,
        avgPrice: r.avg_price,
        recordCount: r.record_count,
        marketplaceTotal: r.marketplace_total || 0,
      })),
    },
    brainrots,
    rarityStats: sanitizedRarityStats,
    rarityDist,
    mutationDist,
    priceBuckets,
    mutationStats: sanitizedMutationStats,
    msStats: sanitizedMsStats,
    topSellers,
    watchlist: { found: wlFound, missing: wlMissing },
    recommendations: recs,
    rawListings: rawAll,
    priceHistory: priceHistory || [],
    marketChanges: {
      delisted: (marketChanges || []).filter((c: any) => c.change_type === 'delisted'),
      newItems: (marketChanges || []).filter((c: any) => c.change_type === 'new'),
    },
    soldArchive: {
      recent: (soldArchive || []).slice(0, 500).map((s: any) => ({
        name: s.name, rarity: s.rarity, mutation: s.mutation, ms: s.ms,
        exactMs: s.exact_ms, price: s.price, quantity: s.quantity,
        seller: s.seller, imageUrl: s.image_url,
        soldAt: s.sold_at, firstSeenAt: s.first_seen_at,
      })),
      byName: soldByName,
      totalAllTime: totalSoldCount || 0,
    },
    trending: trendingItems,
    config: configData,
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
  } catch (err: any) {
    console.error('Data API GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function computeTrustScore(s: SellerStats | null | undefined): number {
  if (!s) return 0;
  let score = 50;
  if (s.verified) score += 15;
  if (s.rating >= 99) score += 15;
  else if (s.rating >= 95) score += 10;
  else if (s.rating >= 90) score += 5;
  if (s.feedbackCount >= 1000) score += 10;
  else if (s.feedbackCount >= 100) score += 5;
  if (s.disputeRatio === 0) score += 5;
  else if (s.disputeRatio > 0.05) score -= 15;
  if (s.warranty) score += 5;
  return Math.max(0, Math.min(100, score));
}

const TIER_RANK: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };

function buildRecommendations(brainrots: Record<string, any>, wlMap: Record<string, any>, blSet: Set<string>, soldByName: Record<string, any>) {
  // Phase 1: Collect raw metrics for all brainrots
  const raw: any[] = [];
  for (const [name, b] of Object.entries(brainrots)) {
    if (blSet.has(name.toLowerCase())) continue;
    const combos = Object.values(b.combos) as any[];
    const n = b.listingCount;
    if (n === 0) continue;
    const medPrice = b.medianPrice;
    // Skip items with median price under $2 — too cheap to be worth trading
    if (medPrice < 2) continue;
    const sold = soldByName[name] || { count: 0, avgPrice: 0, totalValue: 0 };
    const spread = b.minPrice > 0 && isFinite(b.maxPrice) ? Math.min(1000, (b.maxPrice - b.minPrice) / b.minPrice) : 0;
    const roiAtMedian = b.minPrice > 0 && isFinite(medPrice) ? Math.min(100, (medPrice - b.minPrice) / b.minPrice) : 0;
    raw.push({ name, b, combos, n, medPrice, sold, spread, roiAtMedian });
  }

  // Phase 2: Percentile rank helper — maps values to 0-10 scale relative to all items
  // Uses binary search on pre-sorted arrays for O(log n) instead of O(n) per call
  const percentileRank = (sortedArr: number[], val: number) => {
    const n = sortedArr.length;
    if (n <= 1) return 5;
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedArr[mid] < val) lo = mid + 1;
      else hi = mid;
    }
    return (lo / (n - 1)) * 10;
  };
  const allMed = raw.map(r => r.medPrice).sort((a, b) => a - b);
  const allSpread = raw.map(r => r.spread).sort((a, b) => a - b);
  const allListingCounts = raw.map(r => r.n).sort((a, b) => a - b);
  // allSold removed — demand score uses log2 scale instead of percentile rank

  // Phase 3: Score each brainrot using balanced multi-factor scoring
  const recs: any[] = [];
  for (const r of raw) {
    const { name, b, combos, n, medPrice, sold, spread, roiAtMedian } = r;

    // Demand score: sold count + trending (0-10)
    const soldCount = typeof sold.count === 'number' && isFinite(sold.count) ? sold.count : 0;
    const demandFromSold = soldCount > 0 ? Math.min(6, Math.log2(soldCount + 1) * 2) : 0;
    const demandFromTrending = (b.trendingListings ?? 0) > 0 ? Math.min(4, b.trendingListings * 0.5) : 0;
    const demandScore = Math.min(10, demandFromSold + demandFromTrending);

    // Supply score: inverted listing count — fewer = rarer (0-10)
    const supplyRank = percentileRank(allListingCounts, n);
    const supplyScore = 10 - supplyRank; // fewer listings = higher score

    // Spread score: price spread for arbitrage (0-10)
    const spreadScore = percentileRank(allSpread, spread);

    // Market depth: combination of sellers, combos, mutations (0-10)
    const depthScore = Math.min(10,
      ((b.sellerCount ?? 0) >= 10 ? 3 : (b.sellerCount ?? 0) >= 5 ? 2 : (b.sellerCount ?? 0) >= 2 ? 1 : 0) +
      ((combos?.length ?? 0) >= 10 ? 3 : (combos?.length ?? 0) >= 5 ? 2 : (combos?.length ?? 0) >= 2 ? 1 : 0) +
      ((b.mutationCount ?? 0) >= 5 ? 2 : (b.mutationCount ?? 0) >= 2 ? 1 : 0) +
      (n >= 20 ? 2 : n >= 5 ? 1 : 0)
    );

    // Value score: median price relative to market (0-10)
    const valueScore = percentileRank(allMed, medPrice);

    // WL bonus
    const wlPriority = wlMap[name.toLowerCase()]?.priority ?? -1;
    const wlBonus = wlPriority >= 0 ? Math.max(0, 5 - (wlPriority / 15)) : 0;

    // Rarity bonus — SCALED by actual price. A $1 Secret gets almost no bonus.
    // A $500 OG gets the full bonus. This prevents cheap junk from outscoring
    // genuinely valuable items just because they have a "rare" label.
    const maxRarityBonus = RARITY_SCORE_BONUS[b.rarity] ?? 0;
    // Price scaling: $0→0%, $5→25%, $20→50%, $100→80%, $500+→100% of max bonus
    const priceScale = medPrice >= 500 ? 1.0
      : medPrice >= 100 ? 0.8
      : medPrice >= 20 ? 0.5
      : medPrice >= 5 ? 0.25
      : medPrice >= 2 ? 0.1
      : 0;
    const rarityBonus = Math.round(maxRarityBonus * priceScale * 10) / 10;

    // Combined score — market signals are primary, rarity is a bonus for VALUABLE items
    const baseMarketScore = Math.min(100,
      demandScore * 2.0 +   // 20% demand
      supplyScore * 1.2 +   // 12% scarcity
      spreadScore * 1.5 +   // 15% arbitrage
      depthScore * 1.0 +    // 10% market depth
      valueScore * 1.3 +    // 13% value
      wlBonus * 2.0         // bonus: watchlist
    );
    // Final score: market score + price-scaled rarity bonus
    const score = isFinite(baseMarketScore + rarityBonus) ? baseMarketScore + rarityBonus : rarityBonus;

    // Tier based on percentile within scored items (will be adjusted after sorting)
    // Flip & farm scores for strategy presets
    const flipScore = Math.min(10, spreadScore * 0.5 + (roiAtMedian > 1.0 ? 4 : roiAtMedian > 0.5 ? 3 : roiAtMedian > 0.2 ? 1.5 : 0) + (n >= 3 ? 1 : 0));
    const farmScore = Math.min(10, demandFromSold * 0.8 + (n >= 10 ? 2 : n >= 5 ? 1 : 0) + (medPrice <= 10 ? 3 : medPrice <= 30 ? 2 : medPrice <= 50 ? 1 : 0));

    const bestCombos = combos
      .map((c: any) => ({
        mut: c.mutation, ms: c.ms,
        min: isFinite(c.minPrice) ? Math.round(c.minPrice * 100) / 100 : 0,
        max: isFinite(c.maxPrice) ? Math.round(c.maxPrice * 100) / 100 : 0,
        avg: isFinite(c.avgPrice) ? c.avgPrice : 0,
        med: isFinite(c.medianPrice) ? c.medianPrice : 0,
        n: c.count || 0,
        qty: c.totalQty || 0,
        sellers: (c.sellers || []).slice(0, 8),
        exactMsMin: c.exactMsMin, exactMsMax: c.exactMsMax,
      }))
      .sort((a: any, z: any) => {
        const avgDiff = (z.avg || 0) - (a.avg || 0);
        return isFinite(avgDiff) ? avgDiff : 0;
      })
      .slice(0, 15);

    recs.push({
      name, rarity: b.rarity, rarityWeight: RARITY_WEIGHT[b.rarity] ?? 7,
      tier: '', score: Math.round(score * 10) / 10,
      demandScore: Math.round(demandScore * 10) / 10,
      scarcityScore: Math.round(supplyScore * 10) / 10,
      valueScore: Math.round(valueScore * 10) / 10,
      spreadScore: Math.round(spreadScore * 10) / 10,
      depthScore: Math.round(depthScore * 10) / 10,
      wlPriority, wlBonus: Math.round(wlBonus * 10) / 10,
      flipScore: Math.round(flipScore * 10) / 10,
      farmScore: Math.round(farmScore * 10) / 10,
      roiPct: Math.round(roiAtMedian * 1000) / 10,
      soldCount: sold.count,
      soldAvgPrice: sold.avgPrice,
      min: Math.round(b.minPrice * 100) / 100,
      max: Math.round(b.maxPrice * 100) / 100,
      avg: b.avgPrice,
      med: Math.round(medPrice * 100) / 100,
      p10: b.p10, p25: b.p25, p75: b.p75, p90: b.p90,
      listings: b.listingCount,
      totalQty: b.totalQty,
      combos: combos.length,
      sellerCount: b.sellerCount,
      mutationCount: b.mutationCount,
      mutations: b.mutations,
      imageUrl: b.imageUrl,
      trendingListings: b.trendingListings,
      verifiedListings: b.verifiedListings,
      exactMsMin: b.exactMsMin, exactMsMax: b.exactMsMax, exactMsMedian: b.exactMsMedian,
      bestCombos,
    });
  }

  // Phase 4: Sort by score first, then rarity weight as tiebreaker
  recs.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 0.5) return scoreDiff;
    // Within similar scores, rarer items come first
    const rw = (RARITY_WEIGHT[a.rarity] ?? 7) - (RARITY_WEIGHT[b.rarity] ?? 7);
    if (rw !== 0) return rw;
    // Same rarity + same score: prefer more sold
    return (b.soldCount || 0) - (a.soldCount || 0);
  });

  // Assign tiers by percentile rank, then enforce rarity tier floors
  const total = recs.length;
  for (let i = 0; i < total; i++) {
    const pct = i / total;
    let tier = pct < 0.08 ? 'S' : pct < 0.25 ? 'A' : pct < 0.50 ? 'B' : pct < 0.80 ? 'C' : 'D';

    // Enforce rarity tier floor — OG/Secret/Mythical pets can't drop below their floor
    const floor = RARITY_TIER_FLOOR[recs[i].rarity];
    if (floor && (TIER_RANK[tier] ?? 4) > (TIER_RANK[floor] ?? 4)) {
      tier = floor;
    }
    recs[i].tier = tier;
  }

  return recs;
}
