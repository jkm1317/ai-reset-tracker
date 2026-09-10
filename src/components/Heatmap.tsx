import { heatmapDays } from '../lib/stats';
import type { ResetEvent } from '../lib/types';

interface Props {
  events: ResetEvent[];
  weeks?: number;
}

export function Heatmap({ events, weeks = 26 }: Props) {
  const cells = heatmapDays(events, weeks);
  const months: string[] = [];
  let lastMonth = '';
  for (let i = 0; i < cells.length; i += 7) {
    const m = cells[i].date.slice(0, 7);
    if (m !== lastMonth) {
      months.push(cells[i].date);
      lastMonth = m;
    } else {
      months.push('');
    }
  }

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-legend">
        <span>Last {weeks} weeks</span>
        <span className="legend-items">
          <i className="hm-0" /> none
          <i className="hm-1" /> reset
          <i className="hm-banked" /> banked
        </span>
      </div>
      <div className="heatmap" role="img" aria-label="Reset activity heatmap">
        {cells.map((c) => {
          const banked = c.kinds.includes('banked') && c.count > 0;
          const cls =
            c.count === 0 ? 'hm-0' : banked ? 'hm-banked' : c.count > 1 ? 'hm-2' : 'hm-1';
          return (
            <div
              key={c.date}
              className={`hm-cell ${cls}`}
              title={
                c.count
                  ? `${c.date}: ${c.count} reset(s)${banked ? ' (incl. banked)' : ''}`
                  : `${c.date}: no reset`
              }
            />
          );
        })}
      </div>
      <div className="heatmap-dow">
        <span>Mon</span>
        <span>Wed</span>
        <span>Fri</span>
      </div>
    </div>
  );
}
