# BRAINROT MARKET INTELLIGENCE — PROJECT BRIEF

> Keep this file accurate. If you change architecture, strategies, gem tiers, or workflow, update it.

## WHAT IT IS

**Local desktop app** (like Agency/Neon): Roblox trading analytics for **Steal a Brainrot**. Scrapes the full Eldorado.gg market (~49k listings) into a local SQLite DB, analyzes it, and generates auto-joiner configs for sniping underpriced listings. Anyone can install and run it — no accounts, no cloud, no env vars.

**Stack:** Next.js 16.2.4 (App Router, standalone output) · TypeScript · **better-sqlite3** (local DB) · Electron + electron-builder (NSIS installer) · SWR · Recharts
**Repo:** `https://github.com/rojoarg/brainrot-dashboard.git` — branch **`main`** (repo root = this folder)
**History:** was Supabase + Vercel until June 2026; fully migrated to local-first. No Supabase code remains.

## RUN / BUILD

- `npm run dev` → dashboard at localhost:3000, DB auto-created at `./data/brainrot.db`
- Hit **Scrape Now** in the header (or `GET /api/scrape`) → full market sweep ~5 min, no secret needed locally
- `npm run electron` → Electron window against the running dev server
- `npm run dist:win` → `next build` + `scripts/prepare-standalone.js` + electron-builder → `dist/BrainrotIntel-Setup-<version>.exe`
- Packaged app: Electron spawns the Next standalone server on a **bundled node.exe** (avoids better-sqlite3 ABI mismatch); DB lives in `%APPDATA%/brainrot-market-intelligence/brainrot.db`; auto-scrapes on launch when data >12h old and every 6h.
- **Always run `npx tsc --noEmit` and `npx eslint app lib`** before saying you're done.

## KEY FILES

- `lib/db.ts` — SQLite layer: schema init (8 tables), `swapStagingToLive()` (atomic staging→live swap, sold/delisted detection, first_seen_at preservation, min-rows abort guard)
- `app/api/scrape/route.ts` — single-pass local scraper (CONCURRENT=5, end-detection: 5 empty pages OR HTTP 4xx — Eldorado caps at page 1000), background run + `?action=status` poll
- `app/api/data/route.ts` — reads SQLite, computes scores/recommendations (sync queries)
- `app/api/config/route.ts` — config persistence (watchlist + blacklist, transactional)
- `app/components/tabs/ConfigTab.tsx` — strategy picker, filters, config generator (core feature)
- `app/lib/utils.ts` — smartMinValue, computePriority, getMutationAdvisory, buildConfigJSON
- `app/lib/constants.ts` — RARITY_WEIGHT, MUTATION_MULTIPLIERS (full June-2026 table; Eldorado spells "Yin-Yang" with hyphen)
- `electron/main.js` — shell: free port, spawn server, auto-scrape, single instance
- `scripts/prepare-standalone.js` — assembles standalone server + static + public + node.exe
- `app/page.tsx` — tabs, state, Scrape Now button with status polling
- Game/market domain knowledge: `.claude/skills/brainrot-market/SKILL.md`

## CONFIG SEMANTICS (the part people get wrong)

Output JSON: `{ blacklisted: string[], whitelisted: [{ pet_name, priority, min_value, mutations? }], version }`.

- `priority`: sequential index of the sorted list (0 = grab first). page.tsx watchlist adds use `computePriority()`.
- `min_value`: minimum **in-game gem value** a spawned pet must have to be grabbed. **INVERTED vs USD:** expensive USD → 1M ("grab any copy"); cheap USD → high gem bar. Must stay monotonic: cheaper USD ⇒ higher gem threshold. $20+ effective price (base median OR best mutation) = premium = always 1M, pinned on top.
- `mutations`: per-mutation overrides, only when they differ from base budget and have real price data.

## STRATEGIES (3)

1. **All-Star** (`default` gems) — profit score: price + flip + demand + farm + depth + rarity tiebreak
2. **Farmer** (`farmer` gems, p25 pricing, 50M–300M budgets) — farm score + sold volume + depth
3. **Trending** (`default`) — trending listings ×5 + sold ×2 + score

Gem tiers (default): $20+→1M · $10-20→1B · $5-10→1.5B · <$5→2B. Farmer: $20+→1M · $10-20→50M · $5-10→100M · <$5→300M.

## VERIFIED STATE (2026-06-11)

- Full local scrape with coverage top-up: 51,439 listings / 275 brainrots, ~14 min; raw coverage 95.2% of Eldorado's own recordCount (the gap is the discarded 'Other' junk bucket + search recordCount inflation from bundle titles — named coverage is effectively complete).
- Eldorado API facts: pageSize hard-capped at 50; pagination 400s past ~page 1000 (treated as end-of-market); `searchQuery` does server-side search and bypasses the page cap (used for the per-name top-up); listing attributes are still only Rarity tree + Mutations + M/s (no Traits exposed).
- Mutations: full table incl. Phantom (added June 11 2026, multiplier ESTIMATED 12x — confirm and update constants when known; scraper captures Phantom listings automatically).
- Export formats: presets + custom key mapping persisted in localStorage; import accepts any common config shape (parseConfigImport).
- `scripts/coverage-check.js` prints coverage diagnostics against the local DB.

## OPEN / NEXT (the "100x" roadmap)

1. Confirm Phantom's real multiplier (announced in sammy's Discord; no public source yet).
2. Surface price history (collected daily per combo — barely shown in UI): trend charts, pump detection.
3. Config validation feedback: explain WHY each item was included.
4. Sold-velocity (sold/day) signals once the sold archive accumulates locally.
5. UI refresh of secondary tabs.
6. profitScore weights never validated against real trading outcomes.
