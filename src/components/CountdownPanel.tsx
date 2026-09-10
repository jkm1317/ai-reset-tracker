import { useState } from 'react';
import {
  formatRemaining,
  useLocalCountdowns,
  type CountdownSlot,
} from '../hooks/useLocalCountdowns';

const DEFAULTS: Omit<CountdownSlot, 'resetAt'>[] = [
  { id: 'claude-5h', label: 'Claude 5-hour window', provider: 'claude' },
  { id: 'claude-weekly', label: 'Claude weekly window', provider: 'claude' },
  { id: 'codex-weekly', label: 'Codex weekly window', provider: 'codex' },
];

export function CountdownPanel() {
  const { slots, upsert, remove, remaining } = useLocalCountdowns();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function slotFor(id: string) {
    return slots.find((s) => s.id === id);
  }

  return (
    <section className="panel countdowns">
      <h3>Personal /usage countdowns</h3>
      <p className="muted">
        Optional. Paste the next reset times from Claude Code <code>/usage</code> or your Codex
        UI. Saved only in this browser via localStorage — never uploaded.
      </p>
      <div className="countdown-grid">
        {DEFAULTS.map((def) => {
          const existing = slotFor(def.id);
          const ms = existing ? remaining(existing.resetAt) : null;
          return (
            <div key={def.id} className={`countdown-card provider-${def.provider}`}>
              <div className="stat-label">{def.label}</div>
              <div className="stat-value small">{formatRemaining(ms)}</div>
              <label className="field">
                Next reset (local)
                <input
                  type="datetime-local"
                  value={
                    drafts[def.id] ??
                    (existing
                      ? toLocalInput(existing.resetAt)
                      : '')
                  }
                  onChange={(ev) =>
                    setDrafts((d) => ({ ...d, [def.id]: ev.target.value }))
                  }
                />
              </label>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    const v = drafts[def.id] ?? (existing ? toLocalInput(existing.resetAt) : '');
                    if (!v) return;
                    upsert({ ...def, resetAt: new Date(v).toISOString() });
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    remove(def.id);
                    setDrafts((d) => ({ ...d, [def.id]: '' }));
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
