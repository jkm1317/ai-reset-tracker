# AI Reset Tracker

Unofficial multi-provider **usage-limit reset tracker** + light **anticipator** for **Claude Code** and **OpenAI Codex**. Grok / xAI is a deferred TODO stub.

**Not affiliated** with Anthropic, OpenAI, xAI, Claude, Codex, or Grok.

Inspired by (UX/data study only — no proprietary code copied):

- https://claude-resets.com/
- https://codex-resets.com/

## Features

- Unified dashboard: days since last reset, counts, mean gap, longest drought, heatmap, shared timeline
- Announcement archive with X links, delivery mode (`immediate` | `banked` | `unknown`), and `reason_tags`
- Anticipation panel: honest odds from drought vs mean, weekend proximity, recent reason patterns — **not a schedule guarantee**
- Claude vs Codex comparison (overlap / 90d / all-time)
- Machine-readable: `public/data/summary.json`, `public/data/resets.json`, `public/llms.txt`, `public/rss.xml`
- Optional personal `/usage` countdowns in `localStorage` (never uploaded)

## Event schema

| Field | Description |
| --- | --- |
| `provider` | `claude` \| `codex` \| `grok` |
| `kind` | `reset` \| `policy` |
| `delivery` | `immediate` \| `banked` \| `unknown` |
| `reason_tags` | e.g. `incident`, `milestone`, `weekend_holiday`, `product_launch`, `banked_credit`, `usage_anomaly`, `capacity`, `goodwill`, `policy_change` |
| `scope` | Who was covered |
| `date` | ISO-8601 UTC |
| `url` | Original X announcement |
| `account` | Announcing handle |
| `note` | Short paraphrase |

## Quick start

```bash
cd /workspace/ai-reset-tracker   # or your clone path
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

Production build:

```bash
npm run build
npm run preview
```

Static output lands in `dist/` — deploy that folder to any static host (GitHub Pages, Netlify, Cloudflare Pages, S3, etc.).

## Refresh seed data

Re-fetch upstream catalogs and regenerate `public/data/*`:

```bash
npm run refresh-data
```

Sources:

- Claude events adapted from https://claude-resets.com/data/resets.json (with attribution)
- Codex announcements from https://codex-resets.com/api/resets (curated ~52 posts from @thsottiaux)

After refreshing, rebuild RSS/`llms.txt` if you maintain them separately, or re-run the project’s data helpers and commit the updated JSON.

## Deploy

1. `npm run build`
2. Publish `dist/` as a static site
3. Ensure `/data/resets.json`, `/data/summary.json`, `/llms.txt`, and `/rss.xml` are reachable at the site root (Vite copies `public/` into `dist/`)

No server required.

## Attribution

- Claude catalog adapted from [claude-resets.com](https://claude-resets.com/) data feeds
- Codex history curated from [codex-resets.com](https://codex-resets.com/) / @thsottiaux announcements
- Timestamps prefer announcement times / status IDs; notes are paraphrases
- Classifications (`delivery`, `reason_tags`, scope) are editorial interpretations — always check the original post

## Disclaimer

This is a community fan tool. It does **not** predict official resets, does **not** speak for any lab, and anticipation scores are descriptive historical hints only.
