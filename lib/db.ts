import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Local SQLite data layer — replaces Supabase so the dashboard runs fully
 * offline as a desktop app. One file, zero config, no credentials.
 *
 * DB location: BRAINROT_DB_PATH env var (set by the Electron shell to the
 * user-data dir) or ./data/brainrot.db when running `next dev` directly.
 */

const DB_PATH = process.env.BRAINROT_DB_PATH
  || path.join(process.cwd(), 'data', 'brainrot.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  initSchema(_db);
  return _db;
}

const LISTING_COLUMNS = `
  name TEXT NOT NULL,
  rarity TEXT DEFAULT '',
  mutation TEXT DEFAULT 'None',
  ms TEXT DEFAULT 'N/A',
  exact_ms REAL,
  price REAL NOT NULL,
  quantity INTEGER DEFAULT 0,
  seller TEXT DEFAULT '',
  verified INTEGER DEFAULT 0,
  offer_id TEXT NOT NULL,
  seller_rating REAL DEFAULT 0,
  seller_feedback_count INTEGER DEFAULT 0,
  seller_positive INTEGER DEFAULT 0,
  seller_negative INTEGER DEFAULT 0,
  seller_dispute_ratio REAL DEFAULT 0,
  seller_warranty INTEGER DEFAULT 0,
  seller_id TEXT DEFAULT '',
  seller_joined TEXT,
  offer_title TEXT DEFAULT '',
  delivery_time TEXT DEFAULT '',
  is_trending INTEGER DEFAULT 0,
  expire_date TEXT,
  offer_state TEXT DEFAULT 'Active',
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  original_currency TEXT DEFAULT '',
  original_price REAL DEFAULT 0,
  exchange_rate REAL DEFAULT 0,
  first_seen_at TEXT`;

// Shared column list (without id) for INSERT ... SELECT between live/staging.
export const LISTING_COL_NAMES = [
  'name', 'rarity', 'mutation', 'ms', 'exact_ms', 'price', 'quantity', 'seller',
  'verified', 'offer_id', 'seller_rating', 'seller_feedback_count', 'seller_positive',
  'seller_negative', 'seller_dispute_ratio', 'seller_warranty', 'seller_id',
  'seller_joined', 'offer_title', 'delivery_time', 'is_trending', 'expire_date',
  'offer_state', 'description', 'image_url', 'original_currency', 'original_price',
  'exchange_rate', 'first_seen_at',
] as const;

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS brainrot_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ${LISTING_COLUMNS}
    );
    CREATE INDEX IF NOT EXISTS idx_listings_name ON brainrot_listings(name);
    CREATE INDEX IF NOT EXISTS idx_listings_offer ON brainrot_listings(offer_id);

    CREATE TABLE IF NOT EXISTS brainrot_listings_staging (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ${LISTING_COLUMNS},
      UNIQUE(offer_id)
    );

    CREATE TABLE IF NOT EXISTS brainrot_watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_name TEXT NOT NULL UNIQUE,
      priority INTEGER DEFAULT 0,
      min_value REAL DEFAULT 1000000,
      mutations TEXT DEFAULT NULL  -- JSON: Record<string, number>
    );

    CREATE TABLE IF NOT EXISTS brainrot_blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_name TEXT NOT NULL UNIQUE
    );

    -- Scrape blacklist: brainrots the user never wants scraped or shown
    -- anywhere in the app (different from brainrot_blacklist, which only
    -- excludes pets from generated configs).
    CREATE TABLE IF NOT EXISTS brainrot_scrape_blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_name TEXT NOT NULL UNIQUE COLLATE NOCASE
    );

    CREATE TABLE IF NOT EXISTS brainrot_scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      completed_at TEXT,
      total_segments INTEGER DEFAULT 0,
      segments_completed INTEGER DEFAULT 0,
      staging_count INTEGER DEFAULT 0,
      total_listings INTEGER DEFAULT 0,
      total_brainrots INTEGER DEFAULT 0,
      total_sellers INTEGER DEFAULT 0,
      pages_scraped INTEGER DEFAULT 0,
      pages_failed INTEGER DEFAULT 0,
      total_qty INTEGER DEFAULT 0,
      delisted_count INTEGER DEFAULT 0,
      new_count INTEGER DEFAULT 0,
      trending_count INTEGER DEFAULT 0,
      avg_price REAL DEFAULT 0,
      record_count INTEGER DEFAULT 0,
      marketplace_total INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS brainrot_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rarity TEXT DEFAULT '',
      mutation TEXT DEFAULT 'None',
      ms TEXT DEFAULT 'N/A',
      min_price REAL DEFAULT 0,
      max_price REAL DEFAULT 0,
      avg_price REAL DEFAULT 0,
      median_price REAL DEFAULT 0,
      listing_count INTEGER DEFAULT 0,
      total_qty INTEGER DEFAULT 0,
      snapshot_date TEXT NOT NULL DEFAULT (date('now')),
      UNIQUE(name, mutation, ms, snapshot_date)
    );
    CREATE INDEX IF NOT EXISTS idx_history_date ON brainrot_price_history(snapshot_date);

    CREATE TABLE IF NOT EXISTS brainrot_market_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_type TEXT NOT NULL,  -- 'delisted' | 'new'
      name TEXT NOT NULL,
      rarity TEXT DEFAULT '',
      mutation TEXT DEFAULT 'None',
      ms TEXT DEFAULT 'N/A',
      price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      seller TEXT DEFAULT '',
      detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_changes_detected ON brainrot_market_changes(detected_at);

    CREATE TABLE IF NOT EXISTS brainrot_sold_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_id TEXT DEFAULT '',
      name TEXT NOT NULL,
      rarity TEXT DEFAULT '',
      mutation TEXT DEFAULT 'None',
      ms TEXT DEFAULT 'N/A',
      exact_ms REAL,
      price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      seller TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      first_seen_at TEXT,
      sold_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sold_at ON brainrot_sold_archive(sold_at);
    CREATE INDEX IF NOT EXISTS idx_sold_name ON brainrot_sold_archive(name);
  `);
}

export const nowIso = () => new Date().toISOString();

/**
 * Atomic staging→live swap (replaces the Supabase `swap_staging_to_live` RPC).
 * - Aborts (keeps live data intact) when staging looks like a partial scrape.
 * - Offers present in live but missing from staging → sold/delisted archive
 *   + market change rows. New offers → 'new' market change rows.
 * - Preserves first_seen_at for offers that already existed.
 */
export function swapStagingToLive(minListingsForSwap: number): {
  status: 'SUCCESS' | 'ABORTED';
  staging_count: number;
  new_live: number;
  unique_names: number;
  unique_sellers: number;
  delisted: number;
  new_count: number;
} {
  const db = getDb();
  const cols = LISTING_COL_NAMES.join(', ');
  const run = db.transaction(() => {
    const stagingCount = (db.prepare('SELECT COUNT(*) AS c FROM brainrot_listings_staging').get() as any).c as number;
    if (stagingCount < minListingsForSwap) {
      return { status: 'ABORTED' as const, staging_count: stagingCount, new_live: 0, unique_names: 0, unique_sellers: 0, delisted: 0, new_count: 0 };
    }
    const liveCount = (db.prepare('SELECT COUNT(*) AS c FROM brainrot_listings').get() as any).c as number;
    const soldAt = nowIso();

    // Change detection only makes sense between two comparable full scrapes.
    // Skip it when live is empty (first populate) OR much smaller than
    // staging (bootstrap preview swap mid-first-scrape) — otherwise the
    // whole market gets flagged "new"/"delisted" as noise.
    const detectChanges = liveCount >= stagingCount * 0.5;

    // Keep original first_seen_at for offers that persisted across scrapes
    db.prepare(`
      UPDATE brainrot_listings_staging SET first_seen_at = COALESCE(
        (SELECT l.first_seen_at FROM brainrot_listings l WHERE l.offer_id = brainrot_listings_staging.offer_id),
        first_seen_at
      )`).run();

    // Delisted = in live, missing from staging → archive as sold + market change
    let delisted = 0;
    let newCount = 0;
    if (detectChanges) {
      delisted = db.prepare(`
        INSERT INTO brainrot_sold_archive (offer_id, name, rarity, mutation, ms, exact_ms, price, quantity, seller, image_url, first_seen_at, sold_at)
        SELECT offer_id, name, rarity, mutation, ms, exact_ms, price, quantity, seller, image_url, first_seen_at, ?
        FROM brainrot_listings
        WHERE offer_id NOT IN (SELECT offer_id FROM brainrot_listings_staging)
      `).run(soldAt).changes;

      db.prepare(`
        INSERT INTO brainrot_market_changes (change_type, name, rarity, mutation, ms, price, quantity, seller, detected_at)
        SELECT 'delisted', name, rarity, mutation, ms, price, quantity, seller, ?
        FROM brainrot_listings
        WHERE offer_id NOT IN (SELECT offer_id FROM brainrot_listings_staging)
          AND name != 'Other'
      `).run(soldAt);

      // New offers = in staging, missing from live ('Other' junk excluded)
      newCount = db.prepare(`
        INSERT INTO brainrot_market_changes (change_type, name, rarity, mutation, ms, price, quantity, seller, detected_at)
        SELECT 'new', name, rarity, mutation, ms, price, quantity, seller, ?
        FROM brainrot_listings_staging
        WHERE offer_id NOT IN (SELECT offer_id FROM brainrot_listings)
          AND name != 'Other'
      `).run(soldAt).changes;
    }

    // The swap itself
    db.prepare('DELETE FROM brainrot_listings').run();
    db.prepare(`INSERT INTO brainrot_listings (${cols}) SELECT ${cols} FROM brainrot_listings_staging`).run();

    const stats = db.prepare(`
      SELECT COUNT(*) AS new_live,
             COUNT(DISTINCT name) AS unique_names,
             COUNT(DISTINCT seller) AS unique_sellers
      FROM brainrot_listings
    `).get() as any;

    return {
      status: 'SUCCESS' as const,
      staging_count: stagingCount,
      new_live: stats.new_live as number,
      unique_names: stats.unique_names as number,
      unique_sellers: stats.unique_sellers as number,
      delisted,
      new_count: newCount,
    };
  });
  return run();
}
