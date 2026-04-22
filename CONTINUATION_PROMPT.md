# BRAINROT DASHBOARD — CONTINUATION PROMPT

Copy-paste everything below this line into a new session.

---

## PROJECT CONTEXT

This is a **Roblox pet trading analytics dashboard** ("Brainrot Market Intelligence") for the game "Steal a Brainrot". It scrapes Eldorado.gg marketplace data, analyzes it, and generates auto-joiner configs for sniping underpriced listings.

**Stack:** Next.js 16.2.4 (App Router) · TypeScript · Supabase (Postgres) · Vercel · SWR · Recharts
**Repo:** `https://github.com/rojoarg/brainrot-dashboard.git` (branch: `master`)
**Live:** Deployed on Vercel (auto-deploys on push to master)

## HOW WE WORK

1. **All files live in the mounted workspace folder** — that's the git repo root
2. **To push:** Run these commands in my terminal:
   ```
   cd C:\claude\ResearchMarket\Market Brainrot Research\ResearchMarket
   git add -A
   git commit -m "your message"
   git push origin master
   ```
3. **Vercel auto-deploys** on push — no manual deploy needed
4. **Supabase env vars are on Vercel** (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) — they're NOT in local .env files. Local builds will fail at page data collection (expected), but `npx tsc --noEmit` works for type checking.
5. **Always run `npx tsc --noEmit`** before saying you're done to catch type errors
6. **Brand:** Dark theme default, red+black accent palette (Rojo Colo), light mode supported. Premium/futuristic feel.

## CRITICAL FILES

### Config Output Format (what the auto-joiner consumes)
```json
{
  "blacklisted": ["PetName1", "PetName2"],
  "whitelisted": [
    {
      "pet_name": "Headless Horseman",
      "priority": 0,
      "min_value": 1000000,
      "mutations": {
        "Rainbow": 500000000,
        "Divine": 400000000
      }
    }
  ],
  "version": "1.0"
}
```

- `priority`: lower = higher priority (0 is first). Currently set by array index `i` in ConfigTab, but `100 - rec.score` in page.tsx addToWL. **This inconsistency needs fixing.**
- `min_value`: gems threshold for auto-joiner. 1M gems = floor. See smartMinValue() for logic.
- `mutations`: per-mutation gem overrides when a mutation makes an item worth significantly more

### Rarity Weight System (lower = more valuable)
```
OG: 0, Brainrot God: 1, Admin: 2, Secret: 3, Mythical: 4,
Legendary: 5, Taco: 6, Valentines: 6, Festive: 6,
Epic: 7, Rare: 8, Uncommon: 9, Common: 10
```

### masterSort (applied to ALL strategy results)
```
1. Rarity weight (OG first, Common last)
2. Sold count (more sold = higher)
3. Strategy-specific sort function
```

### smartMinValue Logic
- OG / Admin / Brainrot God → always 1M gems (buy everything)
- Others based on median USD price:
  - $500+ → 1B gems
  - $200+ → 700M
  - $100+ → 500M
  - $50+ → 400M
  - $20+ → 300M
  - $10+ → 200M
  - $5+ → 100M
  - <$5 → 1M (floor)

### Key Files
- `app/components/tabs/ConfigTab.tsx` — **THE FOCUS.** Strategy picker, filters, config generator
- `app/lib/utils.ts` — smartMinValue, masterSort, getMutationAdvisory, buildConfigJSON, downloadConfigJSON
- `app/lib/constants.ts` — RARITY_WEIGHT, MUTATION_MULTIPLIERS, RARITY_SCORE_BONUS, RARITY_TIER_FLOOR
- `app/lib/types.ts` — All TypeScript interfaces (Recommendation, Brainrot, WLItem, Config, etc.)
- `app/api/data/route.ts` — Backend: fetches from Supabase, computes scores, builds recommendations
- `app/page.tsx` — Main dashboard: tabs, state, watchlist CRUD, data fetching
- `app/components/ui.tsx` — Shared UI components (StatCard, TierBadge, RarityBadge, WLButton, etc.)
- `app/globals.css` — Full design system with responsive breakpoints
- `app/lib/useData.ts` — SWR data hook

### ConfigTab Strategy System (8 strategies)
1. **All-Star** — profitScore() combines rarity bonus + flip + farm + demand + value + base score
2. **Farmer** — farmScore * 3 + soldCount * 2 + listings bonus + price tier bonus (under $20/$50)
3. **Flipper** — flipScore * 3 + ROI * 0.15 + spreadScore * 2 + sold/listing bonuses
4. **Sniper** — rarity * 5 + scarcityScore * 3 + valueScore * 2 + sold bonus
5. **Whale** — rarity * 4 + median * 0.5 + sold bonus (10) + seller diversity
6. **Trending** — trendingListings * 5 + soldCount * 2 + score * 0.3
7. **Budget** — score/price efficiency * sold multiplier
8. **Diversified** — profitScore per-rarity, then combined masterSort

### ConfigTab Features
- Strategy picker cards (grid)
- Collapsible filter panel: min/max median, min listings, rarity filter, max items, exclude rarities, blacklist
- Preview table with tier/rarity/price/min_value/mutation overrides
- Generate & Download config JSON
- Save to Supabase DB
- Import JSON config

## KNOWN ISSUES TO FIX

1. **Priority inconsistency:** ConfigTab uses array index `i` for priority. page.tsx addToWL uses `Math.round(100 - rec.score)`. These should be unified — priority should reflect actual importance (rarity weight + strategy score).

2. **profitScore() may need retuning** — the weights (rarityBonus*3, flip*1.5, farm*1, demand*2, value*1.5, baseScore*0.3) were set empirically but never validated against real trading outcomes.

3. **Budget strategy filter hint says "Filters to items under $5"** but there's no actual price cap enforced in the sort function — it just sorts by score/price ratio. Should it auto-set maxPrice to $5?

4. **Diversified strategy** takes `perRarity = ceil(maxN / rarities.length)` items per rarity, then re-sorts and slices to maxN. This can over-represent common rarities if there are many rarity tiers with few items.

5. **getMutationAdvisory recommendedOverride formula** uses `avgMed * safePriceRatio * 10000` which converts USD to gems, but the 10000 multiplier may not match actual exchange rates.

6. **No validation feedback** — when a user generates a config, there's no breakdown of what was picked and why. No "these OGs were auto-included because they're always valuable" messaging.

## PRIMARY MISSION

Make the ConfigTab logic **100x perfect**. This means:

- Every strategy must produce genuinely optimal results for its stated purpose
- The scoring, sorting, and filtering must be mathematically sound
- Priority assignment must be consistent and meaningful
- min_value calculations must be correct for every rarity and price tier
- Mutation overrides must accurately reflect the value premium
- The generated config JSON must be production-ready for the auto-joiner
- Edge cases (no listings, no sold data, unknown rarities) must be handled gracefully
- The UX should make it obvious what the config generator is doing and why

Challenge every assumption. Test every formula. Verify every sort produces the right order. Make it bulletproof.
