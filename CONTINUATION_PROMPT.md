# BRAINROT DASHBOARD — PROJECT BRIEF

> Keep this file accurate. If you change strategies, gem tiers, or workflow, update it.

## PROJECT CONTEXT

Roblox pet trading analytics dashboard ("Brainrot Market Intelligence") for the game **Steal a Brainrot**. It scrapes Eldorado.gg marketplace data (~54k listings), analyzes it, and generates auto-joiner configs for sniping underpriced listings.

**Stack:** Next.js 16.2.4 (App Router, Turbopack) · TypeScript · Supabase (Postgres) · Vercel · SWR · Recharts
**Repo:** `https://github.com/rojoarg/brainrot-dashboard.git` — branch **`main`** (repo root = this folder)
**Deploy:** Vercel auto-deploys on push to `main`.

## HOW WE WORK

1. Repo root is this folder. Push: `git add -A && git commit && git push origin main`.
2. **Env vars:** `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (+ `CRON_SECRET` for the scraper) live on Vercel. Locally, copy `.env.local.example` → `.env.local` and fill them in — without them the UI loads but API routes return 503 with a clear message.
3. **Always run `npx tsc --noEmit` and `npx eslint app lib`** before saying you're done.
4. Game/market domain knowledge lives in `.claude/skills/brainrot-market/SKILL.md`.
5. Brand: dark theme default, red+black accents (Rojo Colo), light mode supported. Premium/futuristic feel.

## KEY FILES

- `app/components/tabs/ConfigTab.tsx` — strategy picker, filters, config generator (the core feature)
- `app/lib/utils.ts` — smartMinValue, computePriority, getMutationAdvisory, buildConfigJSON
- `app/lib/constants.ts` — RARITY_WEIGHT, MUTATION_MULTIPLIERS (full June-2026 table incl. Gold/Diamond/Bloodrot/Candy/Disco; note Eldorado spells "Yin-Yang" with a hyphen), colors, tier floors
- `app/api/data/route.ts` — reads Supabase, computes scores/recommendations
- `app/api/scrape/route.ts` — Eldorado scraper (chunked, self-chaining, CRON_SECRET-protected)
- `app/api/config/route.ts` — config persistence (watchlist + blacklist tables)
- `lib/supabase.ts` — client; exports `supabaseConfigured` guard (never throw at module load)
- `app/page.tsx` — tabs, state, watchlist CRUD · `app/lib/useData.ts` — SWR hook

## CONFIG SEMANTICS (the part people get wrong)

Output JSON: `{ blacklisted: string[], whitelisted: [{ pet_name, priority, min_value, mutations? }], version }`.

- `priority`: sequential index of the sorted list (0 = grab first). page.tsx watchlist adds use `computePriority()` instead.
- `min_value`: minimum **in-game gem value** a spawned pet must have to be grabbed. **INVERTED vs USD:** expensive USD → 1M ("grab any copy"); cheap USD → high gem bar. Must stay monotonic: cheaper USD ⇒ higher gem threshold. $20+ effective price (base median OR best mutation) = premium = always 1M and pinned at the top.
- `mutations`: per-mutation gem overrides, only emitted when they differ from the base budget and have real price data.

## STRATEGIES (3)

1. **All-Star** (`default` gem mode) — profit score: price + flip + demand + farm + depth + rarity tiebreak
2. **Farmer** (`farmer` gem mode, p25 pricing, tight budgets 50M–300M) — farm score + sold volume + listing depth
3. **Trending** (`default`) — trending listings ×5 + sold ×2 + score

Gem tiers (default mode): $20+→1M · $10-20→1B · $5-10→1.5B · <$5→2B. Farmer: $20+→1M · $10-20→50M · $5-10→100M · <$5→300M.

## CURRENT STATE (June 2026)

- Eldorado API works, schema unchanged, ~54k listings (~1082 pages; scraper MAX_PAGES=1400 has headroom).
- Mutation table updated to the full 12-live set + unreleased Disco.
- ConfigTab: export list = filters + removals + quick filters (table search is view-only); Download / Save to DB / JSON preview all share one `buildWhitelist()`.

## OPEN / NEXT

- Live Vercel URL unknown from this machine; deployment status unverified.
- profitScore weights never validated against real trading outcomes.
- "100x" product overhaul wanted: richer market analytics (price history is collected but barely surfaced), better validation feedback on config generation, sold-velocity signals, alerting.
