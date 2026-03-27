import type { VerseQuery } from "../../types/search";

const canonicalBooks = ["psalm", "john", "romans", "isaiah"] as const;

function toCanonicalBook(rawBook: string): string | undefined {
  const normalized = rawBook.toLowerCase();
  return canonicalBooks.find((book) => book === normalized)?.replace(/^./, (s) => s.toUpperCase());
}

export function parseQuery(rawInput: string): VerseQuery {
  const cleaned = rawInput.trim();
  const referenceMatch = cleaned.match(/^([1-3]?\s?[A-Za-z]+)\s+(\d+):(\d+)(?:-(\d+))?$/);

  if (referenceMatch) {
    const canonicalBook = toCanonicalBook(referenceMatch[1].replace(/\s+/g, ""));
    const chapter = Number(referenceMatch[2]);
    const verseStart = Number(referenceMatch[3]);
    const verseEnd = referenceMatch[4] ? Number(referenceMatch[4]) : verseStart;

    return {
      kind: "exact_reference",
      raw: cleaned,
      normalized: cleaned,
      canonicalBook,
      chapter,
      verseStart,
      verseEnd
    };
  }

  return {
    kind: "phrase",
    raw: cleaned,
    phrase: cleaned.toLowerCase(),
    normalized: cleaned.toLowerCase()
  };
}
