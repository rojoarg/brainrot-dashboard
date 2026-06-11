---
name: brainrot-market
description: Deep knowledge of Steal a Brainrot game economy, Eldorado.gg marketplace, mutations, rarities, pricing, auto-joiner config generation. Use when working on config logic, gem budgets, pricing decisions, or any brainrot market intelligence feature.
---

# Brainrot Market Intelligence Skill

You are an expert in the Steal a Brainrot (Roblox) game economy and the Eldorado.gg marketplace. Use this knowledge when making decisions about config generation, gem budgets, pricing tiers, mutation handling, and priority ordering.

## Game Economy Fundamentals

**Steal a Brainrot** is a Roblox game with 400+ collectible "brainrots" across 8 rarity tiers. Players collect brainrots that generate passive in-game income (Sheckles/second), then trade them for real USD on Eldorado.gg.

### The Value Chain
```
Spawn Rate → Exist Count → In-Game Income → Mutation Multiplier → Real USD Value
```
A brainrot's real-money value is determined by: how rare it is (spawn odds), how many exist, how much income it generates, and whether it has a high-value mutation.

## Rarity Tiers & USD Value Ranges

| Tier | USD Range | In-Game Cost | Income/s | Example |
|------|-----------|-------------|----------|---------|
| OG | $500-$4,000+ | $450B-750B | $450M-750M/s | Meowl, Strawberry Elephant, Headless Horseman |
| Secret | $2-$500+ | $50M-2.5B | $300K-25M/s | Dragon Gingerini, Griffin, Signore Carapace |
| Brainrot God | $1-$100 | $5M-100M | $17.5K-315K/s | Antonio, Tralalero Tralala, Los Crocodillitos |
| Mythic | $1-$5 | $350K-5.5M | $1.9K-18.5K/s | Bombardiro Crocodilo, Elephanto Frigo |
| Legendary | $0.50-$5 | $50K-347.5K | $300-1.9K/s | Ballerina Cappuccina, Quackula |
| Epic | $0.10-$1 | $10K-47.5K | $75-325/s | Brr Brr Patapim, Penguino Cocosino |
| Rare | $0.01-$0.50 | $2K-9.7K | $15-75/s | Trippi Troppi, Tung Tung Tung Sahur |
| Common | $0.01-$0.10 | $25-1.7K | $1-14/s | Noobini Pizzanini, Lirili Larila |

## Top 20 Most Valuable Brainrots (Eldorado USD)

1. Headless Horseman — $2,000-$4,000+ (OG, ~121 exist)
2. Strawberry Elephant — $1,000-$3,000+ (OG, ~2,032 exist)
3. Signore Carapace — $700-$3,000+ (Secret, ~293 exist)
4. Meowl — $500-$1,000+ (OG, ~3,200 exist)
5. Skibidi Toilet — $400-$1,000+ (OG, ~2,500 exist)
6. Elefanto Frigo — $340-$1,000+ (Secret, ~687 exist)
7. Griffin — $400-$800+ (Secret, ~332 exist)
8. Dragon Gingerini — $200-$500+ (Secret)
9. Love Love Bear — $150-$400 (Secret, ~948 exist)
10. Hydra Dragon Cannelloni — $70-$300 (Secret)
11. Dragon Cannelloni — $60-$100+ (Secret)
12. Celestial Pegasus — $20-$100+ (Secret)
13. Cerberus — $20-$100+ (Secret)
14. Arcadragon — $20-$80+ (Secret)
15. Cooki and Milki — $15-$100 (Secret)
16. Capitano Moby — $15-$75 (Secret)
17. Burguro and Fryuro — $10-$100 (Secret)
18. La Secret Combinasion — $5-$25 (Secret)
19. Chillin Chili — $5-$25 (Secret)
20. Tang Tang Keletang — $2-$25 (Secret)

## Mutations — Complete Reference

| Mutation | Multiplier | Availability | Rarity/Notes |
|----------|-----------|-------------|-------------|
| Default | 1x | Always | Base state |
| Extinct | 1x | Special | Only on extinct/removed brainrots |
| Gold | 1.25x | Permanent | 10% Red Carpet spawn chance |
| Diamond | 1.5x | Permanent | 20.4% Red Carpet spawn chance |
| Bloodrot | 2x | Event | Bloodmoon Admin Abuse |
| Candy | 4x | Event | Candy Aurora Admin Abuse |
| Lava | 6x | Event | Molten Admin Abuse |
| Galaxy | 7x | Event | Galactic Admin Abuse |
| Yin Yang | 7.5x | Event | Yin Yang Admin Abuse |
| Radioactive | 8.5x | Event | Radioactive Admin Abuse |
| Cursed | 9x | Event | EXTREMELY RARE (ran for 6 seconds once) |
| Rainbow | 10x | Permanent | 1% Red Carpet spawn — always valuable |
| Divine | 10x | Event | Divine Admin Abuse (includes Halo trait) |
| Cyber | 11x | Event | Cyber Admin Abuse (added Apr 18, 2026) |
| Disco | 12x | UNRELEASED | Confirmed in game data, highest multiplier |

### Mutation Impact on USD Value
A high mutation can multiply real USD trading value dramatically:
- Base Garama: $5 → Cursed Garama: $30-50 (9x multiplier drives USD up 6-10x)
- Base Antonio: $15 → Rainbow Antonio: $50+ 
- Cheap common $1 → Cyber mutation: $10-20 (the mutation IS the value)

**Critical for config**: When a mutation's USD value exceeds the base price threshold, its gem budget must be overridden. A $1 base with $30 Cursed should get 1M gems (premium tier), not 2B (cheap tier).

## M/s (Income Per Second)
- Stands for "millions per second" of in-game currency
- Each brainrot has base income, multiplied by mutation
- Higher M/s = more farming value = higher real-money value
- Eldorado listings show M/s as key attribute
- The "min_value" in bot config is related to this — minimum Sheckles value to buy

## Config Generation Rules

### Priority Ordering
- 0 = most important (buy first)
- Sequential (0, 1, 2, 3...) — no gaps, no duplicates
- Premium items ($20+ USD) always priority 0-N regardless of strategy
- Within premium: sort by USD value descending

### Gem Budget (min_value) by Strategy
**All-Star (default):**
- $20+ → 1M (always buy)
- $10-20 → 1B
- $5-10 → 1.5B
- $2-5 → 2B

**Farmer (volume):**
- $20+ → 1M (still always buy premium)
- $10-20 → 50M
- $5-10 → 100M
- $2-5 → 300M

**Trending:**
- Same as All-Star but sorted by trending signals

### Mutation Override Rules
- Only add mutation override when its gem budget DIFFERS from base
- Base=$440 (1M) + mutation=$500 (1M) → NO override (same value)
- Base=$5 (1.5B) + Cursed=$30 (1M) → YES override (1.5B→1M)
- Include ALL mutations with listings that have different gem budgets

## Naming Conventions
- **Los** = male combination brainrots (Los Matteos, Los Bros)
- **La** = mixed combination (La Grande Combinasion)  
- **Las** = female combination (Las Sis, Las Cappuchinas)
- **Sahur** = Eid/Ramadan event brainrots
- Combination brainrots are often Secret rarity and very valuable

## Competitor Platforms for Design Reference
- **Rolimons.com** — Gold standard for Roblox item value tracking. Price history charts, trade calculator, player portfolios. Clean dark UI.
- **MoonValues** — Brainrot-specific value list with demand scores
- **game.guide** — WFL (Win/Fair/Lose) trade calculator
- **igitems.com** — Real-time value calculator with mutation factors
- **TradeKitsune** — Multi-game trading platform
- **JBValues** — Jailbreak value tracker (similar data density)

## How to Apply This Knowledge

1. **When generating configs**: ensure ALL top-20 valuable brainrots are included with correct gem budgets. Missing a $500 Meowl = lost revenue.
2. **When handling mutations**: Cursed, Rainbow, Divine, Cyber mutations can make any brainrot worth 5-50x its base. Always check mutation prices separately.
3. **When setting gem tiers**: the tiers represent how much in-game currency the bot will spend. Premium items (real USD value) should always be 1M (cheapest possible) because ANY deal is worth it.
4. **When filtering**: never drop a pet just because base is cheap — check mutations first. Money Money Puggy base=$2 but Cursed=$20+.
5. **When sorting**: exist count and sold history are stronger signals than spawn rate for trading value.
