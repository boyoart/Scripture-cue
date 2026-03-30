import { useMemo, useState } from "react";
import { searchKjv, type SearchResult } from "./api";

type HistoryItem = {
  reference: string;
  timestamp: string;
};

const EMPTY_RESULT: SearchResult = {
  found: false,
  translation: "KJV",
  reference: "No result",
  theme: "Scripture Lookup",
  verses: [],
  message: "No result loaded yet."
};

export default function App() {
  const [reference, setReference] = useState("John 3:16");
  const [result, setResult] = useState<SearchResult>(EMPTY_RESULT);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState("Ready");
  const [isLoading, setIsLoading] = useState(false);

  const verseText = useMemo(() => {
    if (!result.found || result.verses.length === 0) {
      return result.message ?? "No result loaded yet.";
    }

    return result.verses.map((v) => `${v.verse}. ${v.text}`).join("\n");
  }, [result]);

  async function handleSearch() {
    const trimmed = reference.trim();
    if (!trimmed) return;

    try {
      setIsLoading(true);
      setStatus("Searching...");

      const response = await searchKjv(trimmed);
      console.log("frontend search response", response);

      setResult(response);

      if (response.found && response.verses.length > 0) {
        setHistory((prev) =>
          [
            {
              reference: response.reference,
              timestamp: new Date().toLocaleTimeString()
            },
            ...prev
          ].slice(0, 20)
        );

        setStatus("Verse loaded");
      } else {
        setStatus(response.message ?? "No result found");
      }
    } catch (error) {
      console.error("search failed", error);

      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
          ? error
          : JSON.stringify(error, null, 2);

      setResult({
        ...EMPTY_RESULT,
        message: `Search failed: ${message}`
      });

      setStatus("Search failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="eyebrow">SCRIPTURE CUE</div>
          <h1>Presentation Operator Console</h1>
        </div>
        <div className="pill">{status}</div>
      </div>

      <div className="grid">
        <div className="left-col">
          <section className="card">
            <h2>Scripture Search</h2>
            <p className="muted">Find passage, topic or reference</p>

            <label className="label">Search</label>
            <input
              className="input"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSearch();
              }}
              placeholder="Genesis 1:1"
            />

            <label className="label">Translation</label>
            <select className="input" value="KJV" disabled>
              <option value="KJV">KJV</option>
            </select>

            <button className="button" onClick={() => void handleSearch()} disabled={isLoading}>
              {isLoading ? "Searching..." : "Search"}
            </button>
          </section>

          <section className="card">
            <h2>Recent History</h2>
            <p className="muted">Newest successful matches first</p>

            {history.length === 0 ? (
              <div className="empty">No successful searches yet.</div>
            ) : (
              <div className="history-list">
                {history.map((item, idx) => (
                  <button
                    key={`${item.reference}-${idx}`}
                    className="history-item"
                    onClick={() => setReference(item.reference)}
                  >
                    <div className="history-ref">{item.reference}</div>
                    <div className="history-time">{item.timestamp}</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="right-col">
          <section className="card">
            <h2>Verse Preview</h2>
            <p className="muted">Prepared for confidence monitor and projector output</p>
            <div className="preview-box">
              <pre>{verseText}</pre>
            </div>
          </section>

          <section className="card metadata-card">
            <h2>Metadata</h2>
            <p className="muted">Review details before presenting</p>

            <div className="meta-grid">
              <div>
                <div className="meta-label">REFERENCE</div>
                <div className="meta-value">{result.reference}</div>
              </div>
              <div>
                <div className="meta-label">TRANSLATION</div>
                <div className="meta-value">{result.translation}</div>
              </div>
              <div>
                <div className="meta-label">THEME</div>
                <div className="meta-value">{result.theme}</div>
              </div>
              <div>
                <div className="meta-label">STATUS</div>
                <div className="meta-value">{result.found ? "Loaded" : "No Result"}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}