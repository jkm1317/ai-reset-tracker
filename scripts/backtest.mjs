#!/usr/bin/env node
/**
 * Blind backtest of anticipate() / gapConditionalHazard().
 *
 * Primary estimand: estimated P(reset within 7d | history at T).
 * Primary non-overlap protocol: WEEKLY checkpoints (7d apart).
 * Post-reset is EVENT-TRIGGERED (NOT non-overlapping — Codex often has
 * checkpoints <7d apart so next-7d windows collide).
 * Gap-conditional: one drought sample per held-out gap (no dependent row stack).
 * NOT pooled overlapping daily band lift.
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
  if (score >= 65) return 'high';
  if (score >= 50) return 'elevated';
  if (score >= 35) return 'moderate';
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
      hitRate7: rate,
      lift7:
        rate == null || base == null || base === 0 ? null : rate / base,
      avgP: subset.length ? mean(subset.map((r) => r.p)) : null,
    };
  }
  return out;
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
    };
  }
  const base = constantBaselineMetrics(rows);
  const br = brierScore(rows);
  const ll = logLoss(rows);
  return {
    protocol: label,
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
    topDecile: blockBootstrapTopDecile(rows),
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
      'Blind per-provider backtest: anticipate()/gap hazard sees only events before T. Primary NON-OVERLAP protocol = weekly (7d-apart) checkpoints. Post-reset is event-triggered (NOT non-overlapping — windows often collide when resets are <7d apart). Gap-conditional = one drought landmark per held-out gap. Report Brier/log-loss vs constant base rate (skill often ≈0) and ranking separation; do not claim calibrated Brier skill. Pooled overlapping daily band lift is NOT the success criterion.',
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

    // --- Weekly non-overlapping checkpoints (PRIMARY protocol; 7d-apart) ---
    const weeklyRows = [];
    for (let tMs = startMs; tMs + 7 * DAY_MS <= evalEndMs; tMs += 7 * DAY_MS) {
      const priorEvents = filterBefore(events, tMs);
      const priorResets = resetsOnly(priorEvents);
      if (priorResets.length < MIN_PRIOR_RESETS) continue;
      const rivals = filterBefore(rivalsFull, tMs);
      const ant = anticipate(provider, priorEvents, rivals, new Date(tMs));
      const p = ant.score / 100;
      const y = hasResetInWindow(resets, tMs, 7) ? 1 : 0;
      weeklyRows.push({
        date: isoDay(tMs),
        p,
        y,
        score: ant.score,
        oddsLabel: ant.oddsLabel,
        droughtDays: ant.droughtDays,
      });
    }

    // --- Post-reset checkpoints: EVENT-TRIGGERED (UTC day after each reset).
    // NOT non-overlapping — Codex often resets <7d apart so next-7d windows collide. ---
    const postResetRows = [];
    for (let i = 1; i < resetTimes.length; i++) {
      const tMs = utcDay(new Date(resetTimes[i])) + DAY_MS;
      if (tMs + 7 * DAY_MS > evalEndMs) continue;
      const priorEvents = filterBefore(events, tMs);
      const priorResets = resetsOnly(priorEvents);
      if (priorResets.length < MIN_PRIOR_RESETS) continue;
      const rivals = filterBefore(rivalsFull, tMs);
      const ant = anticipate(provider, priorEvents, rivals, new Date(tMs));
      const p = ant.score / 100;
      const y = hasResetInWindow(resets, tMs, 7) ? 1 : 0;
      postResetRows.push({
        date: isoDay(tMs),
        p,
        y,
        score: ant.score,
        oddsLabel: ant.oddsLabel,
        droughtDays: ant.droughtDays,
      });
    }

    // --- Gap-conditional residual: ONE drought sample per held-out gap ---
    // Landmark d=0 (fresh-cycle 7d hazard) avoids stacking dependent mid-gap rows
    // that overstate n. Effective-n = number of held-out gaps.
    const allGaps = computeGaps(events);
    const gapRows = [];
    for (let i = 2; i < allGaps.length; i++) {
      const hist = allGaps.slice(0, i);
      const g = allGaps[i];
      const d = 0; // single landmark per gap
      const { p } = gapConditionalHazard(hist, d, 7);
      const y = g > d && g <= d + 7 ? 1 : 0;
      gapRows.push({ p, y, drought: d, gap: g });
    }

    // Reference-only: overlapping daily walk (NOT primary success metric)
    const dailyRows = [];
    for (let tMs = startMs; tMs + 7 * DAY_MS <= evalEndMs; tMs += DAY_MS) {
      const priorEvents = filterBefore(events, tMs);
      if (resetsOnly(priorEvents).length < MIN_PRIOR_RESETS) continue;
      const rivals = filterBefore(rivalsFull, tMs);
      const ant = anticipate(provider, priorEvents, rivals, new Date(tMs));
      dailyRows.push({
        p: ant.score / 100,
        y: hasResetInWindow(resets, tMs, 7) ? 1 : 0,
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
        `  ${name.padEnd(11)} n=${String(s.n).padStart(3)}  base=${fmtPct(s.baseRate).padStart(6)}  Brier=${fmtNum(s.brier)} (base ${fmtNum(s.baselineBrier)}, skill ${fmtNum(s.brierSkill)})  LL=${fmtNum(s.logLoss)} (skill ${fmtNum(s.logLossSkill)})`,
      );
      if (s.separation) {
        console.log(
          `               p̂ hit/miss ${fmtNum(s.separation.avgPOnHit, 3)} / ${fmtNum(s.separation.avgPOnMiss, 3)}  top-decile prec ${fmtPct(s.topDecile?.precision)} [${fmtPct(s.topDecile?.lo)}, ${fmtPct(s.topDecile?.hi)}]`,
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
    const ranked =
      w.n >= 10 &&
      sep?.avgPOnHit != null &&
      sep?.avgPOnMiss != null &&
      sep.avgPOnHit > sep.avgPOnMiss + 0.05;
    const skillNearZero = Math.abs(w.brierSkill ?? 99) < 0.03;
    const top = w.topDecile;
    const topOk =
      top?.precision != null &&
      top.baseRate != null &&
      top.precision >= top.baseRate;

    if (ranked) {
      lines.push(
        `${provider}: ranking signal on weekly (primary non-overlap) checkpoints (p̂ hit ${fmtNum(sep.avgPOnHit, 2)} > miss ${fmtNum(sep.avgPOnMiss, 2)}); Brier skill ${fmtNum(w.brierSkill)} ≈ 0 vs constant base ${fmtPct(w.baseRate)} — ranking present, not calibrated Brier skill; top-decile prec ${fmtPct(top?.precision)} (block-bootstrap 95% [${fmtPct(top?.lo)}, ${fmtPct(top?.hi)}], n_weekly=${w.n}, n_gap=${g?.n ?? 0}).`,
      );
    } else if (skillNearZero) {
      lines.push(
        `${provider}: no ranking edge on weekly checkpoints (p̂ hit/miss ${fmtNum(sep?.avgPOnHit, 2)}/${fmtNum(sep?.avgPOnMiss, 2)}); Brier skill ${fmtNum(w.brierSkill)} ≈ 0 vs constant base rate (n_weekly=${w.n}, n_gap=${g?.n ?? 0}) — UI shows a shrunk hazard ranking signal, not a calibrated forecast.`,
      );
    } else {
      lines.push(
        `${provider}: no reliable short-horizon ranking on this catalog (weekly p̂ hit/miss ${fmtNum(sep?.avgPOnHit, 2)}/${fmtNum(sep?.avgPOnMiss, 2)}, Brier skill ${fmtNum(w.brierSkill)} vs constant base, n=${w.n}) — UI still shows an honest shrunk hazard, not overdue urgency.`,
      );
    }
    if (
      topOk === false &&
      top?.precision != null &&
      top.baseRate != null &&
      w.n >= 10
    ) {
      lines.push(
        `  └ top-decile precision ${fmtPct(top.precision)} vs base ${fmtPct(top.baseRate)} (secondary).`,
      );
    }
  }
  lines.push(
    'Weekly is the primary non-overlap protocol; post-reset is event-triggered (windows collide when resets are <7d apart). Pooled overlapping daily band-lift is intentionally not the success bar.',
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
  lines.push(`| Base rate (7d hit) | ${fmtPct(s.baseRate)} |`);
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
  if (s.topDecile) {
    lines.push(
      `| Top-decile precision (7d) | ${fmtPct(s.topDecile.precision)} (n=${s.topDecile.nTop ?? s.topDecile.n ?? '—'}; block-bootstrap 95% [${fmtPct(s.topDecile.lo)}, ${fmtPct(s.topDecile.hi)}]) |`,
    );
  }
  lines.push('');
  if (s.byBand) {
    lines.push('| Band (by p̂) | n | Hit rate 7d | Lift vs base |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const band of ['low', 'moderate', 'elevated', 'high']) {
      const b = s.byBand[band];
      lines.push(
        `| ${band} | ${b.days} | ${fmtPct(b.hitRate7)} | ${fmtLift(b.lift7)} |`,
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
    '- **Weekly protocol (PRIMARY non-overlap):** checkpoints every 7 UTC days → non-overlapping next-7d outcomes.',
  );
  lines.push(
    '- **Post-reset protocol (event-triggered, NOT non-overlapping):** UTC day after each reset → next-7d outcome. Codex often has resets <7d apart, so these windows collide; treat as diagnostic, not a second IID sample.',
  );
  lines.push(
    '- **Gap-conditional (one row per gap):** for each held-out completed gap, score empirical hazard once at landmark drought d = 0 from prior gaps only; y = 1 if that gap ends in (0, 7]. Avoids stacking dependent mid-gap rows that overstate n.',
  );
  lines.push(
    '- Metrics: **Brier** / **log-loss** vs constant base rate (skill = baseline − model; on this catalog skill is typically ≈ 0 — do **not** claim calibrated Brier skill). Prefer **ranking** separation (p̂ on hit vs miss) where present (Codex).',
  );
  lines.push(
    '- Secondary: top-decile precision with **block bootstrap** 95% interval (contiguous blocks; CI omitted when n < 5).',
  );
  lines.push(
    '- Score ≈ 100 × estimated P(reset in ~7d). Labels: low &lt;35 · moderate &lt;50 · elevated &lt;65 · high ≥65 — chance-soon ranking bands, not overdue.',
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
    '_Descriptive backtest on a small public announcement log — not a claim of calibrated Brier skill. Skill vs a constant provider base rate is typically ≈0; where a signal appears it is a within-provider ranking effect (Codex on weekly checkpoints). Post-reset rows are event-triggered and may overlap._',
  );
  lines.push('');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
