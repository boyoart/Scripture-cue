# Search Feature

Local-first Bible search with an in-memory bundled dataset and provider abstraction.

## Current implementation
- `seedTranslations.ts` provides bundled public-domain KJV/WEB seed content.
- `bibleDatabase.ts` indexes references and phrase matches.
- `localBibleProvider.ts` keeps the existing provider pattern intact.

## Future direction
- Replace seed excerpts with full translation payloads generated from public-domain source files.
- Add pluggable adapters for licensed/API-based providers without changing parser/display flow.
