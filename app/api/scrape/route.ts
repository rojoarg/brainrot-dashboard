import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const maxDuration = 60;

const ELDORADO_API = 'https://www.eldorado.gg/api/v1/item-management/offers?gameId=259&category=CustomItem&pageSize=50&useMinPurchasePrice=false&pageIndex=';
const IMAGE_BASE = 'https://images.eldorado.gg/';
const CONCURRENT = 5;              // 5 concurrent fetches to avoid rate-limiting
const PAGES_PER_CHUNK = 20;        // 20 pages per chunk â 10s -- safe even when Eldorado API is slow
const CHUNKS_PER_CALL = 1;         // 1 chunk per call
const MAX_PAGES = 1400;            // Eldorado has ~65k listings (1310+ pages x 50/page). 1400 = headroom.
const TOTAL_CHUNKS = Math.ceil(MAX_PAGES / PAGES_PER_CHUNK); // 70 chunks
const TOTAL_CALLS = Math.ceil(TOTAL_CHUNKS / CHUNKS_PER_CALL); // 70 batch calls â 72 hops total
const MIN_LISTINGS_FOR_SWAP = 10000;

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
        headers: { 'User-Agent': 'BrainrotDashboard/3.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        // Rate limited -- wait and retry
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
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

// Sanitize text for safe PostgreSQL insertion -- strips null bytes and control chars
function sanitizeText(val: string | null, maxLen: number = 500): string {
  if (!val) return '';
  const cleaned = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.slice(0, maxLen);
}

function toDbRow(l: Listing) {
  return {
    name: sanitizeText(l.name), rarity: sanitizeText(l.rarity),
    mutation: sanitizeText(l.mutation), ms: sanitizeText(l.ms),
    exact_ms: l.exact_ms, price: l.price, quantity: l.quantity,
    seller: sanitizeText(l.seller), verified: l.verified, offer_id: l.offer_id,
    seller_rating: Math.round(l.seller_rating * 100) / 100,
    seller_feedback_count: l.seller_feedback_count,
    seller_positive: l.seller_positive, seller_negative: l.seller_negative,
    seller_dispute_ratio: Math.round(l.seller_dispute_ratio * 10000) / 10000,
    seller_warranty: l.seller_warranty, seller_id: l.seller_id,
    seller_joined: l.seller_joined,
    offer_title: sanitizeText(l.offer_title, 255),
    delivery_time: sanitizeText(l.delivery_time, 100),
    is_trending: l.is_trending,
    expire_date: l.expire_date, offer_state: l.offer_state,
    description: sanitizeText(l.description, 500),
    image_url: l.image_url,
    original_currency: sanitizeText(l.original_currency),
    original_price: l.original_price,
    exchange_rate: l.exchange_rate,
    first_seen_at: new Date().toISOString(),
  };
}

// Chain: trigger the next batch via Supabase pg_net (external HTTP).
// This avoids Vercel's 508 Loop Detected error -- the HTTP call originates from
// Supabase's infrastructure, not from within the Vercel function chain.
// pg_net timeout is 55s (set in trigger_scrape_batch SQL function).
async function triggerNext(baseUrl: string, secret: string, nextSegment: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await supabase.rpc('trigger_scrape_batch', {
        base_url: baseUrl,
        secret: secret,
        segment: nextSegment,
      });
      if (error) {
        console.error(`triggerNext ${nextSegment} RPC error (attempt ${attempt}):`, error.message);
        if (attempt === 0) { await new Promise(r => setTimeout(r, 1000)); continue; }
        // Final fallback: direct fetch (may 508 but better than dropping chain)
        try {
          await fetch(`${baseUrl}/api/scrape?segment=${nextSegment}&secret=${secret}`, {
            headers: { 'Authorization': `Bearer ${secret}` },
            signal: AbortSignal.timeout(5000),
          });
        } catch (err) { console.warn('triggerNext fallback fetch failed:', err instanceof Error ? err.message : err); }
      } else {
        console.log(`triggerNext ${nextSegment}: pg_net dispatched`, JSON.stringify(data));
        return; // Success
      }
    } catch (err) {
      console.error(`triggerNext ${nextSegment} exception (attempt ${attempt}):`, err);
      if (attempt === 0) { await new Promise(r => setTimeout(r, 1000)); continue; }
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Auth: support both query param (?secret=...) and Vercel cron header (Authorization: Bearer ...)
  const secretParam = searchParams.get('secret') || '';
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 8) {
    console.error('CRON_SECRET not set or too short');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  // Timing-safe comparison using HMAC to prevent brute-force via timing analysis
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
      // Fallback: length-check + direct compare (still safer than no check)
      return a.length === b.length && a === b;
    }
  }
  const paramMatch = secretParam.length > 0 && await timingSafeEqual(secretParam, cronSecret);
  const bearerMatch = (bearerToken || '').length > 0 && await timingSafeEqual(bearerToken || '', cronSecret);
  if (!paramMatch && !bearerMatch) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const segment = searchParams.get('segment');
  // Hardcode base URL to prevent SSRF via Host header injection
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : new URL(request.url).origin;

  // Validate segment to prevent injection
  if (segment && !/^(init|finalize|batch-\d{1,3})$/.test(segment)) {
    return NextResponse.json({ error: 'Invalid segment' }, { status: 400 });
  }

  // Default (no segment) = init
  if (!segment || segment === 'init') {
    const initResult = await initScrape();
    // Only chain to batch-0 if init succeeded (not 409 overlap or 500 error)
    if (initResult.status === 200) {
      await triggerNext(baseUrl, cronSecret,'batch-0');
    }
    return initResult;
  }

  if (segment === 'finalize') return finalizeScrape();

  // Batch processing: each call processes 1 chunk (20 pages, ~10-15s -- safe under 60s)
  if (segment.startsWith('batch-')) {
    const batchParts = segment.split('-');
    const batchNum = batchParts.length > 1 ? parseInt(batchParts[1], 10) : NaN;
    if (isNaN(batchNum) || batchNum < 0 || batchNum >= TOTAL_CALLS) {
      return NextResponse.json({ error: 'Invalid batch number', segment }, { status: 400 });
    }

    // Verify there's still a running scrape run (chain integrity check)
    const { data: activeRun } = await supabase
      .from('brainrot_scrape_runs')
      .select('id')
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (!activeRun) {
      return NextResponse.json({ error: 'No active scrape run -- chain broken', step: `batch-${batchNum}` }, { status: 409 });
    }

    const chunkNum = batchNum; // 1:1 mapping now (CHUNKS_PER_CALL=1)
    // Chain: trigger next batch BEFORE scraping (fire-before-scrape pattern).
    // This ensures the trigger doesn't push us past Vercel's 60s limit.
    // 5s stagger limits peak concurrency to ~3 batches (each takes ~15s).
    if (batchNum < TOTAL_CALLS - 1) {
      await new Promise(r => setTimeout(r, 5000));
      await triggerNext(baseUrl, cronSecret, `batch-${batchNum + 1}`);
    }

    let result;
    try {
      result = await scrapeSegment(chunkNum);
    } catch (err: any) {
      console.error(`batch-${batchNum} scrapeSegment error:`, err);
      await supabase.from('brainrot_scrape_runs').update({
        status: 'failed', completed_at: new Date().toISOString(),
      }).eq('id', activeRun.id);
      return NextResponse.json({ error: 'Segment failed', step: `batch-${batchNum}` }, { status: 500 });
    }

    // Last batch -- trigger finalize as a separate hop (it needs its own 60s budget
    // for waiting on parallel batches + swap RPC + snapshot generation)
    if (batchNum === TOTAL_CALLS - 1) {
      await triggerNext(baseUrl, cronSecret, 'finalize');
    }

    return NextResponse.json({ step: `batch-${batchNum}`, ...result });
  }

  return NextResponse.json({ error: 'Invalid segment' }, { status: 400 });
}

// âââ INIT: Clear STAGING table (NOT live), create run âââ
async function initScrape() {
  // Check for recently started runs to prevent overlap (within last 15 minutes)
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: recentRuns } = await supabase
    .from('brainrot_scrape_runs')
    .select('id, started_at')
    .eq('status', 'running')
    .gte('started_at', fifteenMinAgo);

  if (recentRuns && recentRuns.length > 0) {
    return NextResponse.json({
      success: false, step: 'init',
      error: 'Scrape already running',
      runId: recentRuns[0].id,
    }, { status: 409 });
  }

  // Fail any old stuck runs (older than 15 min)
  await supabase.from('brainrot_scrape_runs').update({
    status: 'failed',
    completed_at: new Date().toISOString(),
  }).eq('status', 'running');

  // Create new scrape run BEFORE clearing staging -- ensures run exists before chain starts
  const { data: run, error: runErr } = await supabase
    .from('brainrot_scrape_runs')
    .insert({ status: 'running', total_segments: TOTAL_CHUNKS, segments_completed: 0, staging_count: 0 })
    .select()
    .single();

  if (runErr) {
    console.error('Failed to create scrape run:', runErr.message);
    return NextResponse.json({ success: false, error: 'Failed to create scrape run' }, { status: 500 });
  }

  // Clear STAGING table only -- live data stays intact
  const { error: clearErr } = await supabase.from('brainrot_listings_staging').delete().neq('id', 0);
  if (clearErr) {
    // Roll back the run if staging clear fails
    await supabase.from('brainrot_scrape_runs').update({ status: 'failed' }).eq('id', run.id);
    return NextResponse.json({ success: false, error: 'Failed to clear staging' }, { status: 500 });
  }

  return NextResponse.json({ success: true, runId: run?.id, step: 'init', totalBatches: TOTAL_CALLS });
}

// âââ CHUNK: Scrape pages into STAGING table âââ
async function scrapeSegment(chunkNum: number) {
  const t0 = Date.now();
  const startPage = chunkNum * PAGES_PER_CHUNK + 1;
  const endPage = Math.min((chunkNum + 1) * PAGES_PER_CHUNK, MAX_PAGES);
  const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  const allListings: Listing[] = [];
  let failed = 0;
  let consecutiveEmpty = 0;
  let reachedEnd = false;

  for (let i = 0; i < pages.length; i += CONCURRENT) {
    if (reachedEnd) break;
    const batch = pages.slice(i, i + CONCURRENT);
    const results = await Promise.all(batch.map(p => fetchPage(p)));
    for (const r of results) {
      if (r === null) {
        failed++;
        consecutiveEmpty = 0; // Errors don't count as "end"
      } else if (r.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 5) { reachedEnd = true; break; }
      } else {
        consecutiveEmpty = 0;
        allListings.push(...r);
      }
    }
    if (i + CONCURRENT < pages.length && !reachedEnd) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Deduplicate
  const seenIds = new Set<string>();
  const deduped: Listing[] = [];
  for (const l of allListings) {
    if (l.offer_id && !seenIds.has(l.offer_id)) {
      seenIds.add(l.offer_id);
      deduped.push(l);
    }
  }
  seenIds.clear(); // Explicit GC cleanup

  // Upsert into STAGING table (not live) -- dedup by offer_id
  let upsertErrors = 0;
  for (let i = 0; i < deduped.length; i += 500) {
    const { error: upsertErr } = await supabase.from('brainrot_listings_staging').upsert(
      deduped.slice(i, i + 500).map(l => toDbRow(l)),
      { onConflict: 'offer_id' }
    );
    if (upsertErr) {
      console.error(`Staging upsert batch ${i} error:`, upsertErr.message);
      upsertErrors++;
      if (upsertErrors > 5) {
        console.error(`Too many upsert errors (${upsertErrors}), halting batch processing`);
        break;
      }
    }
  }

  // Update run progress -- use actual DB count to avoid inflated cross-segment duplicates
  const { data: runningRun } = await supabase
    .from('brainrot_scrape_runs')
    .select('id, segments_completed')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (runningRun) {
    // Get real staging count from DB (accurate after upsert deduplication)
    const { count: realStagingCount, error: countErr } = await supabase
      .from('brainrot_listings_staging')
      .select('*', { count: 'exact', head: true });

    if (countErr) {
      console.error(`Staging count query error for batch ${chunkNum}:`, countErr.message);
    }

    await supabase.from('brainrot_scrape_runs').update({
      segments_completed: (runningRun.segments_completed || 0) + 1,
      staging_count: realStagingCount || 0,
    }).eq('id', runningRun.id);
  }

  const fetchedCount = deduped.length;
  // Cleanup large arrays for GC before returning (memory leak prevention across chunks)
  allListings.length = 0;
  deduped.length = 0;

  return { chunk: chunkNum, pages: `${startPage}-${endPage}`, fetched: fetchedCount, failed, upsertErrors, durationMs: Date.now() - t0 };
}

// âââ FINALIZE: Wait for all batches, then atomic swap stagingâlive âââ
async function finalizeScrape() {
  try {
  // Find running run
  const { data: runningRun } = await supabase
    .from('brainrot_scrape_runs')
    .select('id, segments_completed, total_segments')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  // Wait for parallel batches to finish (fire-before-scrape means some may still be running)
  if (runningRun) {
    const target = runningRun.total_segments || TOTAL_CHUNKS;
    let waited = 0;
    const MAX_WAIT = 45000; // 45s max (accounting for slow batches under Vercel 60s limit)
    let lastCompleted = 0;
    while (waited < MAX_WAIT) {
      const { data: check } = await supabase
        .from('brainrot_scrape_runs')
        .select('segments_completed')
        .eq('id', runningRun.id)
        .single();
      const completed = check?.segments_completed || 0;
      if (completed >= target) break;
      if (completed === lastCompleted && waited > 20000) {
        console.warn(`finalizeScrape: progress stalled at ${completed}/${target} after ${waited}ms`);
      }
      lastCompleted = completed;
      await new Promise(r => setTimeout(r, 3000));
      waited += 3000;
    }
    if (waited >= MAX_WAIT) {
      console.warn(`finalizeScrape: timeout waiting for batches (${lastCompleted}/${target} completed), proceeding with swap`);
    }
  }

  // Call server-side PostgreSQL function for atomic swap (runs in ~2s instead of 30+s)
  const { data: swapResult, error: swapError } = await supabase.rpc('swap_staging_to_live');

  if (swapError || !swapResult) {
    if (runningRun) {
      await supabase.from('brainrot_scrape_runs').update({
        status: 'failed', completed_at: new Date().toISOString(),
      }).eq('id', runningRun.id);
    }
    return NextResponse.json({
      step: 'finalize', status: 'ERROR',
      error: swapError?.message || 'RPC swap failed',
    }, { status: 500 });
  }

  if (swapResult.status === 'ABORTED') {
    if (runningRun) {
      await supabase.from('brainrot_scrape_runs').update({
        status: 'failed', completed_at: new Date().toISOString(),
        staging_count: swapResult.staging_count,
      }).eq('id', runningRun.id);
    }
    return NextResponse.json({ step: 'finalize', ...swapResult });
  }

  // Generate price snapshots BEFORE marking run as completed
  let snapshotCount = 0;
  try {
    let liveListings: any[] = [];
    let page = 0;
    const MAX_SNAPSHOT_PAGES = 200;
    while (page < MAX_SNAPSHOT_PAGES) {
      const { data, error } = await supabase
        .from('brainrot_listings')
        .select('name, rarity, mutation, ms, price, quantity')
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (error) {
        console.error(`Snapshot fetch page ${page} error:`, error.message);
        break;
      }
      if (!data || data.length === 0) break;
      liveListings = liveListings.concat(data);
      if (data.length < 1000) break;
      page++;
    }

    const combos: Record<string, any[]> = {};
    for (const l of liveListings) {
      const key = `${l.name}|${l.mutation}|${l.ms}`;
      if (!combos[key]) combos[key] = [];
      combos[key].push(l);
    }
    const snapshots = Object.entries(combos).map(([, items]) => {
      const prices = items.map((i: any) => i.price).sort((a: number, b: number) => a - b);
      const n = prices.length;
      return {
        name: items[0].name, rarity: items[0].rarity,
        mutation: items[0].mutation, ms: items[0].ms,
        min_price: prices[0], max_price: prices[n - 1],
        avg_price: n > 0 ? Math.round((prices.reduce((s: number, p: number) => s + p, 0) / n) * 100) / 100 : 0,
        median_price: prices[Math.floor(n / 2)] || 0,
        listing_count: n,
        total_qty: items.reduce((s: number, i: any) => s + (i.quantity || 0), 0),
      };
    });
    for (let i = 0; i < snapshots.length; i += 500) {
      const { error: upsertErr } = await supabase.from('brainrot_price_history').upsert(snapshots.slice(i, i + 500), {
        onConflict: 'name,mutation,ms,snapshot_date',
      });
      if (upsertErr) console.error(`Snapshot upsert batch ${i} error:`, upsertErr.message);
    }
    snapshotCount = snapshots.length;
  } catch (snapErr: any) {
    // Price snapshots are non-critical -- log but don't fail the scrape
    console.error('Price snapshot generation failed:', snapErr.message);
  }

  // Fetch Eldorado's actual listing count for coverage tracking
  let eldoradoTotal = 0;
  try {
    const countRes = await fetch(ELDORADO_API + '1', {
      headers: { 'User-Agent': 'BrainrotDashboard/3.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (countRes.ok) {
      const countData = await countRes.json();
      eldoradoTotal = countData.recordCount || countData.totalPages || 0;
    }
  } catch { /* non-critical */ }

  // NOW mark run as completed (after snapshots)
  if (runningRun) {
    await supabase.from('brainrot_scrape_runs').update({
      completed_at: new Date().toISOString(),
      total_listings: swapResult.new_live,
      total_brainrots: swapResult.unique_names,
      total_sellers: swapResult.unique_sellers,
      status: 'completed',
      staging_count: swapResult.staging_count,
      delisted_count: swapResult.delisted,
      marketplace_total: eldoradoTotal,
    }).eq('id', runningRun.id);
  }

  // Clean old market changes (14 days) -- non-critical
  try {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    await supabase.from('brainrot_market_changes').delete().lt('detected_at', twoWeeksAgo.toISOString());
  } catch (cleanErr: any) {
    console.error('Market changes cleanup failed:', cleanErr.message);
  }

  return NextResponse.json({
    step: 'finalize',
    status: 'SUCCESS',
    ...swapResult,
    snapshots: snapshotCount,
  });
  } catch (err: any) {
    console.error('finalizeScrape fatal error:', err);
    // Attempt to mark run as failed
    try {
      await supabase.from('brainrot_scrape_runs').update({
        status: 'failed', completed_at: new Date().toISOString(),
      }).eq('status', 'running');
    } catch { /* best-effort */ }
    return NextResponse.json({
      step: 'finalize', status: 'ERROR',
      error: 'Finalize failed',
    }, { status: 500 });
  }
}
