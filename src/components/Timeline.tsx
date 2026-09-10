import { useMemo } from 'react';
import { formatDate, parseUtc } from '../lib/stats';
import type { ResetEvent } from '../lib/types';

interface Props {
  claudeEvents: ResetEvent[];
  codexEvents: ResetEvent[];
  grokEvents?: ResetEvent[];
}

export function Timeline({ claudeEvents, codexEvents, grokEvents = [] }: Props) {
  const marks = useMemo(() => {
    const all = [
      ...claudeEvents.filter((e) => e.kind === 'reset').map((e) => ({ ...e, lane: 'claude' as const })),
      ...codexEvents.filter((e) => e.kind === 'reset').map((e) => ({ ...e, lane: 'codex' as const })),
      ...grokEvents.filter((e) => e.kind === 'reset').map((e) => ({ ...e, lane: 'grok' as const })),
    ].sort((a, b) => parseUtc(a.date).getTime() - parseUtc(b.date).getTime());
    if (!all.length) return [];
    const min = parseUtc(all[0].date).getTime();
    const max = parseUtc(all[all.length - 1].date).getTime();
    const span = Math.max(max - min, 1);
    return all.map((e) => ({
      ...e,
      pct: ((parseUtc(e.date).getTime() - min) / span) * 100,
    }));
  }, [claudeEvents, codexEvents, grokEvents]);

  return (
    <section className="panel timeline">
      <h3>Shared timeline</h3>
      <p className="muted">Every public reset on one axis. Hover a mark; click through to the source.</p>
      <div className="timeline-lanes">
        {(
          [
            ['claude', 'Claude'],
            ['codex', 'Codex'],
            ['grok', 'Grok'],
          ] as const
        ).map(([lane, label]) => (
          <div className="lane" key={lane}>
            <span className={`lane-label ${lane}`}>{label}</span>
            <div className="lane-track">
              {marks
                .filter((m) => m.lane === lane)
                .map((m) => (
                  <a
                    key={`${lane}-${m.id}`}
                    className={`mark ${lane}`}
                    style={{ left: `${m.pct}%` }}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${formatDate(m.date)} — ${m.note ?? 'reset'}`}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
