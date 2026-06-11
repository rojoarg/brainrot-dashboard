import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Scrape blacklist — brainrots the user never wants scraped or shown.
 * Different from the config blacklist (which only excludes pets from
 * generated configs): this one removes them from the entire app.
 *
 * GET             → { blacklisted: string[] }
 * POST {action: 'add'|'remove', name} → updated list. Adding also deletes
 * existing live/staging rows so the pet disappears immediately.
 */

const MAX_NAME_LENGTH = 100;
const MAX_ENTRIES = 500;

function listAll(db: ReturnType<typeof getDb>): string[] {
  return (db.prepare('SELECT pet_name FROM brainrot_scrape_blacklist ORDER BY pet_name').all() as any[])
    .map(r => r.pet_name);
}

export async function GET() {
  try {
    return NextResponse.json({ blacklisted: listAll(getDb()) });
  } catch (err) {
    console.error('Blacklist GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let body: any;
    try { body = await request.json(); } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    const action = body?.action;
    const name = typeof body?.name === 'string'
      ? body.name.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, MAX_NAME_LENGTH)
      : '';
    if ((action !== 'add' && action !== 'remove') || name.length === 0) {
      return NextResponse.json({ success: false, error: 'Expected { action: "add"|"remove", name: string }' }, { status: 400 });
    }

    const db = getDb();
    if (action === 'add') {
      const count = (db.prepare('SELECT COUNT(*) AS c FROM brainrot_scrape_blacklist').get() as any).c as number;
      if (count >= MAX_ENTRIES) {
        return NextResponse.json({ success: false, error: `Blacklist full (max ${MAX_ENTRIES})` }, { status: 400 });
      }
      let removedListings = 0;
      db.transaction(() => {
        db.prepare('INSERT OR IGNORE INTO brainrot_scrape_blacklist (pet_name) VALUES (?)').run(name);
        // Immediate effect: drop existing data for this pet (history and the
        // sold archive are kept — only live market data disappears)
        removedListings = db.prepare('DELETE FROM brainrot_listings WHERE lower(name) = lower(?)').run(name).changes;
        db.prepare('DELETE FROM brainrot_listings_staging WHERE lower(name) = lower(?)').run(name);
      })();
      return NextResponse.json({ success: true, blacklisted: listAll(db), removedListings });
    }

    db.prepare('DELETE FROM brainrot_scrape_blacklist WHERE pet_name = ?').run(name);
    return NextResponse.json({ success: true, blacklisted: listAll(db) });
  } catch (err) {
    console.error('Blacklist POST error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
