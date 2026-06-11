import { NextResponse } from 'next/server';
import { getDb, swapStagingToLive, nowIso } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * LOCAL scraper — runs the full Eldorado sweep in one background pass.
 *
 * The old Vercel design (60s function limit → 70 chunked calls chained via
 * Supabase pg_net) is gone: a local Node server has no execution limit, so
 * GET /api/scrape kicks off a single async run and returns immediately.
 * Progress is written to brainrot_scrape_runs; the dashboard polls it via
 * /api/data meta.scrapeRuns.
 *
 * Auth: optional. If CRON_SECRET is set, ?secret= / Bearer must match.
 */

const ELDORADO_API = 'https://www.eldorado.gg/api/v1/item-management/offers?gameId=259&category=CustomItem&pageSize=50&useMinPurchasePrice=false&pageIndex=';
const IMAGE_BASE = 'https://images.eldorado.gg/';
const CONCURRENT = 5;              // concurrent fetches — keeps Eldorado happy
const MAX_PAGES = 1400;            // Eldorado currently 400s past page 1000 (50k listings);
                                   // the 4xx end-detection stops there. Headroom if they raise it.
const MIN_LISTINGS_FOR_SWAP = 10000; // abort swap if scrape looks partial — protects live data
const STALE_RUN_MINUTES = 30;      // full local run takes ~5-10 min; 30 min = definitely stuck

interface Listing {
  name: string; rarity: string; mutation: string; ms: string; exact_ms: number | null;
  price: number; quantity: number; seller: string; verified: boolean; offer_id: string;
  seller_rating: number; seller_feedback_count: number; seller_positive: number;
  seller_negative: number; seller_dispute_ratio: number; seller_warranty: boolean;
  seller_id: string; seller_joined: string | null; offer_title: string; delivery_time: string;
  is_trending: boolean; expire_date: string | null; offer_state: string; description: string;
  image_url: string; original_currency: string; original_price: number; exchange_rate: number;
}

function parseListing(item: any): Listing | null {
  const o = item.offer || {};
  const u = item.user || {};
  const uoi = item.userOrderInfo || {};
  const tev: Record<string, string> = {};
  (o.tradeEnvironmentValues || []).forEach((t: any) => { tev[t.name] = t.value; });
  const oav: Record<string, string> = {};
  (o.offerAttributeIdValues || []).forEach((a: any) => { oav[a.name] = a.value; });
  let exactMs: number | null = null;
  (o.attributes || []).forEach((a: any) => {
    if (a.name === 'M/s' && a.type === 'Numeric' && a.value != null) {
      const v = typeof a.value === 'number' ? a.value : parseFloat(a.value);
      if (!isNaN(v) && isFinite(v) && v >= 0 && v <= 1e10) exactMs = v;
    }
  });
  const usdPrice = o.pricePerUnitInUSD || {};
  const localPrice = o.pricePerUnit || {};
  const exRate = o.exchangeRate || {};
  const mainImg = o.mainOfferImage || {};
  const name = tev['Brainrot'] || '';
  const price = Number(usdPrice.amount) || 0;
  if (!name || price <= 0 || !isFinite(price)) return null;
  return {
    name, rarity: tev['Rarity'] || '', mutation: oav['Mutations'] || 'None',
    ms: oav['M/s'] || 'N/A', exact_ms: exactMs, price, quantity: Math.max(0, Number(o.quantity) || 0),
    seller: u.username || '', verified: u.isVerifiedSeller || false, offer_id: o.id || '',
    seller_rating: Math.max(0, Math.min(100, Number(uoi.feedbackScore) || 0)), seller_feedback_count: Math.max(0, Number(uoi.ratingCount) || 0),
    seller_positive: Math.max(0, Number(uoi.positiveCount) || 0), seller_negative: Math.max(0, Number(uoi.negativeCount) || 0),
    seller_dispute_ratio: Math.max(0, Math.min(1, Number(uoi.disputedAccountOrderRatio) || 0)),
    seller_warranty: uoi.isEligibleForWarranty || false,
    seller_id: u.id || '', seller_joined: u.createdDate || null,
    offer_title: o.offerTitle || '', delivery_time: o.guaranteedDeliveryTime || '',
    is_trending: o.isTrending || false, expire_date: o.expireDate || null,
    offer_state: o.offerState || 'Active', description: (o.description || '').slice(0, 500),
    image_url: mainImg.smallImage ? IMAGE_BASE + mainImg.smallImage : '',
    original_currency: localPrice.currency || exRate.currency || '',
    original_price: localPrice.amount || 0, exchange_rate: exRate.exchangeRate || 0,
  };
}

// Returns Listing[] on success, empty array for end-of-results, null for errors
async function fetchPage(page: number, retries = 2): Promise<Listing[] | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(ELDORADO_API + page, {
        headers: { 'User-Agent': 'BrainrotDashboard/4.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      // Eldorado hard-caps pagination (HTTP 400 past page ~1000) — that's
      // end-of-market, not an error. Don't retry, don't count as failed.
      if (res.status >= 400 && res.status < 429) return [];
      if (!res.ok) return null;
      const data = await res.json();
      const results = data.results || [];
      if (results.length === 0) return []; // End of results, not an error
      return results.map(parseListing).filter(Boolean) as Listing[];
    } catch (err) {
      console.error(`fetchPage attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Server-side search page (the same `searchQuery` the Eldorado site uses).
 * Used by the coverage top-up: pagination is capped at ~page 1000, but
 * search slices the market small enough to reach everything.
 */
async function fetchSearchPage(query: string, page: number): Promise<{ listings: Listing[]; recordCount: number } | null> {
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${ELDORADO_API}${page}&searchQuery=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'BrainrotDashboard/4.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2500));
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      return {
        listings: ((data.results || []) as any[]).map(parseListing).filter(Boolean) as Listing[],
        recordCount: data.recordCount || 0,
      };
    } catch {
      if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

// Sanitize text for safe insertion — strips null bytes and control chars
function sanitizeText(val: string | null, maxLen: number = 500): string {
  if (!val) return '';
  const cleaned = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.slice(0, maxLen);
}

const STAGING_INSERT_SQL = `
  INSERT OR REPLACE INTO brainrot_listings_staging (
    name, rarity, mutation, ms, exact_ms, price, quantity, seller, verified, offer_id,
    seller_rating, seller_feedback_count, seller_positive, seller_negative,
    seller_dispute_ratio, seller_warranty, seller_id, seller_joined, offer_title,
    delivery_time, is_trending, expire_date, offer_state, description, image_url,
    original_currency, original_price, exchange_rate, first_seen_at
  ) VALUES (
    @name, @rarity, @mutation, @ms, @exact_ms, @price, @quantity, @seller, @verified, @offer_id,
    @seller_rating, @seller_feedback_count, @seller_positive, @seller_negative,
    @seller_dispute_ratio, @seller_warranty, @seller_id, @seller_joined, @offer_title,
    @delivery_time, @is_trending, @expire_date, @offer_state, @description, @image_url,
    @original_currency, @original_price, @exchange_rate, @first_seen_at
  )`;

function toDbRow(l: Listing) {
  return {
    name: sanitizeText(l.name), rarity: sanitizeText(l.rarity),
    mutation: sanitizeText(l.mutation), ms: sanitizeText(l.ms),
    exact_ms: l.exact_ms, price: l.price, quantity: l.quantity,
    seller: sanitizeText(l.seller), verified: l.verified ? 1 : 0, offer_id: l.offer_id,
    seller_rating: Math.round(l.seller_rating * 100) / 100,
    seller_feedback_count: l.seller_feedback_count,
    seller_positive: l.seller_positive, seller_negative: l.seller_negative,
    seller_dispute_ratio: Math.round(l.seller_dispute_ratio * 10000) / 10000,
    seller_warranty: l.seller_warranty ? 1 : 0, seller_id: l.seller_id,
    seller_joined: l.seller_joined,
    offer_title: sanitizeText(l.offer_title, 255),
    delivery_time: sanitizeText(l.delivery_time, 100),
    is_trending: l.is_trending ? 1 : 0,
    expire_date: l.expire_date, offer_state: l.offer_state,
    description: sanitizeText(l.description, 500),
    image_url: l.image_url,
    original_currency: sanitizeText(l.original_currency),
    original_price: l.original_price,
    exchange_rate: l.exchange_rate,
    first_seen_at: nowIso(),
  };
}

/* ─── Background runner ─── */

// First ~40 pages cover the most valuable listings — swap them live early on
// fresh installs so the user sees data in ~1 min instead of an empty app.
const BOOTSTRAP_PAGES = 40;
const BOOTSTRAP_MIN_ROWS = 500;

async function runFullScrape(runId: number): Promise<void> {
  const db = getDb();
  // Scrape blacklist: skip these names entirely (case-insensitive)
  const scrapeBlacklist = new Set(
    (db.prepare('SELECT pet_name FROM brainrot_scrape_blacklist').all() as any[])
      .map(r => String(r.pet_name).toLowerCase()),
  );
  const filterBlacklisted = (ls: Listing[]) =>
    scrapeBlacklist.size === 0 ? ls : ls.filter(l => !scrapeBlacklist.has(l.name.toLowerCase()));

  const insertStmt = db.prepare(STAGING_INSERT_SQL);
  const insertBatch = db.transaction((rows: ReturnType<typeof toDbRow>[]) => {
    for (const r of rows) insertStmt.run(r);
  });
  const updateProgress = db.prepare(
    'UPDATE brainrot_scrape_runs SET segments_completed = ?, pages_scraped = ?, pages_failed = ?, staging_count = ? WHERE id = ?'
  );
  const failRun = () => db.prepare(
    "UPDATE brainrot_scrape_runs SET status = 'failed', completed_at = ? WHERE id = ?"
  ).run(nowIso(), runId);

  try {
    let page = 1;
    let pagesScraped = 0;
    let pagesFailed = 0;
    let consecutiveEmpty = 0;
    let reachedEnd = false;
    // Bootstrap preview only when the app has no data at all (fresh install)
    let bootstrapDone = ((db.prepare('SELECT COUNT(*) AS c FROM brainrot_listings').get() as any).c as number) > 0;

    while (page <= MAX_PAGES && !reachedEnd) {
      const batch = Array.from({ length: Math.min(CONCURRENT, MAX_PAGES - page + 1) }, (_, i) => page + i);
      const results = await Promise.all(batch.map(p => fetchPage(p)));
      for (const r of results) {
        if (r === null) {
          pagesFailed++;
          consecutiveEmpty = 0; // errors don't count as "end of market"
        } else if (r.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 5) { reachedEnd = true; break; }
        } else {
          consecutiveEmpty = 0;
          pagesScraped++;
          insertBatch(filterBlacklisted(r).map(toDbRow));
        }
      }
      page += batch.length;

      // Progress heartbeat every ~20 pages so the UI can show live status
      if (page % 20 < CONCURRENT || reachedEnd) {
        const stagingCount = (db.prepare('SELECT COUNT(*) AS c FROM brainrot_listings_staging').get() as any).c;
        updateProgress.run(pagesScraped, pagesScraped, pagesFailed, stagingCount, runId);
      }

      // Early preview swap on fresh installs: put the first ~40 pages (the
      // highest-value listings) live so the dashboard renders within ~1 min.
      // The full scrape keeps going and swaps the complete market at the end.
      if (!bootstrapDone && page > BOOTSTRAP_PAGES) {
        bootstrapDone = true;
        try {
          const boot = swapStagingToLive(BOOTSTRAP_MIN_ROWS);
          console.log(`Bootstrap preview swap: ${boot.status} — ${boot.new_live} listings live for first paint`);
        } catch (bootErr) {
          console.error('Bootstrap preview swap failed (continuing full scrape):', bootErr);
        }
      }

      if (!reachedEnd) await new Promise(r => setTimeout(r, 300));
    }

    // ─── Coverage top-up ───
    // Eldorado caps pagination (~page 1000 ≈ 50k listings) but the market is
    // bigger. For every name whose staged count is below its searchQuery
    // recordCount, pull the search pages — search bypasses the page cap.
    // (recordCount includes substring matches of other pets, so some fetches
    // are redundant; the offer_id upsert dedupes them.)
    let marketTotal = 0;
    try {
      const totalRes = await fetch(ELDORADO_API + '1', {
        headers: { 'User-Agent': 'BrainrotDashboard/4.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (totalRes.ok) marketTotal = (await totalRes.json()).recordCount || 0;
    } catch { /* non-critical */ }

    const stagedTotal = () => (db.prepare('SELECT COUNT(*) AS c FROM brainrot_listings_staging').get() as any).c as number;
    if (marketTotal > 0 && stagedTotal() < marketTotal * 0.99) {
      const names = db.prepare('SELECT name, COUNT(*) AS c FROM brainrot_listings_staging GROUP BY name ORDER BY c DESC').all() as { name: string; c: number }[];
      console.log(`Coverage top-up: staged ${stagedTotal()} of ~${marketTotal} — checking ${names.length} names via search`);
      let topUpPages = 0;
      for (const { name, c } of names) {
        if (name === 'Other') continue; // Eldorado's misc bucket — discarded by the dashboard anyway
        const first = await fetchSearchPage(name, 1);
        if (!first) continue;
        if (first.listings.length > 0) insertBatch(filterBlacklisted(first.listings).map(toDbRow));
        if (first.recordCount > c && first.recordCount > first.listings.length) {
          // 200-page ceiling (10k listings/name) — top names run ~3.5k today
          const lastPage = Math.min(Math.ceil(first.recordCount / 50), 200);
          for (let p = 2; p <= lastPage; p++) {
            const more = await fetchSearchPage(name, p);
            if (!more || more.listings.length === 0) break;
            insertBatch(filterBlacklisted(more.listings).map(toDbRow));
            topUpPages++;
            await new Promise(r => setTimeout(r, 200));
          }
        }
        await new Promise(r => setTimeout(r, 150));
      }
      const finalStaged = stagedTotal();
      updateProgress.run(pagesScraped, pagesScraped, pagesFailed, finalStaged, runId);
      console.log(`Coverage top-up done: +${topUpPages} extra pages, staged ${finalStaged}/${marketTotal} (${marketTotal > 0 ? Math.round(finalStaged / marketTotal * 100) : 0}%)`);
    }

    // ─── Finalize: atomic swap + snapshots + cleanup ───
    const swap = swapStagingToLive(MIN_LISTINGS_FOR_SWAP);
    if (swap.status === 'ABORTED') {
      console.error(`Scrape ${runId}: swap ABORTED — staging only had ${swap.staging_count} rows (< ${MIN_LISTINGS_FOR_SWAP}). Live data untouched.`);
      db.prepare("UPDATE brainrot_scrape_runs SET status = 'failed', completed_at = ?, staging_count = ? WHERE id = ?")
        .run(nowIso(), swap.staging_count, runId);
      return;
    }

    // Daily price snapshots per (name, mutation, ms) combo
    let snapshotCount = 0;
    try {
      const live = db.prepare('SELECT name, rarity, mutation, ms, price, quantity FROM brainrot_listings').all() as any[];
      const combos: Record<string, any[]> = {};
      for (const l of live) {
        const key = `${l.name}|${l.mutation}|${l.ms}`;
        if (!combos[key]) combos[key] = [];
        combos[key].push(l);
      }
      const today = new Date().toISOString().split('T')[0];
      const upsertSnap = db.prepare(`
        INSERT INTO brainrot_price_history (name, rarity, mutation, ms, min_price, max_price, avg_price, median_price, listing_count, total_qty, snapshot_date)
        VALUES (@name, @rarity, @mutation, @ms, @min_price, @max_price, @avg_price, @median_price, @listing_count, @total_qty, @snapshot_date)
        ON CONFLICT(name, mutation, ms, snapshot_date) DO UPDATE SET
          min_price = excluded.min_price, max_price = excluded.max_price,
          avg_price = excluded.avg_price, median_price = excluded.median_price,
          listing_count = excluded.listing_count, total_qty = excluded.total_qty
      `);
      const snapAll = db.transaction((entries: [string, any[]][]) => {
        for (const [, items] of entries) {
          const prices = items.map((i: any) => i.price).sort((a: number, b: number) => a - b);
          const n = prices.length;
          upsertSnap.run({
            name: items[0].name, rarity: items[0].rarity,
            mutation: items[0].mutation, ms: items[0].ms,
            min_price: prices[0], max_price: prices[n - 1],
            avg_price: n > 0 ? Math.round((prices.reduce((s: number, p: number) => s + p, 0) / n) * 100) / 100 : 0,
            median_price: prices[Math.floor(n / 2)] || 0,
            listing_count: n,
            total_qty: items.reduce((s: number, i: any) => s + (i.quantity || 0), 0),
            snapshot_date: today,
          });
          snapshotCount++;
        }
      });
      snapAll(Object.entries(combos));
    } catch (snapErr: any) {
      console.error('Price snapshot generation failed:', snapErr?.message || snapErr);
    }

    // Eldorado's own total for coverage tracking (already fetched for the
    // top-up; refetch only if that failed) — non-critical
    let eldoradoTotal = marketTotal;
    if (eldoradoTotal === 0) {
      try {
        const countRes = await fetch(ELDORADO_API + '1', {
          headers: { 'User-Agent': 'BrainrotDashboard/4.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (countRes.ok) {
          const countData = await countRes.json();
          eldoradoTotal = countData.recordCount || 0;
        }
      } catch { /* non-critical */ }
    }

    const liveStats = db.prepare(
      'SELECT COALESCE(SUM(quantity), 0) AS qty, COALESCE(AVG(price), 0) AS avg, COALESCE(SUM(is_trending), 0) AS trending FROM brainrot_listings'
    ).get() as any;

    db.prepare(`
      UPDATE brainrot_scrape_runs SET
        status = 'completed', completed_at = ?,
        total_listings = ?, total_brainrots = ?, total_sellers = ?,
        staging_count = ?, delisted_count = ?, new_count = ?,
        total_qty = ?, avg_price = ?, trending_count = ?,
        record_count = ?, marketplace_total = ?
      WHERE id = ?
    `).run(
      nowIso(), swap.new_live, swap.unique_names, swap.unique_sellers,
      swap.staging_count, swap.delisted, swap.new_count,
      liveStats.qty, Math.round(liveStats.avg * 100) / 100, liveStats.trending,
      swap.new_live, eldoradoTotal, runId,
    );

    // Trim old market changes (14 days)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    db.prepare('DELETE FROM brainrot_market_changes WHERE detected_at < ?').run(twoWeeksAgo.toISOString());

    console.log(`Scrape ${runId} completed: ${swap.new_live} listings, ${swap.unique_names} brainrots, ${swap.delisted} delisted, ${snapshotCount} snapshots`);
  } catch (err: any) {
    console.error(`Scrape ${runId} fatal error:`, err?.message || err);
    try { failRun(); } catch { /* best-effort */ }
  }
}

/* ─── Route handler ─── */

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode('cmp'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const [sigA, sigB] = await Promise.all([
      crypto.subtle.sign('HMAC', key, encoder.encode(a)),
      crypto.subtle.sign('HMAC', key, encoder.encode(b)),
    ]);
    const arrA = new Uint8Array(sigA);
    const arrB = new Uint8Array(sigB);
    if (arrA.length !== arrB.length) return false;
    let diff = 0;
    for (let i = 0; i < arrA.length; i++) diff |= arrA[i] ^ arrB[i];
    return diff === 0;
  } catch {
    return a.length === b.length && a === b;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Auth only when CRON_SECRET is configured (kept for hosted deployments;
  // the local desktop app doesn't set it)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret.length >= 8) {
    const secretParam = searchParams.get('secret') || '';
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const paramMatch = secretParam.length > 0 && await timingSafeEqual(secretParam, cronSecret);
    const bearerMatch = bearerToken.length > 0 && await timingSafeEqual(bearerToken, cronSecret);
    if (!paramMatch && !bearerMatch) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const db = getDb();

  // Status poll: GET /api/scrape?action=status
  if (searchParams.get('action') === 'status') {
    const latest = db.prepare('SELECT * FROM brainrot_scrape_runs ORDER BY started_at DESC LIMIT 1').get() || null;
    return NextResponse.json({ run: latest });
  }

  // Overlap guard: refuse if a run started recently and is still marked running
  const staleCutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000).toISOString();
  const activeRun = db.prepare(
    "SELECT id, started_at FROM brainrot_scrape_runs WHERE status = 'running' AND started_at >= ? ORDER BY started_at DESC LIMIT 1"
  ).get(staleCutoff) as any;
  if (activeRun) {
    return NextResponse.json({ success: false, error: 'Scrape already running', runId: activeRun.id }, { status: 409 });
  }

  // Fail any stuck runs, clear staging, create the new run
  db.prepare("UPDATE brainrot_scrape_runs SET status = 'failed', completed_at = ? WHERE status = 'running'").run(nowIso());
  db.prepare('DELETE FROM brainrot_listings_staging').run();
  const runId = db.prepare("INSERT INTO brainrot_scrape_runs (status, total_segments, segments_completed, staging_count) VALUES ('running', 0, 0, 0)")
    .run().lastInsertRowid as number;

  // Fire the full scrape in the background — local server, no time limits.
  runFullScrape(runId).catch(err => console.error(`runFullScrape(${runId}) unhandled:`, err));

  return NextResponse.json({ success: true, runId, mode: 'local', message: 'Scrape started — poll /api/scrape?action=status or the dashboard freshness banner.' });
}
