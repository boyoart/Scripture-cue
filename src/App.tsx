import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/window";
import { save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";
import { writeText } from "@tauri-apps/api/clipboard";
import { searchKjv, type SearchResult } from "./api";
import MicrophoneMeter from "./components/MicrophoneMeter";
import { normalizeTranscriptToReference, type NormalizedResult } from "./features/parser";
import { CANONICAL_BOOK_DICTIONARY } from "./features/parser/spokenBookMatcher";
import { useSpeechMeter } from "./features/speech/useSpeechMeter";
import {
  PROJECTOR_WINDOW_LABEL,
  PROJECTOR_STATE_EVENT,
  getProjectorRouteUrl,
  writeProjectorState,
  type ProjectorPayload,
  type ReferencePlacement
} from "./features/display/projectorSync";
import {
  addSessionLogEntry,
  formatSessionTimestamp,
  toSessionLogCsv,
  toSessionLogText,
  type SessionLogEntry,
  type SessionSourceType
} from "./features/history/sessionLog";

type HistoryItem = {
  reference: string;
  timestampMs: number;
  repeats: number;
};

type ListeningWorkflowState = "idle" | "listening" | "processing" | "verse_loaded" | "error";
type SessionLogFilter = "all" | "typed" | "spoken";

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
  const [sessionLog, setSessionLog] = useState<SessionLogEntry[]>([]);
  const [sessionLogFilter, setSessionLogFilter] = useState<SessionLogFilter>("all");
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [isLoading, setIsLoading] = useState(false);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [speechDebug, setSpeechDebug] = useState<NormalizedResult | null>(null);
  const [listeningState, setListeningState] = useState<ListeningWorkflowState>("idle");
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [showPresentationReference, setShowPresentationReference] = useState(true);
  const [referencePlacement, setReferencePlacement] = useState<ReferencePlacement>("top-left");
  const [useSafeMargins, setUseSafeMargins] = useState(true);
  const [isProjectorWindowOpen, setIsProjectorWindowOpen] = useState(false);
  const projectorWindowRef = useRef<WebviewWindow | null>(null);
  const lastHistoryEntryRef = useRef<{ reference: string; timestampMs: number } | null>(null);
  const lastAutoSearchRef = useRef<{ normalizedReference: string; timestampMs: number } | null>(null);
  const { bars, micState, transcript, errorMessage, listening, startListening, stopListening } = useSpeechMeter();

  const verseText = useMemo(() => {
    if (!result.found || result.verses.length === 0) {
      return result.message ?? "No result loaded yet.";
    }

    return result.verses.map((v) => `${v.verse}. ${v.text}`).join("\n");
  }, [result]);

  const projectorPayload: ProjectorPayload = useMemo(
    () => ({
      result,
      verseText,
      showReference: showPresentationReference,
      referencePlacement,
      useSafeMargins
    }),
    [result, referencePlacement, showPresentationReference, useSafeMargins, verseText]
  );

  useEffect(() => {
    writeProjectorState(projectorPayload);
    void emit(PROJECTOR_STATE_EVENT, projectorPayload).catch((error) => {
      console.warn("[projector] failed to emit sync event", error);
    });
  }, [projectorPayload]);

  const filteredSessionLog = useMemo(() => {
    if (sessionLogFilter === "all") {
      return sessionLog;
    }

    return sessionLog.filter((entry) => entry.sourceType === sessionLogFilter);
  }, [sessionLog, sessionLogFilter]);

  const pushHistoryWithCooldown = useCallback((nextReference: string) => {
    const now = Date.now();
    const last = lastHistoryEntryRef.current;

    const isDuplicateWithinCooldown =
      last?.reference === nextReference && now - last.timestampMs < HISTORY_DUPLICATE_COOLDOWN_MS;

    lastHistoryEntryRef.current = { reference: nextReference, timestampMs: now };

    setHistory((prev) => {
      if (isDuplicateWithinCooldown) {
        return prev;
      }

      const existingIndex = prev.findIndex((item) => item.reference === nextReference);
      if (existingIndex >= 0) {
        const existingItem = prev[existingIndex];
        const nextEntry: HistoryItem = {
          ...existingItem,
          timestampMs: now,
          repeats: existingItem.repeats + 1
        };
        const withoutExisting = prev.filter((_, index) => index !== existingIndex);
        return [nextEntry, ...withoutExisting].slice(0, 20);
      }

      return [
        {
          reference: nextReference,
          timestampMs: now,
          repeats: 1
        },
        ...prev
      ].slice(0, 20);
    });
  }, []);

  const syncProjectorNow = useCallback(async (nextStatus = "Projector updated") => {
    writeProjectorState(projectorPayload);
    try {
      await emit(PROJECTOR_STATE_EVENT, projectorPayload);
      setStatus(nextStatus);
    } catch (error) {
      console.warn("[projector] manual sync failed", error);
      setStatus("Projector sync failed");
    }
  }, [projectorPayload]);

  const handleClearCurrentVerse = useCallback(() => {
    setResult({
      ...EMPTY_RESULT,
      message: "Verse cleared by operator."
    });
    setListeningState("idle");
    setStatus("Current verse cleared");
  }, []);

  const handleRepresentCurrentVerse = useCallback(() => {
    void syncProjectorNow("Current verse re-presented");
  }, [syncProjectorNow]);

  const handleSearch = useCallback(async (overrideReference?: string, sourceType: SessionSourceType = "typed") => {
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
        setSessionLog((prev) =>
          addSessionLogEntry(prev, {
            reference: response.reference,
            sourceType
          })
        );
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
    await handleSearch(nextReference, "spoken");
  }, [handleSearch]);

  const exportSessionLog = useCallback(async (format: "txt" | "csv") => {
    try {
      setSessionNotice(null);
      const suggestedName = `scripture-cue-session-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.${format}`;
      const targetPath = await save({
        defaultPath: suggestedName,
        filters:
          format === "txt"
            ? [{ name: "Text", extensions: ["txt"] }]
            : [{ name: "CSV", extensions: ["csv"] }]
      });

      if (!targetPath) {
        setStatus("Session export canceled");
        setSessionNotice("Export canceled.");
        return;
      }

      const content = format === "txt" ? toSessionLogText(sessionLog) : toSessionLogCsv(sessionLog);
      await writeTextFile(targetPath, content);
      setStatus(`Session log exported (${format.toUpperCase()})`);
      setSessionNotice(`Exported ${format.toUpperCase()} to ${targetPath}`);
    } catch (error) {
      console.error("[session] export failed", error);
      const details =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error);
      setStatus("Session export failed");
      setSessionNotice(`Export failed: ${details}`);
    }
  }, [sessionLog]);

  const handleClearSessionLog = useCallback(() => {
    if (sessionLog.length === 0) {
      setSessionNotice("Session log is already empty.");
      return;
    }

    const confirmed = window.confirm("Clear the session log for this service? Current verse will stay loaded.");
    if (!confirmed) {
      return;
    }

    setSessionLog([]);
    setSessionNotice("Session log cleared.");
    setStatus("Session log cleared");
  }, [sessionLog.length]);

  const handleCopyCurrentReference = useCallback(async () => {
    if (!result.reference || result.reference === EMPTY_RESULT.reference) {
      setSessionNotice("No loaded reference to copy.");
      return;
    }

    try {
      await writeText(result.reference);
      setSessionNotice(`Copied reference: ${result.reference}`);
      setStatus("Current reference copied");
    } catch (error) {
      console.error("[session] copy reference failed", error);
      const details =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error);
      setSessionNotice(`Copy failed: ${details}`);
      setStatus("Copy reference failed");
    }
  }, [result.reference]);

  const handleRecallSessionEntry = useCallback(async (entry: SessionLogEntry) => {
    setReference(entry.reference);
    await handleSearch(entry.reference, entry.sourceType);
  }, [handleSearch]);

  useEffect(() => {
    const existingWindow = WebviewWindow.getByLabel(PROJECTOR_WINDOW_LABEL);
    if (!existingWindow) {
      setIsProjectorWindowOpen(false);
      projectorWindowRef.current = null;
      return;
    }

    projectorWindowRef.current = existingWindow;
    setIsProjectorWindowOpen(true);

    const unlistenPromise = existingWindow.once("tauri://close-requested", () => {
      projectorWindowRef.current = null;
      setIsProjectorWindowOpen(false);
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

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

  const handleOpenProjectorView = useCallback(async () => {
    const existing = WebviewWindow.getByLabel(PROJECTOR_WINDOW_LABEL);

    if (existing) {
      projectorWindowRef.current = existing;
      setIsProjectorWindowOpen(true);
      await existing.show();
      await existing.setFocus();
      setStatus("Projector view focused");
      return;
    }

    try {
      const projectorWindow = new WebviewWindow(PROJECTOR_WINDOW_LABEL, {
        url: getProjectorRouteUrl(window.location.pathname),
        title: "Scripture Cue Projector",
        width: 1600,
        height: 900,
        resizable: true,
        fullscreen: false,
        decorations: true,
        center: true
      });

      projectorWindowRef.current = projectorWindow;
      writeProjectorState(projectorPayload);

      projectorWindow.once("tauri://created", () => {
        setIsProjectorWindowOpen(true);
        setStatus("Projector view ready");
      });

      projectorWindow.once("tauri://error", (event) => {
        projectorWindowRef.current = null;
        setIsProjectorWindowOpen(false);
        const errorMessage =
          event.payload instanceof Error
            ? event.payload.message
            : typeof event.payload === "string"
              ? event.payload
              : JSON.stringify(event.payload ?? "Unknown projector error");
        console.error("[projector] window open failed", event.payload);
        setStatus(`Projector failed to open: ${errorMessage}`);
      });

      projectorWindow.once("tauri://close-requested", () => {
        projectorWindowRef.current = null;
        setIsProjectorWindowOpen(false);
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error ?? "Unknown projector error");
      console.error("[projector] window creation threw", error);
      setStatus(`Projector failed to open: ${errorMessage}`);
    }
  }, [projectorPayload]);

  const handleCloseProjectorView = useCallback(async () => {
    const target = projectorWindowRef.current ?? WebviewWindow.getByLabel(PROJECTOR_WINDOW_LABEL);

    if (!target) {
      setIsProjectorWindowOpen(false);
      return;
    }

    await target.close();
    projectorWindowRef.current = null;
    setIsProjectorWindowOpen(false);
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
              onClick={() => void handleOpenProjectorView()}
              disabled={isLoading}
            >
              {isProjectorWindowOpen ? "Focus Projector View" : "Open Projector View"}
            </button>
            {isProjectorWindowOpen ? (
              <button className="present-button present-button--secondary" onClick={() => void handleCloseProjectorView()}>
                Close Projector View
              </button>
            ) : null}
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

                <div className="translation-row">
                  <label className="field-label" htmlFor="reference-placement-select">
                    Reference placement
                  </label>
                  <select
                    id="reference-placement-select"
                    value={referencePlacement}
                    onChange={(e) => setReferencePlacement(e.target.value as ReferencePlacement)}
                  >
                    <option value="top-left">Top-left</option>
                    <option value="top-center">Top-center</option>
                    <option value="bottom-left">Bottom-left</option>
                  </select>
                </div>

                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={useSafeMargins}
                    onChange={(e) => setUseSafeMargins(e.target.checked)}
                  />
                  Use projector safe margins
                </label>

                <div className="service-actions">
                  <button
                    className="present-button present-button--secondary"
                    type="button"
                    onClick={handleClearCurrentVerse}
                  >
                    Clear Current Verse
                  </button>
                  <button
                    className="present-button"
                    type="button"
                    onClick={handleRepresentCurrentVerse}
                  >
                    Re-present Current Verse
                  </button>
                </div>
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
                          <span className="history-list__meta">
                            {item.repeats > 1 ? `Repeated ${item.repeats}x` : "Ready to search"}
                          </span>
                          <span className="history-list__time">
                            {new Date(item.timestampMs).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit"
                            })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="panel-card">
              <header className="panel-card__header">
                <h2>Service Session Log</h2>
                <p>Chronological verses presented this service with one-click quick recall.</p>
              </header>

              <div className="panel-card__body session-log-body">
                <div className="session-log-actions session-log-actions--filters">
                  <button
                    className="present-button present-button--secondary"
                    type="button"
                    onClick={() => void exportSessionLog("txt")}
                  >
                    Export TXT
                  </button>
                  <button
                    className="present-button present-button--secondary"
                    type="button"
                    onClick={() => void exportSessionLog("csv")}
                  >
                    Export CSV
                  </button>
                </div>
                <div className="session-log-actions">
                  <button
                    className={`present-button present-button--secondary ${sessionLogFilter === "all" ? "present-button--active" : ""}`}
                    type="button"
                    onClick={() => setSessionLogFilter("all")}
                  >
                    All
                  </button>
                  <button
                    className={`present-button present-button--secondary ${sessionLogFilter === "typed" ? "present-button--active" : ""}`}
                    type="button"
                    onClick={() => setSessionLogFilter("typed")}
                  >
                    Typed
                  </button>
                  <button
                    className={`present-button present-button--secondary ${sessionLogFilter === "spoken" ? "present-button--active" : ""}`}
                    type="button"
                    onClick={() => setSessionLogFilter("spoken")}
                  >
                    Spoken
                  </button>
                </div>
                <div className="session-log-actions">
                  <button
                    className="present-button present-button--secondary"
                    type="button"
                    onClick={() => void handleCopyCurrentReference()}
                  >
                    Copy Current Reference
                  </button>
                  <button
                    className="present-button present-button--secondary"
                    type="button"
                    onClick={handleClearSessionLog}
                  >
                    Clear Session Log
                  </button>
                </div>
                {sessionNotice ? <p className="session-notice">{sessionNotice}</p> : null}

                {sessionLog.length === 0 ? (
                  <p className="history-empty">No verses presented in this session yet.</p>
                ) : filteredSessionLog.length === 0 ? (
                  <p className="history-empty">No {sessionLogFilter} entries in this session log yet.</p>
                ) : (
                  <ol className="session-log-list" aria-label="Service session log">
                    {filteredSessionLog.map((entry) => (
                      <li key={entry.id}>
                        <button
                          className="history-list__item"
                          onClick={() => void handleRecallSessionEntry(entry)}
                        >
                          <span className="history-list__reference">{entry.reference}</span>
                          <span className="history-list__meta">Source: {entry.sourceType}</span>
                          <span className="history-list__time">{formatSessionTimestamp(entry.timestampMs)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
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
          <div className={`presentation-mode__content ${useSafeMargins ? "presentation-mode__content--safe" : ""}`}>
            {showPresentationReference ? (
              <p
                className={`presentation-mode__reference presentation-mode__reference--${referencePlacement}`}
              >
                {result.reference}
              </p>
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
