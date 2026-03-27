import type { VerseQuery } from "../../types/search";

const BOOK_ALIASES: Record<string, string> = {
  genesis: "Genesis",
  exodus: "Exodus",
  leviticus: "Leviticus",
  numbers: "Numbers",
  deuteronomy: "Deuteronomy",
  joshua: "Joshua",
  psalm: "Psalm",
  psalms: "Psalm",
  proverb: "Proverbs",
  proverbs: "Proverbs",
  isaiah: "Isaiah",
  jeremiah: "Jeremiah",
  matthew: "Matthew",
  mark: "Mark",
  luke: "Luke",
  john: "John",
  romans: "Romans"
};

function normalizeInput(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function parseVerseQuery(raw: string, translationCode: string): VerseQuery {
  const normalized = normalizeInput(raw);
  const exactMatch = normalized.match(/^([1-3]?\s?[a-zA-Z]+)\s+(\d+)(?::(\d+)(?:-(\d+))?|\s+(\d+))?$/i);

  if (exactMatch) {
    const [, bookToken, chapterToken, verseColonToken, verseEndToken, verseSpaceToken] = exactMatch;
    const canonicalBook = BOOK_ALIASES[bookToken.toLowerCase()] ?? bookToken;
    const verseStartToken = verseColonToken ?? verseSpaceToken;

    return {
      kind: "exact_reference",
      raw,
      normalized,
      canonicalBook,
      chapter: Number(chapterToken),
      verseStart: verseStartToken ? Number(verseStartToken) : undefined,
      verseEnd: verseEndToken ? Number(verseEndToken) : undefined,
      translationCode
    };
  }

  return {
    kind: "phrase",
    raw,
    normalized,
    phrase: normalized.toLowerCase(),
    translationCode
  };
}
