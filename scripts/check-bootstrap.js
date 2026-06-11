// Polls the packaged app's userData DB until the bootstrap swap puts listings live.
const path = require('path');
const Database = require('better-sqlite3');
const dbPath = path.join(process.env.APPDATA, 'brainrot-dashboard', 'brainrot.db');
const fs = require('fs');

async function main() {
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    if (fs.existsSync(dbPath)) {
      try {
        const db = new Database(dbPath, { readonly: true });
        const live = db.prepare('SELECT COUNT(*) c FROM brainrot_listings').get().c;
        const staged = db.prepare('SELECT COUNT(*) c FROM brainrot_listings_staging').get().c;
        const run = db.prepare('SELECT status FROM brainrot_scrape_runs ORDER BY id DESC LIMIT 1').get();
        db.close();
        const t = Math.round((Date.now() - t0) / 1000);
        console.log(`t=${t}s live=${live} staged=${staged} run=${run ? run.status : 'none'}`);
        if (live > 0) {
          console.log(`BOOTSTRAP CONFIRMED: ${live} listings live after ${t}s while scrape still ${run?.status}`);
          process.exit(0);
        }
      } catch (e) { console.log('db busy:', e.code || e.message); }
    } else {
      console.log(`t=${Math.round((Date.now() - t0) / 1000)}s db not yet created`);
    }
    await new Promise(r => setTimeout(r, 10000));
  }
  console.log('TIMEOUT: bootstrap swap not observed in 4 min');
  process.exit(1);
}
main();
