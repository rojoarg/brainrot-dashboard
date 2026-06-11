# Engineering Decisions — Autonomous Overhaul (v1.2.0)

Decisions made without human input during the overnight overhaul, with rationale.

## Architecture / data
- **`rawListings` made opt-in (`?include=raw`).** It was the single largest payload block (~8k rows, ~2.4MB) and consumed by nothing except "Export All". Default poll payload dropped ~9.2MB → ~6.8MB. Export All now fetches the raw variant on demand. Safer & lighter than shipping it on every 5-min poll.
- **Dropped `rarityStats` and `petNames` from the API payload.** Never read by the UI (only the derived `rarityDist` is). Kept `rarityStats` as an internal computation.
- **Dropped `sellers` from `bestCombos`.** Duplicated the seller data already in `brainrots[].combos`; only DetailTab reads sellers, and it reads them from `brainrots`. Pure payload savings.
- **Retention pruning (90 days) for `brainrot_sold_archive` and `brainrot_price_history`.** The UI only reads 30 days; these tables grew unbounded. 90 days keeps headroom for future trend features while bounding the local DB.
- **Trending derived from `first_seen_at < 24h`** (with a cold-start guard that disables it when >50% of listings are "new", i.e. a fresh DB). Eldorado's `isTrending` flag is dead (0 of ~51k listings carry it), which left the Trending tab permanently empty. Chose age-based derivation because `first_seen_at` survives swaps and reflects real market churn.

## Correctness / security
- **`shell.openExternal` now restricted to http/https.** A dropped file or malicious link could otherwise launch arbitrary handlers (file:, ms-msdt:, …). Lowest-risk, highest-safety fix.
- **Dev/start scripts bind `127.0.0.1`.** `next dev`/`next start` default to 0.0.0.0, exposing unauthenticated write endpoints to the LAN. The packaged app was already safe; this closes the manual-run gap.
- **Scrape supersession guard (`stillActive()`).** A scrape deemed stale (>30 min) could be superseded by a new run while still alive, racing on the staging table. The old run now aborts at the next loop checkpoint and before the irreversible swap. Chose "newest running run owns the lifecycle" — the superseded run returns without touching status, leaving the winner in control.
- **Change-detection guard `liveCount >= stagingCount * 0.5`.** Generalized the first-populate skip to also cover the bootstrap preview swap (small live vs full staging), preventing the whole market from being flagged new/delisted.

## Watchlist persistence
- **Debounced auto-save (1.5s) of the config to the DB on every change.** Previously "+ WL" additions lived only in React state and vanished on restart unless the user pressed Save in the Config tab. Gated behind `configLoadedRef` so it never overwrites the DB with an empty config before the initial load.

## UX / design
- **Removed two tabs earlier (Dashboard, Raw Data); this pass fixed the fallout** and added full keyboard navigation (`keyActivate` helper on every clickable row/card), a focus trap + restore in the blacklist modal, empty states for every table, contrast-compliant `--text3`, and legible tab badge counts.
- **Self-hosted fonts via next/font** (done earlier) — kept; critical for the offline desktop app.
- **Export format picker now applies to ALL three export buttons.** `downloadConfigJSON` was reimplemented over `formatConfigExport` + the saved format; the header/Watchlist exports previously ignored the user's chosen format.

## Not done (deliberately)
- **Full /api/data memoization + ETag.** The aggregation is ~1.4s but runs against a local 127.0.0.1 server for a single user; the payload cuts above were the higher-value, lower-risk win. Left as a future optimization to avoid a larger refactor under autonomous mode.
- **Code signing / auto-updater.** Require a paid certificate and release infrastructure — out of scope for an unattended run. Flagged in FINAL_REPORT.
