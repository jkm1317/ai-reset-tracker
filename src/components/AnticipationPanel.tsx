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

/**
 * UI-only honesty about 72h usefulness on the public announcement log.
 * Derived from blind weekly backtest ceilings — not live scorer output.
 * Do not surface OOS calibration or Brier skill claims here.
 */
const SIGNAL_HONESTY: Record<
  ProviderId,
  { useful: boolean; chip: string; detail?: string }
> = {
  claude: {
    useful: false,
    chip: '72h signal: not useful yet on public log',
    detail: 'Ceiling on this thin public log — score is a pattern hint, not confidence.',
  },
  grok: {
    useful: false,
    chip: '72h signal: not useful yet on public log',
    detail: 'Ceiling on this thin public log — score is a pattern hint, not confidence.',
  },
  codex: {
    useful: true,
    chip: 'Ranking clears bar · sample modest',
  },
};

export function AnticipationPanel({
  provider,
  events,
  rivalEvents = [],
  productName,
  prominent = true,
  detailed = false,
}: Props) {
  const result = anticipate(provider, events, rivalEvents);
  const honesty = SIGNAL_HONESTY[provider];
  const top =
    result.features.find((f) => f.weight > 0) ??
    result.features[0] ??
    null;
  const why = top?.detail ?? 'Waiting on more public signals.';

  return (
    <section
      className={`likelihood-box odds-tone-${result.oddsLabel}${prominent ? ' prominent' : ''}${
        honesty.useful ? '' : ' signal-sparse'
      }`}
      aria-label={`${productName} reset likelihood`}
    >
      <div className="likelihood-kicker">
        <span>Reset chance (~72h)</span>
        <span className="likelihood-product">{productName}</span>
      </div>

      <div className="likelihood-hero">
        <div className={`odds-word odds-${result.oddsLabel}`}>{result.oddsLabel}</div>
        <div className="score-block">
          <span className="score-num">{result.score}</span>
          <span className="score-denom">/ 100</span>
        </div>
      </div>

      <div
        className={`signal-honesty ${honesty.useful ? 'signal-ok' : 'signal-muted'}`}
        title={honesty.detail}
      >
        <span className="signal-chip">{honesty.chip}</span>
        {honesty.detail ? (
          <span className="signal-detail">{honesty.detail}</span>
        ) : null}
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
