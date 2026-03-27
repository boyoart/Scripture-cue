import { FormEvent, useEffect, useMemo, useState } from "react";
import HistoryList from "./components/HistoryList";
import MicrophoneMeter from "./components/MicrophoneMeter";
import PanelCard from "./components/PanelCard";
import { parseSpeechQuery } from "./features/parser/parseSpeechQuery";
import { searchScripture } from "./features/search/searchScripture";
import type { TranslationCode, VerseRecord } from "./features/search/localBibleDb";
import { useSpeechMeter } from "./features/speech/useSpeechMeter";

type SearchStatus = "ready" | "not_found";

export default function App() {
  const [query, setQuery] = useState("");
  const [translation, setTranslation] = useState<TranslationCode>("NIV");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("ready");
  const [activeVerse, setActiveVerse] = useState<VerseRecord>({
    reference: "Psalm 23:1-3",
    text: "The Lord is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul.",
    theme: "Comfort & Assurance"
  });

  const { bars, transcript, micState, errorMessage, listening, startListening, stopListening } = useSpeechMeter();

  const handleSearch = (searchInput: string) => {
    const parsed = parseSpeechQuery(searchInput);
    const result = searchScripture(parsed.normalized, translation);

    if (result.match) {
      setActiveVerse(result.match);
      setSearchStatus("ready");
      return;
    }

    setSearchStatus("not_found");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleSearch(query);
  };

  useEffect(() => {
    if (!transcript) {
      return;
    }

    setQuery(transcript);
    handleSearch(transcript);
  }, [transcript]);

  const micButtonLabel = useMemo(() => {
    if (listening) {
      return "Stop listening";
    }

    if (micState === "processing") {
      return "Processing";
    }

    return "Start listening";
  }, [listening, micState]);

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
            <form className="search-controls" onSubmit={handleSubmit}>
              <label htmlFor="query-input" className="field-label">
                Search
              </label>
              <div className="search-row">
                <input
                  id="query-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Type verse reference or keywords"
                />
                <button
                  type="button"
                  className={`icon-button icon-button--mic icon-button--${micState}`}
                  aria-label={micButtonLabel}
                  onClick={listening ? stopListening : () => void startListening()}
                  disabled={micState === "processing"}
                >
                  🎙
                </button>
                <button type="submit" className="search-submit">
                  Search
                </button>
              </div>
              <div className="speech-row">
                <MicrophoneMeter bars={bars} micState={micState} />
                <div className="speech-readout">
                  <p>{listening ? "Listening for speech..." : "Press mic to capture a spoken query."}</p>
                  {errorMessage ? <p className="speech-error">{errorMessage}</p> : null}
                </div>
              </div>
            </form>

            <div className="select-wrap">
              <label htmlFor="translation" className="field-label">
                Translation
              </label>
              <select
                id="translation"
                value={translation}
                onChange={(event) => setTranslation(event.target.value as TranslationCode)}
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
              <p>{activeVerse.text}</p>
            </article>
            {searchStatus === "not_found" ? (
              <p className="search-warning">No verse found for "{query}" in {translation}. Showing previous result.</p>
            ) : null}
          </PanelCard>

          <PanelCard title="Metadata" subtitle="Review details before presenting">
            <dl className="metadata-grid">
              <div>
                <dt>Reference</dt>
                <dd>{activeVerse.reference}</dd>
              </div>
              <div>
                <dt>Translation</dt>
                <dd>{translation}</dd>
              </div>
              <div>
                <dt>Theme</dt>
                <dd>{activeVerse.theme}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{searchStatus === "ready" ? "Previewed" : "Needs review"}</dd>
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
