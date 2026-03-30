import type { VerseQuery } from "../../types/search";
import { BOOK_ALIASES } from "./bookAliases";
import { normalizeNumberWords } from "./numberWords";
import type { VerseParserResult } from "./types";

function normalizeInput(rawInput: string): string {
  return rawInput
    .trim()
    .toLowerCase()
    .replace(/[.,;!?]+/g, " ")
    .replace(/\s+/g, " ");
}

function resolveBook(bookCandidate: string): string | undefined {
  const compact = bookCandidate.trim().replace(/\s+/g, " ");
  return BOOK_ALIASES[compact];
}

function buildReferenceQuery(
  kind: VerseQuery["kind"],
  raw: string,
  normalized: string,
  canonicalBook: string,
  chapter: number,
  verseStart: number,
  verseEnd: number | undefined,
  confidence: number,
): VerseParserResult {
  return {
    query: {
      kind,
      raw,
      normalized,
      canonicalBook,
      chapter,
      verseStart,
      verseEnd,
      confidence,
    },
    meta: {
      confidence,
      normalizedInput: normalized,
      matchedPattern: kind === "exact_reference" ? "exact_reference" : "spoken_chapter_verse",
    },
  };
}

function asPhrase(raw: string, normalized: string): VerseParserResult {
  return {
    query: {
      kind: "phrase",
      raw,
      normalized,
      phrase: normalized,
      confidence: 0.35,
    },
    meta: {
      confidence: 0.35,
      normalizedInput: normalized,
      matchedPattern: "phrase",
    },
  };
}

export function parseVerseRequest(rawInput: string): VerseParserResult {
  const normalizedText = normalizeInput(rawInput);

  if (!normalizedText) {
    return asPhrase(rawInput, normalizedText);
  }

  const normalizedWithNumbers = normalizeNumberWords(normalizedText);

  const exactMatch = normalizedWithNumbers.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (exactMatch) {
    const [, bookPart, chapterRaw, verseStartRaw, verseEndRaw] = exactMatch;
    const canonicalBook = resolveBook(bookPart);

    if (canonicalBook) {
      return buildReferenceQuery(
        "exact_reference",
        rawInput,
        normalizedWithNumbers,
        canonicalBook,
        Number(chapterRaw),
        Number(verseStartRaw),
        verseEndRaw ? Number(verseEndRaw) : undefined,
        0.98,
      );
    }
  }

  const spokenChapterVerse = normalizedWithNumbers.match(
    /^(.+?)\s+chapter\s+(\d+)\s+verse\s+(\d+)(?:\s*(?:to|through|-)\s*(\d+))?$/,
  );
  if (spokenChapterVerse) {
    const [, bookPart, chapterRaw, verseStartRaw, verseEndRaw] = spokenChapterVerse;
    const canonicalBook = resolveBook(bookPart);

    if (canonicalBook) {
      return buildReferenceQuery(
        "spoken_reference",
        rawInput,
        normalizedWithNumbers,
        canonicalBook,
        Number(chapterRaw),
        Number(verseStartRaw),
        verseEndRaw ? Number(verseEndRaw) : undefined,
        0.93,
      );
    }
  }

  const spokenSpaced = normalizedWithNumbers.match(/^(.+?)\s+(\d+)\s+(\d+)(?:\s*(?:to|through|-)\s*(\d+))?$/);
  if (spokenSpaced) {
    const [, bookPart, chapterRaw, verseStartRaw, verseEndRaw] = spokenSpaced;
    const canonicalBook = resolveBook(bookPart);

    if (canonicalBook) {
      return {
        query: {
          kind: "spoken_reference",
          raw: rawInput,
          normalized: normalizedWithNumbers,
          canonicalBook,
          chapter: Number(chapterRaw),
          verseStart: Number(verseStartRaw),
          verseEnd: verseEndRaw ? Number(verseEndRaw) : undefined,
          confidence: 0.88,
        },
        meta: {
          confidence: 0.88,
          normalizedInput: normalizedWithNumbers,
          matchedPattern: "spoken_spaced",
        },
      };
    }
  }

  return asPhrase(rawInput, normalizedWithNumbers);
}
