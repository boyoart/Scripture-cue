import { useMemo, useState } from "react";
import HistoryList from "./components/HistoryList";
import PanelCard from "./components/PanelCard";
import { parseVerseRequest } from "./features/parser";

const verseText = `The Lord is my shepherd, I lack nothing.
He makes me lie down in green pastures,
he leads me beside quiet waters,
he refreshes my soul.`;

export default function App() {
  const [queryText, setQueryText] = useState("");

  const parserResult = useMemo(() => parseVerseRequest(queryText), [queryText]);

  return (
    <main className="app-shell">
      <header className="app-shell__topbar">
        <div>
          <p className="eyebrow">Scripture Cue</p>
          <h1>Presentation Operator Console</h1>
        </div>
        <span className="service-pill">Live Session Ready</span>
      </header>

      <div className="workspace-grid">
        <aside className="workspace-column workspace-column--left">
          <PanelCard title="Scripture Search" subtitle="Find passage, topic, or reference">
            <div className="search-controls">
              <label htmlFor="query-input" className="field-label">
                Search
              </label>
              <div className="search-row">
                <input
                  id="query-input"
                  value={queryText}
                  onChange={(event) => setQueryText(event.target.value)}
                  placeholder="Type verse reference, spoken transcript, or keywords"
                />
                <button type="button" className="icon-button" aria-label="Start voice search">
                  🎙
                </button>
              </div>
            </div>

            <div className="select-wrap">
              <label htmlFor="translation" className="field-label">
                Translation
              </label>
              <select id="translation" defaultValue="NIV">
                <option value="NIV">NIV</option>
                <option value="ESV">ESV</option>
                <option value="KJV">KJV</option>
                <option value="NLT">NLT</option>
              </select>
            </div>

            <div className="parser-status" aria-live="polite">
              <p className="parser-status__title">Parser Debug Output</p>
              <p>
                Classification: <strong>{parserResult.query.kind}</strong>
              </p>
              <pre>{JSON.stringify(parserResult, null, 2)}</pre>
            </div>
          </PanelCard>

          <PanelCard title="Recent History" subtitle="Quick recall for frequently used passages">
            <HistoryList />
          </PanelCard>
        </aside>

        <section className="workspace-column workspace-column--right">
          <PanelCard
            title="Verse Preview"
            subtitle="Prepared for confidence monitor and projector output"
            className="preview-card"
          >
            <article className="verse-preview">
              <p>{verseText}</p>
            </article>
          </PanelCard>

          <PanelCard title="Metadata" subtitle="Review details before presenting">
            <dl className="metadata-grid">
              <div>
                <dt>Reference</dt>
                <dd>Psalm 23:1-3</dd>
              </div>
              <div>
                <dt>Translation</dt>
                <dd>NIV</dd>
              </div>
              <div>
                <dt>Theme</dt>
                <dd>Comfort &amp; Assurance</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Parser Ready (Search Pending)</dd>
              </div>
            </dl>
          </PanelCard>

          <button type="button" className="present-button">
            Present Fullscreen
          </button>
        </section>
      </div>
    </main>
  );
}
