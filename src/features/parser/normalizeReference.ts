import type { VerseQuery } from "../../types/search";
import { matchSpokenBook, type MatchResult } from "./spokenBookMatcher";

export type NormalizedResult = {
  query: VerseQuery;
  rawTranscript: string;
  normalizedReference: string;
  confidence: number;
  canonicalBook?: string;
  ambiguity: "clear" | "ambiguous";
  debug: {
    transcriptSanitized: string;
    bookMatchSource: MatchResult["source"];
    reason?: string;
  };
  structuredReference?: {
    book: string;
    chapter: number;
    verseStart: number;
    verseEnd: number;
  };
};

const SIMPLE_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  first: 1,
  second: 2,
  third: 3
};

const RANGE_JOINERS = new Set(["to", "through", "thru", "-"]);
const SINGLE_CHAPTER_BOOKS = new Set(["Obadiah", "Philemon", "2 John", "3 John", "Jude"]);
const NUMBER_WORD_REGEX = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|first|second|third)\b/;

function sanitizeTranscript(input: string): string {
  return input
    .toLowerCase()
    .replace(/[!?()[\]{}"'`]/g, " ")
    .replace(/[.,;]+/g, " ")
    .replace(/\bchapter\s*(\d+)/g, " chapter $1 ")
    .replace(/\bverse\s*(\d+)/g, " verse $1 ")
    .replace(/\bverses\s*(\d+)/g, " verse $1 ")
    .replace(/\b(open|the|book|of|and|then|please|find|show|me)\b/g, " ")
    .replace(/\bchapter\b/g, " chapter ")
    .replace(/\bverses?\b/g, " verse ")
    .replace(/\bcolon\b/g, " : ")
    .replace(/\s*:\s*/g, " : ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

type BookMatchAtOffset = MatchResult & { offset: number };

function hasReferenceLikeNumbers(value: string): boolean {
  return /\d/.test(value) || NUMBER_WORD_REGEX.test(value);
}

function findBookMatchInTranscript(cleaned: string): BookMatchAtOffset {
  const tokens = cleaned.split(" ").filter(Boolean);
  let best: BookMatchAtOffset = {
    consumedTokenCount: 0,
    confidence: 0,
    ambiguous: true,
    source: "none",
    reason: "No scripture-like candidate detected",
    offset: 0
  };

  for (let offset = 0; offset < tokens.length; offset += 1) {
    const candidateTranscript = tokens.slice(offset).join(" ");
    const match = matchSpokenBook(candidateTranscript);
    if (!match.canonicalBook || match.consumedTokenCount === 0) {
      continue;
    }

    const trailing = tokens.slice(offset + match.consumedTokenCount).join(" ").trim();
    if (!hasReferenceLikeNumbers(trailing)) {
      continue;
    }

    if (!best.canonicalBook || match.confidence > best.confidence) {
      best = { ...match, offset };
    }
  }

  return best;
}

function parseNumericToken(token: string): number | null {
  if (/^\d+$/.test(token)) {
    return Number(token);
  }

  if (token in SIMPLE_NUMBERS) {
    return SIMPLE_NUMBERS[token];
  }

  return null;
}

function parseNumberWords(tokens: string[], startIndex: number): { value: number; consumed: number } | null {
  const token = tokens[startIndex];
  if (!token || RANGE_JOINERS.has(token)) {
    return null;
  }

  if (/^\d+$/.test(token)) {
    return { value: Number(token), consumed: 1 };
  }

  const mapped = parseNumericToken(token);
  if (mapped === null) {
    return null;
  }

  const nextToken = tokens[startIndex + 1];
  const nextValue = nextToken ? parseNumericToken(nextToken) : null;
  const canCombineTensAndUnits = mapped >= 20 && mapped % 10 === 0 && nextValue !== null && nextValue > 0 && nextValue < 10;

  if (canCombineTensAndUnits) {
    return { value: mapped + nextValue, consumed: 2 };
  }

  return { value: mapped, consumed: 1 };
}

function parseFirstNumber(tokens: string[]): number | undefined {
  for (let i = 0; i < tokens.length; i += 1) {
    const parsed = parseNumberWords(tokens, i);
    if (!parsed) {
      continue;
    }

    return parsed.value;
  }

  return undefined;
}

function toReferenceString(book: string, chapter: number, verseStart?: number, verseEnd?: number): string {
  if (!verseStart) {
    return `${book} ${chapter}`;
  }

  if (!verseEnd || verseEnd === verseStart) {
    return `${book} ${chapter}:${verseStart}`;
  }

  return `${book} ${chapter}:${verseStart}-${verseEnd}`;
}

function parseReferenceParts(remaining: string, canonicalBook: string): {
  chapter?: number;
  verseStart?: number;
  verseEnd?: number;
  confidenceBoost: number;
} {
  if (!remaining) {
    return { confidenceBoost: 0.04 };
  }

  const colonMatch = remaining.match(/(\d+)\s*:\s*(\d+)(?:\s*(?:-|to|through|thru)\s*(\d+))?/);
  if (colonMatch) {
    return {
      chapter: Number(colonMatch[1]),
      verseStart: Number(colonMatch[2]),
      verseEnd: colonMatch[3] ? Number(colonMatch[3]) : undefined,
      confidenceBoost: 0.3
    };
  }

  const tokens = remaining.split(" ").filter(Boolean);
  const joinerIndex = tokens.findIndex((token) => RANGE_JOINERS.has(token));
  if (joinerIndex > 0 && joinerIndex < tokens.length - 1) {
    const preRangeTokens = tokens.slice(0, joinerIndex);
    const postRangeTokens = tokens.slice(joinerIndex + 1);
    const verseEnd = parseFirstNumber(postRangeTokens);

    if (verseEnd !== undefined) {
      const verseMarkerIndex = preRangeTokens.findIndex((token) => token === "verse" || token === "verses");
      const chapterTokens =
        verseMarkerIndex >= 0
          ? preRangeTokens.slice(0, verseMarkerIndex).filter((token) => token !== "chapter")
          : preRangeTokens.filter((token) => token !== "chapter");
      const chapter = parseFirstNumber(chapterTokens);

      let verseStart: number | undefined;
      if (verseMarkerIndex >= 0) {
        verseStart = parseFirstNumber(preRangeTokens.slice(verseMarkerIndex + 1));
      } else if (chapterTokens.length > 0) {
        const chapterStartIndex = preRangeTokens.findIndex((token) => token === chapterTokens[0]);
        if (chapterStartIndex >= 0) {
          verseStart = parseFirstNumber(preRangeTokens.slice(chapterStartIndex + 1));
        }
      }

      if (chapter && verseStart && verseEnd >= verseStart) {
        return {
          chapter,
          verseStart,
          verseEnd,
          confidenceBoost: 0.34
        };
      }
    }
  }

  const chapterLabelMatch = remaining.match(/\bchapter\s+([a-z0-9 -]+?)(?=\s+verse\b|$)/);
  const verseLabelMatch = remaining.match(/\bverse\s+([a-z0-9 -]+)$/);
  if (chapterLabelMatch) {
    const chapterTokens = chapterLabelMatch[1].split(" ").filter(Boolean);
    const chapterParsed = parseNumberWords(chapterTokens, 0);
    const chapter = chapterParsed?.value;

    let verseStart: number | undefined;
    let verseEnd: number | undefined;
    if (verseLabelMatch) {
      const verseTokens = verseLabelMatch[1].split(" ").filter(Boolean);
      const verseNumbers: number[] = [];
      let sawRangeJoiner = false;

      for (let i = 0; i < verseTokens.length; i += 1) {
        if (RANGE_JOINERS.has(verseTokens[i])) {
          sawRangeJoiner = true;
          continue;
        }

        const parsed = parseNumberWords(verseTokens, i);
        if (!parsed) {
          continue;
        }

        verseNumbers.push(parsed.value);
        i += parsed.consumed - 1;
      }

      verseStart = verseNumbers[0];
      verseEnd = sawRangeJoiner ? verseNumbers[1] : undefined;
    }

    if (chapter) {
      return {
        chapter,
        verseStart,
        verseEnd,
        confidenceBoost: verseStart ? 0.28 : 0.14
      };
    }
  }

  const compactTokens = remaining
    .replace(/\bchapter\b/g, " ")
    .replace(/\bverse\b/g, " ")
    .split(" ")
    .filter(Boolean);
  const compactNumericToken = compactTokens.length === 1 && /^\d+$/.test(compactTokens[0]) ? compactTokens[0] : undefined;
  const values: number[] = [];
  let sawRangeJoiner = false;

  for (let i = 0; i < compactTokens.length; i += 1) {
    if (RANGE_JOINERS.has(compactTokens[i])) {
      sawRangeJoiner = true;
      continue;
    }

    const parsed = parseNumberWords(compactTokens, i);
    if (!parsed) {
      continue;
    }

    values.push(parsed.value);
    i += parsed.consumed - 1;
  }

  if (values.length >= 2) {
    return {
      chapter: values[0],
      verseStart: values[1],
      verseEnd: sawRangeJoiner && values[2] ? values[2] : undefined,
      confidenceBoost: 0.2
    };
  }

  if (values.length === 1) {
    if (SINGLE_CHAPTER_BOOKS.has(canonicalBook)) {
      return {
        chapter: 1,
        verseStart: values[0],
        confidenceBoost: 0.22
      };
    }

    if (compactNumericToken) {
      if (compactNumericToken.length === 2) {
        return {
          chapter: Number(compactNumericToken[0]),
          verseStart: Number(compactNumericToken[1]),
          confidenceBoost: 0.24
        };
      }

      if (compactNumericToken.length === 3) {
        return {
          chapter: Number(compactNumericToken.slice(0, 1)),
          verseStart: Number(compactNumericToken.slice(1)),
          confidenceBoost: 0.24
        };
      }

      if (compactNumericToken.length === 4) {
        return {
          chapter: Number(compactNumericToken.slice(0, 2)),
          verseStart: Number(compactNumericToken.slice(2)),
          confidenceBoost: 0.22
        };
      }
    }

    return { chapter: values[0], confidenceBoost: 0.1 };
  }

  return { confidenceBoost: -0.15 };
}

export function normalizeTranscriptToReference(rawTranscript: string, translationCode: string): NormalizedResult {
  const cleaned = sanitizeTranscript(rawTranscript);
  const bookMatch = findBookMatchInTranscript(cleaned);

  if (!bookMatch.canonicalBook || bookMatch.consumedTokenCount === 0) {
    return {
      rawTranscript,
      normalizedReference: cleaned,
      confidence: Math.min(0.45, bookMatch.confidence || 0.1),
      ambiguity: "ambiguous",
      debug: {
        transcriptSanitized: cleaned,
        bookMatchSource: bookMatch.source,
        reason: bookMatch.reason ?? "Unable to safely match a Bible book"
      },
      query: {
        kind: "phrase",
        raw: rawTranscript,
        phrase: cleaned,
        confidence: Math.min(0.45, bookMatch.confidence || 0.1),
        translationCode
      }
    };
  }

  const cleanedTokens = cleaned.split(" ").filter(Boolean);
  const remainder = cleanedTokens.slice(bookMatch.offset + bookMatch.consumedTokenCount).join(" ").trim();
  const parts = parseReferenceParts(remainder, bookMatch.canonicalBook);
  const recognizedVerses = parts.verseStart ? 0.16 : 0;
  const recognizedRange = parts.verseEnd ? 0.08 : 0;
  const bookConfidenceBase = 0.24 + bookMatch.confidence * 0.2;
  const confidence = Math.max(
    0,
    Math.min(0.99, bookConfidenceBase + parts.confidenceBoost + (parts.chapter ? 0.2 : 0) + recognizedVerses + recognizedRange)
  );

  const normalizedReference = parts.chapter
    ? toReferenceString(bookMatch.canonicalBook, parts.chapter, parts.verseStart, parts.verseEnd)
    : bookMatch.canonicalBook;
  const structuredReference =
    parts.chapter && parts.verseStart
      ? {
          book: bookMatch.canonicalBook,
          chapter: parts.chapter,
          verseStart: parts.verseStart,
          verseEnd: parts.verseEnd ?? parts.verseStart
        }
      : undefined;

  return {
    rawTranscript,
    normalizedReference,
    canonicalBook: bookMatch.canonicalBook,
    confidence,
    ambiguity: bookMatch.ambiguous ? "ambiguous" : "clear",
    debug: {
      transcriptSanitized: cleaned,
      bookMatchSource: bookMatch.source,
      reason: bookMatch.reason
    },
    structuredReference,
    query: {
      kind: "spoken_reference",
      raw: rawTranscript,
      normalized: normalizedReference,
      book: bookMatch.canonicalBook,
      canonicalBook: bookMatch.canonicalBook,
      chapter: parts.chapter,
      verseStart: parts.verseStart,
      verseEnd: parts.verseEnd ?? parts.verseStart,
      translationCode,
      confidence
    }
  };
}

export function normalizeTypedReference(input: string, translationCode: string): NormalizedResult {
  const normalized = normalizeTranscriptToReference(input, translationCode);
  return {
    ...normalized,
    ambiguity: "clear",
    query: {
      ...normalized.query,
      kind: "exact_reference"
    }
  };
}
