# Brainrot Market Intelligence

Local desktop app for **Steal a Brainrot** (Roblox) trading: scrapes the full Eldorado.gg marketplace into a local database, analyzes prices, mutations, sellers and sold history, and generates **auto-joiner configs** for sniping underpriced pets.

Everything runs on your machine — no accounts, no cloud, no setup.

## Install (Windows)

1. Download `BrainrotIntel-Setup-<version>.exe` from [Releases](https://github.com/rojoarg/brainrot-dashboard/releases)
2. Run it. The app opens and pulls the live market automatically (~5 min first run).
3. Data refreshes on launch when older than 12 h, every 6 h while open, or on demand with **⟳ Scrape Now**.

Your data lives in `%APPDATA%/brainrot-market-intelligence/brainrot.db` (SQLite) and survives updates.

## Highlights

- **Config generator** — 3 strategies (All-Star / Farmer / Trending), premium pinning, per-mutation gem budgets, blacklist, JSON preview, one-click download
- **Market analytics** — 49k listings, price percentiles, rarity/mutation distributions, seller trust scores
- **Sold & delisted tracking** — every scrape diffs the market and archives what disappeared
- **Price history** — daily snapshots per pet+mutation+M/s combo

## Development

```bash
npm install
npm run dev        # dashboard at localhost:3000 (DB at ./data/brainrot.db)
npm run electron   # desktop window against the dev server
npm run dist:win   # build the Windows installer into dist/
```

Stack: Next.js 16 (App Router, standalone) · TypeScript · better-sqlite3 · Electron · SWR · Recharts.

See `CONTINUATION_PROMPT.md` for architecture notes and `.claude/skills/brainrot-market/SKILL.md` for game-economy domain knowledge.
