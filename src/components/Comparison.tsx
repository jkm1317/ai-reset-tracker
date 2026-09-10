import { useMemo, useState } from 'react';
import {
  computeProviderStats,
  eventsInWindow,
  formatDays,
  resetsOnly,
} from '../lib/stats';
import type { ResetEvent } from '../lib/types';

interface Props {
  claudeEvents: ResetEvent[];
  codexEvents: ResetEvent[];
}

type Window = 'overlap' | '90d' | 'all';

export function Comparison({ claudeEvents, codexEvents }: Props) {
  const [window, setWindow] = useState<Window>('overlap');

  const claudeFirst = resetsOnly(claudeEvents)[0]?.date ?? null;

  const { cStats, xStats } = useMemo(() => {
    const c = eventsInWindow(claudeEvents, window, claudeFirst);
    // Overlap uses Claude's first reset as shared start (both tracked)
    const x = eventsInWindow(codexEvents, window, claudeFirst);
    return {
      cStats: computeProviderStats(c),
      xStats: computeProviderStats(x),
    };
  }, [claudeEvents, codexEvents, window, claudeFirst]);

  const rows: { label: string; claude: string; codex: string; better: 'claude' | 'codex' | 'tie'; invert?: boolean }[] = [
    {
      label: 'Resets',
      claude: String(cStats.resetCount),
      codex: String(xStats.resetCount),
      better:
        cStats.resetCount === xStats.resetCount
          ? 'tie'
          : cStats.resetCount > xStats.resetCount
            ? 'claude'
            : 'codex',
    },
    {
      label: 'Mean gap',
      claude: formatDays(cStats.meanGapDays),
      codex: formatDays(xStats.meanGapDays),
      better:
        cStats.meanGapDays == null || xStats.meanGapDays == null
          ? 'tie'
          : cStats.meanGapDays < xStats.meanGapDays
            ? 'claude'
            : cStats.meanGapDays > xStats.meanGapDays
              ? 'codex'
              : 'tie',
      invert: true,
    },
    {
      label: 'Longest drought',
      claude: formatDays(cStats.longestGapDays),
      codex: formatDays(xStats.longestGapDays),
      better:
        cStats.longestGapDays == null || xStats.longestGapDays == null
          ? 'tie'
          : cStats.longestGapDays < xStats.longestGapDays
            ? 'claude'
            : cStats.longestGapDays > xStats.longestGapDays
              ? 'codex'
              : 'tie',
      invert: true,
    },
    {
      label: 'Days since last',
      claude: formatDays(cStats.daysSinceLast),
      codex: formatDays(xStats.daysSinceLast),
      better:
        cStats.daysSinceLast == null || xStats.daysSinceLast == null
          ? 'tie'
          : cStats.daysSinceLast < xStats.daysSinceLast
            ? 'claude'
            : cStats.daysSinceLast > xStats.daysSinceLast
              ? 'codex'
              : 'tie',
      invert: true,
    },
    {
      label: 'Pace / month',
      claude: cStats.pacePerMonth != null ? String(cStats.pacePerMonth) : '—',
      codex: xStats.pacePerMonth != null ? String(xStats.pacePerMonth) : '—',
      better:
        cStats.pacePerMonth == null || xStats.pacePerMonth == null
          ? 'tie'
          : cStats.pacePerMonth > xStats.pacePerMonth
            ? 'claude'
            : cStats.pacePerMonth < xStats.pacePerMonth
              ? 'codex'
              : 'tie',
    },
  ];

  return (
    <section className="panel comparison">
      <div className="panel-head">
        <h3>Claude vs Codex</h3>
        <div className="segmented" role="group" aria-label="Comparison window">
          {(
            [
              ['overlap', 'Overlap'],
              ['90d', 'Last 90 days'],
              ['all', 'All time'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={window === id ? 'active' : ''}
              onClick={() => setWindow(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">
        ▲ marks the more generous side on that row (more resets / faster pace; smaller gaps).
        Overlap starts at Claude&apos;s first tracked reset so both catalogs share a clock.
      </p>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Claude Code</th>
              <th>Codex</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className={r.better === 'claude' ? 'winner' : ''}>
                  {r.claude}
                  {r.better === 'claude' ? ' ▲' : ''}
                </td>
                <td className={r.better === 'codex' ? 'winner' : ''}>
                  {r.codex}
                  {r.better === 'codex' ? ' ▲' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
