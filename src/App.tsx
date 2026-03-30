import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchKjv, type SearchResult } from "./api";
import MicrophoneMeter from "./components/MicrophoneMeter";
import { normalizeTranscriptToReference, type NormalizedResult } from "./features/parser";
import { CANONICAL_BOOK_DICTIONARY } from "./features/parser/spokenBookMatcher";
import { useSpeechMeter } from "./features/speech/useSpeechMeter";

type HistoryItem = {
  reference: string;
  timestamp: string;
};

type ListeningWorkflowState = "idle" | "listening" | "processing" | "verse_loaded" | "error";

const HISTORY_DUPLICATE_COOLDOWN_MS = 10_000;
const AUTO_SEARCH_DUPLICATE_COOLDOWN_MS = 8_000;

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
  const [speechDebug, setSpeechDebug] = useState<NormalizedResult | null>(null);
  const [listeningState, setListeningState] = useState<ListeningWorkflowState>("idle");
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [showPresentationReference, setShowPresentationReference] = useState(true);
  const lastHistoryEntryRef = useRef<{ reference: string; timestampMs: number } | null>(null);
  const lastAutoSearchRef = useRef<{ normalizedReference: string; timestampMs: number } | null>(null);
  const { bars, micState, transcript, errorMessage, listening, startListening, stopListening } = useSpeechMeter();

  const verseText = useMemo(() => {
    if (!result.found || result.verses.length === 0) {
      return result.message ?? "No result loaded yet.";
    }

    return result.verses.map((v) => `${v.verse}. ${v.text}`).join("\n");
  }, [result]);

  const pushHistoryWithCooldown = useCallback((nextReference: string) => {
    const now = Date.now();
    const last = lastHistoryEntryRef.current;

    const isDuplicateWithinCooldown =
      last?.reference === nextReference && now - last.timestampMs < HISTORY_DUPLICATE_COOLDOWN_MS;

    if (isDuplicateWithinCooldown) {
      return;
    }

    lastHistoryEntryRef.current = { reference: nextReference, timestampMs: now };

    setHistory((prev) =>
      [
        {
          reference: nextReference,
          timestamp: new Date(now).toLocaleTimeString()
        },
        ...prev
      ].slice(0, 20)
    );
  }, []);

  const handleSearch = useCallback(async (overrideReference?: string) => {
    const trimmed = (overrideReference ?? reference).trim();
    if (!trimmed) return;

    try {
      setIsLoading(true);
      setStatus("Searching...");
      setListeningState("processing");

      const response = await searchKjv(trimmed);
      setResult(response);

      if (response.found && response.verses.length > 0) {
        pushHistoryWithCooldown(response.reference);
        setListeningState("verse_loaded");
        setStatus("Verse loaded");
      } else {
        setListeningState("idle");
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

      setListeningState("error");
      setStatus("Search failed");
    } finally {
      setIsLoading(false);
    }
  }, [pushHistoryWithCooldown, reference]);

  async function handleStartListening() {
    setSpeechNotice(null);
    setListeningState("listening");
    await startListening();
  }

  function handleStopListening() {
    stopListening("idle");
    setListeningState("idle");
    setStatus("Listening stopped");
  }

  const runSpeechSearch = useCallback(async (spokenTranscript: string) => {
    if (!spokenTranscript.trim()) {
      return;
    }

    const normalized = normalizeTranscriptToReference(spokenTranscript, "KJV");
    setSpeechDebug(normalized);

    const normalizedValue = normalized.normalizedReference.trim();
    const canAutoSearch =
      normalized.query.kind === "spoken_reference" &&
      normalized.ambiguity === "clear" &&
      Boolean(normalized.structuredReference) &&
      normalized.confidence >= 0.74;
    const nextReference = canAutoSearch ? normalizedValue || spokenTranscript.trim() : spokenTranscript.trim();
    setReference(nextReference);

    if (!canAutoSearch) {
      setListeningState("idle");
      setSpeechNotice(`Heard: "${spokenTranscript}" (review before search)`);
      return;
    }

    const now = Date.now();
    const lastAutoSearch = lastAutoSearchRef.current;
    const duplicateAutoSearch =
      lastAutoSearch?.normalizedReference === nextReference &&
      now - lastAutoSearch.timestampMs < AUTO_SEARCH_DUPLICATE_COOLDOWN_MS;

    if (duplicateAutoSearch) {
      setListeningState("idle");
      setSpeechNotice(`Heard duplicate reference "${nextReference}" (suppressed)`);
      return;
    }

    lastAutoSearchRef.current = { normalizedReference: nextReference, timestampMs: now };
    setSpeechNotice(`Heard: "${spokenTranscript}" → ${nextReference}`);
    await handleSearch(nextReference);
  }, [handleSearch]);

  useEffect(() => {
    if (micState === "listening") {
      setListeningState("listening");
      return;
    }

    if (micState === "processing") {
      setListeningState("processing");
      return;
    }

    if (micState === "error") {
      setListeningState("error");
      return;
    }

    if (micState === "idle" && listeningState === "listening") {
      setListeningState("idle");
    }
  }, [listeningState, micState]);

  useEffect(() => {
    if (micState !== "success" || !transcript.trim()) {
      return;
    }

    void runSpeechSearch(transcript);
  }, [micState, runSpeechSearch, transcript]);

  const listeningStateLabel = useMemo(() => {
    switch (listeningState) {
      case "listening":
        return "Listening";
      case "processing":
        return "Processing";
      case "verse_loaded":
        return "Verse Loaded";
      case "error":
        return "Error";
      case "idle":
      default:
        return "Idle";
    }
  }, [listeningState]);

  const togglePresentationMode = useCallback(async () => {
    const root = document.documentElement;

    if (!document.fullscreenElement) {
      await root.requestFullscreen();
      setIsPresentationMode(true);
      return;
    }

    await document.exitFullscreen();
    setIsPresentationMode(false);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsPresentationMode(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  return (
    <>
      <div className={`app-shell ${isPresentationMode ? "app-shell--presentation-active" : ""}`}>
        <header className="app-shell__topbar">
          <div>
            <p className="eyebrow">SCRIPTURE CUE</p>
            <h1>Presentation Operator Console</h1>
          </div>
          <div className="topbar-actions">
            <div className="service-pill">{status}</div>
            <button
              className="present-button"
              onClick={() => void togglePresentationMode()}
              disabled={isLoading}
            >
              {isPresentationMode ? "Exit Fullscreen" : "Present Fullscreen"}
            </button>
          </div>
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
                <span className={`mic-state-chip mic-state-chip--${listeningState}`}>
                  {listeningStateLabel}
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

              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={showPresentationReference}
                  onChange={(e) => setShowPresentationReference(e.target.checked)}
                />
                Show reference in presenter view
              </label>
            </div>
          </section>

          <section className="panel-card">
            <header className="panel-card__header">
              <h2>Speech Debug</h2>
              <p>Shows transcript parsing, confidence, and ambiguity before auto-search.</p>
            </header>

            <div className="panel-card__body">
              {speechDebug ? (
                <dl className="debug-grid">
                  <div>
                    <dt>Heard transcript</dt>
                    <dd>{speechDebug.rawTranscript}</dd>
                  </div>
                  <div>
                    <dt>Matched book</dt>
                    <dd>{speechDebug.canonicalBook ?? "Uncertain"}</dd>
                  </div>
                  <div>
                    <dt>Normalized reference</dt>
                    <dd>{speechDebug.normalizedReference}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{(speechDebug.confidence * 100).toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>Ambiguity</dt>
                    <dd>{speechDebug.ambiguity === "clear" ? "Clear" : "Ambiguous - manual review"}</dd>
                  </div>
                  <div>
                    <dt>Book source</dt>
                    <dd>{speechDebug.debug.bookMatchSource}</dd>
                  </div>
                  {speechDebug.debug.reason ? (
                    <div>
                      <dt>Match note</dt>
                      <dd>{speechDebug.debug.reason}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="history-empty">No speech transcript captured yet.</p>
              )}
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

          <section className="panel-card">
            <header className="panel-card__header">
              <h2>Canonical Book Coverage</h2>
              <p>Configured spoken-book dictionary for all supported KJV books.</p>
            </header>
            <div className="panel-card__body">
              <p className="coverage-count">{CANONICAL_BOOK_DICTIONARY.length} books configured.</p>
            </div>
          </section>
        </div>
        </div>
      </div>

      {isPresentationMode ? (
        <section className="presentation-mode" aria-live="polite">
          <button className="presentation-exit-button" onClick={() => void togglePresentationMode()}>
            Exit Fullscreen
          </button>
          <div className="presentation-mode__content">
            {showPresentationReference ? (
              <p className="presentation-mode__reference">{result.reference}</p>
            ) : null}
            <pre className={`presentation-mode__verse ${result.found ? "" : "presentation-mode__verse--empty"}`}>
              {verseText}
            </pre>
          </div>
        </section>
      ) : null}
    </>
  );
}
