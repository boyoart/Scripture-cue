# Scripture Cue (Bundled Bible DB Upgrade)

Windows-first desktop scaffold for **Scripture Cue**, built with **Tauri + React + TypeScript + Vite**.

## MVP Scope in this module
- Bundled SQLite Bible database resource for desktop packaging.
- Translation-aware search commands in Tauri (`get_translations`, `search_verses`).
- React UI wiring for typed search + microphone capture + parser + bundled DB search.
- Translation selector now sourced from bundled translations.

## Prerequisites
- Node.js 20+
- npm 10+
- Rust (stable)
- Tauri prerequisites for your OS:
  - Windows: Visual Studio C++ Build Tools + WebView2

## Install
```bash
npm install
```

## Run in browser (UI only)
```bash
npm run dev
```

## Run as desktop app (Tauri)
```bash
npm run tauri:dev
```

## Production build
```bash
npm run build
npm run tauri:build
```

## Bible DB Resource
- Resource path: `src-tauri/resources/bibles/bible.db`
- Regenerate starter DB seed:
```bash
python scripts/build_bible_db.py
```

## Database schema
- `translations`
- `books`
- `verses`
- `book_aliases`

## Current Module Limitations
- Repository currently seeds a starter KJV/WEB dataset to keep source size small.
- Full-corpus ingestion script can be layered on top of `scripts/build_bible_db.py` when licensed/public-domain source files are available in your environment.
