import { useMemo, useState } from "react";
import HistoryList from "./components/HistoryList";
import PanelCard from "./components/PanelCard";
import { parseVerseQuery } from "./features/parser";
import { searchLocalBibleDb } from "./features/search";
import { captureSpeechTranscript, type SpeechCaptureState } from "./features/speech";
import type { VerseResult } from "./types/verse";

const DEFAULT_QUERY = "Isaiah 40 31";

type SearchState = "idle" | "searching" | "success" | "no_results" | "error";

function getSpeechStatusLabel(state: SpeechCaptureState): string {
  if (state === "listening") {
    return "Listening...";
  }
  if (state === "processing") {
    return "Processing speech...";
  }
  if (state === "success") {
    return "Transcript captured.";
  }
  if (state === "error") {
    return "Could not capture speech.";
  }
  return "Microphone ready";
}

export default function App() {
  const [queryText, setQueryText] = useState(DEFAULT_QUERY);
  const [translation, setTranslation] = useState("NIV");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [speechState, setSpeechState] = useState<SpeechCaptureState>("idle");
  const [statusMessage, setStatusMessage] = useState("Ready for typed or microphone input.");
  const [results, setResults] = useState<VerseResult[]>([]);

  const activeResult = results[0];

  const derivedStatus = useMemo(() => {
    if (speechState === "error" || searchState === "error") {
      return "status-chip status-chip--error";
    }
    if (speechState === "processing" || searchState === "searching") {
      return "status-chip status-chip--processing";
    }
    if (searchState === "success" || speechState === "success") {
      return "status-chip status-chip--success";
    }
    return "status-chip";
  }, [searchState, speechState]);

  const runSearch = async (text: string) => {
    const raw = text.trim();
    if (!raw) {
      setResults([]);
      setSearchState("no_results");
      setStatusMessage("Enter a verse reference or phrase to search.");
      return;
    }

    setSearchState("searching");
    setStatusMessage("Searching local Bible database...");

    try {
      const parsed = parseVerseQuery(raw, translation);
      const verseResults = await searchLocalBibleDb(parsed);
      setResults(verseResults);

      if (verseResults.length > 0) {
        setSearchState("success");
        setStatusMessage(`Found ${verseResults.length} result(s) for \"${raw}\".`);
      } else {
        setSearchState("no_results");
        setStatusMessage(`No verses found for \"${raw}\" in ${translation}.`);
      }
    } catch (error) {
      setSearchState("error");
      setStatusMessage(`Search failed: ${(error as Error).message}`);
    }
  };

  const onSearchClick = async () => {
    await runSearch(queryText);
  };

  const onMicClick = async () => {
    setSpeechState("listening");
    setStatusMessage("Listening for scripture reference...");

    try {
      const speech = await captureSpeechTranscript();
      setSpeechState("processing");
      setQueryText(speech.transcript);
      setStatusMessage(`Heard: \"${speech.transcript}\". Running parser and search...`);
      await runSearch(speech.transcript);
      setSpeechState("success");
    } catch (error) {
      setSpeechState("error");
      setStatusMessage(`Microphone error: ${(error as Error).message}`);
    }
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
          <PanelCard title="Scripture Search" subtitle="Find passage by typed or microphone input">
            <div className="search-controls">
              <label htmlFor="query-input" className="field-label">
                Search
              </label>
              <div className="search-row">
                <input
                  id="query-input"
                  placeholder="Type verse reference or keywords"
                  value={queryText}
                  onChange={(event) => setQueryText(event.target.value)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Start voice search"
                  onClick={onMicClick}
                  disabled={speechState === "listening" || speechState === "processing"}
                >
                  🎙
                </button>
                <button type="button" className="search-button" onClick={onSearchClick}>
                  Search
                </button>
              </div>
              <p className="microphone-status" role="status">
                {getSpeechStatusLabel(speechState)}
              </p>
            </div>

            <div className="select-wrap">
              <label htmlFor="translation" className="field-label">
                Translation
              </label>
              <select
                id="translation"
                value={translation}
                onChange={(event) => setTranslation(event.target.value)}
              >
                <option value="NIV">NIV</option>
                <option value="ESV">ESV</option>
                <option value="KJV">KJV</option>
                <option value="NLT">NLT</option>
              </select>
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
              <p>{activeResult ? activeResult.text : "No verse selected yet."}</p>
            </article>
          </PanelCard>

          <PanelCard title="Metadata" subtitle="Review details before presenting">
            <dl className="metadata-grid">
              <div>
                <dt>Reference</dt>
                <dd>{activeResult?.reference ?? "—"}</dd>
              </div>
              <div>
                <dt>Translation</dt>
                <dd>{activeResult?.translationCode ?? translation}</dd>
              </div>
              <div>
                <dt>Input Mode</dt>
                <dd>{speechState === "success" ? "Microphone" : "Typed"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{searchState.replace("_", " ")}</dd>
              </div>
            </dl>
          </PanelCard>

          <button type="button" className="present-button">
            Present Fullscreen
          </button>
        </section>
      </div>

      <footer className={derivedStatus}>{statusMessage}</footer>
    </main>
  );
}
