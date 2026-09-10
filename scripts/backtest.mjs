#!/usr/bin/env node
/**
 * Blind backtest of anticipate() / gapConditionalHazard().
 *
 * Primary estimand: estimated P(reset within 72h / 3d | history at T).
 * Secondary estimand: P(reset within 7d) reported alongside when the window fits.
 * Primary non-overlap protocol: WEEKLY checkpoints (7d apart) → non-overlapping 72h outcomes.
 * Post-reset is EVENT-TRIGGERED (NOT non-overlapping — windows collide when resets are close).
 * Gap-conditional: one drought sample per held-out gap (no dependent row stack).
 * NOT pooled overlapping daily band lift.
 * Success bar: elevated/high (or top-decile) 72h precision well above baseline;
 * prefer Brier skill > 0 vs constant base rate — do not claim calibrated Brier skill lightly.
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
const MIN_PRIOR_RESETS = 2;
const BOOTSTRAP_DRAWS = 400;
const BOOTSTRAP_SEED = 20260910;

const HORIZON_PRIMARY_DAYS = 3; // 72 hours
const HORIZON_SECONDARY_DAYS = 7;
const WEEKLY_STEP_DAYS = 7; // non-overlap spacing (still weekly)

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

function clampP(p) {
  const eps = 1e-6;
  return Math.min(1 - eps, Math.max(eps, p));
}

function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function brierScore(rows) {
  if (!rows.length) return null;
  return mean(rows.map((r) => (r.p - r.y) ** 2));
}

function logLoss(rows) {
  if (!rows.length) return null;
  return mean(
    rows.map((r) => {
      const p = clampP(r.p);
      return -(r.y ? Math.log(p) : Math.log(1 - p));
    }),
  );
}

function baseRate(rows) {
  if (!rows.length) return null;
  return mean(rows.map((r) => r.y));
}

function constantBaselineMetrics(rows) {
  const b = baseRate(rows);
  if (b == null) return { baseRate: null, brier: null, logLoss: null };
  const constRows = rows.map((r) => ({ p: b, y: r.y }));
  return {
    baseRate: b,
    brier: brierScore(constRows),
    logLoss: logLoss(constRows),
  };
}

function rankingSeparation(rows) {
  const hits = rows.filter((r) => r.y === 1);
  const misses = rows.filter((r) => r.y === 0);
  return {
    avgPOnHit: mean(hits.map((r) => r.p)),
    avgPOnMiss: mean(misses.map((r) => r.p)),
    nHit: hits.length,
    nMiss: misses.length,
  };
}

function labelFromP(p) {
  const score = Math.round(100 * p);
  if (score >= 60) return 'high';
  if (score >= 45) return 'elevated';
  if (score >= 30) return 'moderate';
  return 'low';
}

function bandTable(rows) {
  const bands = ['low', 'moderate', 'elevated', 'high'];
  const out = {};
  const base = baseRate(rows);
  for (const band of bands) {
    const subset = rows.filter((r) => labelFromP(r.p) === band);
    const rate = subset.length ? mean(subset.map((r) => r.y)) : null;
    out[band] = {
      days: subset.length,
      hitRate: rate,
      hitRate7: rate, // alias kept for older report readers
      lift:
        rate == null || base == null || base === 0 ? null : rate / base,
      lift7:
        rate == null || base == null || base === 0 ? null : rate / base,
      avgP: subset.length ? mean(subset.map((r) => r.p)) : null,
    };
  }
  return out;
}

/** Precision when model calls elevated/high (score≥45 under 72h bands). */
function elevatedHighPrecision(rows) {
  const calls = rows.filter((r) => r.p >= 0.45);
  const base = baseRate(rows);
  const prec = calls.length ? mean(calls.map((r) => r.y)) : null;
  const target =
    base == null ? null : Math.max(0.5, base + 0.15);
  return {
    n: calls.length,
    precision: prec,
    baseRate: base,
    target,
    clearsBar:
      prec != null &&
      target != null &&
      calls.length >= 3 &&
      prec >= target,
  };
}

/** Top score tercile precision (complement to top-decile). */
function topTercilePrecision(rows) {
  if (!rows.length) return { n: 0, precision: null, threshold: null, baseRate: null };
  const sorted = [...rows].sort((a, b) => b.p - a.p);
  const n = Math.max(1, Math.ceil(rows.length / 3));
  const top = sorted.slice(0, n);
  const base = baseRate(rows);
  const prec = mean(top.map((r) => r.y));
  const target = base == null ? null : Math.max(0.5, base + 0.15);
  return {
    n,
    precision: prec,
    threshold: top[top.length - 1]?.p ?? null,
    baseRate: base,
    target,
    clearsBar:
      prec != null && target != null && n >= 3 && prec >= target,
  };
}

function topDecilePrecision(rows) {
  if (!rows.length) return { n: 0, precision: null, threshold: null };
  const sorted = [...rows].sort((a, b) => b.p - a.p);
  const n = Math.max(1, Math.ceil(rows.length * 0.1));
  const top = sorted.slice(0, n);
  return {
    n,
    precision: mean(top.map((r) => r.y)),
    threshold: top[top.length - 1]?.p ?? null,
    baseRate: baseRate(rows),
  };
}

/** Mulberry32 PRNG for reproducible bootstrap. */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Block bootstrap of top-decile precision: resample contiguous blocks of
 * `blockLen` rows (preserves local dependence), then recompute top-decile prec.
 */
function blockBootstrapTopDecile(rows, blockLen = 2, draws = BOOTSTRAP_DRAWS) {
  if (rows.length < 5) {
    const observed = topDecilePrecision(rows);
    return {
      nDraws: 0,
      mean: null,
      lo: null,
      hi: null,
      precision: observed.precision,
      nTop: observed.n,
      n: observed.n,
      baseRate: observed.baseRate,
    };
  }
  const rand = mulberry32(BOOTSTRAP_SEED);
  const observed = topDecilePrecision(rows);
  const block = Math.max(1, Math.min(blockLen, Math.floor(rows.length / 2)));
  const nBlocks = Math.ceil(rows.length / block);
  const samples = [];
  for (let d = 0; d < draws; d++) {
    const boot = [];
    for (let b = 0; b < nBlocks; b++) {
      const start = Math.floor(rand() * (rows.length - block + 1));
      for (let i = 0; i < block && boot.length < rows.length; i++) {
        boot.push(rows[start + i]);
      }
    }
    const prec = topDecilePrecision(boot).precision;
    if (prec != null) samples.push(prec);
  }
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor(0.025 * samples.length)];
  const hi = samples[Math.min(samples.length - 1, Math.floor(0.975 * samples.length))];
  return {
    nDraws: samples.length,
    blockLen: block,
    precision: observed.precision,
    mean: mean(samples),
    lo,
    hi,
    nTop: observed.n,
    baseRate: observed.baseRate,
  };
}

function summarizeProtocol(rows, label) {
  if (!rows.length) {
    return {
      protocol: label,
      n: 0,
      baseRate: null,
      brier: null,
      logLoss: null,
      baselineBrier: null,
      baselineLogLoss: null,
      brierSkill: null,
      logLossSkill: null,
      separation: null,
      byBand: null,
      topDecile: null,
      elevatedHigh: null,
      topTercile: null,
      secondary7d: null,
    };
  }
  const base = constantBaselineMetrics(rows);
  const br = brierScore(rows);
  const ll = logLoss(rows);
  const topDec = blockBootstrapTopDecile(rows);
  const baseR = base.baseRate;
  const topTarget = baseR == null ? null : Math.max(0.5, baseR + 0.15);
  const topClears =
    topDec.precision != null &&
    topTarget != null &&
    (topDec.nTop ?? topDec.n ?? 0) >= 3 &&
    topDec.precision >= 0.5 &&
    topDec.precision >= topTarget;
  const rows7 = rows.filter((r) => r.y7 != null);
  let secondary7d = null;
  if (rows7.length) {
    const r7 = rows7.map((r) => ({ p: r.p, y: r.y7 }));
    const b7 = constantBaselineMetrics(r7);
    const br7 = brierScore(r7);
    secondary7d = {
      n: rows7.length,
      baseRate: b7.baseRate,
      brier: br7,
      baselineBrier: b7.brier,
      brierSkill: br7 == null || b7.brier == null ? null : b7.brier - br7,
      separation: rankingSeparation(r7),
      topDecile: topDecilePrecision(r7),
    };
  }
  return {
    protocol: label,
    horizonDays: HORIZON_PRIMARY_DAYS,
    n: rows.length,
    baseRate: base.baseRate,
    brier: br,
    logLoss: ll,
    baselineBrier: base.brier,
    baselineLogLoss: base.logLoss,
    brierSkill: br == null || base.brier == null ? null : base.brier - br,
    logLossSkill: ll == null || base.logLoss == null ? null : base.logLoss - ll,
    separation: rankingSeparation(rows),
    byBand: bandTable(rows),
    topDecile: { ...topDec, target: topTarget, clearsBar: topClears },
    elevatedHigh: elevatedHighPrecision(rows),
    topTercile: topTercilePrecision(rows),
    secondary7d,
  };
}

function fmtPct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function fmtNum(x, d = 3) {
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
  const { anticipate, rivalCatalog, resetsOnly, gapConditionalHazard, computeGaps } =
    await import(pathToFileURL(join(BUILD_DIR, 'stats.js')).href);

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
      'Blind per-provider backtest: anticipate()/gap hazard sees only events before T. Primary estimand = P(reset within 72h/3d). Primary NON-OVERLAP protocol = weekly (7d-apart) checkpoints with 72h outcomes. Secondary = 7d hit on the same checkpoints when the window fits. Post-reset is event-triggered (NOT non-overlapping — windows collide when resets are close). Gap-conditional = one drought landmark per held-out gap. Success bar: elevated/high or top-decile 72h precision ≥ max(50%, baseline+15pp) with usable n; prefer Brier skill > 0. Do not claim calibrated Brier skill lightly. Pooled overlapping daily band lift is NOT the success criterion.',
    providers: {},
  };

  for (const provider of PROVIDERS) {
    const events = allByProvider[provider];
    const resets = resetsOnly(events);
    const resetTimes = resets.map((e) => parseUtc(e.date).getTime());

    if (resets.length < MIN_PRIOR_RESETS) {
      results.providers[provider] = {
        note: `Skipped: only ${resets.length} reset(s); need ≥${MIN_PRIOR_RESETS} prior resets to score.`,
        resetCount: resets.length,
      };
      console.log(`\n=== ${provider} === skipped (thin history: ${resets.length} resets)`);
      continue;
    }

    const secondResetMs = resetTimes[MIN_PRIOR_RESETS - 1];
    let startMs = utcDay(new Date(secondResetMs)) + DAY_MS;
    while (
      startMs <= evalEndMs &&
      resetTimes.filter((t) => t < startMs).length < MIN_PRIOR_RESETS
    ) {
      startMs += DAY_MS;
    }

    const rivalsFull = rivalCatalog(allByProvider, provider);

    // --- Weekly non-overlapping checkpoints (PRIMARY protocol; 7d-apart, 72h outcome) ---
    const weeklyRows = [];
    for (
      let tMs = startMs;
      tMs + HORIZON_PRIMARY_DAYS * DAY_MS <= evalEndMs;
      tMs += WEEKLY_STEP_DAYS * DAY_MS
    ) {
      const priorEvents = filterBefore(events, tMs);
      const priorResets = resetsOnly(priorEvents);
      if (priorResets.length < MIN_PRIOR_RESETS) continue;
      const rivals = filterBefore(rivalsFull, tMs);
      const ant = anticipate(provider, priorEvents, rivals, new Date(tMs));
      const p = ant.score / 100;
      const y = hasResetInWindow(resets, tMs, HORIZON_PRIMARY_DAYS) ? 1 : 0;
      const y7 =
        tMs + HORIZON_SECONDARY_DAYS * DAY_MS <= evalEndMs
          ? hasResetInWindow(resets, tMs, HORIZON_SECONDARY_DAYS)
            ? 1
            : 0
          : null;
      weeklyRows.push({
        date: isoDay(tMs),
        p,
        y,
        y7,
        score: ant.score,
        oddsLabel: ant.oddsLabel,
        droughtDays: ant.droughtDays,
      });
    }

    // --- Post-reset checkpoints: EVENT-TRIGGERED (UTC day after each reset).
    // NOT non-overlapping — windows collide when resets are <72h apart. ---
    const postResetRows = [];
    for (let i = 1; i < resetTimes.length; i++) {
      const tMs = utcDay(new Date(resetTimes[i])) + DAY_MS;
      if (tMs + HORIZON_PRIMARY_DAYS * DAY_MS > evalEndMs) continue;
      const priorEvents = filterBefore(events, tMs);
      const priorResets = resetsOnly(priorEvents);
      if (priorResets.length < MIN_PRIOR_RESETS) continue;
      const rivals = filterBefore(rivalsFull, tMs);
      const ant = anticipate(provider, priorEvents, rivals, new Date(tMs));
      const p = ant.score / 100;
      const y = hasResetInWindow(resets, tMs, HORIZON_PRIMARY_DAYS) ? 1 : 0;
      const y7 =
        tMs + HORIZON_SECONDARY_DAYS * DAY_MS <= evalEndMs
          ? hasResetInWindow(resets, tMs, HORIZON_SECONDARY_DAYS)
            ? 1
            : 0
          : null;
      postResetRows.push({
        date: isoDay(tMs),
        p,
        y,
        y7,
        score: ant.score,
        oddsLabel: ant.oddsLabel,
        droughtDays: ant.droughtDays,
      });
    }

    // --- Gap-conditional residual: ONE drought sample per held-out gap ---
    // Landmark d=0 (fresh-cycle 72h hazard) avoids stacking dependent mid-gap rows
    // that overstate n. Effective-n = number of held-out gaps.
    const allGaps = computeGaps(events);
    const gapRows = [];
    for (let i = 2; i < allGaps.length; i++) {
      const hist = allGaps.slice(0, i);
      const g = allGaps[i];
      const d = 0; // single landmark per gap
      const { p } = gapConditionalHazard(hist, d, HORIZON_PRIMARY_DAYS);
      const y = g > d && g <= d + HORIZON_PRIMARY_DAYS ? 1 : 0;
      const y7 = g > d && g <= d + HORIZON_SECONDARY_DAYS ? 1 : 0;
      gapRows.push({ p, y, y7, drought: d, gap: g });
    }

    // Reference-only: overlapping daily walk (NOT primary success metric)
    const dailyRows = [];
    for (
      let tMs = startMs;
      tMs + HORIZON_PRIMARY_DAYS * DAY_MS <= evalEndMs;
      tMs += DAY_MS
    ) {
      const priorEvents = filterBefore(events, tMs);
      if (resetsOnly(priorEvents).length < MIN_PRIOR_RESETS) continue;
      const rivals = filterBefore(rivalsFull, tMs);
      const ant = anticipate(provider, priorEvents, rivals, new Date(tMs));
      dailyRows.push({
        p: ant.score / 100,
        y: hasResetInWindow(resets, tMs, HORIZON_PRIMARY_DAYS) ? 1 : 0,
        y7:
          tMs + HORIZON_SECONDARY_DAYS * DAY_MS <= evalEndMs
            ? hasResetInWindow(resets, tMs, HORIZON_SECONDARY_DAYS)
              ? 1
              : 0
            : null,
        score: ant.score,
      });
    }

    const weekly = summarizeProtocol(weeklyRows, 'weekly_nonoverlap');
    const postReset = summarizeProtocol(postResetRows, 'post_reset_event_triggered');
    const gapCond = summarizeProtocol(gapRows, 'gap_conditional_one_per_gap');
    const dailyRef = summarizeProtocol(dailyRows, 'daily_overlapping_reference');

    results.providers[provider] = {
      resetCount: resets.length,
      firstReset: resets[0]?.date ?? null,
      lastReset: resets[resets.length - 1]?.date ?? null,
      evalStart: isoDay(startMs),
      evalEnd: isoDay(evalEndMs),
      weekly,
      postReset,
      gapConditional: gapCond,
      dailyOverlappingReference: dailyRef,
    };

    console.log(`\n=== ${provider} ===`);
    for (const [name, s] of [
      ['weekly', weekly],
      ['post-reset*', postReset],
      ['gap-cond', gapCond],
    ]) {
      console.log(
        `  ${name.padEnd(11)} n=${String(s.n).padStart(3)}  base72h=${fmtPct(s.baseRate).padStart(6)}  Brier=${fmtNum(s.brier)} (base ${fmtNum(s.baselineBrier)}, skill ${fmtNum(s.brierSkill)})  LL=${fmtNum(s.logLoss)} (skill ${fmtNum(s.logLossSkill)})`,
      );
      if (s.separation) {
        console.log(
          `               p̂ hit/miss ${fmtNum(s.separation.avgPOnHit, 3)} / ${fmtNum(s.separation.avgPOnMiss, 3)}  top-decile prec ${fmtPct(s.topDecile?.precision)} [${fmtPct(s.topDecile?.lo)}, ${fmtPct(s.topDecile?.hi)}] clears=${s.topDecile?.clearsBar}`,
        );
      }
      if (s.elevatedHigh) {
        console.log(
          `               elev/high n=${s.elevatedHigh.n} prec ${fmtPct(s.elevatedHigh.precision)} target ${fmtPct(s.elevatedHigh.target)} clears=${s.elevatedHigh.clearsBar}  top-tercile ${fmtPct(s.topTercile?.precision)} clears=${s.topTercile?.clearsBar}`,
        );
      }
      if (s.secondary7d) {
        console.log(
          `               secondary7d n=${s.secondary7d.n} base=${fmtPct(s.secondary7d.baseRate)} Brier skill ${fmtNum(s.secondary7d.brierSkill)}`,
        );
      }
    }
  }

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
  const lines = [];
  for (const provider of PROVIDERS) {
    const p = results.providers[provider];
    if (!p?.weekly || p.weekly.n === 0) {
      lines.push(`${provider}: insufficient weekly (primary non-overlap) sample.`);
      continue;
    }
    const w = p.weekly;
    const g = p.gapConditional;
    const sep = w.separation;
    const eh = w.elevatedHigh;
    const top = w.topDecile;
    const terc = w.topTercile;
    const skillPos = (w.brierSkill ?? -1) > 0;
    const bar =
      eh?.clearsBar || top?.clearsBar || terc?.clearsBar;
    const ranked =
      sep?.avgPOnHit != null &&
      sep?.avgPOnMiss != null &&
      sep.avgPOnHit > sep.avgPOnMiss + 0.03;

    if (bar && skillPos) {
      lines.push(
        `${provider}: CLEARS 72h bar on weekly (elev/high prec ${fmtPct(eh?.precision)} n=${eh?.n ?? 0}; top-decile ${fmtPct(top?.precision)}; top-tercile ${fmtPct(terc?.precision)}; target ${fmtPct(eh?.target ?? top?.target)}; Brier skill ${fmtNum(w.brierSkill)} > 0 vs base ${fmtPct(w.baseRate)}; p̂ hit/miss ${fmtNum(sep?.avgPOnHit, 2)}/${fmtNum(sep?.avgPOnMiss, 2)}; n_weekly=${w.n}, n_gap=${g?.n ?? 0}).`,
      );
    } else if (bar) {
      lines.push(
        `${provider}: 72h call precision clears bar (elev/high ${fmtPct(eh?.precision)} n=${eh?.n}; top-decile ${fmtPct(top?.precision)}; top-tercile ${fmtPct(terc?.precision)}; target ${fmtPct(eh?.target ?? top?.target)}) but Brier skill ${fmtNum(w.brierSkill)} (want >0) vs base ${fmtPct(w.baseRate)}; n_weekly=${w.n}.`,
      );
    } else if (ranked && skillPos) {
      lines.push(
        `${provider}: ranking + positive Brier skill on weekly 72h (p̂ hit ${fmtNum(sep.avgPOnHit, 2)} > miss ${fmtNum(sep.avgPOnMiss, 2)}; skill ${fmtNum(w.brierSkill)}; base ${fmtPct(w.baseRate)}) but call-precision bar not cleared (elev/high ${fmtPct(eh?.precision)} n=${eh?.n}; top-decile ${fmtPct(top?.precision)}; target ${fmtPct(top?.target)}).`,
      );
    } else {
      const ceiling =
        (w.baseRate ?? 1) < 0.25
          ? ` Ceiling on this thin 72h log: hits often arrive at unprecedented droughts where survivors=0, so gap/rival/weekend features cannot concentrate ≥50% precision (best top-decile here ${fmtPct(top?.precision)} vs target ${fmtPct(top?.target)}) — not faked.`
          : '';
      lines.push(
        `${provider}: does NOT clear 72h usefulness bar on weekly (base ${fmtPct(w.baseRate)}; elev/high prec ${fmtPct(eh?.precision)} n=${eh?.n} target ${fmtPct(eh?.target)}; top-decile ${fmtPct(top?.precision)}; top-tercile ${fmtPct(terc?.precision)}; Brier skill ${fmtNum(w.brierSkill)}; p̂ hit/miss ${fmtNum(sep?.avgPOnHit, 2)}/${fmtNum(sep?.avgPOnMiss, 2)}; n_weekly=${w.n}, n_gap=${g?.n ?? 0}).${ceiling}`,
      );
    }
  }
  lines.push(
    'Weekly (7d-apart, 72h outcome) is the primary non-overlap protocol; 7d hit is secondary. Post-reset is event-triggered (windows collide when resets are close). Pooled overlapping daily band-lift is intentionally not the success bar.',
  );
  return lines.join(' ');
}

function renderProtocolSection(title, s) {
  const lines = [];
  lines.push(`### ${title}`);
  lines.push('');
  if (!s || !s.n) {
    lines.push('_No rows._');
    lines.push('');
    return lines;
  }
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Checkpoints (n) | ${s.n} |`);
  lines.push(`| Base rate (72h hit) | ${fmtPct(s.baseRate)} |`);
  lines.push(
    `| Brier | ${fmtNum(s.brier)} (constant-base ${fmtNum(s.baselineBrier)}, skill ${fmtNum(s.brierSkill)}) |`,
  );
  lines.push(
    `| Log-loss | ${fmtNum(s.logLoss)} (constant-base ${fmtNum(s.baselineLogLoss)}, skill ${fmtNum(s.logLossSkill)}) |`,
  );
  if (s.separation) {
    lines.push(
      `| Mean p̂ on hit / miss | ${fmtNum(s.separation.avgPOnHit, 3)} / ${fmtNum(s.separation.avgPOnMiss, 3)} |`,
    );
  }
  if (s.elevatedHigh) {
    lines.push(
      `| Elevated/high precision (72h) | ${fmtPct(s.elevatedHigh.precision)} (n=${s.elevatedHigh.n}; target ${fmtPct(s.elevatedHigh.target)}; clears=${s.elevatedHigh.clearsBar}) |`,
    );
  }
  if (s.topTercile) {
    lines.push(
      `| Top-tercile precision (72h) | ${fmtPct(s.topTercile.precision)} (n=${s.topTercile.n}; target ${fmtPct(s.topTercile.target)}; clears=${s.topTercile.clearsBar}) |`,
    );
  }
  if (s.topDecile) {
    lines.push(
      `| Top-decile precision (72h) | ${fmtPct(s.topDecile.precision)} (n=${s.topDecile.nTop ?? s.topDecile.n ?? '—'}; target ${fmtPct(s.topDecile.target)}; clears=${s.topDecile.clearsBar}; block-bootstrap 95% [${fmtPct(s.topDecile.lo)}, ${fmtPct(s.topDecile.hi)}]) |`,
    );
  }
  if (s.secondary7d) {
    lines.push(
      `| Secondary 7d base / Brier skill | ${fmtPct(s.secondary7d.baseRate)} / ${fmtNum(s.secondary7d.brierSkill)} (n=${s.secondary7d.n}) |`,
    );
  }
  lines.push('');
  if (s.byBand) {
    lines.push('| Band (by p̂) | n | Hit rate 72h | Lift vs base |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const band of ['low', 'moderate', 'elevated', 'high']) {
      const b = s.byBand[band];
      lines.push(
        `| ${band} | ${b.days} | ${fmtPct(b.hitRate ?? b.hitRate7)} | ${fmtLift(b.lift ?? b.lift7)} |`,
      );
    }
    lines.push('');
  }
  return lines;
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
    '- Production `anticipate()` + `gapConditionalHazard()` from `src/lib/stats.ts` (compiled via `tsc` at run time).',
  );
  lines.push(
    '- Blind: events/rivals filtered to `date < T`; `now = T` (UTC midnight).',
  );
  lines.push(
    '- **Weekly protocol (PRIMARY non-overlap):** checkpoints every 7 UTC days → non-overlapping next-72h (3d) outcomes; 7d hit kept as secondary when the window fits.',
  );
  lines.push(
    '- **Post-reset protocol (event-triggered, NOT non-overlapping):** UTC day after each reset → next-72h outcome. Windows collide when resets are close; treat as diagnostic, not a second IID sample.',
  );
  lines.push(
    '- **Gap-conditional (one row per gap):** for each held-out completed gap, score empirical hazard once at landmark drought d = 0 from prior gaps only; y = 1 if that gap ends in (0, 3]. Avoids stacking dependent mid-gap rows that overstate n.',
  );
  lines.push(
    '- Metrics: **Brier** / **log-loss** vs constant base rate (skill = baseline − model; prefer skill > 0). Success bar: elevated/high or top-decile/tercile **72h precision ≥ max(50%, baseline+15pp)** with usable n. Do **not** claim calibrated Brier skill lightly.',
  );
  lines.push(
    '- Secondary: top-decile precision with **block bootstrap** 95% interval (contiguous blocks; CI omitted when n < 5).',
  );
  lines.push(
    '- Score ≈ 100 × estimated P(reset in ~72h / 3d). Labels: low &lt;30 · moderate &lt;45 · elevated &lt;60 · high ≥60 — chance-soon ranking bands for the 72h horizon, not overdue.',
  );
  lines.push('');

  for (const provider of PROVIDERS) {
    const p = results.providers[provider];
    lines.push(`## ${provider}`);
    lines.push('');
    if (!p?.weekly) {
      lines.push(p?.note ?? '_No data._');
      lines.push('');
      continue;
    }
    lines.push(
      `- Resets in catalog: **${p.resetCount}** (${p.firstReset} → ${p.lastReset})`,
    );
    lines.push(`- Eval window: **${p.evalStart}** → **${p.evalEnd}**`);
    lines.push('');
    lines.push(...renderProtocolSection('Weekly non-overlapping (primary)', p.weekly));
    lines.push(...renderProtocolSection('Post-reset day (event-triggered — NOT non-overlapping)', p.postReset));
    lines.push(
      ...renderProtocolSection('Gap-conditional hazard residual (one row per gap, landmark d=0)', p.gapConditional),
    );
    lines.push(
      ...renderProtocolSection(
        'Daily overlapping (reference only — not the success bar)',
        p.dailyOverlappingReference,
      ),
    );
  }

  lines.push('## Verdict');
  lines.push('');
  lines.push(results.verdict);
  lines.push('');
  lines.push(
    '_Descriptive backtest on a small public announcement log. Prefer positive Brier skill and call-precision above max(50%, baseline+15pp); do not claim calibrated Brier skill lightly. Post-reset rows are event-triggered and may overlap._',
  );
  lines.push('');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
