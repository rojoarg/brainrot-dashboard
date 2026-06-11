# Changelog

## v1.2.2 — 2026-06-11

### Fixed
- **Min/max prices were nonsense** (e.g. Headless Horseman showing a $0.67 min against a $6,999 median). Eldorado is full of decoy/scam/mislabeled listings priced orders of magnitude off the real rate; the aggregation took the raw min/max across all of them. Displayed min/max (and the ROI/spread derived from min) are now computed from a robust band (10× around the median), falling back to raw ends only for thin samples. Verified in-browser: Meowl $195–$3.5K, Headless $860–$10K.
- **Trending tab was permanently empty.** A cold-start guard suppressed all trending whenever >50% of listings were recent — which is always true right after a sync. Trending is now the newest listings (by first-seen, then price), decoy-filtered, and never empty when data exists. Verified: "Trending (100)".
- **Price-change alerts showed absurd values** (e.g. "+441135%"): they compared the two latest price-history rows for a pet — often different mutation combos — using decoy-polluted avg_price. Now each pet is collapsed to one listing-count-weighted **median** price per day, compared across the two most recent days, and clamped to ±999%.

### Tooling
- Added `scripts/tab-check.js` (Playwright) to drive every tab, capture console/error-boundary failures, and screenshot each — used to verify this release.

## v1.2.1 — 2026-06-11

### Performance
- `/api/data` now caches its serialized payload keyed by a cheap version string (max scrape-run / watchlist / blacklist / scrape-blacklist ids) and emits an ETag. Repeat polls skip the ~1.4s full aggregation (verified `X-Cache: HIT`), and unchanged browser polls get a `304 Not Modified` with an empty body (`Cache-Control: no-cache` enables revalidation). Cache busts correctly on scrape swap, config save, and blacklist edits (verified). Removed the conflicting `s-maxage` header from next.config.js.

## v1.2.0 — 2026-06-11 (autonomous overhaul)

### Fixed
- **Trending was always empty** — Eldorado's `isTrending` flag is dead; trending is now derived from listing age (new in last 24h) with a fresh-install guard.
- **Watchlist additions were lost on restart** — config now auto-saves (debounced) to the local DB on every change.
- **Scrape History table showed blank columns** — was reading snake_case fields the API serializes as camelCase; now shows real Listings/Brainrots/Sellers/Delisted/New/Coverage.
- **Trending table** had duplicate React keys and broken thumbnails (wrong field names); fixed, plus the Exact M/s column now populates.
- **Cheapest-sellers-per-combo selection** could keep the wrong sellers until the first replacement; corrected.
- **Two export buttons ignored the chosen export format** — all exports now honor the Config tab's format picker.
- Electron `shell.openExternal` restricted to http/https (blocks file:/scheme abuse).
- Double error dialog on dev-mode launch failure.

### Security
- `next dev`/`next start` now bind `127.0.0.1` (no LAN exposure of write endpoints).
- Scrape supersession guard prevents two background scrapers racing on the staging table.

### Performance
- Default `/api/data` payload reduced ~26% (~9.2MB → ~6.8MB): `rawListings` is now opt-in (`?include=raw`), and `rarityStats`/`petNames`/`bestCombos.sellers` (all unused by the UI) are no longer sent.
- 90-day retention pruning for the sold archive and price history (was unbounded).

### Accessibility
- Full keyboard navigation: every clickable table row/card is focusable and activates with Enter/Space.
- Blacklist modal: focus trap, focus restore on close, and page shortcuts disabled while open.
- Raised low-contrast `--text3` to WCAG AA in both themes; legible tab badge counts; ghost buttons no longer rely on 50% opacity; aria-labels on filter/sort selects and icon buttons.

### Design
- Fixed v4 CSS layer collisions: the engineering-grid texture no longer destroys the noise grain (merged onto one layer), and the brand title gradient animates again.

### Housekeeping
- Removed cloud-era leftovers: `vercel.json`, `@vercel/functions`, `react-window`, `@types/react-window`, dead exports (`masterSort`, `buildConfigJSON`, `UNKNOWN_MUTATION_COLOR`), orphaned types, and a misleading Supabase `.env.local.example`.
- Shared helpers extracted (`buildMutationOverrides`, `enrichConfig`, `keyActivate`) to kill triplicated logic.

## v1.1.0 — 2026-06-11
- Redesign: tabs 12→9, Detail as drill-in, self-hosted fonts, EULA installer page, footer disclaimer, zero lint problems.

## v1.0.0 — 2026-06-11
- Local-first desktop app: SQLite + Electron + NSIS installer; dropped Supabase/Vercel. First-launch sync screen, bootstrap preview, scrape blacklist, full market coverage via search top-up.
