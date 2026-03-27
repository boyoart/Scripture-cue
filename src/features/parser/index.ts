import type { VerseQuery } from "../../types/search";

const REFERENCE_PATTERN = /^([1-3]?\s?[A-Za-z]+)\s+(\d+):(\d+)(?:-(\d+))?$/;

export function parseQuery(raw: string, translationCode: string): VerseQuery {
  const trimmed = raw.trim();
  const referenceMatch = trimmed.match(REFERENCE_PATTERN);

  if (referenceMatch) {
    const [, canonicalBook, chapter, verseStart, verseEnd] = referenceMatch;
    return {
      kind: "exact_reference",
      raw,
      normalized: trimmed.toLowerCase(),
      canonicalBook,
      chapter: Number(chapter),
      verseStart: Number(verseStart),
      verseEnd: verseEnd ? Number(verseEnd) : Number(verseStart),
      translationCode
    };
  }

  return {
    kind: "phrase",
    raw,
    phrase: trimmed,
    normalized: trimmed.toLowerCase(),
    translationCode
  };
}
