# AI Reset Tracker

Unofficial multi-provider **usage-limit reset tracker** + **likelihood-first anticipator** for **Claude Code**, **OpenAI Codex / ChatGPT**, and **Grok / xAI**.

**Not affiliated** with Anthropic, OpenAI, xAI, Claude, Codex, or Grok.

Inspired by (UX/data study only — no proprietary code copied):

- https://claude-resets.com/
- https://codex-resets.com/

## Features

- **Front-and-center likelihood boxes** (odds label + score + one-line why) on Overview for all three providers
- Unified dashboard: days since last reset, counts, mean gap, longest drought, heatmap, shared timeline
- Announcement archive with X/docs links, delivery mode (`immediate` | `banked` | `unknown`), and `reason_tags`
- Anticipator features: drought vs mean, **rival pressure**, weekend proximity, recent reason patterns — **not a schedule guarantee**
- Claude vs Codex comparison (overlap / 90d / all-time)
- Machine-readable: `public/data/summary.json`, `public/data/resets.json`, `public/llms.txt`, `public/rss.xml`
- Optional personal `/usage` countdowns in `localStorage` (never uploaded)

## Anticipator score (brief)

Score is additive, then clamped to 0–100:

| Feature | Typical weights |
| --- | --- |
| Drought vs mean gap | 0 / +10 / +22 / +35 (or thin-history drought bump) |
| **Rival pressure** | 0 / +12 / +16 / +22 if another lab had `product_launch`, `milestone`, `competitive_response`, or a **banked** reset in the last ~3–7 days |
| Weekend proximity (Fri–Sun UTC) | +12 |
| Recent reason patterns | +4 to +8 |
| Pace dampener (high-frequency, early cycle) | −8 |

Labels: **low** &lt;18 · **moderate** &lt;35 · **elevated** &lt;55 · **high** ≥55.

**Rival pressure thesis:** labs sometimes reset not only after incidents, but when a rival ships something good so maxed users do not churn (e.g. Claude Max around Astra week). Cross-links: Claude odds look at recent Codex/Grok events and vice versa.

## Grok / xAI notes

- Paid SuperGrok uses an **account-specific shared weekly usage pool** (see [docs.x.ai FAQ](https://docs.x.ai/grok/faq)); free-tier Chat/Voice limits are separate.
- Public discretionary “miracle” resets are **rare** compared with Claude/Codex — the catalog seeds documented policy + sparse announcement events and says so when history is thin.
- Anticipator still scores on rival pressure + any drought from seeded public resets.

## Event schema

| Field | Description |
| --- | --- |
| `provider` | `claude` \| `codex` \| `grok` |
| `kind` | `reset` \| `policy` |
| `delivery` | `immediate` \| `banked` \| `unknown` |
| `reason_tags` | e.g. `incident`, `milestone`, `weekend_holiday`, `product_launch`, `banked_credit`, `usage_anomaly`, `capacity`, `goodwill`, `policy_change`, **`competitive_response`** |
| `scope` | Who was covered |
| `date` | ISO-8601 UTC |
| `url` | Original announcement or docs |
| `account` | Announcing handle |
| `note` | Short paraphrase |

## Quick start

```bash
cd /workspace/ai-reset-tracker   # or your clone path
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173/ai-reset-tracker/).

Production build:

```bash
npm run build
npm run preview
```

Static output lands in `dist/` — deploy that folder to any static host (GitHub Pages, Netlify, Cloudflare Pages, S3, etc.). Base path is `/ai-reset-tracker/` for GitHub Pages.

## Refresh seed data

Re-fetch upstream Claude/Codex catalogs and regenerate `public/data/*` (preserves curated Grok events + competitive tags):

```bash
npm run refresh-data
```

Sources:

- Claude events adapted from https://claude-resets.com/data/resets.json (with attribution)
- Codex announcements from https://codex-resets.com/api/resets (curated ~52 posts from @thsottiaux)
- Grok: curated locally from docs.x.ai + sparse public announcements

## Deploy

1. `npm run build`
2. Publish `dist/` as a static site (gh-pages at `/ai-reset-tracker/`)
3. Ensure `/data/resets.json`, `/data/summary.json`, `/llms.txt`, and `/rss.xml` are reachable under the base path (Vite copies `public/` into `dist/`)

No server required. Data fetches use `import.meta.env.BASE_URL`.

## Attribution

- Claude catalog adapted from [claude-resets.com](https://claude-resets.com/) data feeds
- Codex history curated from [codex-resets.com](https://codex-resets.com/) / @thsottiaux announcements
- Grok / xAI from [docs.x.ai/grok/faq](https://docs.x.ai/grok/faq) and sparse @bot / press-covered announcements
- Timestamps prefer announcement times / status IDs; notes are paraphrases
- Classifications (`delivery`, `reason_tags`, scope) are editorial interpretations — always check the original post

## Disclaimer

This is a community fan tool. It does **not** predict official resets, does **not** speak for any lab, and anticipation scores are descriptive historical hints only.
