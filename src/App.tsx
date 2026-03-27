import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import HistoryList, { type HistoryItem } from "./components/HistoryList";
import PanelCard from "./components/PanelCard";
import { parseVerseQuery } from "./features/parser";
import { buildPreviewMetadata } from "./features/display";
import { getAvailableTranslations } from "./features/settings";
import { localBibleProvider } from "./features/search";
import type { VerseResult } from "./types/verse";

function getTimeLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const translations = useMemo(() => getAvailableTranslations(), []);
  const [queryText, setQueryText] = useState("Psalm 23:1-3");
  const [translationCode, setTranslationCode] = useState(translations[0]?.code ?? "KJV");
  const [results, setResults] = useState<VerseResult[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const metadata = useMemo(
    () => buildPreviewMetadata(results, translationCode),
    [results, translationCode]
  );

  async function runSearch() {
    const query = parseVerseQuery(queryText, translationCode);
    const nextResults = await localBibleProvider.search(query);

    setResults(nextResults);

    if (nextResults[0]) {
      setHistory((previous) => [
        {
          reference: nextResults[0].reference,
          translation: nextResults[0].translationCode,
          timeLabel: getTimeLabel()
        },
        ...previous
      ].slice(0, 8));
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await runSearch();
  }

  async function onQueryEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      await runSearch();
    }
  }

  const verseText =
    results.length > 0
      ? results.map((verse) => `${verse.reference} — ${verse.text}`).join("\n")
      : "No verses found for the current query. Try a reference like John 3:16 or a phrase like 'God so loved'.";

  return (
    <main className="app-shell">
      <header className="app-shell__topbar">
        <div>
          <p className="eyebrow">Scripture Cue</p>
          <h1>Presentation Operator Console</h1>
        </div>
        <span className="service-pill">Local Bible DB Bundled</span>
      </header>

      <div className="workspace-grid">
        <aside className="workspace-column workspace-column--left">
          <PanelCard title="Scripture Search" subtitle="Find passage, topic, or reference">
            <form className="search-controls" onSubmit={onSubmit}>
              <label htmlFor="query-input" className="field-label">
                Search
              </label>
              <div className="search-row">
                <input
                  id="query-input"
                  value={queryText}
                  onChange={(event) => setQueryText(event.target.value)}
                  onKeyDown={onQueryEnter}
                  placeholder="Type verse reference or keywords"
                />
                <button type="submit" className="icon-button" aria-label="Run search">
                  🔎
                </button>
              </div>
            </form>

            <div className="select-wrap">
              <label htmlFor="translation" className="field-label">
                Translation
              </label>
              <select
                id="translation"
                value={translationCode}
                onChange={(event) => setTranslationCode(event.target.value)}
              >
                {translations.map((translation) => (
                  <option key={translation.code} value={translation.code}>
                    {translation.code} — {translation.name}
                  </option>
                ))}
              </select>
            </div>
          </PanelCard>

          <PanelCard title="Recent History" subtitle="Quick recall for frequently used passages">
            <HistoryList items={history} />
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
                <dd>{metadata.reference}</dd>
              </div>
              <div>
                <dt>Translation</dt>
                <dd>{metadata.translationName}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{metadata.source}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{metadata.status} ({metadata.verseCount} verses)</dd>
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
