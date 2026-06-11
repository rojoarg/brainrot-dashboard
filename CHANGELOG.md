# Changelog

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
