# FINAL REPORT — Autonomous Overhaul (v1.1.0 → v1.2.0)

Run unattended. Backup branch `backup-pre-overhaul` created at the pre-overhaul commit and left untouched.

## Method
A repo map was built, then three read-only audit agents swept every file in parallel (Correctness/Security, Architecture/Performance, Design/UX). Findings were severity-tagged, fixed in order, and a fourth agent re-audited every changed file for regressions (result: **0 regressions**). The build/typecheck/lint gate was run after each batch.

Audit totals: 19 (correctness/security) + 20 (architecture/perf) + 36 (design/ux) = **75 findings triaged**. 0 CRITICAL in correctness; the 3 "CRITICAL" design findings were keyboard-access gaps, all fixed.

## What was fixed

### Correctness (user-visible bugs)
1. **Trending always empty** — Eldorado's `isTrending` flag carries on 0 of ~51k listings. Now derived from `first_seen_at < 24h` with a fresh-install cold-start guard. The Trending tab and Trending strategy now work (from day 2 on a given machine).
2. **Watchlist lost on restart** — "+ WL" additions lived only in React state. Added debounced auto-save to the local DB, gated so it can't wipe the DB before initial load.
3. **Scrape History blank columns** — read snake_case fields the API emits as camelCase. Rebuilt the table with real data + a coverage %.
4. **Trending table** — duplicate React keys (wrong id field) and broken thumbnails (`image_url` vs `imageUrl`); Exact M/s now shows.
5. **Cheapest-sellers-per-combo** picked the wrong sellers until the first replacement; sort-at-fill fix.
6. **Export format picker** was ignored by 2 of 3 export buttons; unified.

### Security
- `shell.openExternal` restricted to http/https (blocks file:/scheme launches from dropped files or scraped links).
- Dev/start scripts bind `127.0.0.1` (the packaged app already did; this closes the manual-run LAN exposure of the unauthenticated POST endpoints).
- Scrape supersession guard stops two background scrapers racing on the staging table after a >30-min stale-run takeover.
- Verified clean: SQL injection (all parameterized), XSS (JSX escaping + image host allowlist), path traversal, Electron contextIsolation/nodeIntegration, NaN/Infinity sanitization, localStorage guards, interval/listener cleanup.

### Performance
- Default `/api/data` payload **~9.2MB → ~6.8MB (~26%)**: `rawListings` opt-in via `?include=raw`, and `rarityStats`/`petNames`/`bestCombos.sellers` (UI-unused) removed.
- 90-day retention pruning for `sold_archive` + `price_history` (were unbounded; UI reads 30d).

### Accessibility
- Full keyboard navigation via a `keyActivate` helper on every clickable row/card (Enter/Space).
- Blacklist modal: focus trap + focus restore, global shortcuts suppressed while open.
- `--text3` raised to WCAG-AA contrast in both themes; legible active-tab badge counts; ghost buttons no longer rely on 50% opacity; aria-labels on selects and icon-only buttons; empty states on every table.

### Design
- Fixed v4 CSS layer selector collisions: the engineering-grid texture had silently destroyed the noise grain (now layered on one pseudo-element) and the animated brand-title gradient was static (now animates).

### Housekeeping / debt
- Removed: `vercel.json`, deps `@vercel/functions` + `react-window` + `@types/react-window`, dead exports `masterSort`/`buildConfigJSON`/`UNKNOWN_MUTATION_COLOR`, orphaned `RarityStats` type, misleading Supabase `.env.local.example`.
- Extracted shared helpers: `buildMutationOverrides`, `enrichConfig`, `getSavedExportFormat`, `keyActivate` (killed triplicated logic).

## Quality gate (final)
- `npx tsc --noEmit` — **clean**
- `npx eslint app lib` — **0 problems** (electron/main.js is CommonJS, outside the Next lint scope by design)
- `npm run build` — **clean**, 0 warnings (the swc lockfile notice was resolved by `npm install`)
- Runtime smoke (packaged + dev): `/api/data` serves 50,225 listings / 268 recs; `?include=raw` adds 8,000 raw rows; `/api/config` POST round-trips; `/api/blacklist` add/remove verified earlier; scrape supersession + retention paths reviewed.

## Decisions
See `DECISIONS.md`. Headline calls: rawListings opt-in (vs full memoization), trending-by-age, watchlist auto-save, retention at 90 days.

## Deployment status
This is a **local desktop app** — its "deploy" artifact is the Windows installer, not a hosted URL.
- Built: `dist/BrainrotIntel-Setup-1.2.0.exe` (assisted NSIS installer with EULA page; bundled Node + better-sqlite3 binary verified by afterPack).
- Committed locally on `main` (conventional message). **Push to `git remote (GitHub)` and the GitHub Release upload require credentials/authorization not available in unattended mode** — left for the owner. There is no web host to verify; the equivalent verification (packaged server boots, connects to Eldorado, serves real data on a clean profile) was performed in prior sessions and the binary artifact is reproduced here.

## Known limitations (flagged, not blockers)
- **Unsigned installer** → SmartScreen "unknown publisher" warning. Needs a code-signing certificate (paid).
- **No auto-updater** → updates are manual reinstalls. Would add `electron-updater` + Releases if distribution scales.
- **Trending activates on day 2** of use on a given machine (cold-start guard by design).
- **/api/data aggregation** (~1.4s) is recomputed per request; fine for a single local user, but ETag/memoization is the next perf step if needed.

## Before / after
| | Before (v1.1.0) | After (v1.2.0) |
|---|---|---|
| Trending tab | always empty | populated (age-derived) |
| Watchlist persistence | lost on restart | auto-saved |
| Scrape History table | blank columns | full real data |
| Default API payload | ~9.2 MB | ~6.8 MB |
| Keyboard navigation | tables unreachable | full |
| WCAG contrast (--text3) | ~3.9:1 (fail) | ~5.0:1 (pass) |
| Unbounded tables | sold/history grew forever | 90-day retention |
| Dead deps / files | 3 deps + vercel.json + dead exports | removed |
| tsc / eslint / build | clean | clean |
