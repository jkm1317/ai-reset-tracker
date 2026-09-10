import { useMemo } from 'react';
import { formatDate, parseUtc } from '../lib/stats';
import type { ResetEvent } from '../lib/types';

interface Props {
  claudeEvents: ResetEvent[];
  codexEvents: ResetEvent[];
}

export function Timeline({ claudeEvents, codexEvents }: Props) {
  const marks = useMemo(() => {
    const all = [
      ...claudeEvents.filter((e) => e.kind === 'reset').map((e) => ({ ...e, lane: 'claude' as const })),
      ...codexEvents.filter((e) => e.kind === 'reset').map((e) => ({ ...e, lane: 'codex' as const })),
    ].sort((a, b) => parseUtc(a.date).getTime() - parseUtc(b.date).getTime());
    if (!all.length) return [];
    const min = parseUtc(all[0].date).getTime();
    const max = parseUtc(all[all.length - 1].date).getTime();
    const span = Math.max(max - min, 1);
    return all.map((e) => ({
      ...e,
      pct: ((parseUtc(e.date).getTime() - min) / span) * 100,
    }));
  }, [claudeEvents, codexEvents]);

  return (
    <section className="panel timeline">
      <h3>Shared timeline</h3>
      <p className="muted">Every reset on one axis. Hover a mark; click through to X.</p>
      <div className="timeline-lanes">
        <div className="lane">
          <span className="lane-label claude">Claude</span>
          <div className="lane-track">
            {marks
              .filter((m) => m.lane === 'claude')
              .map((m) => (
                <a
                  key={`c-${m.id}`}
                  className="mark claude"
                  style={{ left: `${m.pct}%` }}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${formatDate(m.date)} — ${m.note ?? 'reset'}`}
                />
              ))}
          </div>
        </div>
        <div className="lane">
          <span className="lane-label codex">Codex</span>
          <div className="lane-track">
            {marks
              .filter((m) => m.lane === 'codex')
              .map((m) => (
                <a
                  key={`x-${m.id}`}
                  className="mark codex"
                  style={{ left: `${m.pct}%` }}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${formatDate(m.date)} — ${m.note ?? 'reset'}`}
                />
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}
