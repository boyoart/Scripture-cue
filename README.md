# Scripture Cue (Module 1 Scaffold)

Windows-first desktop scaffold for **Scripture Cue**, built with **Tauri + React + TypeScript + Vite**.

## MVP Scope in this module
- Desktop shell setup (Tauri)
- React UI starter screen
- Dark theme baseline
- Organized architecture folders for upcoming modules
- Core query/result/provider interfaces

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
  pages/
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

## Current Module Limitations
- No real speech recognition provider yet.
- No real Bible search provider yet.
- No fullscreen presenter behavior yet.
