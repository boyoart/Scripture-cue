import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import HistoryList from "./components/HistoryList";
import PanelCard from "./components/PanelCard";
import { DEFAULT_TRANSLATION, SUPPORTED_TRANSLATIONS } from "./data/bibleDb";
import { addHistoryEntry, type HistoryEntry } from "./features/history";
import { normalizeTranscriptToReference, normalizeTypedReference } from "./features/parser";
import { localBibleProvider } from "./features/search";
import { captureTranscript, createMicLevelStream, type MicState } from "./features/speech";
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

  const micLabel = useMemo(() => {
    if (micState === "listening") return "Listening";
    if (micState === "processing") return "Processing";
    if (micState === "success") return "Success";
    if (micState === "error") return "Error";
    return "Start Voice";
  }, [micState]);

  useEffect(() => {
    runTypedSearch(DEFAULT_QUERY, DEFAULT_TRANSLATION);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    setStatusText(source === "speech" ? "Processing speech transcript..." : "Searching local Bible database...");
    const results = await localBibleProvider.search(normalized.query);

    if (!results.length) {
      setActiveResult(null);
      setStatusText("No result found in local KJV database. Try another reference.");
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

  async function handleMicSearch() {
    setMicError(null);
    setMicState("listening");
    setStatusText("Listening for scripture reference...");

    const stopLevelStream = await createMicLevelStream(setSpectrumLevels);

    try {
      const fallback = queryInput.trim() || "John three sixteen";
      const speech = await captureTranscript(fallback);
      setMicState("processing");

      const transcript = speech.transcript.trim();
      setQueryInput(transcript);
      await runQuery(transcript, "speech");
      setMicState("success");

      window.setTimeout(() => setMicState("idle"), 900);
    } catch (error) {
      setMicState("error");
      setStatusText("Microphone capture failed. You can still type references.");
      setMicError(error instanceof Error ? error.message : "Unknown microphone error");
    } finally {
      stopLevelStream();
      setSpectrumLevels(Array(10).fill(0.12));
    }
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
                  aria-label="Start voice search"
                >
                  🎙
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
