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
- Anticipator: **gap-conditional 72h (3d) hazard** (chance-soon ranking signal; skill≈0 vs constant base rate on this log), with rival pressure shown as context — **not a schedule guarantee**
- Claude vs Codex comparison (overlap / 90d / all-time)
- Machine-readable: `public/data/summary.json`, `public/data/resets.json`, `public/llms.txt`, `public/rss.xml`
- Optional personal `/usage` countdowns in `localStorage` (never uploaded)

## Anticipator score (brief)

Score ≈ **100 × estimated P(public reset in the next ~72 hours / 3 days)** from this provider’s **own completed gap history** (blind to the future):

| Feature | Role |
| --- | --- |
| **72h gap hazard** | Empirical P(gap ends in (drought, drought+3] \| survived past drought), shrunk toward an early-cycle prior. Long droughts that outlived most historical gaps score **low** (not “overdue”). |
| Rival pressure (~72h) | Short-window rival launch/milestone/banked events may **boost** the score only when past gap-starts for this provider show a positive shrunk lift; 7d rivals remain context. |
| Weekend / drought bins | Weekend proximity and coarse drought-bin smoothing — lifts fit only on past gap-starts / completed gaps at T (blind). Reason tags stay descriptive. |

Labels track estimated chance-soon (ranking bands — not a claim of calibrated Brier skill): **low** &lt;30 · **moderate** &lt;45 · **elevated** &lt;60 · **high** ≥60 (72h bands; slightly lower than the old 7d cutovers).

**Rival pressure thesis (context only):** labs sometimes reset when a rival ships; we still surface those events in the feature list without letting them dominate the probability.

## Grok / xAI notes

- Paid SuperGrok uses an **account-specific shared weekly usage pool** (see [docs.x.ai FAQ](https://docs.x.ai/grok/faq)); free-tier Chat/Voice limits are separate.
- Public discretionary “miracle” resets are **rare** compared with Claude/Codex — the catalog seeds documented policy + sparse announcement events and says so when history is thin.
- Anticipator uses whatever public reset gaps exist; thin history → wide shrunk prior.

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

## Blind backtest

```bash
npm run backtest
```

Writes `scripts/backtest-report.md` + `scripts/backtest-results.json` — per-provider Brier/log-loss on the **primary weekly non-overlap** protocol with **72h hit** as the primary outcome (7d hit kept as secondary), plus event-triggered post-reset diagnostics (windows may collide when resets are close) and **one-row-per-gap** hazard residuals (`anticipate()` blinded to future events). Skill vs constant base rate is typically ≈0; do not claim calibrated Brier skill. Pooled overlapping daily band-lift is not the success bar.

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
