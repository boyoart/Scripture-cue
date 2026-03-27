import type { VerseQuery } from "../../types/search";

const NUMBER_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  one: 1,
  two: 2,
  three: 3
};

const KNOWN_BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalm",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation"
];

export const PARSER_FEATURE_READY = true;

function titleCase(input: string): string {
  return input
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeSpoken(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/[,.;!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((token) => {
      if (token in NUMBER_WORDS) {
        return NUMBER_WORDS[token].toString();
      }
      if (token === "verse" || token === "verses") {
        return "";
      }
      return token;
    })
    .filter(Boolean);

  return tokens.join(" ");
}

function detectReferenceTokens(tokens: string[]): VerseQuery | null {
  const chapterVerseTokenIndex = tokens.findIndex((token) => /\d+:\d+(-\d+)?/.test(token));

  if (chapterVerseTokenIndex > 0) {
    const book = titleCase(tokens.slice(0, chapterVerseTokenIndex).join(" "));
    const chapterVerse = tokens[chapterVerseTokenIndex];
    const match = chapterVerse.match(/(\d+):(\d+)(?:-(\d+))?/);
    if (!match) return null;

    const chapter = Number.parseInt(match[1], 10);
    const verseStart = Number.parseInt(match[2], 10);
    const verseEnd = match[3] ? Number.parseInt(match[3], 10) : verseStart;

    return {
      kind: "exact_reference",
      raw: tokens.join(" "),
      normalized: `${book} ${chapter}:${verseStart}${verseEnd > verseStart ? `-${verseEnd}` : ""}`,
      canonicalBook: book,
      chapter,
      verseStart,
      verseEnd,
      confidence: 1
    };
  }

  const trailingNumbers = tokens.join(" ").match(/(.+?)\s(\d+)\s(\d+)(?:\s*-\s*(\d+))?$/);

  if (trailingNumbers) {
    const book = titleCase(trailingNumbers[1]);
    const chapter = Number.parseInt(trailingNumbers[2], 10);
    const verseStart = Number.parseInt(trailingNumbers[3], 10);
    const verseEnd = trailingNumbers[4] ? Number.parseInt(trailingNumbers[4], 10) : verseStart;

    return {
      kind: "spoken_reference",
      raw: tokens.join(" "),
      normalized: `${book} ${chapter}:${verseStart}${verseEnd > verseStart ? `-${verseEnd}` : ""}`,
      canonicalBook: book,
      chapter,
      verseStart,
      verseEnd,
      confidence: 0.9
    };
  }

  return null;
}

export function parseScriptureInput(rawInput: string, translationCode = "KJV"): VerseQuery {
  const normalizedSpoken = normalizeSpoken(rawInput);
  const tokens = normalizedSpoken.split(" ").filter(Boolean);

  const detectedReference = detectReferenceTokens(tokens);
  if (detectedReference && KNOWN_BOOKS.some((book) => detectedReference.canonicalBook?.includes(book.split(" ").slice(-1)[0]))) {
    return { ...detectedReference, raw: rawInput, translationCode };
  }

  return {
    kind: "phrase",
    raw: rawInput,
    normalized: normalizedSpoken,
    phrase: normalizedSpoken,
    translationCode,
    confidence: 0.65
  };
}
