import { type FormEvent, useMemo, useState } from "react";
import HistoryList from "./components/HistoryList";
import PanelCard from "./components/PanelCard";
import { type SupportedTranslation } from "./data/localBibleDb";
import { buildMetadata, buildVersePreview } from "./features/display";
import { addHistoryEntry, type HistoryEntry } from "./features/history";
import { parseQuery } from "./features/parser";
import { searchVerses } from "./features/search";
import { DEFAULT_TRANSLATION, getTranslationOptions } from "./features/settings";
import { captureSpeech } from "./features/speech";

const SHOW_DEBUG = import.meta.env.DEV;

export default function App() {
  const [query, setQuery] = useState("");
  const [translation, setTranslation] = useState<SupportedTranslation>(DEFAULT_TRANSLATION);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [previewText, setPreviewText] = useState("No verse selected yet. Search by reference or keyword.");
  const [meta, setMeta] = useState({
    reference: "-",
    translationCode: "-",
    theme: "-",
    status: "Idle" as const
  });
  const [isListening, setIsListening] = useState(false);
  const [debugMessage, setDebugMessage] = useState("Ready");

  const translations = useMemo(() => getTranslationOptions(), []);

  const runSearch = (rawInput: string) => {
    const parsed = parseQuery(rawInput);
    const results = searchVerses(parsed, translation);
    setPreviewText(buildVersePreview(results));

    const metadata = buildMetadata(results);
    setMeta(metadata);

    if (results.length > 0) {
      const entry: HistoryEntry = {
        query: rawInput,
        reference: metadata.reference,
        translation,
        createdAt: Date.now()
      };
      setHistory((current) => addHistoryEntry(current, entry));
      setDebugMessage(`Parsed as ${parsed.kind}; found ${results.length} verse(s)`);
    } else {
      setDebugMessage(`Parsed as ${parsed.kind}; no verse matches in bundled DB`);
    }
  };

  const onSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }
    runSearch(query);
  };

  const onMicClick = async () => {
    setIsListening(true);
    const speech = await captureSpeech();
    setQuery(speech.transcript);
    runSearch(speech.transcript);
    setIsListening(false);
    setDebugMessage(`Speech source: ${speech.source}; transcript: "${speech.transcript}"`);
  };

  const onHistorySelect = (item: HistoryEntry) => {
    setQuery(item.query);
    runSearch(item.query);
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
            <form className="search-controls" onSubmit={onSearchSubmit}>
              <label htmlFor="query-input" className="field-label">
                Search
              </label>
              <div className="search-row">
                <input
                  id="query-input"
                  placeholder="Type verse reference or keywords"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Start voice search"
                  onClick={onMicClick}
                  disabled={isListening}
                >
                  {isListening ? "…" : "🎙"}
                </button>
              </div>
            </form>

            <div className="select-wrap">
              <label htmlFor="translation" className="field-label">
                Translation
              </label>
              <select
                id="translation"
                value={translation}
                onChange={(event) => setTranslation(event.target.value as SupportedTranslation)}
              >
                {translations.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </PanelCard>

          <PanelCard title="Recent History" subtitle="Quick recall for frequently used passages">
            <HistoryList items={history} onSelect={onHistorySelect} />
          </PanelCard>
        </aside>

        <section className="workspace-column workspace-column--right">
          <PanelCard
            title="Verse Preview"
            subtitle="Prepared for confidence monitor and projector output"
            className="preview-card"
          >
            <article className="verse-preview">
              <p>{previewText}</p>
            </article>
          </PanelCard>

          <PanelCard title="Metadata" subtitle="Review details before presenting">
            <dl className="metadata-grid">
              <div>
                <dt>Reference</dt>
                <dd>{meta.reference}</dd>
              </div>
              <div>
                <dt>Translation</dt>
                <dd>{meta.translationCode}</dd>
              </div>
              <div>
                <dt>Theme</dt>
                <dd>{meta.theme}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{meta.status}</dd>
              </div>
            </dl>
          </PanelCard>

          {SHOW_DEBUG ? (
            <PanelCard title="Parser Debug" subtitle="Visible in dev mode only">
              <p className="debug-text">{debugMessage}</p>
            </PanelCard>
          ) : null}

          <button type="button" className="present-button">
            Present Fullscreen
          </button>
        </section>
      </div>
    </main>
  );
}
