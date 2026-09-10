# Anticipation scorer — blind backtest

Generated: 2026-09-10T19:08:07.978Z (UTC)
Evaluation end: 2026-09-10 UTC

## Method

Blind per-provider backtest: anticipate()/gap hazard sees only events before T. Primary NON-OVERLAP protocol = weekly (7d-apart) checkpoints. Post-reset is event-triggered (NOT non-overlapping — windows often collide when resets are <7d apart). Gap-conditional = one drought landmark per held-out gap. Report Brier/log-loss vs constant base rate (skill often ≈0) and ranking separation; do not claim calibrated Brier skill. Pooled overlapping daily band lift is NOT the success criterion.

- Production `anticipate()` + `gapConditionalHazard()` from `src/lib/stats.ts` (compiled via `tsc` at run time).
- Blind: events/rivals filtered to `date < T`; `now = T` (UTC midnight).
- **Weekly protocol (PRIMARY non-overlap):** checkpoints every 7 UTC days → non-overlapping next-7d outcomes.
- **Post-reset protocol (event-triggered, NOT non-overlapping):** UTC day after each reset → next-7d outcome. Codex often has resets <7d apart, so these windows collide; treat as diagnostic, not a second IID sample.
- **Gap-conditional (one row per gap):** for each held-out completed gap, score empirical hazard once at landmark drought d = 0 from prior gaps only; y = 1 if that gap ends in (0, 7]. Avoids stacking dependent mid-gap rows that overstate n.
- Metrics: **Brier** / **log-loss** vs constant base rate (skill = baseline − model; on this catalog skill is typically ≈ 0 — do **not** claim calibrated Brier skill). Prefer **ranking** separation (p̂ on hit vs miss) where present (Codex).
- Secondary: top-decile precision with **block bootstrap** 95% interval (contiguous blocks; CI omitted when n < 5).
- Score ≈ 100 × estimated P(reset in ~7d). Labels: low &lt;35 · moderate &lt;50 · elevated &lt;65 · high ≥65 — chance-soon ranking bands, not overdue.

## claude

- Resets in catalog: **11** (2026-04-16T20:02:04Z → 2026-09-04T20:08:45Z)
- Eval window: **2026-04-24** → **2026-09-10**

### Weekly non-overlapping (primary)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 19 |
| Base rate (7d hit) | 36.8% |
| Brier | 0.242 (constant-base 0.233, skill -0.009) |
| Log-loss | 0.674 (constant-base 0.658, skill -0.016) |
| Mean p̂ on hit / miss | 0.279 / 0.235 |
| Top-decile precision (7d) | 0.0% (n=2; block-bootstrap 95% [0.0%, 100.0%]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 13 | 38.5% | 1.04× |
| moderate | 6 | 33.3% | 0.90× |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Post-reset day (event-triggered — NOT non-overlapping)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 9 |
| Base rate (7d hit) | 22.2% |
| Brier | 0.218 (constant-base 0.173, skill -0.045) |
| Log-loss | 0.635 (constant-base 0.530, skill -0.106) |
| Mean p̂ on hit / miss | 0.255 / 0.344 |
| Top-decile precision (7d) | 0.0% (n=1; block-bootstrap 95% [0.0%, 0.0%]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 6 | 33.3% | 1.50× |
| moderate | 3 | 0.0% | 0.00× |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Gap-conditional hazard residual (one row per gap, landmark d=0)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 8 |
| Base rate (7d hit) | 25.0% |
| Brier | 0.226 (constant-base 0.188, skill -0.039) |
| Log-loss | 0.655 (constant-base 0.562, skill -0.093) |
| Mean p̂ on hit / miss | 0.254 / 0.339 |
| Top-decile precision (7d) | 0.0% (n=1; block-bootstrap 95% [0.0%, 0.0%]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 5 | 40.0% | 1.60× |
| moderate | 3 | 0.0% | 0.00× |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Daily overlapping (reference only — not the success bar)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 133 |
| Base rate (7d hit) | 42.1% |
| Brier | 0.269 (constant-base 0.244, skill -0.025) |
| Log-loss | 0.760 (constant-base 0.681, skill -0.080) |
| Mean p̂ on hit / miss | 0.285 / 0.247 |
| Top-decile precision (7d) | 28.6% (n=14; block-bootstrap 95% [7.1%, 64.3%]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 90 | 36.7% | 0.87× |
| moderate | 41 | 56.1% | 1.33× |
| elevated | 2 | 0.0% | 0.00× |
| high | 0 | — | — |

## codex

- Resets in catalog: **52** (2025-09-17T04:02:52Z → 2026-09-08T01:56:57Z)
- Eval window: **2025-11-06** → **2026-09-10**

### Weekly non-overlapping (primary)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 44 |
| Base rate (7d hit) | 61.4% |
| Brier | 0.259 (constant-base 0.237, skill -0.022) |
| Log-loss | 0.748 (constant-base 0.667, skill -0.081) |
| Mean p̂ on hit / miss | 0.437 / 0.289 |
| Top-decile precision (7d) | 80.0% (n=5; block-bootstrap 95% [40.0%, 100.0%]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 19 | 36.8% | 0.60× |
| moderate | 10 | 80.0% | 1.30× |
| elevated | 12 | 75.0% | 1.22× |
| high | 3 | 100.0% | 1.63× |

### Post-reset day (event-triggered — NOT non-overlapping)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 48 |
| Base rate (7d hit) | 72.9% |
| Brier | 0.219 (constant-base 0.197, skill -0.022) |
| Log-loss | 0.644 (constant-base 0.584, skill -0.060) |
| Mean p̂ on hit / miss | 0.581 / 0.491 |
| Top-decile precision (7d) | 80.0% (n=5; block-bootstrap 95% [40.0%, 100.0%]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 6 | 50.0% | 0.69× |
| moderate | 5 | 80.0% | 1.10× |
| elevated | 20 | 70.0% | 0.96× |
| high | 17 | 82.4% | 1.13× |

### Gap-conditional hazard residual (one row per gap, landmark d=0)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 49 |
| Base rate (7d hit) | 71.4% |
| Brier | 0.235 (constant-base 0.204, skill -0.031) |
| Log-loss | 0.678 (constant-base 0.598, skill -0.079) |
| Mean p̂ on hit / miss | 0.547 / 0.492 |
| Top-decile precision (7d) | 100.0% (n=5; block-bootstrap 95% [40.0%, 100.0%]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 5 | 60.0% | 0.84× |
| moderate | 8 | 75.0% | 1.05× |
| elevated | 28 | 71.4% | 1.00× |
| high | 8 | 75.0% | 1.05× |

### Daily overlapping (reference only — not the success bar)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 302 |
| Base rate (7d hit) | 61.3% |
| Brier | 0.249 (constant-base 0.237, skill -0.012) |
| Log-loss | 0.715 (constant-base 0.668, skill -0.048) |
| Mean p̂ on hit / miss | 0.446 / 0.278 |
| Top-decile precision (7d) | 90.3% (n=31; block-bootstrap 95% [77.4%, 100.0%]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 127 | 38.6% | 0.63× |
| moderate | 73 | 74.0% | 1.21× |
| elevated | 76 | 77.6% | 1.27× |
| high | 26 | 88.5% | 1.44× |

## grok

- Resets in catalog: **2** (2026-08-26T14:00:00Z → 2026-09-01T16:00:00Z)
- Eval window: **2026-09-02** → **2026-09-10**

### Weekly non-overlapping (primary)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 1 |
| Base rate (7d hit) | 0.0% |
| Brier | 0.194 (constant-base 0.000, skill -0.194) |
| Log-loss | 0.580 (constant-base 0.000, skill -0.580) |
| Mean p̂ on hit / miss | — / 0.440 |
| Top-decile precision (7d) | 0.0% (n=1; block-bootstrap 95% [—, —]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 0 | — | — |
| moderate | 1 | 0.0% | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Post-reset day (event-triggered — NOT non-overlapping)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 1 |
| Base rate (7d hit) | 0.0% |
| Brier | 0.194 (constant-base 0.000, skill -0.194) |
| Log-loss | 0.580 (constant-base 0.000, skill -0.580) |
| Mean p̂ on hit / miss | — / 0.440 |
| Top-decile precision (7d) | 0.0% (n=1; block-bootstrap 95% [—, —]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 0 | — | — |
| moderate | 1 | 0.0% | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Gap-conditional hazard residual (one row per gap, landmark d=0)

_No rows._

### Daily overlapping (reference only — not the success bar)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 2 |
| Base rate (7d hit) | 0.0% |
| Brier | 0.194 (constant-base 0.000, skill -0.194) |
| Log-loss | 0.580 (constant-base 0.000, skill -0.580) |
| Mean p̂ on hit / miss | — / 0.440 |
| Top-decile precision (7d) | 0.0% (n=1; block-bootstrap 95% [—, —]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 0 | — | — |
| moderate | 2 | 0.0% | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

## Verdict

claude: no ranking edge on weekly checkpoints (p̂ hit/miss 0.28/0.24); Brier skill -0.009 ≈ 0 vs constant base rate (n_weekly=19, n_gap=8) — UI shows a shrunk hazard ranking signal, not a calibrated forecast.   └ top-decile precision 0.0% vs base 36.8% (secondary). codex: ranking signal on weekly (primary non-overlap) checkpoints (p̂ hit 0.44 > miss 0.29); Brier skill -0.022 ≈ 0 vs constant base 61.4% — ranking present, not calibrated Brier skill; top-decile prec 80.0% (block-bootstrap 95% [40.0%, 100.0%], n_weekly=44, n_gap=49). grok: no reliable short-horizon ranking on this catalog (weekly p̂ hit/miss —/0.44, Brier skill -0.194 vs constant base, n=1) — UI still shows an honest shrunk hazard, not overdue urgency. Weekly is the primary non-overlap protocol; post-reset is event-triggered (windows collide when resets are <7d apart). Pooled overlapping daily band-lift is intentionally not the success bar.

_Descriptive backtest on a small public announcement log — not a claim of calibrated Brier skill. Skill vs a constant provider base rate is typically ≈0; where a signal appears it is a within-provider ranking effect (Codex on weekly checkpoints). Post-reset rows are event-triggered and may overlap._
