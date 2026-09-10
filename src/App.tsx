import { useEffect, useState } from 'react';
import { AnticipationPanel } from './components/AnticipationPanel';
import { Archive } from './components/Archive';
import { Comparison } from './components/Comparison';
import { CountdownPanel } from './components/CountdownPanel';
import { ProviderHero } from './components/ProviderHero';
import { Timeline } from './components/Timeline';
import { rivalCatalog } from './lib/stats';
import type { ResetsDataset, SummaryDataset } from './lib/types';
import './App.css';

type Tab = 'overview' | 'claude' | 'codex' | 'grok' | 'compare' | 'personal';

export default function App() {
  const [data, setData] = useState<ResetsDataset | null>(null);
  const [summary, setSummary] = useState<SummaryDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/resets.json`).then((r) => {
        if (!r.ok) throw new Error(`resets.json ${r.status}`);
        return r.json();
      }),
      fetch(`${import.meta.env.BASE_URL}data/summary.json`).then((r) => {
        if (!r.ok) throw new Error(`summary.json ${r.status}`);
        return r.json();
      }),
    ])
      .then(([resets, sum]) => {
        setData(resets);
        setSummary(sum);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="app shell">
        <p className="error">Failed to load data: {error}</p>
      </div>
    );
  }

  if (!data || !summary) {
    return (
      <div className="app shell">
        <p className="muted">Loading reset catalogs…</p>
      </div>
    );
  }

  const claude = data.providers.claude;
  const codex = data.providers.codex;
  const grok = data.providers.grok;

  const byProvider = {
    claude: claude.events,
    codex: codex.events,
    grok: grok.events,
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ↻
          </span>
          <div>
            <h1>AI Reset Tracker</h1>
            <p className="tagline">
              Likelihood-first usage-limit resets for Claude Code, Codex / ChatGPT, and Grok
            </p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {(
            [
              ['overview', 'Overview'],
              ['claude', 'Claude'],
              ['codex', 'Codex'],
              ['grok', 'Grok'],
              ['compare', 'Compare'],
              ['personal', 'My /usage'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="shell">
        <aside className="disclaimer banner">
          Unofficial community tracker. <strong>Not affiliated</strong> with Anthropic, OpenAI,
          xAI, Claude, Codex, or Grok. Odds are historical pattern hints — not guarantees.
        </aside>

        {tab === 'overview' && (
          <>
            <p className="section-lead">
              <strong>Will they reset soon?</strong> Likelihood boxes first. History stays secondary
              below.
            </p>
            <div className="provider-columns">
              {(
                [
                  ['claude', claude, 'Claude Code'],
                  ['codex', codex, 'Codex / ChatGPT'],
                  ['grok', grok, 'Grok / xAI'],
                ] as const
              ).map(([id, meta, product]) => (
                <div className="provider-column" key={id}>
                  <AnticipationPanel
                    provider={id}
                    events={meta.events}
                    rivalEvents={rivalCatalog(byProvider, id)}
                    productName={product}
                    prominent
                  />
                  <ProviderHero id={id} meta={meta} compact />
                </div>
              ))}
            </div>
            <Timeline
              claudeEvents={claude.events}
              codexEvents={codex.events}
              grokEvents={grok.events}
            />
          </>
        )}

        {tab === 'claude' && (
          <>
            <AnticipationPanel
              provider="claude"
              events={claude.events}
              rivalEvents={rivalCatalog(byProvider, 'claude')}
              productName="Claude Code"
              prominent
              detailed
            />
            <ProviderHero id="claude" meta={claude} />
            <Archive events={claude.events} title="Claude announcement archive" />
          </>
        )}

        {tab === 'codex' && (
          <>
            <AnticipationPanel
              provider="codex"
              events={codex.events}
              rivalEvents={rivalCatalog(byProvider, 'codex')}
              productName="Codex / ChatGPT"
              prominent
              detailed
            />
            <ProviderHero id="codex" meta={codex} />
            <Archive events={codex.events} title="Codex announcement archive" />
          </>
        )}

        {tab === 'grok' && (
          <>
            <AnticipationPanel
              provider="grok"
              events={grok.events}
              rivalEvents={rivalCatalog(byProvider, 'grok')}
              productName="Grok / xAI"
              prominent
              detailed
            />
            <ProviderHero id="grok" meta={grok} />
            <Archive events={grok.events} title="Grok / xAI public signals" />
          </>
        )}

        {tab === 'compare' && (
          <>
            <Comparison claudeEvents={claude.events} codexEvents={codex.events} />
            <Timeline
              claudeEvents={claude.events}
              codexEvents={codex.events}
              grokEvents={grok.events}
            />
          </>
        )}

        {tab === 'personal' && <CountdownPanel />}
      </main>

      <footer className="footer shell">
        <div>
          <strong>Data</strong>
          <ul>
            <li>
              <a href={`${import.meta.env.BASE_URL}data/summary.json`}>/data/summary.json</a>
            </li>
            <li>
              <a href={`${import.meta.env.BASE_URL}data/resets.json`}>/data/resets.json</a>
            </li>
            <li>
              <a href={`${import.meta.env.BASE_URL}llms.txt`}>/llms.txt</a>
            </li>
            <li>
              <a href={`${import.meta.env.BASE_URL}rss.xml`}>/rss.xml</a>
            </li>
          </ul>
        </div>
        <div>
          <strong>Attribution</strong>
          <ul>
            {data.meta.attribution.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="muted small">
            Seed generated {summary.generatedAt}. Inspired by{' '}
            <a href="https://claude-resets.com/" target="_blank" rel="noopener noreferrer">
              claude-resets.com
            </a>{' '}
            and{' '}
            <a href="https://codex-resets.com/" target="_blank" rel="noopener noreferrer">
              codex-resets.com
            </a>{' '}
            (UX study only — no proprietary code copied).
          </p>
        </div>
      </footer>
    </div>
  );
}
