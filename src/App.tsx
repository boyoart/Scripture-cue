import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import HistoryList from "./components/HistoryList";
import PanelCard from "./components/PanelCard";
import { DEFAULT_TRANSLATION, SUPPORTED_TRANSLATIONS } from "./data/bibleDb";
import { addHistoryEntry, type HistoryEntry } from "./features/history";
import { normalizeTranscriptToReference, normalizeTypedReference } from "./features/parser";
import { localBibleProvider } from "./features/search";
import { createLiveTranscriptStream, createMicLevelStream, type MicState, type TranscriptChunk } from "./features/speech";
import type { VerseResult } from "./types/verse";

const DEFAULT_QUERY = "Psalm 23:1-3";

export default function App() {
  const [queryInput, setQueryInput] = useState(DEFAULT_QUERY);
  const [translation, setTranslation] = useState<(typeof SUPPORTED_TRANSLATIONS)[number]>(DEFAULT_TRANSLATION);
  const [micState, setMicState] = useState<MicState>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [spectrumLevels, setSpectrumLevels] = useState<number[]>(Array(10).fill(0.12));
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeResult, setActiveResult] = useState<VerseResult | null>(null);
  const [statusText, setStatusText] = useState("Ready for input");
  const [debugInfo, setDebugInfo] = useState({ raw: "", normalized: "", canonicalBook: "", confidence: 0 });
  const [liveEnabled, setLiveEnabled] = useState(false);
  const translationRef = useRef(translation);
  const queryInputRef = useRef(queryInput);

  const micLabel = useMemo(() => {
    if (micState === "listening") return "Listening";
    if (micState === "processing") return "Processing";
    if (micState === "success") return "Success";
    if (micState === "error") return "Error";
    return "Idle";
  }, [micState]);

  useEffect(() => {
    runTypedSearch(DEFAULT_QUERY, DEFAULT_TRANSLATION);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    translationRef.current = translation;
  }, [translation]);

  useEffect(() => {
    queryInputRef.current = queryInput;
  }, [queryInput]);

  async function runQuery(rawInput: string, source: "typed" | "speech") {
    const normalized =
      source === "speech"
        ? normalizeTranscriptToReference(rawInput, translation)
        : normalizeTypedReference(rawInput, translation);

    setDebugInfo({
      raw: normalized.rawTranscript,
      normalized: normalized.normalizedReference,
      canonicalBook: normalized.canonicalBook || "(none)",
      confidence: normalized.confidence
    });

    setStatusText(source === "speech" ? "Processing speech transcript chunk..." : "Searching local Bible database...");
    const results = await localBibleProvider.search(normalized.query);

    if (!results.length) {
      setActiveResult(null);
      setStatusText(
        source === "speech"
          ? "No result found in local KJV database. Waiting for a better live reference..."
          : "No result found in local KJV database. Try another reference."
      );
      return;
    }

    const previewResult = results[0];
    setActiveResult(previewResult);
    setStatusText(`Loaded ${previewResult.reference} (${previewResult.translationCode})`);
    setHistory((prev: HistoryEntry[]) =>
      addHistoryEntry(prev, {
        reference: previewResult.reference,
        translation: previewResult.translationCode
      })
    );
  }

  async function runTypedSearch(nextQuery = queryInput, nextTranslation = translation) {
    setMicError(null);
    if (!nextQuery.trim()) {
      setStatusText("Enter a scripture reference.");
      return;
    }

    if (nextTranslation !== translation) {
      setTranslation(nextTranslation);
    }

    await runQuery(nextQuery, "typed");
  }

  async function toggleLiveListening() {
    if (liveEnabled) {
      setLiveEnabled(false);
      setMicState("idle");
      setStatusText("Live listening stopped.");
      return;
    }

    setMicError(null);
    setLiveEnabled(true);
  }

  useEffect(() => {
    if (!liveEnabled) {
      setSpectrumLevels(Array(10).fill(0.12));
      return;
    }

    let disposed = false;
    let lastTriggeredKey = "";
    let lastTriggeredAt = 0;
    const duplicateCooldownMs = 9000;
    let resetSuccessTimer: number | null = null;
    let stopTranscript: (() => void) | null = null;
    let stopSpectrum: (() => void) | null = null;

    const processChunk = async (chunk: TranscriptChunk) => {
      if (disposed) {
        return;
      }

      const transcript = chunk.transcript.trim();
      if (!transcript) {
        setMicState("error");
        setMicError("Speech recognition disconnected. Retrying...");
        setStatusText("Speech recognition disconnected. Retrying...");
        return;
      }

      setMicError(null);
      setQueryInput(transcript);
      setMicState("processing");

      const normalized = normalizeTranscriptToReference(transcript, translationRef.current);
      setDebugInfo({
        raw: normalized.rawTranscript,
        normalized: normalized.normalizedReference,
        canonicalBook: normalized.canonicalBook || "(none)",
        confidence: normalized.confidence
      });

      if (!normalized.query.chapter || !normalized.query.canonicalBook || normalized.confidence < 0.65) {
        setMicState("listening");
        setStatusText(`Listening... confidence ${normalized.confidence.toFixed(2)} too low for auto-search.`);
        return;
      }

      const dedupeKey = `${normalized.normalizedReference}-${translationRef.current}`;
      const now = Date.now();
      if (dedupeKey === lastTriggeredKey && now - lastTriggeredAt < duplicateCooldownMs) {
        setMicState("listening");
        setStatusText(`Suppressed duplicate live detection for ${normalized.normalizedReference}.`);
        return;
      }

      lastTriggeredKey = dedupeKey;
      lastTriggeredAt = now;

      await runQuery(transcript, "speech");
      setMicState("success");
      if (resetSuccessTimer) {
        window.clearTimeout(resetSuccessTimer);
      }
      resetSuccessTimer = window.setTimeout(() => {
        if (!disposed) {
          setMicState("listening");
        }
      }, 900);
    };

    (async () => {
      setMicState("listening");
      setStatusText("Live listening active. Say a scripture reference.");
      stopSpectrum = await createMicLevelStream(setSpectrumLevels);
      stopTranscript = await createLiveTranscriptStream(processChunk, queryInputRef.current.trim() || "John three sixteen");
    })().catch((error) => {
      setMicState("error");
      setMicError(error instanceof Error ? error.message : "Unable to start live listening.");
      setStatusText("Unable to start live listening.");
      setLiveEnabled(false);
    });

    return () => {
      disposed = true;
      if (resetSuccessTimer) {
        window.clearTimeout(resetSuccessTimer);
      }
      stopTranscript?.();
      stopSpectrum?.();
      setMicState("idle");
      setSpectrumLevels(Array(10).fill(0.12));
    };
  }, [liveEnabled]);

  async function handleMicSearch() {
    await toggleLiveListening();
  }

  async function handleHistorySelect(entry: HistoryEntry) {
    setQueryInput(entry.reference);
    await runTypedSearch(entry.reference, entry.translation as (typeof SUPPORTED_TRANSLATIONS)[number]);
  }

  return (
    <main className="app-shell">
      <header className="app-shell__topbar">
        <div>
          <p className="eyebrow">Scripture Cue</p>
          <h1>Presentation Operator Console</h1>
        </div>
        <span className="service-pill">{statusText}</span>
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
                  value={queryInput}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setQueryInput(event.target.value)}
                  placeholder="Type verse reference or keywords"
                />
                <button
                  type="button"
                  className={`icon-button icon-button--mic icon-button--${micState}`}
                  onClick={handleMicSearch}
                  aria-label={liveEnabled ? "Stop live listening" : "Start live listening"}
                >
                  {liveEnabled ? "Stop Live" : "GO LIVE"}
                </button>
              </div>
              <div className="mic-status-row">
                <span className={`mic-state mic-state--${micState}`}>{micLabel}</span>
                <div className="spectrum-meter" aria-hidden="true">
                  {spectrumLevels.map((level, index) => (
                    <span key={index} style={{ height: `${Math.max(8, Math.round(level * 28))}px` }} />
                  ))}
                </div>
              </div>
              {micError ? <p className="error-text">{micError}</p> : null}
            </div>

            <div className="select-wrap">
              <label htmlFor="translation" className="field-label">
                Translation
              </label>
              <select
                id="translation"
                value={translation}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setTranslation(event.target.value as (typeof SUPPORTED_TRANSLATIONS)[number])
                }
              >
                {SUPPORTED_TRANSLATIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>

            <div className="search-actions">
              <button type="button" className="run-search-button" onClick={() => runTypedSearch()}>
                Search
              </button>
            </div>
          </PanelCard>

          <PanelCard title="Recent History" subtitle="Newest successful matches first">
            <HistoryList items={history} onSelect={handleHistorySelect} />
          </PanelCard>

          {import.meta.env.DEV ? (
            <PanelCard title="Parser Debug" subtitle="Visible only in development mode">
              <dl className="metadata-grid parser-debug-grid">
                <div>
                  <dt>Raw transcript</dt>
                  <dd>{debugInfo.raw || "-"}</dd>
                </div>
                <div>
                  <dt>Normalized reference</dt>
                  <dd>{debugInfo.normalized || "-"}</dd>
                </div>
                <div>
                  <dt>Canonical book</dt>
                  <dd>{debugInfo.canonicalBook}</dd>
                </div>
                <div>
                  <dt>Parser confidence</dt>
                  <dd>{debugInfo.confidence.toFixed(2)}</dd>
                </div>
              </dl>
            </PanelCard>
          ) : null}
        </aside>

        <section className="workspace-column workspace-column--right">
          <PanelCard
            title="Verse Preview"
            subtitle="Prepared for confidence monitor and projector output"
            className="preview-card"
          >
            <article className={`verse-preview ${activeResult ? "" : "verse-preview--empty"}`.trim()}>
              {activeResult ? <p>{activeResult.text}</p> : <p>No result loaded yet.</p>}
            </article>
          </PanelCard>

          <PanelCard title="Metadata" subtitle="Review details before presenting">
            <dl className="metadata-grid">
              <div>
                <dt>Reference</dt>
                <dd>{activeResult?.reference || "No result"}</dd>
              </div>
              <div>
                <dt>Translation</dt>
                <dd>{activeResult?.translationCode || translation}</dd>
              </div>
              <div>
                <dt>Theme</dt>
                <dd>Scripture Lookup</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{activeResult ? "Previewed" : "No Result"}</dd>
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
