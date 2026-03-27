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
  { canonical: "Leviticus", aliases: ["leviticus", "lev"] },
  { canonical: "Numbers", aliases: ["numbers", "num"] },
  { canonical: "Deuteronomy", aliases: ["deuteronomy", "deut"] },
  { canonical: "Joshua", aliases: ["joshua", "josh"] },
  { canonical: "Judges", aliases: ["judges", "judg"] },
  { canonical: "Ruth", aliases: ["ruth"] },
  { canonical: "1 Samuel", aliases: ["1 samuel", "first samuel", "one samuel", "1st samuel"] },
  { canonical: "2 Samuel", aliases: ["2 samuel", "second samuel", "two samuel", "2nd samuel"] },
  { canonical: "1 Kings", aliases: ["1 kings", "first kings", "one kings", "1st kings"] },
  { canonical: "2 Kings", aliases: ["2 kings", "second kings", "two kings", "2nd kings"] },
  { canonical: "1 Chronicles", aliases: ["1 chronicles", "first chronicles", "one chronicles", "1st chronicles"] },
  { canonical: "2 Chronicles", aliases: ["2 chronicles", "second chronicles", "two chronicles", "2nd chronicles"] },
  { canonical: "Ezra", aliases: ["ezra"] },
  { canonical: "Nehemiah", aliases: ["nehemiah", "neh"] },
  { canonical: "Esther", aliases: ["esther"] },
  { canonical: "Job", aliases: ["job"] },
  { canonical: "Psalm", aliases: ["psalm", "psalms", "psalm's", "ps"] },
  { canonical: "Proverbs", aliases: ["proverbs", "prov"] },
  { canonical: "Ecclesiastes", aliases: ["ecclesiastes", "eccl"] },
  { canonical: "Song of Solomon", aliases: ["song of solomon", "song", "song of songs"] },
  { canonical: "Isaiah", aliases: ["isaiah", "isa"] },
  { canonical: "Jeremiah", aliases: ["jeremiah", "jer"] },
  { canonical: "Lamentations", aliases: ["lamentations", "lam"] },
  { canonical: "Ezekiel", aliases: ["ezekiel", "ezek"] },
  { canonical: "Daniel", aliases: ["daniel", "dan"] },
  { canonical: "Hosea", aliases: ["hosea", "hos"] },
  { canonical: "Joel", aliases: ["joel"] },
  { canonical: "Amos", aliases: ["amos"] },
  { canonical: "Obadiah", aliases: ["obadiah", "obad"] },
  { canonical: "Jonah", aliases: ["jonah"] },
  { canonical: "Micah", aliases: ["micah", "mic"] },
  { canonical: "Nahum", aliases: ["nahum", "nah"] },
  { canonical: "Habakkuk", aliases: ["habakkuk", "hab"] },
  { canonical: "Zephaniah", aliases: ["zephaniah", "zeph"] },
  { canonical: "Haggai", aliases: ["haggai", "hag"] },
  { canonical: "Zechariah", aliases: ["zechariah", "zech"] },
  { canonical: "Malachi", aliases: ["malachi", "mal"] },
  { canonical: "Matthew", aliases: ["matthew", "matt"] },
  { canonical: "Mark", aliases: ["mark", "mrk"] },
  { canonical: "Luke", aliases: ["luke", "luk"] },
  { canonical: "John", aliases: ["john", "jn"] },
  { canonical: "Acts", aliases: ["acts"] },
  { canonical: "Romans", aliases: ["romans", "rom"] },
  { canonical: "1 Corinthians", aliases: ["1 corinthians", "first corinthians", "one corinthians", "1st corinthians"] },
  { canonical: "2 Corinthians", aliases: ["2 corinthians", "second corinthians", "two corinthians", "2nd corinthians"] },
  { canonical: "Galatians", aliases: ["galatians", "gal"] },
  { canonical: "Ephesians", aliases: ["ephesians", "eph"] },
  { canonical: "Philippians", aliases: ["philippians", "phil"] },
  { canonical: "Colossians", aliases: ["colossians", "col"] },
  { canonical: "1 Thessalonians", aliases: ["1 thessalonians", "first thessalonians", "one thessalonians", "1st thessalonians"] },
  { canonical: "2 Thessalonians", aliases: ["2 thessalonians", "second thessalonians", "two thessalonians", "2nd thessalonians"] },
  { canonical: "1 Timothy", aliases: ["1 timothy", "first timothy", "one timothy", "1st timothy"] },
  { canonical: "2 Timothy", aliases: ["2 timothy", "second timothy", "two timothy", "2nd timothy"] },
  { canonical: "Titus", aliases: ["titus", "tit"] },
  { canonical: "Philemon", aliases: ["philemon", "phlm"] },
  { canonical: "Hebrews", aliases: ["hebrews", "heb"] },
  { canonical: "James", aliases: ["james", "jas"] },
  { canonical: "1 Peter", aliases: ["1 peter", "first peter", "one peter", "1st peter"] },
  { canonical: "2 Peter", aliases: ["2 peter", "second peter", "two peter", "2nd peter"] },
  { canonical: "1 John", aliases: ["1 john", "first john", "one john", "1st john"] },
  { canonical: "2 John", aliases: ["2 john", "second john", "two john", "2nd john"] },
  { canonical: "3 John", aliases: ["3 john", "third john", "three john", "3rd john"] },
  { canonical: "Jude", aliases: ["jude"] },
  { canonical: "Revelation", aliases: ["revelation", "rev"] }
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
    .replace(/[!?()[\]{}"'`]/g, " ")
    .replace(/[.,;]+/g, " ")
    .replace(/\bchapter\s*(\d+)/g, " chapter $1 ")
    .replace(/\bverse\s*(\d+)/g, " verse $1 ")
    .replace(/\bverses\s*(\d+)/g, " verse $1 ")
    .replace(/\b(and|then|please|find|show|me|the)\b/g, " ")
    .replace(/\bchapter\b/g, " chapter ")
    .replace(/\bverses?\b/g, " verse ")
    .replace(/\bcolon\b/g, " : ")
    .replace(/\s*:\s*/g, " : ")
    .replace(/\s+-\s+/g, " - ")
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

  const colonMatch = remaining.match(/(\d+)\s*:\s*(\d+)(?:\s*(?:-|to|through|thru)\s*(\d+))?/);
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

  const tokens = remaining
    .replace(/\bchapter\b/g, " ")
    .replace(/\bverse\b/g, " ")
    .split(" ")
    .filter(Boolean);
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
  const recognizedVerses = parts.verseStart ? 0.16 : 0;
  const recognizedRange = parts.verseEnd ? 0.08 : 0;
  const confidence = Math.max(
    0,
    Math.min(0.99, 0.38 + parts.confidenceBoost + (parts.chapter ? 0.2 : 0) + recognizedVerses + recognizedRange)
  );

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
