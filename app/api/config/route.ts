import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [{ data: watchlist, error: wlErr }, { data: blacklist, error: blErr }] = await Promise.all([
      supabase.from('brainrot_watchlist').select('*').order('priority'),
      supabase.from('brainrot_blacklist').select('*').order('pet_name'),
    ]);

    if (wlErr || blErr) {
      console.error('Config GET errors:', wlErr?.message, blErr?.message);
      return NextResponse.json(
        { error: 'Failed to fetch config' },
        { status: 500 }
      );
    }

    return NextResponse.json({
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
const MAX_MUTATIONS_PER_ITEM = 50;

// Sanitize pet names: remove control chars, null bytes, trim (defense-in-depth for Supabase parameterized queries)
function sanitizePetName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '';
  return trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, MAX_PET_NAME_LENGTH);
}

export async function POST(request: Request) {
  try {
    // Guard against oversized request bodies (max ~200KB for config)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 200_000) {
      return NextResponse.json({ success: false, error: 'Request body too large' }, { status: 413 });
    }

    let config;
    try {
      config = await request.json();
    } catch {
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

    // Sync watchlist — delete all then re-insert
    // Note: Supabase JS client doesn't support transactions, but the delete+insert
    // pattern is acceptable here since this is a user-initiated config save and
    // partial failure returns an error so the user knows to retry.
    const { error: delWlErr } = await supabase.from('brainrot_watchlist').delete().neq('id', 0);
    if (delWlErr) {
      return NextResponse.json({ success: false, error: 'Failed to clear watchlist' }, { status: 500 });
    }
    if (dedupedWl.length > 0) {
      const rows = dedupedWl.map((w: any, i: number) => {
        const row: { pet_name: string; priority: number; min_value: number; mutations: Record<string, number> } = {
          pet_name: sanitizePetName(w.pet_name.trim()),
          priority: typeof w.priority === 'number' && isFinite(w.priority) ? Math.max(0, Math.min(w.priority, 10000)) : i + 1,
          min_value: typeof w.min_value === 'number' && isFinite(w.min_value) ? Math.max(0, Math.min(w.min_value, 1e12)) : 0,
          mutations: {},
        };
        if (w.mutations && typeof w.mutations === 'object') {
          let mutCount = 0;
          for (const [k, v] of Object.entries(w.mutations)) {
            if (mutCount >= MAX_MUTATIONS_PER_ITEM) break;
            if (typeof k === 'string' && k.length > 0 && k.length <= 100 && typeof v === 'number' && isFinite(v) && v > 0) {
              row.mutations[k] = Math.min(v, 1e12);
              mutCount++;
            }
          }
        }
        return row;
      });
      for (let i = 0; i < rows.length; i += 50) {
        const { error: insErr } = await supabase.from('brainrot_watchlist').insert(rows.slice(i, i + 50));
        if (insErr) {
          return NextResponse.json({ success: false, error: 'Failed to insert watchlist batch', inserted: i }, { status: 500 });
        }
      }
    }

    // Sync blacklist
    const { error: delBlErr } = await supabase.from('brainrot_blacklist').delete().neq('id', 0);
    if (delBlErr) {
      return NextResponse.json({ success: false, error: 'Failed to clear blacklist' }, { status: 500 });
    }
    if (dedupedBl.length > 0) {
      const rows = dedupedBl.map((name: string) => ({ pet_name: sanitizePetName(name.trim()) }));
      for (let i = 0; i < rows.length; i += 50) {
        const { error: insErr } = await supabase.from('brainrot_blacklist').insert(rows.slice(i, i + 50));
        if (insErr) {
          return NextResponse.json({ success: false, error: 'Failed to insert blacklist batch', inserted: i }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true, whitelisted: dedupedWl.length, blacklisted: dedupedBl.length });
  } catch (err: any) {
    console.error('Config POST error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
