import type { AnticipationResult, ProviderId, ResetEvent } from './types';

export function parseUtc(iso: string): Date {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
}

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

export function formatDays(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}d`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseUtc(iso);
  return d.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

export function formatRelativeDays(days: number | null | undefined): string {
  if (days == null) return '—';
  if (days < 1) return `${Math.round(days * 24)}h ago`;
  if (days < 2) return '1 day ago';
  return `${days.toFixed(1)} days ago`;
}

export function resetsOnly(events: ResetEvent[]): ResetEvent[] {
  return events
    .filter((e) => e.kind === 'reset')
    .slice()
    .sort((a, b) => parseUtc(a.date).getTime() - parseUtc(b.date).getTime());
}

export function computeGaps(events: ResetEvent[]): number[] {
  const r = resetsOnly(events);
  const gaps: number[] = [];
  for (let i = 1; i < r.length; i++) {
    gaps.push(daysBetween(parseUtc(r[i - 1].date), parseUtc(r[i].date)));
  }
  return gaps;
}

export function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeProviderStats(events: ResetEvent[], now = new Date()) {
  const resets = resetsOnly(events);
  const policies = events.filter((e) => e.kind === 'policy');
  const gaps = computeGaps(events);
  const last = resets.length ? parseUtc(resets[resets.length - 1].date) : null;
  const first = resets.length ? parseUtc(resets[0].date) : null;
  const spanDays =
    first && last ? Math.max(daysBetween(first, last), 1) : 1;
  const months = spanDays / 30.4375;

  return {
    resetCount: resets.length,
    policyChangeCount: policies.length,
    lastResetAt: resets.length ? resets[resets.length - 1].date : null,
    lastResetUrl: resets.length ? resets[resets.length - 1].url : null,
    firstResetAt: resets.length ? resets[0].date : null,
    meanGapDays: mean(gaps) != null ? Math.round(mean(gaps)! * 10) / 10 : null,
    longestGapDays: gaps.length ? Math.round(Math.max(...gaps) * 10) / 10 : null,
    daysSinceLast: last ? Math.round(daysBetween(last, now) * 10) / 10 : null,
    pacePerMonth:
      resets.length > 0
        ? Math.round((resets.length / Math.max(months, 0.1)) * 10) / 10
        : null,
    gaps,
    resets,
  };
}

export function weekdayUtc(iso: string): number {
  return parseUtc(iso).getUTCDay(); // 0 Sun .. 6 Sat
}

export function isWeekendProximity(now = new Date()): boolean {
  const day = now.getUTCDay();
  // Fri/Sat/Sun or Mon morning vibes
  return day === 5 || day === 0 || day === 6;
}

const RIVAL_PRESSURE_TAGS = new Set([
  'product_launch',
  'milestone',
  'competitive_response',
]);

/** Rival lookback for score boost (shorter than the old 7d context window). */
const RIVAL_SCORE_WINDOW_DAYS = 3; // 72h
const RIVAL_CONTEXT_WINDOW_DAYS = 7;

function rivalPressureEvents(
  rivalEvents: ResetEvent[],
  now: Date,
  windowDays = RIVAL_CONTEXT_WINDOW_DAYS,
): ResetEvent[] {
  const cut = now.getTime() - windowDays * 86_400_000;
  return rivalEvents
    .filter((e) => {
      const t = parseUtc(e.date).getTime();
      if (t > now.getTime() || t < cut) return false;
      if (e.kind === 'reset' && e.delivery === 'banked') return true;
      return e.reason_tags.some((tag) => RIVAL_PRESSURE_TAGS.has(tag));
    })
    .sort((a, b) => parseUtc(b.date).getTime() - parseUtc(a.date).getTime());
}

function describeRivalEvent(e: ResetEvent): string {
  const tags = e.reason_tags.filter((t) => RIVAL_PRESSURE_TAGS.has(t) || t === 'banked_credit');
  const tagBit = tags.length ? tags[0].replace(/_/g, ' ') : e.kind;
  const who =
    e.provider === 'claude'
      ? 'Claude'
      : e.provider === 'codex'
        ? 'Codex'
        : 'Grok';
  return `${who} ${tagBit}`;
}

/** Primary anticipation horizon: 72 hours (3 days). */
export const ANTICIPATION_HORIZON_DAYS = 3;

function clamp01(x: number, lo = 0.04, hi = 0.92): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Empirical P(gap ends in (drought, drought+horizon] | survived past drought)
 * from this provider's completed gaps only. Prior = unconditional short-horizon
 * rate (freshRate) — NOT an early-cycle massAhead inflation (that inverted
 * Claude at 72h). Lighter shrinkage so frequent labs can reach elevated/high.
 */
export function gapConditionalHazard(
  gaps: number[],
  drought: number,
  horizon = ANTICIPATION_HORIZON_DAYS,
): { p: number; survivors: number; hits: number; prior: number; pastFrac: number } {
  if (!gaps.length) {
    return { p: 0.2, survivors: 0, hits: 0, prior: 0.2, pastFrac: 0 };
  }

  const freshRate = gaps.filter((g) => g <= horizon).length / gaps.length;
  const pastFrac = gaps.filter((g) => g <= drought).length / gaps.length;
  const thin = gaps.length < 3;
  // Prior tracks the provider's own short-horizon base rate.
  const prior = clamp01(
    thin ? 0.55 * freshRate + 0.45 * 0.22 : freshRate,
    thin ? 0.08 : 0.05,
    thin ? 0.4 : 0.75,
  );

  const survivors = gaps.filter((g) => g > drought);
  const hits = gaps.filter((g) => g > drought && g <= drought + horizon);

  if (survivors.length === 0) {
    return {
      p: Math.min(thin ? 0.18 : 0.12, prior * 0.45),
      survivors: 0,
      hits: 0,
      prior,
      pastFrac,
    };
  }

  const k = Math.max(
    thin ? 6 : 2,
    Math.round((thin ? 12 : 5) / Math.sqrt(gaps.length)),
  );
  const haz = (hits.length + k * prior) / (survivors.length + k);
  const w = survivors.length / (survivors.length + (thin ? 5 : 1.25));
  let p = w * haz + (1 - w) * prior;
  // When survivors are plentiful and empirical haz beats the prior, trust haz harder
  // so frequent labs (Codex) can surface elevated/high instead of underconfident mid-30s.
  if (!thin && survivors.length >= 5 && haz > prior) {
    p = p + 0.65 * (haz - p);
  }
  // Absolute honesty cap from the provider's own unconditional short-horizon rate:
  // sparse labs (Claude ~10% gaps ≤3d) must not paint "elevated" from a noisy mid-cycle bin.
  const absCap = thin
    ? 0.5
    : Math.min(0.92, Math.max(0.32, prior + 0.28 + 0.35 * Math.max(0, haz - prior)));
  p = clamp01(Math.min(p, absCap), thin ? 0.06 : 0.04, thin ? 0.55 : 0.92);
  return { p, survivors: survivors.length, hits: hits.length, prior, pastFrac };
}

/**
 * Coarse drought-bin empirical 72h rates from completed gaps only (blind at T).
 * Softens local sampling noise vs pure point-drought hazard.
 */
export function droughtBinHazard(
  gaps: number[],
  drought: number,
  horizon = ANTICIPATION_HORIZON_DAYS,
): { p: number; binLo: number; binHi: number; survivors: number; hits: number } {
  const edges = [0, 1, 3, 7, 14, 30, Infinity];
  let binLo = 0;
  let binHi = Infinity;
  for (let i = 0; i < edges.length - 1; i++) {
    if (drought >= edges[i] && drought < edges[i + 1]) {
      binLo = edges[i];
      binHi = edges[i + 1];
      break;
    }
  }
  // Landmark at bin start (survived past binLo): hit if gap ends within horizon of binLo,
  // but only count gaps that actually entered the bin (gap > binLo). For drought inside
  // the bin we evaluate at current drought via survivors past drought — here we use
  // survivors past max(drought, binLo) approximated by survivors past drought, pooled
  // with other gaps that spent time in this bin by evaluating at binLo for gaps > binLo
  // when drought is near binLo; otherwise condition on drought.
  const anchor = Math.max(binLo, Math.min(drought, binHi === Infinity ? drought : binHi - 1e-6));
  const survivors = gaps.filter((g) => g > anchor);
  const hits = gaps.filter((g) => g > anchor && g <= anchor + horizon);
  const freshRate = gaps.length
    ? gaps.filter((g) => g <= horizon).length / gaps.length
    : 0.2;
  const prior = clamp01(freshRate, 0.05, 0.75);
  if (!survivors.length) {
    return { p: Math.min(0.12, prior * 0.4), binLo, binHi, survivors: 0, hits: 0 };
  }
  const k = Math.max(2, Math.round(6 / Math.sqrt(Math.max(gaps.length, 1))));
  const haz = (hits.length + k * prior) / (survivors.length + k);
  const w = survivors.length / (survivors.length + 2);
  return {
    p: clamp01(w * haz + (1 - w) * prior),
    binLo,
    binHi,
    survivors: survivors.length,
    hits: hits.length,
  };
}

/**
 * Blind past gap-start lift for a binary feature: among completed gaps available
 * at T, compare 72h-end rates when feature was on vs off at gap start.
 */
function pastGapStartLift(
  ownResets: ResetEvent[],
  featureAt: (gapStartMs: number) => boolean,
  horizon = ANTICIPATION_HORIZON_DAYS,
): { lift: number; nOn: number; nOff: number; rateOn: number; rateOff: number } {
  const on: number[] = [];
  const off: number[] = [];
  for (let i = 1; i < ownResets.length; i++) {
    const start = parseUtc(ownResets[i - 1].date).getTime();
    const end = parseUtc(ownResets[i].date).getTime();
    const gapDays = (end - start) / 86_400_000;
    const y = gapDays <= horizon ? 1 : 0;
    if (featureAt(start)) on.push(y);
    else off.push(y);
  }
  const rateOn = on.length ? on.reduce((a, b) => a + b, 0) / on.length : 0;
  const rateOff = off.length ? off.reduce((a, b) => a + b, 0) / off.length : 0;
  // Shrink lift toward 0 when either cell is thin.
  const nEff = Math.min(on.length, off.length);
  const shrink = nEff / (nEff + 4);
  const lift = shrink * (rateOn - rateOff);
  return { lift, nOn: on.length, nOff: off.length, rateOn, rateOff };
}

function oddsFromScore(score: number): AnticipationResult['oddsLabel'] {
  // Score ≈ 100 × estimated P(reset in ~72h / 3d). Bands sit slightly lower than the old 7d
  // thresholds because unconditional 72h rates are lower; still chance-soon ranking, not overdue.
  if (score >= 60) return 'high';
  if (score >= 45) return 'elevated';
  if (score >= 30) return 'moderate';
  return 'low';
}

/**
 * Honest anticipation: score ≈ 100 × P(public reset in next ~72 hours / 3 days | this
 * provider's gap history at T). NOT a schedule guarantee.
 * Additive blind features: drought-bin blend, rival pressure in last ~72h (lift fit on
 * past gap-starts only), weekend proximity (same), recent rival banked credits (~48h).
 */
export function anticipate(
  provider: ProviderId,
  events: ResetEvent[],
  rivalEvents: ResetEvent[] = [],
  now = new Date(),
): AnticipationResult {
  const stats = computeProviderStats(events, now);
  const features: AnticipationResult['features'] = [];
  const thinHistory = stats.resetCount < 3;
  const drought = stats.daysSinceLast ?? 0;
  const meanGap = stats.meanGapDays;
  const gaps = stats.gaps;
  const ownResets = stats.resets;

  const haz = gapConditionalHazard(gaps, drought, ANTICIPATION_HORIZON_DAYS);
  const bin = droughtBinHazard(gaps, drought, ANTICIPATION_HORIZON_DAYS);
  // Blend point-drought hazard with bin-smoothed rate (both blind).
  const blendW = gaps.length >= 6 ? 0.55 : 0.7;
  let pSoon = clamp01(blendW * haz.p + (1 - blendW) * bin.p);
  // Re-assert unconditional-rate honesty after bin blend (bin can spike on thin cells).
  const freshRate = gaps.length
    ? gaps.filter((g) => g <= ANTICIPATION_HORIZON_DAYS).length / gaps.length
    : 0.2;
  if (gaps.length >= 3 && freshRate < 0.25) {
    pSoon = Math.min(pSoon, Math.max(0.28, freshRate + 0.18));
  }

  // --- Rival short-window lift (fit on past gap-starts only; applied if rivals in last 72h) ---
  const rivalsScore = rivalPressureEvents(rivalEvents, now, RIVAL_SCORE_WINDOW_DAYS);
  const rivalsBanked48 = rivalEvents.filter((e) => {
    const age = daysBetween(parseUtc(e.date), now);
    return (
      age >= 0 &&
      age <= 2 &&
      e.kind === 'reset' &&
      e.delivery === 'banked' &&
      parseUtc(e.date).getTime() <= now.getTime()
    );
  });
  const rivalLift = pastGapStartLift(ownResets, (gapStartMs) => {
    const cut = gapStartMs - RIVAL_SCORE_WINDOW_DAYS * 86_400_000;
    return rivalEvents.some((e) => {
      const t = parseUtc(e.date).getTime();
      if (t > gapStartMs || t < cut) return false;
      if (e.kind === 'reset' && e.delivery === 'banked') return true;
      return e.reason_tags.some((tag) => RIVAL_PRESSURE_TAGS.has(tag));
    });
  });
  const bankedLift = pastGapStartLift(ownResets, (gapStartMs) => {
    const cut = gapStartMs - 2 * 86_400_000;
    return rivalEvents.some((e) => {
      const t = parseUtc(e.date).getTime();
      return (
        t <= gapStartMs &&
        t >= cut &&
        e.kind === 'reset' &&
        e.delivery === 'banked'
      );
    });
  });

  let rivalDelta = 0;
  if (rivalsScore.length && rivalLift.nOn >= 2 && rivalLift.lift > 0) {
    rivalDelta += Math.min(0.18, rivalLift.lift);
  }
  if (rivalsBanked48.length && bankedLift.nOn >= 1 && bankedLift.lift > 0) {
    rivalDelta += Math.min(0.12, bankedLift.lift);
  }
  pSoon = clamp01(pSoon + rivalDelta);

  // --- Weekend proximity lift (past gap-starts only) ---
  const weekendNow = isWeekendProximity(now);
  const weekendLift = pastGapStartLift(ownResets, (gapStartMs) =>
    isWeekendProximity(new Date(gapStartMs)),
  );
  let weekendDelta = 0;
  if (weekendNow && weekendLift.nOn >= 3 && weekendLift.lift > 0.02) {
    weekendDelta = Math.min(0.1, weekendLift.lift);
    pSoon = clamp01(pSoon + weekendDelta);
  } else if (!weekendNow && weekendLift.nOff >= 3 && weekendLift.lift < -0.02) {
    // Feature "weekend" has negative lift ⇒ weekday slightly higher; small bump mid-week.
    weekendDelta = Math.min(0.06, -weekendLift.lift * 0.5);
    pSoon = clamp01(pSoon + weekendDelta);
  }

  let score = Math.round(100 * pSoon);
  const pct = Math.round(100 * pSoon);

  // Primary driver: gap-conditional 72h hazard (empirical, not overdue).
  if (gaps.length === 0) {
    features.push({
      label: '72h gap hazard',
      detail: thinHistory
        ? 'Sparse public reset history — no completed gaps to estimate a short-horizon chance.'
        : 'Not enough reset history to estimate gap hazard.',
      weight: score,
    });
  } else if (haz.survivors === 0) {
    features.push({
      label: '72h gap hazard',
      detail: `Drought ${drought.toFixed(1)}d has outlived every prior gap (${gaps.length} completed). Estimated ~${pct}% chance of a reset in the next ~72 hours (3 days) — long tails stay long.`,
      weight: Math.round(100 * haz.p),
    });
  } else {
    const early =
      haz.pastFrac < 0.35
        ? 'early-cycle'
        : haz.pastFrac < 0.7
          ? 'mid-cycle'
          : 'late-cycle';
    features.push({
      label: '72h gap hazard',
      detail: `From ${gaps.length} prior gaps at ${drought.toFixed(1)}d drought (${early}): ${haz.hits}/${haz.survivors} historical survivors ended within +3d (~72h) → hazard ~${Math.round(100 * haz.p)}% (shrunk). Bin-smoothed ~${Math.round(100 * bin.p)}%. Higher score means elevated chance of a reset soon, not “overdue.”`,
      weight: Math.round(100 * (blendW * haz.p + (1 - blendW) * bin.p)),
    });
  }

  // Rival pressure: may move score when past gap-starts show positive short-window lift.
  const rivalsCtx = rivalPressureEvents(rivalEvents, now, RIVAL_CONTEXT_WINDOW_DAYS);
  if (rivalsScore.length) {
    const top = rivalsScore[0];
    const age = daysBetween(parseUtc(top.date), now);
    const daysLabel =
      age < 1 ? 'today' : age < 1.5 ? '1 day ago' : `${age.toFixed(0)} days ago`;
    const wRival = Math.round(100 * rivalDelta);
    features.push({
      label: 'Rival pressure',
      detail: `Rival shipped ${describeRivalEvent(top)} ${daysLabel} (within ~72h). Past gap-start lift ${rivalLift.lift >= 0 ? '+' : ''}${(100 * rivalLift.lift).toFixed(0)}pp (n_on=${rivalLift.nOn}) — ${wRival > 0 ? `applied +${wRival}` : 'too thin / non-positive to boost'}.`,
      weight: wRival,
    });
  } else if (rivalsCtx.length) {
    features.push({
      label: 'Rival pressure',
      detail: `Rival activity in the last 7 days but outside the 72h score window — context only.`,
      weight: 0,
    });
  } else {
    features.push({
      label: 'Rival pressure',
      detail: 'No major rival launch / milestone / banked reset in the last 7 days.',
      weight: 0,
    });
  }

  if (rivalsBanked48.length && bankedLift.lift > 0) {
    features.push({
      label: 'Rival banked credits',
      detail: `Rival banked reset within ~48h; past gap-start lift +${(100 * bankedLift.lift).toFixed(0)}pp (n_on=${bankedLift.nOn}).`,
      weight: Math.round(100 * Math.min(0.12, Math.max(0, bankedLift.lift))),
    });
  }

  if (weekendNow) {
    features.push({
      label: 'Weekend proximity',
      detail:
        weekendDelta > 0
          ? `Near weekend (UTC); past gap-start weekend lift +${(100 * weekendLift.lift).toFixed(0)}pp applied.`
          : 'UTC calendar is near a weekend — noted; insufficient past lift to move the score.',
      weight: Math.round(100 * weekendDelta),
    });
  } else {
    features.push({
      label: 'Weekend proximity',
      detail:
        weekendDelta > 0
          ? `Mid-week (UTC); small bump from inverse weekend lift on this log.`
          : 'Mid-week (UTC).',
      weight: Math.round(100 * weekendDelta),
    });
  }

  const recent = stats.resets.slice(-5);
  const tagCounts: Record<string, number> = {};
  for (const e of recent) {
    for (const t of e.reason_tags) {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (topTags.length) {
    features.push({
      label: 'Recent reason patterns',
      detail: `Recent tags: ${topTags.map(([t, n]) => `${t}(${n})`).join(', ')} — descriptive only.`,
      weight: 0,
    });
  } else {
    features.push({
      label: 'Recent reason patterns',
      detail: thinHistory
        ? 'Thin public log — Grok/xAI discretionary announcement resets are rare vs Claude/Codex miracle posts.'
        : 'No recent reset tags available.',
      weight: 0,
    });
  }

  if (thinHistory) {
    features.push({
      label: 'Data thinness',
      detail: `Only ${stats.resetCount} public discretionary reset(s) seeded. Treat the ~${pct}% estimate as a wide prior, not a forecast.`,
      weight: 0,
    });
  }

  if (meanGap != null) {
    features.push({
      label: 'Cycle context',
      detail: `Drought ${drought.toFixed(1)}d vs mean gap ${meanGap}d — context only; score uses the survival distribution, not “days overdue.”`,
      weight: 0,
    });
  }

  score = Math.max(0, Math.min(100, score));
  const oddsLabel = oddsFromScore(score);

  features.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || b.weight - a.weight);

  return {
    provider,
    oddsLabel,
    score,
    droughtDays: drought,
    meanGap,
    features,
    disclaimer:
      'Score ≈ estimated chance of a public reset in the next ~72 hours (3 days) from this provider’s own gap history — not a schedule or guarantee.',
  };
}

export function eventsInWindow(
  events: ResetEvent[],
  window: 'overlap' | '90d' | 'all',
  otherFirstReset?: string | null,
  now = new Date(),
): ResetEvent[] {
  let filtered = events.slice();
  if (window === '90d') {
    const cut = now.getTime() - 90 * 86_400_000;
    filtered = filtered.filter((e) => parseUtc(e.date).getTime() >= cut);
  } else if (window === 'overlap' && otherFirstReset) {
    const cut = parseUtc(otherFirstReset).getTime();
    filtered = filtered.filter((e) => parseUtc(e.date).getTime() >= cut);
  }
  return filtered;
}

export function heatmapDays(
  events: ResetEvent[],
  weeks = 26,
  now = new Date(),
): { date: string; count: number; kinds: string[] }[] {
  const resets = resetsOnly(events);
  const byDay = new Map<string, { count: number; kinds: string[] }>();
  for (const e of resets) {
    const key = parseUtc(e.date).toISOString().slice(0, 10);
    const cur = byDay.get(key) ?? { count: 0, kinds: [] };
    cur.count += 1;
    cur.kinds.push(e.delivery);
    byDay.set(key, cur);
  }

  // Align to Monday-start grid ending this week
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const endDow = end.getUTCDay(); // 0 Sun
  const daysFromMonday = (endDow + 6) % 7;
  const gridEnd = new Date(end);
  gridEnd.setUTCDate(end.getUTCDate() + (6 - daysFromMonday)); // Sunday end

  const totalDays = weeks * 7;
  const cells: { date: string; count: number; kinds: string[] }[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(gridEnd);
    d.setUTCDate(gridEnd.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit = byDay.get(key);
    cells.push({
      date: key,
      count: hit?.count ?? 0,
      kinds: hit?.kinds ?? [],
    });
  }
  return cells;
}

export function tagLabel(tag: string): string {
  return tag.replace(/_/g, ' ');
}

export function rivalCatalog(
  all: Record<ProviderId, ResetEvent[]>,
  self: ProviderId,
): ResetEvent[] {
  return (Object.keys(all) as ProviderId[])
    .filter((id) => id !== self)
    .flatMap((id) => all[id] ?? []);
}
