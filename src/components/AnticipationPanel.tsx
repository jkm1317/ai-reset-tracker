import { anticipate } from '../lib/stats';
import type { ProviderId, ResetEvent } from '../lib/types';

interface Props {
  provider: ProviderId;
  events: ResetEvent[];
  rivalEvents?: ResetEvent[];
  productName: string;
  /** Compact overview hero: big score + one-line why. Default true. */
  prominent?: boolean;
  /** Show full feature breakdown (provider tabs). */
  detailed?: boolean;
}

export function AnticipationPanel({
  provider,
  events,
  rivalEvents = [],
  productName,
  prominent = true,
  detailed = false,
}: Props) {
  const result = anticipate(provider, events, rivalEvents);
  const top =
    result.features.find((f) => f.weight > 0) ??
    result.features[0] ??
    null;
  const why = top?.detail ?? 'Waiting on more public signals.';

  return (
    <section
      className={`likelihood-box odds-tone-${result.oddsLabel}${prominent ? ' prominent' : ''}`}
      aria-label={`${productName} reset likelihood`}
    >
      <div className="likelihood-kicker">
        <span>Reset likelihood</span>
        <span className="likelihood-product">{productName}</span>
      </div>

      <div className="likelihood-hero">
        <div className={`odds-word odds-${result.oddsLabel}`}>{result.oddsLabel}</div>
        <div className="score-block">
          <span className="score-num">{result.score}</span>
          <span className="score-denom">/ 100</span>
        </div>
      </div>

      <p className="likelihood-why">
        <strong>Why:</strong> {why}
      </p>

      <p className="disclaimer-inline short">{result.disclaimer}</p>

      {detailed ? (
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
      ) : null}
    </section>
  );
}
