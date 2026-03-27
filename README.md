# Scripture Cue (Consolidated MVP)

Windows-first desktop operator console for **Scripture Cue**, built with **Tauri + React + TypeScript + Vite**.

## Consolidated MVP Scope
- Stable desktop shell setup (Tauri v2 aligned across Rust + Node CLI)
- Polished operator console UI with typed search + microphone search flow
- Query parser and local bundled Bible DB search
- Verse preview, metadata panel, translation selector behavior, and recent history
- Dev-only parser debug panel to help diagnose search/parsing behavior

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

## Project Structure
```text
src/
  components/
  data/
  features/
    speech/
    parser/
    search/
    display/
    settings/
    history/
  services/
  stores/
  types/
  utils/
  styles/
src-tauri/
```

## Known Gaps
- Browser speech recognition support varies by runtime; a mock transcript fallback is used.
- Local bundled Bible DB is intentionally minimal for MVP sample coverage.
- Presenter fullscreen behavior is still scaffolded for future implementation.
