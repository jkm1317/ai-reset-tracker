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
 * Honest, explained anticipation — NOT a schedule guarantee.
 * Optional rivalEvents enable cross-lab "rival pressure" scoring.
 */
export function anticipate(
  provider: ProviderId,
  events: ResetEvent[],
  rivalEvents: ResetEvent[] = [],
  now = new Date(),
): AnticipationResult {
  const stats = computeProviderStats(events, now);
  const features: AnticipationResult['features'] = [];
  let score = 0;
  const thinHistory = stats.resetCount < 3;

  const drought = stats.daysSinceLast ?? 0;
  const meanGap = stats.meanGapDays;

  if (meanGap != null && meanGap > 0) {
    const ratio = drought / meanGap;
    if (ratio >= 1.5) {
      score += 35;
      features.push({
        label: 'Drought vs mean',
        detail: `Current drought (${drought.toFixed(1)}d) is ${ratio.toFixed(1)}× the mean gap (${meanGap}d).`,
        weight: 35,
      });
    } else if (ratio >= 1.0) {
      score += 22;
      features.push({
        label: 'Drought vs mean',
        detail: `Drought (${drought.toFixed(1)}d) has reached or passed the mean gap (${meanGap}d).`,
        weight: 22,
      });
    } else if (ratio >= 0.7) {
      score += 10;
      features.push({
        label: 'Drought vs mean',
        detail: `Drought (${drought.toFixed(1)}d) is approaching the mean gap (${meanGap}d).`,
        weight: 10,
      });
    } else {
      features.push({
        label: 'Drought vs mean',
        detail: `Still early in the cycle (${drought.toFixed(1)}d vs mean ${meanGap}d).`,
        weight: 0,
      });
    }
  } else if (stats.resetCount > 0 && drought >= 7) {
    const w = drought >= 14 ? 14 : 8;
    score += w;
    features.push({
      label: 'Drought (thin history)',
      detail: `${drought.toFixed(1)}d since the last seeded public reset — mean gap unknown with sparse announcements.`,
      weight: w,
    });
  } else {
    features.push({
      label: 'Drought vs mean',
      detail: thinHistory
        ? 'Sparse public reset history — no reliable mean gap yet.'
        : 'Not enough reset history to compute a mean gap.',
      weight: 0,
    });
  }

  // Rival pressure: other labs shipped a launch / milestone / banked reset in the last ~3–7 days
  const rivals = rivalPressureEvents(rivalEvents, now);
  if (rivals.length) {
    const top = rivals[0];
    const age = daysBetween(parseUtc(top.date), now);
    const weight = age <= 3 ? 22 : age <= 5 ? 16 : 12;
    score += weight;
    const daysLabel = age < 1 ? 'today' : age < 1.5 ? '1 day ago' : `${age.toFixed(0)} days ago`;
    features.push({
      label: 'Rival pressure',
      detail: `Rival shipped ${describeRivalEvent(top)} ${daysLabel} — historically a window for retention resets.`,
      weight,
    });
  } else {
    features.push({
      label: 'Rival pressure',
      detail: 'No major rival launch / milestone / banked reset in the last 7 days.',
      weight: 0,
    });
  }

  if (isWeekendProximity(now)) {
    score += 12;
    features.push({
      label: 'Weekend proximity',
      detail:
        'UTC calendar is near a weekend — historically a common announcement window for goodwill resets.',
      weight: 12,
    });
  } else {
    features.push({
      label: 'Weekend proximity',
      detail: 'Mid-week (UTC) — weekend-proximate goodwill resets are less relevant today.',
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

  if (topTags.some(([t]) => t === 'incident' || t === 'usage_anomaly')) {
    score += 8;
    features.push({
      label: 'Recent reason patterns',
      detail: `Recent resets often tagged ${topTags.map(([t, n]) => `${t}(${n})`).join(', ')} — incident-driven clusters can recur, but that is not predictive.`,
      weight: 8,
    });
  } else if (topTags.some(([t]) => t === 'competitive_response')) {
    score += 6;
    features.push({
      label: 'Recent reason patterns',
      detail: `Recent tags include competitive_response — labs sometimes reset when rivals ship: ${topTags.map(([t, n]) => `${t}(${n})`).join(', ')}.`,
      weight: 6,
    });
  } else if (topTags.length) {
    score += 4;
    features.push({
      label: 'Recent reason patterns',
      detail: `Recent tags: ${topTags.map(([t, n]) => `${t}(${n})`).join(', ')}.`,
      weight: 4,
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
      detail: `Only ${stats.resetCount} public discretionary reset(s) seeded. Score leans on rival pressure + whatever drought exists — treat odds cautiously.`,
      weight: 0,
    });
  }

  // Pace dampener: very frequent providers shouldn't scream "overdue" as loudly
  if (meanGap != null && meanGap < 5 && drought < meanGap) {
    score = Math.max(0, score - 8);
    features.push({
      label: 'Pace dampener',
      detail: 'High-frequency reset history — short droughts are normal, so odds stay tempered.',
      weight: -8,
    });
  }

  score = Math.max(0, Math.min(100, score));
  let oddsLabel: AnticipationResult['oddsLabel'] = 'low';
  if (score >= 55) oddsLabel = 'high';
  else if (score >= 35) oddsLabel = 'elevated';
  else if (score >= 18) oddsLabel = 'moderate';

  // Sort features so the top explanatory driver (highest |weight|) is first for the one-liner
  features.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || b.weight - a.weight);

  return {
    provider,
    oddsLabel,
    score,
    droughtDays: drought,
    meanGap,
    features,
    disclaimer:
      'Descriptive odds from historical patterns — not a schedule or guarantee.',
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
