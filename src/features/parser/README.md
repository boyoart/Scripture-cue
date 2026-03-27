# Parser Feature

Parses user query text into canonical `VerseQuery` payloads.

## Current implementation
- Handles reference patterns such as `John 3:16` and ranges (`Psalm 23:1-3`).
- Falls back to phrase search for non-reference input.
