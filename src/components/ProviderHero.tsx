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
  /** Smaller stats + heatmap so likelihood stays primary. */
  compact?: boolean;
}

export function ProviderHero({ id, meta, compact = false }: Props) {
  const stats = computeProviderStats(meta.events);
  const accent = id === 'claude' ? 'claude' : id === 'codex' ? 'codex' : 'grok';
  const hasResets = stats.resetCount > 0;

  return (
    <section className={`provider-hero provider-${id}${compact ? ' compact' : ''}`}>
      <div className="provider-title">
        <div>
          <h2>{meta.product}</h2>
          <p className="muted">
            Watching{' '}
            {meta.accountUrl ? (
              <a href={meta.accountUrl} target="_blank" rel="noopener noreferrer">
                @{meta.account}
              </a>
            ) : meta.account ? (
              <>@{meta.account}</>
            ) : (
              'public docs + announcements'
            )}
          </p>
          {meta.note ? <p className="muted small provider-note">{meta.note}</p> : null}
        </div>
        <div className="last-reset">
          <div className="stat-label">Latest reset</div>
          <div className="last-reset-value">
            {hasResets ? formatRelativeDays(stats.daysSinceLast) : 'No public log yet'}
          </div>
          <div className="muted small">{formatDate(stats.lastResetAt)}</div>
          {stats.lastResetUrl ? (
            <a href={stats.lastResetUrl} target="_blank" rel="noopener noreferrer">
              Original post →
            </a>
          ) : null}
        </div>
      </div>
      <div className={`stat-grid${compact ? ' compact-grid' : ''}`}>
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
          hint={
            stats.pacePerMonth != null
              ? `Pace ~${stats.pacePerMonth}/mo`
              : 'Account-specific clocks may differ'
          }
          accent={accent}
        />
      </div>
      {hasResets ? <Heatmap events={meta.events} /> : null}
    </section>
  );
}
