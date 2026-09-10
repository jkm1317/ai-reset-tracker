#!/usr/bin/env node
/**
 * Blind backwards test of anticipate() from src/lib/stats.ts.
 * At each UTC day T, scores using ONLY events with date < T, then records
 * whether a reset actually occurred in (T, T+3d] and (T, T+7d].
 */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EVAL_END = new Date(Date.UTC(2026, 8, 10)); // 2026-09-10
const DAY_MS = 86_400_000;
const PROVIDERS = ['claude', 'codex', 'grok'];
const BANDS = ['low', 'moderate', 'elevated', 'high'];
const MIN_PRIOR_RESETS = 2;

const BUILD_DIR = '/tmp/ai-reset-tracker-stats-build';
const TSCONFIG = '/tmp/ai-reset-tracker-tsconfig.backtest.json';

function compileStats() {
  mkdirSync(BUILD_DIR, { recursive: true });
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      outDir: BUILD_DIR,
      rootDir: join(ROOT, 'src/lib'),
      skipLibCheck: true,
      declaration: false,
      noEmit: false,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      esModuleInterop: true,
      strict: false,
    },
    include: [
      join(ROOT, 'src/lib/stats.ts'),
      join(ROOT, 'src/lib/types.ts'),
    ],
  };
  writeFileSync(TSCONFIG, JSON.stringify(tsconfig, null, 2));
  const r = spawnSync(
    process.execPath,
    [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', TSCONFIG],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(r.stdout || '');
    console.error(r.stderr || '');
    throw new Error(`tsc failed with status ${r.status}`);
  }
}

function utcDay(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function addDays(ms, n) {
  return ms + n * DAY_MS;
}

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function parseUtc(iso) {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
}

function filterBefore(events, tMs) {
  return events.filter((e) => parseUtc(e.date).getTime() < tMs);
}

function hasResetInWindow(resets, tMs, kDays) {
  const end = addDays(tMs, kDays);
  return resets.some((e) => {
    const t = parseUtc(e.date).getTime();
    return t > tMs && t <= end;
  });
}

function emptyBandStats() {
  return Object.fromEntries(
    BANDS.map((b) => [
      b,
      { days: 0, hit3: 0, hit7: 0, sumScore: 0 },
    ]),
  );
}

function scoreBucket(score) {
  if (score < 18) return '0-17';
  if (score < 35) return '18-34';
  if (score < 55) return '35-54';
  if (score < 75) return '55-74';
  return '75-100';
}

function summarizeRows(rows, horizonCompleteDays) {
  const usable3 = rows.filter((r) => r.horizon3Complete);
  const usable7 = rows.filter((r) => r.horizon7Complete);
  // Prefer fully-observed windows for primary metrics
  const primary = usable7.length ? usable7 : usable3;

  const baseline3 =
    usable3.length === 0
      ? null
      : usable3.filter((r) => r.hit3).length / usable3.length;
  const baseline7 =
    usable7.length === 0
      ? null
      : usable7.filter((r) => r.hit7).length / usable7.length;

  const byBand = emptyBandStats();
  for (const r of usable7) {
    const b = byBand[r.oddsLabel];
    b.days += 1;
    b.hit3 += r.hit3 ? 1 : 0;
    b.hit7 += r.hit7 ? 1 : 0;
    b.sumScore += r.score;
  }

  const byBucket = {};
  for (const r of usable7) {
    const key = scoreBucket(r.score);
    if (!byBucket[key]) {
      byBucket[key] = { days: 0, hit3: 0, hit7: 0, sumScore: 0 };
    }
    const b = byBucket[key];
    b.days += 1;
    b.hit3 += r.hit3 ? 1 : 0;
    b.hit7 += r.hit7 ? 1 : 0;
    b.sumScore += r.score;
  }

  const hitDays = usable7.filter((r) => r.hit7);
  const missDays = usable7.filter((r) => !r.hit7);
  const avgScoreHit =
    hitDays.length === 0
      ? null
      : hitDays.reduce((s, r) => s + r.score, 0) / hitDays.length;
  const avgScoreMiss =
    missDays.length === 0
      ? null
      : missDays.reduce((s, r) => s + r.score, 0) / missDays.length;

  // Brier-ish: treat score/100 as probability of reset in 7d
  let brier = null;
  if (usable7.length) {
    let sum = 0;
    for (const r of usable7) {
      const p = r.score / 100;
      const y = r.hit7 ? 1 : 0;
      sum += (p - y) ** 2;
    }
    brier = sum / usable7.length;
  }

  const elevHigh = usable7.filter(
    (r) => r.oddsLabel === 'elevated' || r.oddsLabel === 'high',
  );
  const elevHighHit7 = elevHigh.filter((r) => r.hit7).length;
  const elevHighRate =
    elevHigh.length === 0 ? null : elevHighHit7 / elevHigh.length;
  const elevHighFireRate =
    usable7.length === 0 ? null : elevHigh.length / usable7.length;

  const bandTable = {};
  for (const band of BANDS) {
    const b = byBand[band];
    const hitRate3 = b.days ? b.hit3 / b.days : null;
    const hitRate7 = b.days ? b.hit7 / b.days : null;
    bandTable[band] = {
      days: b.days,
      hitRate3,
      hitRate7,
      lift3:
        hitRate3 == null || baseline3 == null || baseline3 === 0
          ? null
          : hitRate3 / baseline3,
      lift7:
        hitRate7 == null || baseline7 == null || baseline7 === 0
          ? null
          : hitRate7 / baseline7,
      avgScore: b.days ? b.sumScore / b.days : null,
    };
  }

  const bucketTable = {};
  for (const [key, b] of Object.entries(byBucket)) {
    const hitRate7 = b.days ? b.hit7 / b.days : null;
    bucketTable[key] = {
      days: b.days,
      hitRate3: b.days ? b.hit3 / b.days : null,
      hitRate7,
      lift7:
        hitRate7 == null || baseline7 == null || baseline7 === 0
          ? null
          : hitRate7 / baseline7,
      avgScore: b.days ? b.sumScore / b.days : null,
    };
  }

  return {
    scoredDays: rows.length,
    daysWith3dOutcome: usable3.length,
    daysWith7dOutcome: usable7.length,
    horizonCompleteDays,
    baseline3,
    baseline7,
    byBand: bandTable,
    byScoreBucket: bucketTable,
    avgScoreOnHit7d: avgScoreHit,
    avgScoreOnMiss7d: avgScoreMiss,
    brier7d: brier,
    elevatedHigh: {
      days: elevHigh.length,
      fireRate: elevHighFireRate,
      precision7d: elevHighRate,
      lift7:
        elevHighRate == null || baseline7 == null || baseline7 === 0
          ? null
          : elevHighRate / baseline7,
    },
    primarySample: primary.length,
  };
}

function fmtPct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function fmtNum(x, d = 2) {
  if (x == null || Number.isNaN(x)) return '—';
  return x.toFixed(d);
}

function fmtLift(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${x.toFixed(2)}×`;
}

async function main() {
  console.log('Compiling src/lib/stats.ts …');
  compileStats();
  const { anticipate, rivalCatalog, resetsOnly } = await import(
    pathToFileURL(join(BUILD_DIR, 'stats.js')).href
  );

  const dataset = JSON.parse(
    readFileSync(join(ROOT, 'public/data/resets.json'), 'utf8'),
  );

  const allByProvider = {};
  for (const id of PROVIDERS) {
    allByProvider[id] = dataset.providers[id]?.events ?? [];
  }

  const evalEndMs = utcDay(EVAL_END);
  const results = {
    generatedAt: new Date().toISOString(),
    evalEnd: isoDay(evalEndMs),
    method:
      'Blind walk: at UTC midnight T, anticipate(provider, events<T, rivals, now=T). Outcomes: reset in (T, T+Kd]. Warmup: ≥2 prior resets before T.',
    providers: {},
    combined: null,
  };

  const allRows = [];

  for (const provider of PROVIDERS) {
    const events = allByProvider[provider];
    const resets = resetsOnly(events);
    const resetTimes = resets.map((e) => parseUtc(e.date).getTime());

    if (resets.length < MIN_PRIOR_RESETS) {
      results.providers[provider] = {
        note: `Skipped: only ${resets.length} reset(s); need ≥${MIN_PRIOR_RESETS} prior resets to score.`,
        resetCount: resets.length,
        rows: [],
        summary: null,
      };
      console.log(`\n=== ${provider} === skipped (thin history: ${resets.length} resets)`);
      continue;
    }

    // First day we can score: UTC midnight of the calendar day AFTER the 2nd reset
    // (so that at T, ≥2 resets have date < T).
    const secondResetMs = resetTimes[MIN_PRIOR_RESETS - 1];
    let startMs = utcDay(new Date(secondResetMs)) + DAY_MS;
    // Also ensure at startMs we still have ≥2 prior
    while (
      startMs <= evalEndMs &&
      resetTimes.filter((t) => t < startMs).length < MIN_PRIOR_RESETS
    ) {
      startMs += DAY_MS;
    }

    // Score through eval end (today), not last event — drought keeps growing after last reset.
    const endMs = evalEndMs;

    const rivalsFull = rivalCatalog(allByProvider, provider);
    const rows = [];

    for (let tMs = startMs; tMs <= endMs; tMs += DAY_MS) {
      const priorEvents = filterBefore(events, tMs);
      const priorResets = resetsOnly(priorEvents);
      if (priorResets.length < MIN_PRIOR_RESETS) continue;

      const rivals = filterBefore(rivalsFull, tMs);
      const now = new Date(tMs);
      const ant = anticipate(provider, priorEvents, rivals, now);

      const hit3 = hasResetInWindow(resets, tMs, 3);
      const hit7 = hasResetInWindow(resets, tMs, 7);
      const horizon3Complete = addDays(tMs, 3) <= evalEndMs;
      const horizon7Complete = addDays(tMs, 7) <= evalEndMs;

      rows.push({
        date: isoDay(tMs),
        provider,
        score: ant.score,
        oddsLabel: ant.oddsLabel,
        droughtDays: ant.droughtDays,
        meanGap: ant.meanGap,
        hit3,
        hit7,
        horizon3Complete,
        horizon7Complete,
        topFeature: ant.features[0]
          ? `${ant.features[0].label} (${ant.features[0].weight})`
          : null,
      });
    }

    const summary = summarizeRows(rows, {
      end: isoDay(endMs),
      start: isoDay(startMs),
    });
    results.providers[provider] = {
      resetCount: resets.length,
      firstReset: resets[0]?.date ?? null,
      lastReset: resets[resets.length - 1]?.date ?? null,
      evalStart: isoDay(startMs),
      evalEnd: isoDay(endMs),
      scoredDays: rows.length,
      summary,
      // Keep a compact sample of high days for the JSON
      elevatedHighDays: rows
        .filter(
          (r) =>
            r.horizon7Complete &&
            (r.oddsLabel === 'elevated' || r.oddsLabel === 'high'),
        )
        .map((r) => ({
          date: r.date,
          score: r.score,
          oddsLabel: r.oddsLabel,
          hit7: r.hit7,
          hit3: r.hit3,
        })),
    };
    allRows.push(...rows);

    console.log(`\n=== ${provider} ===`);
    console.log(
      `Days scored: ${summary.scoredDays} (7d-complete: ${summary.daysWith7dOutcome}, 3d-complete: ${summary.daysWith3dOutcome})`,
    );
    console.log(
      `Baseline hit rate — next 3d: ${fmtPct(summary.baseline3)} | next 7d: ${fmtPct(summary.baseline7)}`,
    );
    console.log('By odds band (7d-complete days):');
    for (const band of BANDS) {
      const b = summary.byBand[band];
      console.log(
        `  ${band.padEnd(9)} n=${String(b.days).padStart(4)}  hit7=${fmtPct(b.hitRate7).padStart(7)}  lift7=${fmtLift(b.lift7).padStart(6)}  hit3=${fmtPct(b.hitRate3).padStart(7)}`,
      );
    }
    const eh = summary.elevatedHigh;
    console.log(
      `Elevated+high: n=${eh.days} fire=${fmtPct(eh.fireRate)} precision7d=${fmtPct(eh.precision7d)} lift=${fmtLift(eh.lift7)}`,
    );
    console.log(
      `Avg score on 7d-hit days: ${fmtNum(summary.avgScoreOnHit7d, 1)} | on miss: ${fmtNum(summary.avgScoreOnMiss7d, 1)} | Brier(score/100): ${fmtNum(summary.brier7d, 3)}`,
    );
  }

  // Combined across providers (each provider-day is a sample)
  const combinedSummary = summarizeRows(
    allRows.filter((r) => results.providers[r.provider]?.summary),
    { note: 'pooled provider-days' },
  );
  results.combined = combinedSummary;

  console.log('\n=== COMBINED (pooled provider-days) ===');
  console.log(
    `Days: ${combinedSummary.daysWith7dOutcome} (7d-complete) | baseline3=${fmtPct(combinedSummary.baseline3)} baseline7=${fmtPct(combinedSummary.baseline7)}`,
  );
  for (const band of BANDS) {
    const b = combinedSummary.byBand[band];
    console.log(
      `  ${band.padEnd(9)} n=${String(b.days).padStart(4)}  hit7=${fmtPct(b.hitRate7).padStart(7)}  lift7=${fmtLift(b.lift7).padStart(6)}`,
    );
  }
  const ceh = combinedSummary.elevatedHigh;
  console.log(
    `Elevated+high: n=${ceh.days} fire=${fmtPct(ceh.fireRate)} precision7d=${fmtPct(ceh.precision7d)} lift=${fmtLift(ceh.lift7)}`,
  );
  console.log(
    `Avg score hit/miss 7d: ${fmtNum(combinedSummary.avgScoreOnHit7d, 1)} / ${fmtNum(combinedSummary.avgScoreOnMiss7d, 1)} | Brier: ${fmtNum(combinedSummary.brier7d, 3)}`,
  );

  // Honest verdict
  const verdict = buildVerdict(results);
  results.verdict = verdict;
  console.log(`\nVERDICT: ${verdict}`);

  const reportMd = renderMarkdown(results);
  const outJson = join(ROOT, 'scripts/backtest-results.json');
  const outMd = join(ROOT, 'scripts/backtest-report.md');
  writeFileSync(outJson, JSON.stringify(results, null, 2));
  writeFileSync(outMd, reportMd);
  console.log(`\nWrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
}

function buildVerdict(results) {
  const c = results.combined;
  if (!c || !c.daysWith7dOutcome) {
    return 'Insufficient sample to judge — no 7d-complete scored days.';
  }
  const eh = c.elevatedHigh;
  const lift = eh.lift7;
  const n = eh.days;
  const base = c.baseline7;
  const sep =
    c.avgScoreOnHit7d != null && c.avgScoreOnMiss7d != null
      ? c.avgScoreOnHit7d - c.avgScoreOnMiss7d
      : null;
  const highLift = c.byBand.high?.lift7;
  const lowLift = c.byBand.low?.lift7;

  // Heuristic honesty bars
  if (n < 10) {
    return `Signal is weak/noisy: elevated+high fired only ${n} day(s) (7d precision ${fmtPct(eh.precision7d)} vs baseline ${fmtPct(base)}); sample too small for a confident claim.`;
  }
  // Inverse: high band worse than low — common when drought dominates and long gaps are long
  if (
    highLift != null &&
    lowLift != null &&
    highLift < 0.85 &&
    lowLift > 1.05
  ) {
    return `Not useful as a short-horizon predictor (and currently inverse): high-band 7d lift ${fmtLift(highLift)} vs low-band ${fmtLift(lowLift)} (elevated+high precision ${fmtPct(eh.precision7d)} vs ${fmtPct(base)} baseline, n=${n}). Long-drought / high scores often sit inside already-long gaps, while frequent resetters keep “low” days busy within 7d — treat the UI score as a drought/rival dashboard, not a forecast.`;
  }
  if (lift != null && lift >= 1.4 && eh.precision7d != null && eh.precision7d > base) {
    return `Modestly useful: elevated+high days hit resets within 7d at ${fmtPct(eh.precision7d)} (${fmtLift(lift)} vs ${fmtPct(base)} baseline, n=${n}); separation exists but bands are coarse and daily noise remains.`;
  }
  if (lift != null && lift >= 1.15) {
    return `Weak positive signal: elevated+high lift is ${fmtLift(lift)} over ${fmtPct(base)} baseline (n=${n}), but effect size is small and likely noisy.`;
  }
  if (sep != null && sep > 5) {
    return `Calibration lean only: hit days average higher scores (+${fmtNum(sep, 1)}), but odds-band lift is weak (${fmtLift(lift)}); treat anticipator as descriptive, not predictive.`;
  }
  return `Not statistically useful as a predictor: elevated+high precision ${fmtPct(eh.precision7d)} vs baseline ${fmtPct(base)} (lift ${fmtLift(lift)}, n=${n}); score is better read as a drought/rival dashboard than a forecast.`;
}

function renderMarkdown(results) {
  const lines = [];
  lines.push('# Anticipation scorer — blind backtest');
  lines.push('');
  lines.push(`Generated: ${results.generatedAt} (UTC)`);
  lines.push(`Evaluation end: ${results.evalEnd} UTC`);
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push(results.method);
  lines.push('');
  lines.push(
    '- Same production `anticipate()` + `rivalCatalog()` from `src/lib/stats.ts` (compiled via `tsc` at run time).',
  );
  lines.push(
    '- Blind: events and rivals filtered to `date < T`; `now = T` (UTC midnight).',
  );
  lines.push(
    '- Outcomes use the full catalog (not shown to the scorer): reset in `(T, T+3d]` / `(T, T+7d]`.',
  );
  lines.push(
    '- Primary metrics use days where `T+7d ≤ evalEnd` so both horizons are fully observed.',
  );
  lines.push('');
  lines.push('## Combined (pooled provider-days)');
  lines.push('');
  const c = results.combined;
  if (!c) {
    lines.push('_No combined summary._');
  } else {
    lines.push(
      `| Metric | Value |`,
    );
    lines.push(`| --- | --- |`);
    lines.push(`| 7d-complete days | ${c.daysWith7dOutcome} |`);
    lines.push(`| Baseline next-3d | ${fmtPct(c.baseline3)} |`);
    lines.push(`| Baseline next-7d | ${fmtPct(c.baseline7)} |`);
    lines.push(
      `| Avg score on 7d-hit / miss | ${fmtNum(c.avgScoreOnHit7d, 1)} / ${fmtNum(c.avgScoreOnMiss7d, 1)} |`,
    );
    lines.push(`| Brier (score/100 as P) | ${fmtNum(c.brier7d, 3)} |`);
    lines.push(
      `| Elevated+high days (fire rate) | ${c.elevatedHigh.days} (${fmtPct(c.elevatedHigh.fireRate)}) |`,
    );
    lines.push(
      `| Elevated+high precision (7d) | ${fmtPct(c.elevatedHigh.precision7d)} (lift ${fmtLift(c.elevatedHigh.lift7)}) |`,
    );
    lines.push('');
    lines.push('### By odds band');
    lines.push('');
    lines.push(
      '| Band | Days | Hit rate 3d | Hit rate 7d | Lift vs baseline 7d |',
    );
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const band of BANDS) {
      const b = c.byBand[band];
      lines.push(
        `| ${band} | ${b.days} | ${fmtPct(b.hitRate3)} | ${fmtPct(b.hitRate7)} | ${fmtLift(b.lift7)} |`,
      );
    }
    lines.push('');
    lines.push('### By score bucket');
    lines.push('');
    lines.push('| Bucket | Days | Hit rate 7d | Lift 7d |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const key of ['0-17', '18-34', '35-54', '55-74', '75-100']) {
      const b = c.byScoreBucket[key];
      if (!b) continue;
      lines.push(
        `| ${key} | ${b.days} | ${fmtPct(b.hitRate7)} | ${fmtLift(b.lift7)} |`,
      );
    }
  }

  for (const provider of PROVIDERS) {
    const p = results.providers[provider];
    lines.push('');
    lines.push(`## ${provider}`);
    lines.push('');
    if (!p?.summary) {
      lines.push(p?.note ?? '_No data._');
      continue;
    }
    const s = p.summary;
    lines.push(
      `- Resets in catalog: **${p.resetCount}** (${p.firstReset} → ${p.lastReset})`,
    );
    lines.push(`- Eval window: **${p.evalStart}** → **${p.evalEnd}**`);
    lines.push(
      `- Scored days: **${s.scoredDays}** (7d-complete **${s.daysWith7dOutcome}**)`,
    );
    lines.push(
      `- Baseline: 3d **${fmtPct(s.baseline3)}**, 7d **${fmtPct(s.baseline7)}**`,
    );
    lines.push(
      `- Elevated+high: n=${s.elevatedHigh.days}, precision7d=${fmtPct(s.elevatedHigh.precision7d)}, lift=${fmtLift(s.elevatedHigh.lift7)}, fire=${fmtPct(s.elevatedHigh.fireRate)}`,
    );
    lines.push(
      `- Avg score hit/miss 7d: ${fmtNum(s.avgScoreOnHit7d, 1)} / ${fmtNum(s.avgScoreOnMiss7d, 1)}; Brier ${fmtNum(s.brier7d, 3)}`,
    );
    lines.push('');
    lines.push('| Band | Days | Hit 3d | Hit 7d | Lift 7d |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const band of BANDS) {
      const b = s.byBand[band];
      lines.push(
        `| ${band} | ${b.days} | ${fmtPct(b.hitRate3)} | ${fmtPct(b.hitRate7)} | ${fmtLift(b.lift7)} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(results.verdict);
  lines.push('');
  lines.push(
    '_This is a descriptive backtest on a small public announcement log — not a claim of forecasting skill._',
  );
  lines.push('');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
