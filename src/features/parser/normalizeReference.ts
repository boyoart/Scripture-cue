import type { VerseQuery } from "../../types/search";

type NormalizedResult = {
  query: VerseQuery;
  rawTranscript: string;
  normalizedReference: string;
  confidence: number;
  canonicalBook?: string;
};

type BookAlias = {
  canonical: string;
  aliases: string[];
};

const BOOK_ALIASES: BookAlias[] = [
  { canonical: "Genesis", aliases: ["genesis", "gen"] },
  { canonical: "Exodus", aliases: ["exodus", "exo"] },
  { canonical: "Psalm", aliases: ["psalm", "psalms", "ps"] },
  { canonical: "Isaiah", aliases: ["isaiah", "isa"] },
  { canonical: "Matthew", aliases: ["matthew", "matt"] },
  { canonical: "John", aliases: ["john", "jn"] },
  { canonical: "Romans", aliases: ["romans", "rom"] },
  {
    canonical: "1 Corinthians",
    aliases: ["1 corinthians", "first corinthians", "one corinthians", "1st corinthians"]
  },
  {
    canonical: "2 Corinthians",
    aliases: ["2 corinthians", "second corinthians", "two corinthians", "2nd corinthians"]
  }
];

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

function sanitizeTranscript(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,!?;]+/g, " ")
    .replace(/(chapter|verse|verses)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchBookAlias(normalizedText: string): { canonicalBook?: string; consumedAlias?: string } {
  let selected: { canonicalBook?: string; consumedAlias?: string } = {};
  let longest = 0;

  for (const book of BOOK_ALIASES) {
    for (const alias of book.aliases) {
      if ((normalizedText.startsWith(`${alias} `) || normalizedText === alias) && alias.length > longest) {
        selected = { canonicalBook: book.canonical, consumedAlias: alias };
        longest = alias.length;
      }
    }
  }

  return selected;
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
  let index = startIndex;
  let value = 0;
  let consumed = 0;

  while (index < tokens.length) {
    const token = tokens[index];

    if (RANGE_JOINERS.has(token)) {
      break;
    }

    if (/^\d+$/.test(token)) {
      value = Number(token);
      consumed += 1;
      break;
    }

    const mapped = parseNumericToken(token);
    if (mapped === null) {
      break;
    }

    if (mapped === 100 && value > 0) {
      value *= 100;
    } else {
      value += mapped;
    }

    index += 1;
    consumed += 1;

    if (consumed > 3) {
      break;
    }
  }

  return consumed > 0 ? { value, consumed } : null;
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

function parseReferenceParts(remaining: string): {
  chapter?: number;
  verseStart?: number;
  verseEnd?: number;
  confidenceBoost: number;
} {
  if (!remaining) {
    return { confidenceBoost: 0.04 };
  }

  const colonMatch = remaining.match(/(\d+)\s*:\s*(\d+)(?:\s*[-to]+\s*(\d+))?/);
  if (colonMatch) {
    return {
      chapter: Number(colonMatch[1]),
      verseStart: Number(colonMatch[2]),
      verseEnd: colonMatch[3] ? Number(colonMatch[3]) : undefined,
      confidenceBoost: 0.3
    };
  }

  const compactMatch = remaining.match(/^(\d{3,4})$/);
  if (compactMatch) {
    const compact = compactMatch[1];
    const splitAt = compact.length === 3 ? 1 : 2;
    return {
      chapter: Number(compact.slice(0, splitAt)),
      verseStart: Number(compact.slice(splitAt)),
      confidenceBoost: 0.24
    };
  }

  const tokens = remaining.split(" ").filter(Boolean);
  const values: number[] = [];
  let sawRangeJoiner = false;

  for (let i = 0; i < tokens.length; i += 1) {
    if (RANGE_JOINERS.has(tokens[i])) {
      sawRangeJoiner = true;
      continue;
    }

    const parsed = parseNumberWords(tokens, i);
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
    return { chapter: values[0], confidenceBoost: 0.1 };
  }

  return { confidenceBoost: -0.15 };
}

export function normalizeTranscriptToReference(rawTranscript: string, translationCode: string): NormalizedResult {
  const cleaned = sanitizeTranscript(rawTranscript);
  const bookMatch = matchBookAlias(cleaned);

  if (!bookMatch.canonicalBook || !bookMatch.consumedAlias) {
    return {
      rawTranscript,
      normalizedReference: cleaned,
      confidence: 0.1,
      query: {
        kind: "phrase",
        raw: rawTranscript,
        phrase: cleaned,
        confidence: 0.1,
        translationCode
      }
    };
  }

  const remainder = cleaned.slice(bookMatch.consumedAlias.length).trim();
  const parts = parseReferenceParts(remainder);
  const confidence = Math.max(0, Math.min(0.99, 0.45 + parts.confidenceBoost + (parts.chapter ? 0.15 : 0)));

  const normalizedReference = parts.chapter
    ? toReferenceString(bookMatch.canonicalBook, parts.chapter, parts.verseStart, parts.verseEnd)
    : bookMatch.canonicalBook;

  return {
    rawTranscript,
    normalizedReference,
    canonicalBook: bookMatch.canonicalBook,
    confidence,
    query: {
      kind: "spoken_reference",
      raw: rawTranscript,
      normalized: normalizedReference,
      canonicalBook: bookMatch.canonicalBook,
      chapter: parts.chapter,
      verseStart: parts.verseStart,
      verseEnd: parts.verseEnd,
      translationCode,
      confidence
    }
  };
}

export function normalizeTypedReference(input: string, translationCode: string): NormalizedResult {
  return normalizeTranscriptToReference(input, translationCode);
}
