import type { VerseQuery } from "../../types/search";

const referencePattern = /^\s*([1-3]?\s?[A-Za-z ]+)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/;

export function parseVerseQuery(rawInput: string, translationCode: string): VerseQuery {
  const raw = rawInput.trim();
  const refMatch = raw.match(referencePattern);

  if (refMatch) {
    const [, book, chapter, verseStart, verseEnd] = refMatch;
    return {
      kind: "exact_reference",
      raw,
      normalized: raw.toLowerCase(),
      canonicalBook: book.replace(/\s+/g, " ").trim(),
      chapter: Number(chapter),
      verseStart: verseStart ? Number(verseStart) : undefined,
      verseEnd: verseEnd ? Number(verseEnd) : undefined,
      translationCode
    };
  }

  return {
    kind: "phrase",
    raw,
    normalized: raw.toLowerCase(),
    phrase: raw,
    translationCode
  };
}
