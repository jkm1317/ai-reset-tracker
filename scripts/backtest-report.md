# Anticipation scorer — blind backtest

Generated: 2026-09-28T15:25:51.567Z (UTC)
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

- Resets in catalog: **14** (2026-04-16T20:02:04Z → 2026-09-22T16:44:06Z)
- Eval window: **2026-04-24** → **2026-09-10**

### Weekly non-overlapping (primary)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 20 |
| Base rate (72h hit) | 20.0% |
| Brier | 0.195 (constant-base 0.160, skill -0.035) |
| Log-loss | 0.653 (constant-base 0.500, skill -0.153) |
| Mean p̂ on hit / miss | 0.150 / 0.206 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 14.3% (n=7; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=2; target 50.0%; clears=false; block-bootstrap 95% [0.0%, 0.0%]) |
| Secondary 7d base / Brier skill | 47.4% / -0.103 (n=19) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 14 | 28.6% | 1.43× |
| moderate | 6 | 0.0% | 0.00× |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Post-reset day (event-triggered — NOT non-overlapping)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 12 |
| Base rate (72h hit) | 16.7% |
| Brier | 0.165 (constant-base 0.139, skill -0.026) |
| Log-loss | 0.508 (constant-base 0.451, skill -0.058) |
| Mean p̂ on hit / miss | 0.140 / 0.183 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=4; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=2; target 50.0%; clears=false; block-bootstrap 95% [0.0%, 0.0%]) |
| Secondary 7d base / Brier skill | 45.5% / -0.096 (n=11) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 9 | 22.2% | 1.33× |
| moderate | 3 | 0.0% | 0.00× |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Gap-conditional hazard residual (one row per gap, landmark d=0)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 11 |
| Base rate (72h hit) | 9.1% |
| Brier | 0.092 (constant-base 0.083, skill -0.009) |
| Log-loss | 0.376 (constant-base 0.305, skill -0.071) |
| Mean p̂ on hit / miss | 0.040 / 0.087 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=4; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=2; target 50.0%; clears=false; block-bootstrap 95% [0.0%, 0.0%]) |
| Secondary 7d base / Brier skill | 45.5% / -0.156 (n=11) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 11 | 9.1% | 1.00× |
| moderate | 0 | — | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

### Daily overlapping (reference only — not the success bar)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 137 |
| Base rate (72h hit) | 22.6% |
| Brier | 0.198 (constant-base 0.175, skill -0.023) |
| Log-loss | 0.651 (constant-base 0.535, skill -0.117) |
| Mean p̂ on hit / miss | 0.134 / 0.151 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 17.4% (n=46; target 50.0%; clears=false) |
| Top-decile precision (72h) | 14.3% (n=14; target 50.0%; clears=false; block-bootstrap 95% [0.0%, 42.9%]) |
| Secondary 7d base / Brier skill | 46.6% / -0.110 (n=133) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 120 | 24.2% | 1.07× |
| moderate | 17 | 11.8% | 0.52× |
| elevated | 0 | — | — |
| high | 0 | — | — |

## codex

- Resets in catalog: **55** (2025-09-17T04:02:52Z → 2026-09-26T18:17:54Z)
- Eval window: **2025-11-06** → **2026-09-10**

### Weekly non-overlapping (primary)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 44 |
| Base rate (72h hit) | 45.5% |
| Brier | 0.243 (constant-base 0.248, skill 0.005) |
| Log-loss | 0.709 (constant-base 0.689, skill -0.019) |
| Mean p̂ on hit / miss | 0.341 / 0.231 |
| Elevated/high precision (72h) | 80.0% (n=5; target 60.5%; clears=true) |
| Top-tercile precision (72h) | 80.0% (n=15; target 60.5%; clears=true) |
| Top-decile precision (72h) | 80.0% (n=5; target 60.5%; clears=true; block-bootstrap 95% [20.0%, 100.0%]) |
| Secondary 7d base / Brier skill | 61.4% / -0.088 (n=44) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 21 | 28.6% | 0.63× |
| moderate | 18 | 55.6% | 1.22× |
| elevated | 5 | 80.0% | 1.76× |
| high | 0 | — | — |

### Post-reset day (event-triggered — NOT non-overlapping)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 50 |
| Base rate (72h hit) | 58.0% |
| Brier | 0.259 (constant-base 0.244, skill -0.015) |
| Log-loss | 0.731 (constant-base 0.680, skill -0.051) |
| Mean p̂ on hit / miss | 0.413 / 0.308 |
| Elevated/high precision (72h) | 85.7% (n=14; target 73.0%; clears=true) |
| Top-tercile precision (72h) | 82.4% (n=17; target 73.0%; clears=true) |
| Top-decile precision (72h) | 100.0% (n=5; target 73.0%; clears=true; block-bootstrap 95% [40.0%, 100.0%]) |
| Secondary 7d base / Brier skill | 72.9% / -0.115 (n=48) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 11 | 36.4% | 0.63× |
| moderate | 25 | 52.0% | 0.90× |
| elevated | 12 | 83.3% | 1.44× |
| high | 2 | 100.0% | 1.72× |

### Gap-conditional hazard residual (one row per gap, landmark d=0)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 52 |
| Base rate (72h hit) | 48.1% |
| Brier | 0.272 (constant-base 0.250, skill -0.022) |
| Log-loss | 0.762 (constant-base 0.692, skill -0.070) |
| Mean p̂ on hit / miss | 0.346 / 0.318 |
| Elevated/high precision (72h) | 45.5% (n=11; target 63.1%; clears=false) |
| Top-tercile precision (72h) | 55.6% (n=18; target 63.1%; clears=false) |
| Top-decile precision (72h) | 33.3% (n=6; target 63.1%; clears=false; block-bootstrap 95% [0.0%, 83.3%]) |
| Secondary 7d base / Brier skill | 71.2% / -0.128 (n=52) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 21 | 38.1% | 0.79× |
| moderate | 20 | 60.0% | 1.25× |
| elevated | 11 | 45.5% | 0.95× |
| high | 0 | — | — |

### Daily overlapping (reference only — not the success bar)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 306 |
| Base rate (72h hit) | 38.6% |
| Brier | 0.221 (constant-base 0.237, skill 0.016) |
| Log-loss | 0.652 (constant-base 0.667, skill 0.015) |
| Mean p̂ on hit / miss | 0.329 / 0.223 |
| Elevated/high precision (72h) | 81.5% (n=27; target 53.6%; clears=true) |
| Top-tercile precision (72h) | 59.8% (n=102; target 53.6%; clears=true) |
| Top-decile precision (72h) | 77.4% (n=31; target 53.6%; clears=true; block-bootstrap 95% [51.6%, 96.8%]) |
| Secondary 7d base / Brier skill | 61.3% / -0.097 (n=302) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 175 | 24.6% | 0.64× |
| moderate | 104 | 51.0% | 1.32× |
| elevated | 21 | 76.2% | 1.98× |
| high | 6 | 100.0% | 2.59× |

## grok

- Resets in catalog: **2** (2026-08-26T14:00:00Z → 2026-09-01T16:00:00Z)
- Eval window: **2026-09-02** → **2026-09-10**

### Weekly non-overlapping (primary)

| Metric | Value |
| --- | --- |
| Checkpoints (n) | 1 |
| Base rate (72h hit) | 0.0% |
| Brier | 0.020 (constant-base 0.000, skill -0.020) |
| Log-loss | 0.151 (constant-base 0.000, skill -0.151) |
| Mean p̂ on hit / miss | — / 0.140 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=1; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=1; target 50.0%; clears=false; block-bootstrap 95% [—, —]) |
| Secondary 7d base / Brier skill | 0.0% / -0.020 (n=1) |

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
| Brier | 0.020 (constant-base 0.000, skill -0.020) |
| Log-loss | 0.151 (constant-base 0.000, skill -0.151) |
| Mean p̂ on hit / miss | — / 0.140 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=1; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=1; target 50.0%; clears=false; block-bootstrap 95% [—, —]) |
| Secondary 7d base / Brier skill | 0.0% / -0.020 (n=1) |

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
| Brier | 0.024 (constant-base 0.000, skill -0.024) |
| Log-loss | 0.169 (constant-base 0.000, skill -0.169) |
| Mean p̂ on hit / miss | — / 0.155 |
| Elevated/high precision (72h) | — (n=0; target 50.0%; clears=false) |
| Top-tercile precision (72h) | 0.0% (n=2; target 50.0%; clears=false) |
| Top-decile precision (72h) | 0.0% (n=1; target 50.0%; clears=false; block-bootstrap 95% [0.0%, 0.0%]) |
| Secondary 7d base / Brier skill | 0.0% / -0.020 (n=2) |

| Band (by p̂) | n | Hit rate 72h | Lift vs base |
| --- | ---: | ---: | ---: |
| low | 6 | 0.0% | — |
| moderate | 0 | — | — |
| elevated | 0 | — | — |
| high | 0 | — | — |

## Verdict

claude: does NOT clear 72h usefulness bar on weekly (base 20.0%; elev/high prec — n=0 target 50.0%; top-decile 0.0%; top-tercile 14.3%; Brier skill -0.035; p̂ hit/miss 0.15/0.21; n_weekly=20, n_gap=11). Ceiling on this thin 72h log: hits often arrive at unprecedented droughts where survivors=0, so gap/rival/weekend features cannot concentrate ≥50% precision (best top-decile here 0.0% vs target 50.0%) — not faked. codex: CLEARS 72h bar on weekly (elev/high prec 80.0% n=5; top-decile 80.0%; top-tercile 80.0%; target 60.5%; Brier skill 0.005 > 0 vs base 45.5%; p̂ hit/miss 0.34/0.23; n_weekly=44, n_gap=52). grok: does NOT clear 72h usefulness bar on weekly (base 0.0%; elev/high prec — n=0 target 50.0%; top-decile 0.0%; top-tercile 0.0%; Brier skill -0.020; p̂ hit/miss —/0.14; n_weekly=1, n_gap=0). Ceiling on this thin 72h log: hits often arrive at unprecedented droughts where survivors=0, so gap/rival/weekend features cannot concentrate ≥50% precision (best top-decile here 0.0% vs target 50.0%) — not faked. Weekly (7d-apart, 72h outcome) is the primary non-overlap protocol; 7d hit is secondary. Post-reset is event-triggered (windows collide when resets are close). Pooled overlapping daily band-lift is intentionally not the success bar.

_Descriptive backtest on a small public announcement log. Prefer positive Brier skill and call-precision above max(50%, baseline+15pp); do not claim calibrated Brier skill lightly. Post-reset rows are event-triggered and may overlap._
