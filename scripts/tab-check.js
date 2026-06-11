// Loads the running dev app, clicks every tab, captures console errors,
// error-boundary fallbacks, and a screenshot per tab. Reports what's broken.
const { chromium } = require('playwright');

const TABS = ['Overview', 'Market', 'What to Steal', 'Trending', 'Mutations', 'Sellers', 'Sold', 'Watchlist', 'Config'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  for (const label of TABS) {
    const before = errors.length;
    try {
      const btn = page.locator('button[role="tab"]', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
      await btn.click({ timeout: 8000 });
      await page.waitForTimeout(1200);
      const boundary = await page.locator('text=/something went wrong|error loading|tab failed/i').count();
      const panelText = (await page.locator('[role="tabpanel"]').innerText().catch(() => '')).slice(0, 60).replace(/\n/g, ' ');
      const newErrs = errors.slice(before);
      console.log(`TAB "${label}": ${boundary > 0 ? 'ERROR-BOUNDARY' : 'ok'} | console-errs:${newErrs.length} | panel="${panelText}"`);
      if (newErrs.length) newErrs.forEach(e => console.log('   ! ' + e.slice(0, 160)));
      await page.screenshot({ path: `dist/tab-${label.replace(/\s+/g, '_')}.png` }).catch(() => {});
    } catch (e) {
      console.log(`TAB "${label}": CLICK-FAILED ${e.message.slice(0, 120)}`);
    }
  }
  await browser.close();
  console.log('\nTOTAL console/page errors:', errors.length);
})();
