import { useMemo, useState } from "react";
import HistoryList from "./components/HistoryList";
import PanelCard from "./components/PanelCard";
import { verseSearchService } from "./features/search";
import type { VerseResult } from "./types/verse";

function formatPreview(results: VerseResult[]): string {
  return results.map((result) => `${result.reference} ${result.text}`).join("\n\n");
}

export default function App() {
  const [input, setInput] = useState("");
  const [translationCode, setTranslationCode] = useState("KJV");
  const [status, setStatus] = useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [results, setResults] = useState<VerseResult[]>([]);
  const [queryDebug, setQueryDebug] = useState<string>("{}");

  const primaryResult = results[0];

  const metadata = useMemo(
    () => ({
      reference: results.length > 1 ? `${results[0].reference}...` : primaryResult?.reference ?? "—",
      translation: primaryResult?.translationCode ?? translationCode,
      status:
        status === "idle"
          ? "Waiting"
          : status === "searching"
            ? "Searching"
            : status === "found"
              ? "Previewed"
              : "No Result",
      matchType: primaryResult?.matchType ?? "none",
      confidence:
        typeof primaryResult?.confidence === "number"
          ? `${Math.round(primaryResult.confidence * 100)}%`
          : "—"
    }),
    [primaryResult, results, status, translationCode]
  );

  async function runSearch() {
    if (!input.trim()) {
      setStatus("idle");
      setResults([]);
      return;
    }

    setStatus("searching");
    const outcome = await verseSearchService.resolve(input, translationCode);
    setQueryDebug(JSON.stringify(outcome.query, null, 2));
    setResults(outcome.results);
    setStatus(outcome.status);
  }

  return (
    <main className="app-shell">
      <header className="app-shell__topbar">
        <div>
          <p className="eyebrow">Scripture Cue</p>
          <h1>Presentation Operator Console</h1>
        </div>
        <span className="service-pill">Local Bible DB Ready</span>
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
                  placeholder="Try: John 3:16 or First Corinthians 13 verse 4"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void runSearch();
                    }
                  }}
                />
                <button type="button" className="icon-button" onClick={() => void runSearch()}>
                  Go
                </button>
              </div>
            </div>

            <div className="select-wrap">
              <label htmlFor="translation" className="field-label">
                Translation
              </label>
              <select
                id="translation"
                value={translationCode}
                onChange={(event) => setTranslationCode(event.target.value)}
              >
                <option value="KJV">KJV</option>
              </select>
            </div>

            <div className="parser-debug" aria-label="Parser debug output">
              <p className="field-label">Parser Debug</p>
              <pre>{queryDebug}</pre>
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
              {status === "not_found"
                ? "No local verse match was found. Try a direct reference or a phrase from seeded passages."
                : results.length > 0
                  ? formatPreview(results)
                  : "Your selected verse will appear here after search."}
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
                <dd>{metadata.translation}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{metadata.status}</dd>
              </div>
              <div>
                <dt>Match</dt>
                <dd>{metadata.matchType}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{metadata.confidence}</dd>
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
