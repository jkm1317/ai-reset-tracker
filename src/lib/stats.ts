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

const RIVAL_WINDOW_DAYS = 7;

function rivalPressureEvents(rivalEvents: ResetEvent[], now: Date): ResetEvent[] {
  const cut = now.getTime() - RIVAL_WINDOW_DAYS * 86_400_000;
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

/**
 * Empirical P(gap ends in (drought, drought+horizon] | survived past drought)
 * from this provider's completed gaps only. Strong shrinkage when few survivors.
 * Long droughts that have outlived most historical gaps get LOW short-horizon p
 * (inverse of "overdue = urgent").
 */
export function gapConditionalHazard(
  gaps: number[],
  drought: number,
  horizon = 7,
): { p: number; survivors: number; hits: number; prior: number; pastFrac: number } {
  if (!gaps.length) {
    return { p: 0.25, survivors: 0, hits: 0, prior: 0.25, pastFrac: 0 };
  }

  const freshRate = gaps.filter((g) => g <= horizon).length / gaps.length;
  const pastFrac = gaps.filter((g) => g <= drought).length / gaps.length;
  const massAhead = 1 - pastFrac;
  // Early-cycle density prior: higher when many gaps still have mass ahead.
  // Thin catalogs (1–2 gaps) stay humble — a single short gap must not imply ~90%.
  const thin = gaps.length < 3;
  const priorRaw =
    freshRate * (0.35 + 0.65 * massAhead) + 0.05 * massAhead;
  const prior = Math.min(
    thin ? 0.45 : 0.88,
    Math.max(0.08, thin ? 0.2 * priorRaw + 0.8 * 0.28 : priorRaw),
  );

  const survivors = gaps.filter((g) => g > drought);
  const hits = gaps.filter((g) => g > drought && g <= drought + horizon);

  if (survivors.length === 0) {
    // Unprecedented vs history — short-horizon chance is low, not "overdue high".
    return {
      p: Math.min(thin ? 0.22 : 0.16, prior * 0.5),
      survivors: 0,
      hits: 0,
      prior,
      pastFrac,
    };
  }

  const k = Math.max(
    thin ? 8 : 4,
    Math.round((thin ? 16 : 10) / Math.sqrt(gaps.length)),
  );
  const haz = (hits.length + k * prior) / (survivors.length + k);
  const w = survivors.length / (survivors.length + (thin ? 6 : 3));
  const p = Math.min(thin ? 0.55 : 0.9, Math.max(0.06, w * haz + (1 - w) * prior));
  return { p, survivors: survivors.length, hits: hits.length, prior, pastFrac };
}

function oddsFromScore(score: number): AnticipationResult['oddsLabel'] {
  // Score ≈ 100 × calibrated P(reset in ~7d). Labels track chance-soon, not overdue.
  if (score >= 65) return 'high';
  if (score >= 50) return 'elevated';
  if (score >= 35) return 'moderate';
  return 'low';
}

/**
 * Honest anticipation: score ≈ 100 × P(public reset in next ~7 days | this
 * provider's gap history at T). NOT a schedule guarantee.
 * Rival pressure is surfaced when present but does not boost the score on this log
 * (empirically unhelpful / slightly inverse for short-horizon hits).
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

  const haz = gapConditionalHazard(gaps, drought, 7);
  const p7 = haz.p;
  let score = Math.round(100 * p7);

  // Primary driver: gap-conditional 7d hazard (early-cycle density, not overdue).
  const pct = Math.round(100 * p7);
  if (gaps.length === 0) {
    features.push({
      label: '7d gap hazard',
      detail: thinHistory
        ? 'Sparse public reset history — no completed gaps to estimate a short-horizon chance.'
        : 'Not enough reset history to estimate gap hazard.',
      weight: score,
    });
  } else if (haz.survivors === 0) {
    features.push({
      label: '7d gap hazard',
      detail: `Drought ${drought.toFixed(1)}d has outlived every prior gap (${gaps.length} completed). Estimated ~${pct}% chance of a reset in the next 7 days — long tails stay long.`,
      weight: score,
    });
  } else {
    const early =
      haz.pastFrac < 0.35
        ? 'early-cycle'
        : haz.pastFrac < 0.7
          ? 'mid-cycle'
          : 'late-cycle';
    features.push({
      label: '7d gap hazard',
      detail: `From ${gaps.length} prior gaps at ${drought.toFixed(1)}d drought (${early}): ${haz.hits}/${haz.survivors} historical survivors ended within +7d → ~${pct}% (shrunk). Higher score means elevated chance of a reset soon, not “overdue.”`,
      weight: score,
    });
  }

  // Rival pressure: informational only (does not move score on this catalog).
  const rivals = rivalPressureEvents(rivalEvents, now);
  if (rivals.length) {
    const top = rivals[0];
    const age = daysBetween(parseUtc(top.date), now);
    const daysLabel =
      age < 1 ? 'today' : age < 1.5 ? '1 day ago' : `${age.toFixed(0)} days ago`;
    features.push({
      label: 'Rival pressure',
      detail: `Rival shipped ${describeRivalEvent(top)} ${daysLabel} — tracked for context; not used to raise the score (no reliable short-horizon lift on this log).`,
      weight: 0,
    });
  } else {
    features.push({
      label: 'Rival pressure',
      detail: 'No major rival launch / milestone / banked reset in the last 7 days.',
      weight: 0,
    });
  }

  if (isWeekendProximity(now)) {
    features.push({
      label: 'Weekend proximity',
      detail:
        'UTC calendar is near a weekend — noted only; calendar effects are weak vs gap hazard on this log.',
      weight: 0,
    });
  } else {
    features.push({
      label: 'Weekend proximity',
      detail: 'Mid-week (UTC).',
      weight: 0,
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
      'Score ≈ estimated chance of a public reset in the next ~7 days from this provider’s own gap history — not a schedule or guarantee.',
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
