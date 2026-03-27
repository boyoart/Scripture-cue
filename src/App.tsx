import { useEffect, useMemo, useState } from "react";
import HistoryList from "./components/HistoryList";
import PanelCard from "./components/PanelCard";
import { parseQuery } from "./features/parser";
import { searchBundledBible, fetchBundledTranslations } from "./features/search";
import { captureSpeechInput } from "./features/speech";
import type { VerseResult } from "./types/verse";

interface TranslationOption {
  code: string;
  name: string;
  language: string;
  isDefault: boolean;
}

export default function App() {
  const [queryText, setQueryText] = useState("");
  const [translations, setTranslations] = useState<TranslationOption[]>([]);
  const [selectedTranslation, setSelectedTranslation] = useState("KJV");
  const [results, setResults] = useState<VerseResult[]>([]);
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    fetchBundledTranslations().then((loaded) => {
      setTranslations(loaded);
      const defaultTranslation = loaded.find((item) => item.isDefault)?.code ?? loaded[0]?.code ?? "KJV";
      setSelectedTranslation(defaultTranslation);
    });
  }, []);

  const topResult = results[0];

  const metadata = useMemo(
    () => ({
      reference: topResult?.reference ?? "—",
      translation: topResult?.translationCode ?? selectedTranslation,
      theme: topResult ? "Search Result" : "Awaiting Query",
      status: topResult ? "Previewed" : status
    }),
    [topResult, selectedTranslation, status]
  );

  async function runSearch(rawInput: string): Promise<void> {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      setResults([]);
      setStatus("Enter a verse reference or phrase.");
      return;
    }

    setStatus("Searching bundled Bible database...");

    const parsed = parseQuery(trimmed, selectedTranslation);
    const found = await searchBundledBible(parsed);

    setResults(found);
    setStatus(found.length > 0 ? `Found ${found.length} verse(s).` : "No verses found.");
  }

  async function onUseMicrophone(): Promise<void> {
    setStatus("Listening...");
    try {
      const speech = await captureSpeechInput();
      if (!speech.transcript) {
        setStatus("No speech detected.");
        return;
      }

      setQueryText(speech.transcript);
      await runSearch(speech.transcript);
    } catch {
      setStatus("Microphone recognition unavailable in this environment.");
    }
  }

  return (
    <main className="app-shell">
      <header className="app-shell__topbar">
        <div>
          <p className="eyebrow">Scripture Cue</p>
          <h1>Presentation Operator Console</h1>
        </div>
        <span className="service-pill">{status}</span>
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
                  placeholder="Type verse reference or keywords"
                  value={queryText}
                  onChange={(event) => setQueryText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void runSearch(queryText);
                    }
                  }}
                />
                <button type="button" className="icon-button" aria-label="Start voice search" onClick={() => void onUseMicrophone()}>
                  🎙
                </button>
                <button type="button" className="icon-button" aria-label="Search" onClick={() => void runSearch(queryText)}>
                  🔍
                </button>
              </div>
            </div>

            <div className="select-wrap">
              <label htmlFor="translation" className="field-label">
                Translation
              </label>
              <select
                id="translation"
                value={selectedTranslation}
                onChange={(event) => setSelectedTranslation(event.target.value)}
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
              <p>{results.map((item) => item.text).join("\n") || "Your selected verse will appear here after search."}</p>
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
                <dt>Theme</dt>
                <dd>{metadata.theme}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{metadata.status}</dd>
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
