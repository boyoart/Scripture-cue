import { useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";
import HistoryList from "./components/HistoryList";
import PanelCard from "./components/PanelCard";
import { resolveSearchInput } from "./features/search";
import { normalizeSpokenTranscript } from "./features/speech";

type DebugState = {
  rawTranscript: string;
  normalizedReference: string;
  canonicalBookMatch: string;
  parserConfidence: number;
};

const EMPTY_DEBUG: DebugState = {
  rawTranscript: "",
  normalizedReference: "",
  canonicalBookMatch: "",
  parserConfidence: 0,
};

export default function App() {
  const [query, setQuery] = useState("");
  const [translation, setTranslation] = useState("NIV");
  const [reference, setReference] = useState("Psalm 23:1-3");
  const [verseText, setVerseText] = useState(
    "The Lord is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul.",
  );
  const [status, setStatus] = useState("Previewed");
  const [debug, setDebug] = useState<DebugState>(EMPTY_DEBUG);

  const confidencePercent = useMemo(() => `${Math.round(debug.parserConfidence * 100)}%`, [debug.parserConfidence]);

  const runTypedSearch = () => {
    const result = resolveSearchInput(query, translation);

    if (result.verse) {
      setReference(result.verse.reference);
      setVerseText(result.verse.text);
      setStatus("Previewed");
    } else {
      setStatus("No exact verse match");
    }

    setDebug({
      rawTranscript: query,
      normalizedReference: result.normalizedReference ?? query,
      canonicalBookMatch: result.canonicalBook ?? "",
      parserConfidence: result.confidence,
    });
  };

  const runSpeechSimulation = () => {
    const speech = normalizeSpokenTranscript(query);
    const result = resolveSearchInput(speech.transcript, translation);

    if (result.verse) {
      setReference(result.verse.reference);
      setVerseText(result.verse.text);
      setStatus("Previewed");
    } else {
      setStatus("Spoken request parsed, verse unavailable in local sample DB");
    }

    setDebug({
      rawTranscript: speech.debug.rawTranscript,
      normalizedReference: speech.debug.normalizedReference,
      canonicalBookMatch: speech.debug.canonicalBookMatch ?? "",
      parserConfidence: speech.debug.parserConfidence,
    });
  };

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
                  placeholder="Type verse reference or keywords"
                  value={query}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") runTypedSearch();
                  }}
                />
                <button type="button" className="icon-button" aria-label="Start voice search" onClick={runSpeechSimulation}>
                  🎙
                </button>
              </div>
            </div>

            <div className="select-wrap">
              <label htmlFor="translation" className="field-label">
                Translation
              </label>
              <select id="translation" value={translation} onChange={(event: ChangeEvent<HTMLSelectElement>) => setTranslation(event.target.value)}>
                <option value="NIV">NIV</option>
                <option value="ESV">ESV</option>
                <option value="KJV">KJV</option>
                <option value="NLT">NLT</option>
              </select>
            </div>

            <button type="button" className="search-button" onClick={runTypedSearch}>
              Search
            </button>
          </PanelCard>

          <PanelCard title="Recent History" subtitle="Quick recall for frequently used passages">
            <HistoryList />
          </PanelCard>

          <PanelCard title="Speech Parser Debug (Temporary)" subtitle="Current transcript normalization output">
            <dl className="debug-grid">
              <div>
                <dt>Raw transcript</dt>
                <dd>{debug.rawTranscript || "—"}</dd>
              </div>
              <div>
                <dt>Normalized reference</dt>
                <dd>{debug.normalizedReference || "—"}</dd>
              </div>
              <div>
                <dt>Canonical book match</dt>
                <dd>{debug.canonicalBookMatch || "—"}</dd>
              </div>
              <div>
                <dt>Parser confidence</dt>
                <dd>{confidencePercent}</dd>
              </div>
            </dl>
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
                <dd>{reference}</dd>
              </div>
              <div>
                <dt>Translation</dt>
                <dd>{translation}</dd>
              </div>
              <div>
                <dt>Theme</dt>
                <dd>Comfort & Assurance</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{status}</dd>
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
