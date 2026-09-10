import { useMemo, useState } from 'react';
import { formatDate, parseUtc, tagLabel } from '../lib/stats';
import type { ResetEvent } from '../lib/types';

interface Props {
  events: ResetEvent[];
  title: string;
  showPoliciesDefault?: boolean;
}

export function Archive({ events, title, showPoliciesDefault = false }: Props) {
  const [showPolicies, setShowPolicies] = useState(showPoliciesDefault);
  const [q, setQ] = useState('');

  const sorted = useMemo(() => {
    return events
      .filter((e) => (showPolicies ? true : e.kind === 'reset'))
      .filter((e) => {
        if (!q.trim()) return true;
        const hay = `${e.note ?? ''} ${e.scope} ${e.account ?? ''} ${e.reason_tags.join(' ')}`.toLowerCase();
        return hay.includes(q.trim().toLowerCase());
      })
      .slice()
      .sort((a, b) => parseUtc(b.date).getTime() - parseUtc(a.date).getTime());
  }, [events, showPolicies, q]);

  const resets = events
    .filter((e) => e.kind === 'reset')
    .sort((a, b) => parseUtc(a.date).getTime() - parseUtc(b.date).getTime());

  function gapBefore(e: ResetEvent): string | null {
    if (e.kind !== 'reset') return null;
    const idx = resets.findIndex((r) => r.id === e.id);
    if (idx <= 0) return 'First tracked reset';
    const days =
      (parseUtc(e.date).getTime() - parseUtc(resets[idx - 1].date).getTime()) / 86_400_000;
    return `${days.toFixed(1)} days after previous reset`;
  }

  return (
    <section className="panel archive">
      <div className="panel-head">
        <h3>{title}</h3>
        <div className="archive-controls">
          <label className="check">
            <input
              type="checkbox"
              checked={showPolicies}
              onChange={(ev) => setShowPolicies(ev.target.checked)}
            />
            Show policy / limit changes
          </label>
          <input
            className="search"
            placeholder="Filter notes, tags, scope…"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
          />
        </div>
      </div>
      <ol className="archive-list">
        {sorted.map((e) => (
          <li key={`${e.provider}-${e.id}`} className={`archive-item kind-${e.kind}`}>
            <div className="archive-meta">
              <time dateTime={e.date}>{formatDate(e.date)}</time>
              <span className={`badge kind-${e.kind}`}>{e.kind}</span>
              <span className={`badge delivery-${e.delivery}`}>{e.delivery}</span>
              <span className="badge scope">{e.scope}</span>
            </div>
            <p className="archive-note">{e.note ?? '(no note)'}</p>
            <div className="archive-tags">
              {e.reason_tags.map((t) => (
                <span key={t} className="tag">
                  {tagLabel(t)}
                </span>
              ))}
            </div>
            <div className="archive-foot">
              {gapBefore(e) ? <span className="muted">{gapBefore(e)}</span> : null}
              <a href={e.url} target="_blank" rel="noopener noreferrer">
                View on X (@{e.account ?? 'unknown'}) →
              </a>
            </div>
          </li>
        ))}
      </ol>
      {!sorted.length ? <p className="muted">No announcements match.</p> : null}
    </section>
  );
}
