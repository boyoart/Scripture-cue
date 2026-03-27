# Parser Feature

Module 4 parser for turning typed text or microphone transcript text into structured verse query objects.

## Exports
- `parseVerseRequest(rawInput)`
- `BOOK_ALIASES`
- `VerseParserResult`

## Supported patterns
- Exact references (`John 3:16`, `Psalm 23:1-3`)
- Spoken references (`Second Timothy chapter 1 verse 7`, `Isaiah 40 31`)
- Phrase fallback classification when no reference pattern is recognized
