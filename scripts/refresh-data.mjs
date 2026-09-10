#!/usr/bin/env node
/**
 * Refresh public/data from upstream catalogs.
 * Claude: https://claude-resets.com/data/resets.json
 * Codex:  https://codex-resets.com/api/resets
 *
 * Re-run classification lightly; preserves local schema.
 * Usage: node scripts/refresh-data.mjs
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'data');

function classifyReasonTags(text, kind = 'reset') {
  const t = (text || '').toLowerCase();
  const tags = [];
  if (/bug|incident|outage|issue|mitigated|fixed|fix|resolved|disruption|latency/.test(t)) tags.push('incident');
  if (/celebrat|anniversary|million|\bm active|hit |reached|milestone|20m|15m|10m|9m|8m|7m|25m|3 million/.test(t)) tags.push('milestone');
  if (/weekend|friday|saturday|sunday|holiday|merry/.test(t)) tags.push('weekend_holiday');
  if (/launch|plugin|astra|fable|sol|feature|new plan|\$100/.test(t)) tags.push('product_launch');
  if (/rival|competitor|retention|churn|keep (you|builders)|don.?t (switch|jump)/.test(t)) tags.push('competitive_response');
  if (/banked|into your bank|credit one|additional reset/.test(t)) tags.push('banked_credit');
  if (/investigat|faster than|drain|consumed|usage was being/.test(t)) tags.push('usage_anomaly');
  if (/capacity|gpu|provision|scale/.test(t)) tags.push('capacity');
  if (kind === 'policy') tags.push('policy_change');
  if (!tags.length) tags.push('goodwill');
  return tags;
}

function classifyDelivery(text, resetType) {
  if (resetType === 'banked') return 'banked';
  const t = (text || '').toLowerCase();
  if (t.includes('banked reset')) return 'banked';
  if (!t) return 'unknown';
  return 'immediate';
}

function cleanNote(text) {
  if (!text) return null;
  let s = String(text).replace(/https:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 280) s = s.slice(0, 277) + '...';
  return s || null;
}

function inferCodexScope(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('500k')) return 'subset (~500k)';
  if (t.includes('plus & pro') || t.includes('plus and pro')) return 'Plus + Pro';
  return 'all paid';
}

function parseDate(d) {
  return new Date(d.endsWith('Z') || d.includes('+') ? d : d + 'Z');
}

function computeStats(events, now = new Date()) {
  const resetsOnly = events.filter((e) => e.kind === 'reset').sort((a, b) => parseDate(a.date) - parseDate(b.date));
  const gaps = [];
  for (let i = 1; i < resetsOnly.length; i++) {
    gaps.push((parseDate(resetsOnly[i].date) - parseDate(resetsOnly[i - 1].date)) / 86400000);
  }
  const last = resetsOnly.at(-1);
  const first = resetsOnly[0];
  const spanDays = first && last ? Math.max((parseDate(last.date) - parseDate(first.date)) / 86400000, 1) : 1;
  const months = spanDays / 30.4375;
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  return {
    resetCount: resetsOnly.length,
    policyChangeCount: events.filter((e) => e.kind === 'policy').length,
    lastResetAt: last?.date ?? null,
    lastResetUrl: last?.url ?? null,
    lastResetAccount: last?.account ?? null,
    lastResetScope: last?.scope ?? null,
    firstResetAt: first?.date ?? null,
    meanGapDays: mean != null ? Math.round(mean * 10) / 10 : null,
    longestGapDays: gaps.length ? Math.round(Math.max(...gaps) * 10) / 10 : null,
    daysSinceLast: last ? Math.round(((now - parseDate(last.date)) / 86400000) * 10) / 10 : null,
    pacePerMonth: resetsOnly.length ? Math.round((resetsOnly.length / Math.max(months, 0.1)) * 10) / 10 : null,
  };
}

const [claudeRes, codexRes] = await Promise.all([
  fetch('https://claude-resets.com/data/resets.json'),
  fetch('https://codex-resets.com/api/resets'),
]);
if (!claudeRes.ok) throw new Error(`claude resets ${claudeRes.status}`);
if (!codexRes.ok) throw new Error(`codex api ${codexRes.status}`);
const claudeRaw = await claudeRes.json();
const codexApi = await codexRes.json();

const claudeEvents = (claudeRaw.providers?.claude?.events ?? []).map((e) => ({
  id: String(e.id),
  provider: 'claude',
  kind: e.kind ?? 'reset',
  delivery: e.kind === 'policy' ? 'unknown' : 'immediate',
  reason_tags: classifyReasonTags(e.note, e.kind ?? 'reset'),
  scope: e.scope ?? 'all',
  date: e.date.endsWith('Z') ? e.date : `${e.date}Z`,
  url: e.url,
  account: e.account ?? 'ClaudeDevs',
  note: e.note ?? null,
})).sort((a, b) => parseDate(a.date) - parseDate(b.date));

const codexEvents = (codexApi.events ?? []).map((e) => {
  const url = e.tweet_url;
  const urlId = url.replace(/\/$/, '').split('/').pop();
  const tweetId = String(e.tweet_id ?? '');
  const id = tweetId.startsWith('observed') ? urlId : ( /^\d+$/.test(tweetId) ? tweetId : urlId );
  let date = e.announced_at;
  const dt = new Date(date);
  date = dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const text = e.text ?? '';
  return {
    id,
    provider: 'codex',
    kind: 'reset',
    delivery: classifyDelivery(text, e.reset_type),
    reason_tags: classifyReasonTags(text, 'reset'),
    scope: inferCodexScope(text),
    date,
    url,
    account: 'thsottiaux',
    note: cleanNote(text),
  };
}).sort((a, b) => parseDate(a.date) - parseDate(b.date));


// Preserve curated Grok events + apply competitive_response overlays
let previousGrok = {
  name: 'Grok',
  product: 'Grok / xAI',
  account: 'xai',
  accountUrl: 'https://x.com/xai',
  status: 'active',
  note: 'Paid SuperGrok uses an account-specific shared weekly usage pool (Settings → Usage). Free-tier Chat/Voice limits are separate. Public discretionary resets are sparse vs Claude/Codex.',
  events: [],
};
try {
  const prevRaw = JSON.parse(await readFile(join(outDir, 'resets.json'), 'utf8'));
  if (prevRaw?.providers?.grok) previousGrok = { ...previousGrok, ...prevRaw.providers.grok };
} catch {
  /* first refresh */
}

function applyCompetitiveTags(events, provider) {
  const overlays = {
    claude: {
      '2095967323412930677': 'competitive_response',
    },
    codex: {
      '2095651088502591861': 'competitive_response',
      '2096035437299237298': 'competitive_response',
      '2075330198887940337': 'competitive_response',
      '2075641131002700120': 'competitive_response',
      '2075820987833274448': 'competitive_response',
    },
  };
  const map = overlays[provider] ?? {};
  return events.map((e) => {
    const tag = map[e.id];
    if (!tag) return e;
    const reason_tags = e.reason_tags.includes(tag) ? e.reason_tags : [...e.reason_tags, tag];
    return { ...e, reason_tags };
  });
}

const claudeEventsTagged = applyCompetitiveTags(claudeEvents, 'claude');
const codexEventsTagged = applyCompetitiveTags(codexEvents, 'codex');

const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const dataset = {
  meta: {
    name: 'AI Reset Tracker',
    generatedAt,
    attribution: [
      'Claude event catalog adapted from https://claude-resets.com/data/resets.json (with attribution).',
      'Codex announcements curated from https://codex-resets.com/ and @thsottiaux posts; timestamps from announcement times / status IDs.',
      'Grok / xAI signals curated locally from docs.x.ai + sparse public announcements.',
      'Not affiliated with Anthropic, OpenAI, or xAI.',
    ],
    definitions: {
      reset: 'Announcement that flushed usage counters (5-hour and/or weekly).',
      policy: 'Announcement that changed limits without flushing counters; listed but not counted as a reset.',
      immediate: 'Reset applied (or propagating) without requiring the user to redeem a banked credit.',
      banked: 'Credit placed in a reset bank for the user to apply later.',
      unknown: 'Delivery mode unclear from the announcement text.',
      competitive_response: 'Reset timing aligned with a rival lab launch/promo — retention-pressure interpretation.',
    },
  },
  providers: {
    claude: {
      name: 'Claude',
      product: 'Claude Code',
      account: 'ClaudeDevs',
      accountUrl: 'https://x.com/ClaudeDevs',
      events: claudeEventsTagged,
    },
    codex: {
      name: 'Codex',
      product: 'Codex / ChatGPT',
      account: 'thsottiaux',
      accountUrl: 'https://x.com/thsottiaux',
      events: codexEventsTagged,
    },
    grok: previousGrok,
  },
};

const summary = {
  site: 'AI Reset Tracker',
  name: 'ai-reset-tracker',
  generatedAt,
  disclaimer: 'Unofficial community tracker. Not affiliated with Anthropic, OpenAI, xAI, Claude, Codex, or Grok.',
  providers: {
    claude: {
      name: 'Claude',
      product: 'Claude Code',
      account: 'ClaudeDevs',
      accountUrl: 'https://x.com/ClaudeDevs',
      ...computeStats(claudeEventsTagged),
      datasetAttribution: 'Adapted from https://claude-resets.com/data/resets.json',
    },
    codex: {
      name: 'Codex',
      product: 'Codex / ChatGPT',
      account: 'thsottiaux',
      accountUrl: 'https://x.com/thsottiaux',
      ...computeStats(codexEventsTagged),
      datasetAttribution: 'Curated from https://codex-resets.com/ announcements',
    },
    grok: {
      name: 'Grok',
      product: 'Grok / xAI',
      account: previousGrok.account,
      accountUrl: previousGrok.accountUrl,
      status: previousGrok.status ?? 'active',
      note: previousGrok.note,
      ...computeStats(previousGrok.events ?? []),
      datasetAttribution: 'docs.x.ai FAQ + sparse public announcements',
    },
  },
  definitions: dataset.meta.definitions,
  urls: {
    resets: '/data/resets.json',
    summary: '/data/summary.json',
    llms: '/llms.txt',
    rss: '/rss.xml',
  },
};

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'resets.json'), JSON.stringify(dataset, null, 2) + '\n');
await writeFile(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`Wrote ${claudeEventsTagged.length} Claude + ${codexEventsTagged.length} Codex + ${(previousGrok.events??[]).length} Grok events to public/data/`);
