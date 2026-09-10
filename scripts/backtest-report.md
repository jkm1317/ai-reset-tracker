# Anticipation scorer — blind calibration backtest

Generated: 2026-09-10T19:02:00.898Z (UTC)
Evaluation end: 2026-09-10 UTC

## Method

Blind per-provider calibration: anticipate()/gap hazard sees only events before T. Primary metrics = Brier & log-loss on non-overlapping weekly and post-reset checkpoints, plus gap-conditional hazard residuals. Pooled overlapping daily band lift is NOT the success criterion.

- Production `anticipate()` + `gapConditionalHazard()` from `src/lib/stats.ts` (compiled via `tsc` at run time).
- Blind: events/rivals filtered to `date < T`; `now = T` (UTC midnight).
- **Weekly protocol:** checkpoints every 7 UTC days → non-overlapping next-7d outcomes.
- **Post-reset protocol:** UTC day after each reset → next-7d outcome.
- **Gap-conditional:** for each held-out completed gap, at drought d = 0,7,14,… score empirical hazard from prior gaps only; y = 1 if that gap ends in (d, d+7].
- Primary metrics: **Brier** and **log-loss** vs a constant base-rate forecast (skill = baseline − model; higher skill is better).
- Secondary: top-decile precision with **block bootstrap** 95% interval (contiguous blocks).
- Score ≈ 100 × estimated P(reset in ~7d). Labels: low &lt;35 · moderate &lt;50 · elevated &lt;65 · high ≥65 — meaning chance-soon, not overdue.

## claude

- Resets in catalog: **11** (2026-04-16T20:02:04Z → 2026-09-04T20:08:45Z)
- Eval window: **2026-04-24** → **2026-09-10**

### Weekly non-overlapping

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

### Post-reset day

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

### Gap-conditional hazard residual

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 21 |
| Base rate (7d hit) | 38.1% |
| Brier | 0.260 (constant-base 0.236, skill -0.024) |
| Log-loss | 0.740 (constant-base 0.665, skill -0.076) |
| Mean p̂ on hit / miss | 0.266 / 0.258 |
| Top-decile precision (7d) | 33.3% (n=3; block-bootstrap 95% [0.0%, 100.0%]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 15 | 40.0% | 1.05× |
| moderate | 6 | 33.3% | 0.88× |
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

### Weekly non-overlapping

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

### Post-reset day

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

### Gap-conditional hazard residual

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 74 |
| Base rate (7d hit) | 66.2% |
| Brier | 0.246 (constant-base 0.224, skill -0.022) |
| Log-loss | 0.706 (constant-base 0.640, skill -0.066) |
| Mean p̂ on hit / miss | 0.492 / 0.368 |
| Top-decile precision (7d) | 75.0% (n=8; block-bootstrap 95% [50.0%, 100.0%]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 20 | 40.0% | 0.60× |
| moderate | 16 | 81.3% | 1.23× |
| elevated | 30 | 73.3% | 1.11× |
| high | 8 | 75.0% | 1.13× |

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

### Weekly non-overlapping

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 1 |
| Base rate (7d hit) | 0.0% |
| Brier | 0.194 (constant-base 0.000, skill -0.194) |
| Log-loss | 0.580 (constant-base 0.000, skill -0.580) |
| Mean p̂ on hit / miss | — / 0.440 |
| Top-decile precision (7d) | 0.0% (n=undefined; block-bootstrap 95% [—, —]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 0 | — | — |
| moderate | 1 | 0.0% | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Post-reset day

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 1 |
| Base rate (7d hit) | 0.0% |
| Brier | 0.194 (constant-base 0.000, skill -0.194) |
| Log-loss | 0.580 (constant-base 0.000, skill -0.580) |
| Mean p̂ on hit / miss | — / 0.440 |
| Top-decile precision (7d) | 0.0% (n=undefined; block-bootstrap 95% [—, —]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 0 | — | — |
| moderate | 1 | 0.0% | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Gap-conditional hazard residual

_No rows._

### Daily overlapping (reference only — not the success bar)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 2 |
| Base rate (7d hit) | 0.0% |
| Brier | 0.194 (constant-base 0.000, skill -0.194) |
| Log-loss | 0.580 (constant-base 0.000, skill -0.580) |
| Mean p̂ on hit / miss | — / 0.440 |
| Top-decile precision (7d) | 0.0% (n=undefined; block-bootstrap 95% [—, —]) |

| Band (by p̂) | n | Hit rate 7d | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 0 | — | — |
| moderate | 2 | 0.0% | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

## Verdict

claude: no reliable short-horizon calibration edge on this catalog (weekly Brier skill -0.009, p̂ hit/miss 0.28/0.24, n=19) — UI still shows an honest shrunk hazard, not overdue urgency.   └ top-decile precision 0.0% vs base 36.8% (secondary). codex: weak ranking (p̂ hit 0.44 / miss 0.29) but Brier skill -0.022 ≈ baseline — treat scores as soft probabilities, not sharp forecasts (n_weekly=44, n_gap=74). grok: no reliable short-horizon calibration edge on this catalog (weekly Brier skill -0.194, p̂ hit/miss —/0.44, n=1) — UI still shows an honest shrunk hazard, not overdue urgency. Pooled overlapping daily band-lift is intentionally not the success bar (overlapping windows, non-IID days, cross-provider base-rate mix).

_Descriptive backtest on a small public announcement log — not a claim of forecasting skill. Absolute Brier skill vs a constant provider base rate is often near zero on thin samples; ranking within a provider (Codex) is the realistic ceiling._
