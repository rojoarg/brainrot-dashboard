import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseMutations(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length > 0) return obj;
  } catch { /* corrupt JSON — treat as no mutations */ }
  return undefined;
}

export async function GET() {
  try {
    const db = getDb();
    const watchlist = db.prepare('SELECT * FROM brainrot_watchlist ORDER BY priority').all() as any[];
    const blacklist = db.prepare('SELECT * FROM brainrot_blacklist ORDER BY pet_name').all() as any[];

    return NextResponse.json({
      whitelisted: watchlist.map((w: any) => {
        const item: { pet_name: string; priority: number; min_value: number; mutations?: Record<string, number> } = {
          pet_name: w.pet_name,
          priority: w.priority,
          min_value: Number(w.min_value) || 1000000,
        };
        const muts = parseMutations(w.mutations);
        if (muts) item.mutations = muts;
        return item;
      }),
      blacklisted: blacklist.map((b: any) => b.pet_name),
      version: '1.0',
    });
  } catch (err: any) {
    console.error('Config GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const MAX_WATCHLIST_SIZE = 500;
const MAX_BLACKLIST_SIZE = 500;
const MAX_PET_NAME_LENGTH = 100;
const MAX_MUTATIONS_PER_ITEM = 20;
const MAX_TOTAL_MUTATIONS = 2000;

// Sanitize pet names: remove control chars, null bytes, trim
function sanitizePetName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '';
  return trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, MAX_PET_NAME_LENGTH);
}

export async function POST(request: Request) {
  try {
    // Auth: only require auth if CONFIG_SECRET is explicitly set.
    const authHeader = request.headers.get('authorization');
    const configSecret = process.env.CONFIG_SECRET;
    if (configSecret) {
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (bearerToken !== configSecret) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Guard against oversized request bodies (max ~200KB for config)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 200_000) {
      return NextResponse.json({ success: false, error: 'Request body too large' }, { status: 413 });
    }

    let config;
    try {
      config = await request.json();
    } catch (err) {
      console.error('Config POST: JSON parse failed:', err instanceof Error ? err.message : err);
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    const { whitelisted = [], blacklisted = [] } = config;

    // Input validation
    if (!Array.isArray(whitelisted) || !Array.isArray(blacklisted)) {
      return NextResponse.json({ success: false, error: 'whitelisted and blacklisted must be arrays' }, { status: 400 });
    }
    if (whitelisted.length > MAX_WATCHLIST_SIZE) {
      return NextResponse.json({ success: false, error: `Watchlist too large (max ${MAX_WATCHLIST_SIZE})` }, { status: 400 });
    }
    if (blacklisted.length > MAX_BLACKLIST_SIZE) {
      return NextResponse.json({ success: false, error: `Blacklist too large (max ${MAX_BLACKLIST_SIZE})` }, { status: 400 });
    }

    const validWl = whitelisted.filter(
      (w: any) => w &&
        typeof w.pet_name === 'string' &&
        w.pet_name.trim().length > 0 &&
        w.pet_name.trim().length <= MAX_PET_NAME_LENGTH &&
        (w.priority == null || (typeof w.priority === 'number' && isFinite(w.priority) && w.priority >= 0)) &&
        (w.min_value == null || (typeof w.min_value === 'number' && isFinite(w.min_value) && w.min_value >= 0))
    );
    const validBl = blacklisted.filter(
      (name: any) => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= MAX_PET_NAME_LENGTH
    );

    // Deduplicate by pet_name (case-insensitive, keep first occurrence)
    const seenWl = new Set<string>();
    const dedupedWl = validWl.filter((w: any) => {
      const key = w.pet_name.trim().toLowerCase();
      if (seenWl.has(key)) return false;
      seenWl.add(key);
      return true;
    });
    const seenBl = new Set<string>();
    const dedupedBl = validBl.filter((name: string) => {
      const key = name.trim().toLowerCase();
      if (seenBl.has(key)) return false;
      seenBl.add(key);
      return true;
    });

    // Remove items from blacklist if they appear in watchlist (watchlist wins)
    const wlNames = new Set(dedupedWl.map((w: any) => w.pet_name.trim().toLowerCase()));
    const finalBl = dedupedBl.filter((name: string) => !wlNames.has(name.trim().toLowerCase()));

    // Build sanitized rows before the transaction
    let globalMutCount = 0;
    const wlRows = dedupedWl.map((w: any, i: number) => {
      const muts: Record<string, number> = {};
      if (w.mutations && typeof w.mutations === 'object') {
        let mutCount = 0;
        for (const [k, v] of Object.entries(w.mutations)) {
          if (mutCount >= MAX_MUTATIONS_PER_ITEM || globalMutCount >= MAX_TOTAL_MUTATIONS) break;
          if (typeof k === 'string' && k.length > 0 && k.length <= 100 && typeof v === 'number' && isFinite(v) && v > 0) {
            muts[k] = Math.min(v, 1e12);
            mutCount++;
            globalMutCount++;
          }
        }
      }
      return {
        pet_name: sanitizePetName(w.pet_name.trim()),
        priority: typeof w.priority === 'number' && isFinite(w.priority) ? Math.max(0, Math.min(w.priority, 10000)) : i + 1,
        min_value: typeof w.min_value === 'number' && isFinite(w.min_value) ? Math.max(0, Math.min(w.min_value, 1e12)) : 0,
        mutations: Object.keys(muts).length > 0 ? JSON.stringify(muts) : null,
      };
    });
    const blRows = finalBl.map((name: string) => sanitizePetName(name.trim()));

    // Atomic replace — SQLite transaction (no partial-failure window like the
    // old Supabase delete+insert pattern)
    const db = getDb();
    const insertWl = db.prepare('INSERT OR REPLACE INTO brainrot_watchlist (pet_name, priority, min_value, mutations) VALUES (?, ?, ?, ?)');
    const insertBl = db.prepare('INSERT OR REPLACE INTO brainrot_blacklist (pet_name) VALUES (?)');
    db.transaction(() => {
      db.prepare('DELETE FROM brainrot_watchlist').run();
      for (const r of wlRows) insertWl.run(r.pet_name, r.priority, r.min_value, r.mutations);
      db.prepare('DELETE FROM brainrot_blacklist').run();
      for (const name of blRows) insertBl.run(name);
    })();

    return NextResponse.json({ success: true, whitelisted: wlRows.length, blacklisted: blRows.length });
  } catch (err: any) {
    console.error('Config POST error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
