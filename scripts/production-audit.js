// Production audit: node scripts/production-audit.js
// Verifies data completeness of the local DB after a full scrape.
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(process.env.BRAINROT_DB_PATH || path.join(__dirname, '..', 'data', 'brainrot.db'));

const q = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);

console.log('=== LISTINGS ===');
const t = one('SELECT COUNT(*) c, COUNT(DISTINCT name) names, COUNT(DISTINCT seller) sellers FROM brainrot_listings');
console.log(`listings: ${t.c} | distinct brainrots: ${t.names} | sellers: ${t.sellers}`);

console.log('\n=== RARITIES (vs expected 11) ===');
q("SELECT rarity, COUNT(DISTINCT name) pets, COUNT(*) c FROM brainrot_listings WHERE name != 'Other' GROUP BY rarity ORDER BY c DESC")
  .forEach(r => console.log(`  ${r.rarity || '(none)'}: ${r.pets} pets, ${r.c} listings`));

console.log('\n=== MUTATIONS IN MARKET ===');
q('SELECT mutation, COUNT(*) c FROM brainrot_listings GROUP BY mutation ORDER BY c DESC')
  .forEach(r => console.log(`  ${r.mutation}: ${r.c}`));

console.log('\n=== PRICES sanity ===');
const p = one('SELECT MIN(price) min, MAX(price) max, ROUND(AVG(price),2) avg, COUNT(CASE WHEN price <= 0 THEN 1 END) bad FROM brainrot_listings');
console.log(`  min $${p.min} | max $${p.max} | avg $${p.avg} | non-positive prices: ${p.bad}`);

console.log('\n=== SOLD / DELISTED ARCHIVE ===');
const s = one("SELECT COUNT(*) c, MIN(sold_at) oldest, MAX(sold_at) newest FROM brainrot_sold_archive");
console.log(`  archived: ${s.c} | range: ${s.oldest} -> ${s.newest}`);
q('SELECT name, COUNT(*) c FROM brainrot_sold_archive GROUP BY name ORDER BY c DESC LIMIT 5')
  .forEach(r => console.log(`  top sold: ${r.name}: ${r.c}`));

console.log('\n=== PRICE HISTORY SNAPSHOTS ===');
const h = one('SELECT COUNT(*) c, COUNT(DISTINCT snapshot_date) days, COUNT(DISTINCT name) names FROM brainrot_price_history');
console.log(`  rows: ${h.c} | days: ${h.days} | names: ${h.names}`);

console.log('\n=== MARKET CHANGES (7d) ===');
const m = one("SELECT COUNT(CASE WHEN change_type='new' THEN 1 END) new_items, COUNT(CASE WHEN change_type='delisted' THEN 1 END) delisted FROM brainrot_market_changes");
console.log(`  new: ${m.new_items} | delisted: ${m.delisted}`);

console.log('\n=== TRENDING ===');
const tr = one('SELECT SUM(is_trending) c FROM brainrot_listings');
console.log(`  trending listings: ${tr.c}`);

console.log('\n=== SCRAPE RUNS ===');
q('SELECT id, status, started_at, completed_at, total_listings, marketplace_total FROM brainrot_scrape_runs ORDER BY id DESC LIMIT 3')
  .forEach(r => console.log(`  #${r.id} ${r.status} ${r.started_at} -> ${r.completed_at} | ${r.total_listings}/${r.marketplace_total}`));
