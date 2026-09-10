interface Props {
  label: string;
  value: string;
  hint?: string;
  accent?: 'claude' | 'codex' | 'grok' | 'neutral';
}

export function StatCard({ label, value, hint, accent = 'neutral' }: Props) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}
