import {
  formatDate,
  formatDays,
  formatRelativeDays,
  computeProviderStats,
} from '../lib/stats';
import type { ProviderId, ProviderMeta } from '../lib/types';
import { StatCard } from './StatCard';
import { Heatmap } from './Heatmap';

interface Props {
  id: ProviderId;
  meta: ProviderMeta;
}

export function ProviderHero({ id, meta }: Props) {
  if (id === 'grok' || meta.status === 'todo') {
    return (
      <section className={`provider-hero provider-${id} stub`}>
        <div className="provider-title">
          <h2>{meta.name}</h2>
          <span className="badge todo">TODO stub</span>
        </div>
        <p className="muted">
          {meta.note ??
            'Grok / xAI usage-limit reset tracking is deferred. No events seeded yet.'}
        </p>
      </section>
    );
  }

  const stats = computeProviderStats(meta.events);
  const accent = id === 'claude' ? 'claude' : 'codex';

  return (
    <section className={`provider-hero provider-${id}`}>
      <div className="provider-title">
        <div>
          <h2>{meta.product}</h2>
          <p className="muted">
            Watching{' '}
            {meta.accountUrl ? (
              <a href={meta.accountUrl} target="_blank" rel="noopener noreferrer">
                @{meta.account}
              </a>
            ) : (
              '—'
            )}
          </p>
        </div>
        <div className="last-reset">
          <div className="stat-label">Latest reset</div>
          <div className="last-reset-value">
            {formatRelativeDays(stats.daysSinceLast)}
          </div>
          <div className="muted small">{formatDate(stats.lastResetAt)}</div>
          {stats.lastResetUrl ? (
            <a href={stats.lastResetUrl} target="_blank" rel="noopener noreferrer">
              Original post →
            </a>
          ) : null}
        </div>
      </div>
      <div className="stat-grid">
        <StatCard label="Resets" value={String(stats.resetCount)} accent={accent} />
        <StatCard
          label="Mean gap"
          value={formatDays(stats.meanGapDays)}
          hint="Average interval between resets"
          accent={accent}
        />
        <StatCard
          label="Longest drought"
          value={formatDays(stats.longestGapDays)}
          hint="Max gap in the catalog"
          accent={accent}
        />
        <StatCard
          label="Days since last"
          value={formatDays(stats.daysSinceLast)}
          hint={`Pace ~${stats.pacePerMonth ?? '—'}/mo`}
          accent={accent}
        />
      </div>
      <Heatmap events={meta.events} />
    </section>
  );
}
