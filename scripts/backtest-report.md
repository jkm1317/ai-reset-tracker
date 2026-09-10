# Anticipation scorer — blind backtest

Generated: 2026-09-10T18:51:52.007Z (UTC)
Evaluation end: 2026-09-10 UTC

## Method

Blind walk: at UTC midnight T, anticipate(provider, events<T, rivals, now=T). Outcomes: reset in (T, T+Kd]. Warmup: ≥2 prior resets before T.

- Same production `anticipate()` + `rivalCatalog()` from `src/lib/stats.ts` (compiled via `tsc` at run time).
- Blind: events and rivals filtered to `date < T`; `now = T` (UTC midnight).
- Outcomes use the full catalog (not shown to the scorer): reset in `(T, T+3d]` / `(T, T+7d]`.
- Primary metrics use days where `T+7d ≤ evalEnd` so both horizons are fully observed.

## Combined (pooled provider-days)

| Metric | Value |
| --- | --- |
| 7d-complete days | 437 |
| Baseline next-3d | 31.8% |
| Baseline next-7d | 55.1% |
| Avg score on 7d-hit / miss | 20.9 / 33.2 |
| Brier (score/100 as P) | 0.426 |
| Elevated+high days (fire rate) | 131 (30.0%) |
| Elevated+high precision (7d) | 32.1% (lift 0.58×) |

### By odds band

| Band | Days | Hit rate 3d | Hit rate 7d | Lift vs baseline 7d |
| --- | ---: | ---: | ---: | ---: |
| low | 150 | 45.3% | 68.7% | 1.25× |
| moderate | 156 | 32.7% | 61.5% | 1.12× |
| elevated | 70 | 21.4% | 42.9% | 0.78× |
| high | 61 | 6.6% | 19.7% | 0.36× |

### By score bucket

| Bucket | Days | Hit rate 7d | Lift 7d |
| --- | ---: | ---: | ---: |
| 0-17 | 150 | 68.7% | 1.25× |
| 18-34 | 156 | 61.5% | 1.12× |
| 35-54 | 70 | 42.9% | 0.78× |
| 55-74 | 51 | 21.6% | 0.39× |
| 75-100 | 10 | 10.0% | 0.18× |

## claude

- Resets in catalog: **11** (2026-04-16T20:02:04Z → 2026-09-04T20:08:45Z)
- Eval window: **2026-04-24** → **2026-09-10**
- Scored days: **140** (7d-complete **133**)
- Baseline: 3d **18.2%**, 7d **42.1%**
- Elevated+high: n=73, precision7d=32.9%, lift=0.78×, fire=54.9%
- Avg score hit/miss 7d: 32.1 / 43.4; Brier 0.348

| Band | Days | Hit 3d | Hit 7d | Lift 7d |
| --- | ---: | ---: | ---: | ---: |
| low | 25 | 28.0% | 52.0% | 1.24× |
| moderate | 35 | 20.0% | 54.3% | 1.29× |
| elevated | 30 | 23.3% | 50.0% | 1.19× |
| high | 43 | 7.0% | 20.9% | 0.50× |

## codex

- Resets in catalog: **52** (2025-09-17T04:02:52Z → 2026-09-08T01:56:57Z)
- Eval window: **2025-11-06** → **2026-09-10**
- Scored days: **309** (7d-complete **302**)
- Baseline: 3d **38.6%**, 7d **61.3%**
- Elevated+high: n=58, precision7d=31.0%, lift=0.51×, fire=19.2%
- Avg score hit/miss 7d: 17.5 / 26.6; Brier 0.463

| Band | Days | Hit 3d | Hit 7d | Lift 7d |
| --- | ---: | ---: | ---: | ---: |
| low | 125 | 48.8% | 72.0% | 1.18× |
| moderate | 119 | 37.0% | 64.7% | 1.06× |
| elevated | 40 | 20.0% | 37.5% | 0.61× |
| high | 18 | 5.6% | 16.7% | 0.27× |

## grok

- Resets in catalog: **2** (2026-08-26T14:00:00Z → 2026-09-01T16:00:00Z)
- Eval window: **2026-09-02** → **2026-09-10**
- Scored days: **9** (7d-complete **2**)
- Baseline: 3d **0.0%**, 7d **0.0%**
- Elevated+high: n=0, precision7d=—, lift=—, fire=0.0%
- Avg score hit/miss 7d: — / 26.0; Brier 0.068

| Band | Days | Hit 3d | Hit 7d | Lift 7d |
| --- | ---: | ---: | ---: | ---: |
| low | 0 | — | — | — |
| moderate | 2 | 0.0% | 0.0% | — |
| elevated | 0 | — | — | — |
| high | 0 | — | — | — |

## Verdict

Not useful as a short-horizon predictor (and currently inverse): high-band 7d lift 0.36× vs low-band 1.25× (elevated+high precision 32.1% vs 55.1% baseline, n=131). Long-drought / high scores often sit inside already-long gaps, while frequent resetters keep “low” days busy within 7d — treat the UI score as a drought/rival dashboard, not a forecast.

_This is a descriptive backtest on a small public announcement log — not a claim of forecasting skill._
