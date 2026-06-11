// Quick coverage diagnostics: node scripts/coverage-check.js
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(process.env.BRAINROT_DB_PATH || path.join(__dirname, '..', 'data', 'brainrot.db'));
const total = db.prepare('SELECT COUNT(*) c FROM brainrot_listings').get().c;
const other = db.prepare("SELECT COUNT(*) c FROM brainrot_listings WHERE name = 'Other'").get().c;
const garama = db.prepare("SELECT COUNT(*) c FROM brainrot_listings WHERE name = 'Garama and Madundung'").get().c;
const run = db.prepare("SELECT marketplace_total FROM brainrot_scrape_runs WHERE status='completed' ORDER BY started_at DESC LIMIT 1").get();
const mt = run?.marketplace_total || 0;
console.log(`total: ${total} | Other: ${other} | named: ${total - other} | Garama: ${garama}`);
if (mt > 0) console.log(`marketplace_total: ${mt} | raw coverage: ${(total / mt * 100).toFixed(1)}% | named coverage vs (market - Other): ${((total - other) / (mt - other) * 100).toFixed(1)}%`);
