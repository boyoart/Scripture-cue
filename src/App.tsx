import { useCallback, useEffect, useMemo, useState } from "react";
import { searchKjv, type SearchResult } from "./api";
import MicrophoneMeter from "./components/MicrophoneMeter";
import { normalizeTranscriptToReference } from "./features/parser";
import { useSpeechMeter } from "./features/speech/useSpeechMeter";

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
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const { bars, micState, transcript, errorMessage, listening, startListening, stopListening } = useSpeechMeter();

  const verseText = useMemo(() => {
    if (!result.found || result.verses.length === 0) {
      return result.message ?? "No result loaded yet.";
    }

    return result.verses.map((v) => `${v.verse}. ${v.text}`).join("\n");
  }, [result]);

  const handleSearch = useCallback(async (overrideReference?: string) => {
    const trimmed = (overrideReference ?? reference).trim();
    if (!trimmed) return;

    try {
      setIsLoading(true);
      setStatus("Searching...");

      const response = await searchKjv(trimmed);
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
  }, [reference]);

  async function handleStartListening() {
    setSpeechNotice(null);
    await startListening();
  }

  function handleStopListening() {
    stopListening("idle");
    setStatus("Listening stopped");
  }

  const runSpeechSearch = useCallback(async (spokenTranscript: string) => {
    if (!spokenTranscript.trim()) {
      return;
    }

    const normalized = normalizeTranscriptToReference(spokenTranscript, "KJV");
    const normalizedValue = normalized.normalizedReference.trim();
    const canAutoSearch =
      normalized.query.kind === "spoken_reference" &&
      Boolean(normalized.structuredReference) &&
      normalized.confidence >= 0.7;
    const nextReference = canAutoSearch ? normalizedValue || spokenTranscript.trim() : spokenTranscript.trim();
    setReference(nextReference);

    if (canAutoSearch) {
      setSpeechNotice(`Heard: "${spokenTranscript}" → ${nextReference}`);
      await handleSearch(nextReference);
    } else {
      setSpeechNotice(`Heard: "${spokenTranscript}" (review before search)`);
    }
  }, [handleSearch]);

  useEffect(() => {
    if (micState !== "success" || !transcript.trim()) {
      return;
    }

    void runSpeechSearch(transcript);
  }, [micState, runSpeechSearch, transcript]);

  return (
    <div className="app-shell">
      <header className="app-shell__topbar">
        <div>
          <p className="eyebrow">SCRIPTURE CUE</p>
          <h1>Presentation Operator Console</h1>
        </div>
        <div className="service-pill">{status}</div>
      </header>

      <div className="workspace-grid">
        <div className="workspace-column">
          <section className="panel-card">
            <header className="panel-card__header">
              <h2>Scripture Search</h2>
              <p>Operator-ready lookup with the bundled KJV database.</p>
            </header>

            <div className="panel-card__body search-controls">
              <label className="field-label" htmlFor="reference-input">
                Reference
              </label>
              <div className="search-row">
                <input
                  id="reference-input"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSearch();
                  }}
                  placeholder="Genesis 1:1"
                />
                <button
                  className="run-search-button"
                  onClick={() => void handleSearch()}
                  disabled={isLoading}
                >
                  {isLoading ? "Searching..." : "Search"}
                </button>
              </div>

              <div className="mic-controls-row">
                <button
                  className={`mic-toggle-button ${listening ? "mic-toggle-button--live" : ""}`}
                  onClick={() => {
                    if (listening) {
                      handleStopListening();
                    } else {
                      void handleStartListening();
                    }
                  }}
                  disabled={isLoading}
                >
                  {listening ? "Stop Listening" : "Start Listening"}
                </button>
                <span className={`mic-state-chip mic-state-chip--${micState}`}>
                  {listening ? "Listening..." : micState === "error" ? "Mic Error" : "Mic Ready"}
                </span>
              </div>

              <MicrophoneMeter bars={bars} micState={micState} />
              {errorMessage ? <p className="mic-status-line mic-status-line--error">{errorMessage}</p> : null}
              {speechNotice ? <p className="mic-status-line">{speechNotice}</p> : null}

              <div className="translation-row">
                <label className="field-label" htmlFor="translation-select">
                  Translation
                </label>
                <select id="translation-select" value="KJV" disabled>
                  <option value="KJV">KJV</option>
                </select>
              </div>
            </div>
          </section>

          <section className="panel-card">
            <header className="panel-card__header">
              <h2>Recent History</h2>
              <p>Newest successful scripture loads appear first.</p>
            </header>

            <div className="panel-card__body">
              {history.length === 0 ? (
                <p className="history-empty">No successful searches yet.</p>
              ) : (
                <ul className="history-list">
                  {history.map((item, idx) => (
                    <li key={`${item.reference}-${idx}`}>
                      <button
                        className="history-list__item"
                        onClick={() => setReference(item.reference)}
                      >
                        <span className="history-list__reference">{item.reference}</span>
                        <span className="history-list__meta">Ready to search</span>
                        <span className="history-list__time">{item.timestamp}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <div className="workspace-column">
          <section className="panel-card preview-card">
            <header className="panel-card__header">
              <h2>Verse Preview</h2>
              <p>Large-format text for confidence monitor and projection checks.</p>
            </header>

            <div className="panel-card__body">
              <pre className={`verse-preview ${result.found ? "" : "verse-preview--empty"}`}>{verseText}</pre>
            </div>
          </section>

          <section className="panel-card">
            <header className="panel-card__header">
              <h2>Metadata</h2>
              <p>Quick validation details for the currently loaded passage.</p>
            </header>

            <div className="panel-card__body">
              <dl className="metadata-grid">
                <div>
                  <dt>Reference</dt>
                  <dd>{result.reference}</dd>
                </div>
                <div>
                  <dt>Translation</dt>
                  <dd>{result.translation}</dd>
                </div>
                <div>
                  <dt>Theme</dt>
                  <dd>{result.theme}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{result.found ? "Loaded" : "No Result"}</dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
