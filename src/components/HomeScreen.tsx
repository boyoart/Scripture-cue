export function HomeScreen() {
  return (
    <main className="app-shell">
      <header className="header">
        <h1>Scripture Cue</h1>
        <p>Voice-powered Bible verse search and presentation</p>
      </header>

      <section className="controls" aria-label="Search controls">
        <input
          type="text"
          placeholder="Search input placeholder"
          aria-label="Search input placeholder"
          disabled
        />
        <button type="button" className="secondary" disabled>
          Start Listening
        </button>
        <select aria-label="Translation selector placeholder" disabled defaultValue="">
          <option value="" disabled>
            Translation selector placeholder
          </option>
        </select>
      </section>

      <section className="preview" aria-label="Verse preview panel">
        <h2>Verse Preview</h2>
        <p>Your selected verse will appear here after search.</p>
      </section>

      <section className="actions">
        <button type="button" className="primary" disabled>
          Present Fullscreen
        </button>
      </section>

      <footer className="status">Ready for input</footer>
    </main>
  );
}
