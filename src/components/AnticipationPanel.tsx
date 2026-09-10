import { anticipate } from '../lib/stats';
import type { ProviderId, ResetEvent } from '../lib/types';

interface Props {
  provider: ProviderId;
  events: ResetEvent[];
  productName: string;
}

export function AnticipationPanel({ provider, events, productName }: Props) {
  if (provider === 'grok' || events.filter((e) => e.kind === 'reset').length < 2) {
    return (
      <section className="panel anticipation">
        <h3>Anticipator — {productName}</h3>
        <p className="muted">
          Not enough history yet (or provider is a stub). No odds to show.
        </p>
      </section>
    );
  }

  const result = anticipate(provider, events);

  return (
    <section className="panel anticipation">
      <div className="panel-head">
        <h3>Anticipator — {productName}</h3>
        <span className={`odds-pill odds-${result.oddsLabel}`}>
          {result.oddsLabel} · score {result.score}
        </span>
      </div>
      <p className="odds-summary">
        Descriptive odds only — based on drought vs mean gap, weekend proximity, and recent
        reason tags. <strong>Not a schedule guarantee.</strong>
      </p>
      <ul className="feature-list">
        {result.features.map((f) => (
          <li key={f.label}>
            <div className="feature-top">
              <strong>{f.label}</strong>
              <span className="weight">{f.weight > 0 ? `+${f.weight}` : f.weight}</span>
            </div>
            <div className="muted">{f.detail}</div>
          </li>
        ))}
      </ul>
      <p className="disclaimer-inline">{result.disclaimer}</p>
    </section>
  );
}
