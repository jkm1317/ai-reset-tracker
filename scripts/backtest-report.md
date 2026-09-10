# Anticipation scorer — blind backtest

Generated: 2026-09-10T19:15:22.420Z (UTC)
Evaluation end: 2026-09-10 UTC

## Method

Blind per-provider backtest: anticipate()/gap hazard sees only events before T. Primary estimand = P(reset within 72h/3d). Primary NON-OVERLAP protocol = weekly (7d-apart) checkpoints with 72h outcomes. Secondary = 7d hit on the same checkpoints when the window fits. Post-reset is event-triggered (NOT non-overlapping — windows collide when resets are close). Gap-conditional = one drought landmark per held-out gap. Success bar: elevated/high or top-decile 72h precision ≥ max(50%, baseline+15pp) with usable n; prefer Brier skill > 0. Do not claim calibrated Brier skill lightly. Pooled overlapping daily band lift is NOT the success criterion.

- Production `anticipate()` + `gapConditionalHazard()` from `src/lib/stats.ts` (compiled via `tsc` at run time).
- Blind: events/rivals filtered to `date < T`; `now = T` (UTC midnight).
- **Weekly protocol (PRIMARY non-overlap):** checkpoints every 7 UTC days → non-overlapping next-72h (3d) outcomes; 7d hit kept as secondary when the window fits.
- **Post-reset protocol (event-triggered, NOT non-overlapping):** UTC day after each reset → next-72h outcome. Windows collide when resets are close; treat as diagnostic, not a second IID sample.
- **Gap-conditional (one row per gap):** for each held-out completed gap, score empirical hazard once at landmark drought d = 0 from prior gaps only; y = 1 if that gap ends in (0, 3]. Avoids stacking dependent mid-gap rows that overstate n.
- Metrics: **Brier** / **log-loss** vs constant base rate (skill = baseline − model; prefer skill > 0). Success bar: elevated/high or top-decile/tercile **72h precision ≥ max(50%, baseline+15pp)** with usable n. Do **not** claim calibrated Brier skill lightly.
- Secondary: top-decile precision with **block bootstrap** 95% interval (contiguous blocks; CI omitted when n < 5).
- Score ≈ 100 × estimated P(reset in ~72h / 3d). Labels: low &lt;30 · moderate &lt;45 · elevated &lt;60 · high ≥60 — chance-soon ranking bands for the 72h horizon, not overdue.

## claude

- Resets in catalog: **11** (2026-04-16T20:02:04Z → 2026-09-04T20:08:45Z)
- Eval window: **2026-04-24** → **2026-09-10**

### Weekly non-overlapping (primary)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 20 |
| Base rate (72h hit) | 15.0% |
| Brier | 0.162 (constant-base 0.127, skill -0.035) |
| Log-loss | 0.580 (constant-base 0.423, skill -0.157) |
| Mean p̂ on hit / miss | 0.077 / 0.167 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=7; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=2; target 50.0%; clears=false; block-bootstrap 95% [0.0%, 0.0%]) |
| Secondary 7d base / Brier skill | 36.8% / -0.077 (n=19) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 16 | 18.8% | 1.25× |
| moderate | 4 | 0.0% | 0.00× |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Post-reset day (event-triggered — NOT non-overlapping)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 10 |
| Base rate (72h hit) | 10.0% |
| Brier | 0.110 (constant-base 0.090, skill -0.020) |
| Log-loss | 0.442 (constant-base 0.325, skill -0.117) |
| Mean p̂ on hit / miss | 0.040 / 0.122 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=4; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=1; target 50.0%; clears=false; block-bootstrap 95% [0.0%, 0.0%]) |
| Secondary 7d base / Brier skill | 22.2% / -0.005 (n=9) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 10 | 10.0% | 1.00× |
| moderate | 0 | — | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Gap-conditional hazard residual (one row per gap, landmark d=0)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 8 |
| Base rate (72h hit) | 12.5% |
| Brier | 0.126 (constant-base 0.109, skill -0.017) |
| Log-loss | 0.498 (constant-base 0.377, skill -0.122) |
| Mean p̂ on hit / miss | 0.040 / 0.103 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=3; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=1; target 50.0%; clears=false; block-bootstrap 95% [0.0%, 0.0%]) |
| Secondary 7d base / Brier skill | 25.0% / -0.032 (n=8) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 8 | 12.5% | 1.00× |
| moderate | 0 | — | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Daily overlapping (reference only — not the success bar)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 137 |
| Base rate (72h hit) | 18.2% |
| Brier | 0.158 (constant-base 0.149, skill -0.009) |
| Log-loss | 0.527 (constant-base 0.475, skill -0.052) |
| Mean p̂ on hit / miss | 0.131 / 0.124 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 21.7% (n=46; target 50.0%; clears=false) |
| Top-decile precision (72h) | 21.4% (n=14; target 50.0%; clears=false; block-bootstrap 95% [0.0%, 50.0%]) |
| Secondary 7d base / Brier skill | 42.1% / -0.092 (n=133) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 125 | 17.6% | 0.96× |
| moderate | 12 | 25.0% | 1.37× |
| elevated | 0 | — | — |
| high | 0 | — | — |

## codex

- Resets in catalog: **52** (2025-09-17T04:02:52Z → 2026-09-08T01:56:57Z)
- Eval window: **2025-11-06** → **2026-09-10**

### Weekly non-overlapping (primary)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 44 |
| Base rate (72h hit) | 45.5% |
| Brier | 0.245 (constant-base 0.248, skill 0.003) |
| Log-loss | 0.712 (constant-base 0.689, skill -0.023) |
| Mean p̂ on hit / miss | 0.336 / 0.229 |
| Elevated/high precision (72h) | 80.0% (n=5; target 60.5%; clears=true) |
| Top-tercile precision (72h) | 80.0% (n=15; target 60.5%; clears=true) |
| Top-decile precision (72h) | 80.0% (n=5; target 60.5%; clears=true; block-bootstrap 95% [20.0%, 100.0%]) |
| Secondary 7d base / Brier skill | 61.4% / -0.090 (n=44) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 22 | 27.3% | 0.60× |
| moderate | 17 | 58.8% | 1.29× |
| elevated | 5 | 80.0% | 1.76× |
| high | 0 | — | — |

### Post-reset day (event-triggered — NOT non-overlapping)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 50 |
| Base rate (72h hit) | 58.0% |
| Brier | 0.261 (constant-base 0.244, skill -0.018) |
| Log-loss | 0.736 (constant-base 0.680, skill -0.056) |
| Mean p̂ on hit / miss | 0.408 / 0.308 |
| Elevated/high precision (72h) | 85.7% (n=14; target 73.0%; clears=true) |
| Top-tercile precision (72h) | 82.4% (n=17; target 73.0%; clears=true) |
| Top-decile precision (72h) | 100.0% (n=5; target 73.0%; clears=true; block-bootstrap 95% [40.0%, 100.0%]) |
| Secondary 7d base / Brier skill | 72.9% / -0.116 (n=48) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 11 | 36.4% | 0.63× |
| moderate | 25 | 52.0% | 0.90× |
| elevated | 13 | 84.6% | 1.46× |
| high | 1 | 100.0% | 1.72× |

### Gap-conditional hazard residual (one row per gap, landmark d=0)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 49 |
| Base rate (72h hit) | 51.0% |
| Brier | 0.274 (constant-base 0.250, skill -0.025) |
| Log-loss | 0.769 (constant-base 0.693, skill -0.076) |
| Mean p̂ on hit / miss | 0.346 / 0.297 |
| Elevated/high precision (72h) | 62.5% (n=8; target 66.0%; clears=false) |
| Top-tercile precision (72h) | 64.7% (n=17; target 66.0%; clears=false) |
| Top-decile precision (72h) | 60.0% (n=5; target 66.0%; clears=false; block-bootstrap 95% [20.0%, 100.0%]) |
| Secondary 7d base / Brier skill | 71.4% / -0.133 (n=49) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 21 | 38.1% | 0.75× |
| moderate | 20 | 60.0% | 1.18× |
| elevated | 8 | 62.5% | 1.22× |
| high | 0 | — | — |

### Daily overlapping (reference only — not the success bar)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 306 |
| Base rate (72h hit) | 38.6% |
| Brier | 0.222 (constant-base 0.237, skill 0.015) |
| Log-loss | 0.654 (constant-base 0.667, skill 0.013) |
| Mean p̂ on hit / miss | 0.325 / 0.222 |
| Elevated/high precision (72h) | 81.5% (n=27; target 53.6%; clears=true) |
| Top-tercile precision (72h) | 60.8% (n=102; target 53.6%; clears=true) |
| Top-decile precision (72h) | 77.4% (n=31; target 53.6%; clears=true; block-bootstrap 95% [51.6%, 93.5%]) |
| Secondary 7d base / Brier skill | 61.3% / -0.098 (n=302) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 177 | 24.3% | 0.63× |
| moderate | 102 | 52.0% | 1.35× |
| elevated | 24 | 79.2% | 2.05× |
| high | 3 | 100.0% | 2.59× |

## grok

- Resets in catalog: **2** (2026-08-26T14:00:00Z → 2026-09-01T16:00:00Z)
- Eval window: **2026-09-02** → **2026-09-10**

### Weekly non-overlapping (primary)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 1 |
| Base rate (72h hit) | 0.0% |
| Brier | 0.006 (constant-base 0.000, skill -0.006) |
| Log-loss | 0.083 (constant-base 0.000, skill -0.083) |
| Mean p̂ on hit / miss | — / 0.080 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=1; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=1; target 50.0%; clears=false; block-bootstrap 95% [—, —]) |
| Secondary 7d base / Brier skill | 0.0% / -0.006 (n=1) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 1 | 0.0% | — |
| moderate | 0 | — | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Post-reset day (event-triggered — NOT non-overlapping)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 1 |
| Base rate (72h hit) | 0.0% |
| Brier | 0.006 (constant-base 0.000, skill -0.006) |
| Log-loss | 0.083 (constant-base 0.000, skill -0.083) |
| Mean p̂ on hit / miss | — / 0.080 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=1; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=1; target 50.0%; clears=false; block-bootstrap 95% [—, —]) |
| Secondary 7d base / Brier skill | 0.0% / -0.006 (n=1) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 1 | 0.0% | — |
| moderate | 0 | — | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Gap-conditional hazard residual (one row per gap, landmark d=0)

_No rows._

### Daily overlapping (reference only — not the success bar)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 6 |
| Base rate (72h hit) | 0.0% |
| Brier | 0.009 (constant-base 0.000, skill -0.009) |
| Log-loss | 0.100 (constant-base 0.000, skill -0.100) |
| Mean p̂ on hit / miss | — / 0.095 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=2; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=1; target 50.0%; clears=false; block-bootstrap 95% [0.0%, 0.0%]) |
| Secondary 7d base / Brier skill | 0.0% / -0.006 (n=2) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 6 | 0.0% | — |
| moderate | 0 | — | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

## Verdict

claude: does NOT clear 72h usefulness bar on weekly (base 15.0%; elev/high prec — n=0 target 50.0%; top-decile 0.0%; top-tercile 0.0%; Brier skill -0.035; p̂ hit/miss 0.08/0.17; n_weekly=20, n_gap=8). Ceiling on this thin 72h log: hits often arrive at unprecedented droughts where survivors=0, so gap/rival/weekend features cannot concentrate ≥50% precision (best top-decile here 0.0% vs target 50.0%) — not faked. codex: CLEARS 72h bar on weekly (elev/high prec 80.0% n=5; top-decile 80.0%; top-tercile 80.0%; target 60.5%; Brier skill 0.003 > 0 vs base 45.5%; p̂ hit/miss 0.34/0.23; n_weekly=44, n_gap=49). grok: does NOT clear 72h usefulness bar on weekly (base 0.0%; elev/high prec — n=0 target 50.0%; top-decile 0.0%; top-tercile 0.0%; Brier skill -0.006; p̂ hit/miss —/0.08; n_weekly=1, n_gap=0). Ceiling on this thin 72h log: hits often arrive at unprecedented droughts where survivors=0, so gap/rival/weekend features cannot concentrate ≥50% precision (best top-decile here 0.0% vs target 50.0%) — not faked. Weekly (7d-apart, 72h outcome) is the primary non-overlap protocol; 7d hit is secondary. Post-reset is event-triggered (windows collide when resets are close). Pooled overlapping daily band-lift is intentionally not the success bar.

_Descriptive backtest on a small public announcement log. Prefer positive Brier skill and call-precision above max(50%, baseline+15pp); do not claim calibrated Brier skill lightly. Post-reset rows are event-triggered and may overlap._
