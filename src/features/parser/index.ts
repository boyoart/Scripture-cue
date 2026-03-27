import type { QueryType, VerseQuery } from "../../types/search";

const BOOK_ALIASES: Record<string, string[]> = {
  Genesis: ["genesis", "gen"],
  Exodus: ["exodus", "exo"],
  Leviticus: ["leviticus", "lev"],
  Numbers: ["numbers", "num"],
  Deuteronomy: ["deuteronomy", "deut"],
  Joshua: ["joshua", "josh"],
  Judges: ["judges", "judge"],
  Ruth: ["ruth"],
  "1 Samuel": ["1 samuel", "first samuel", "one samuel"],
  "2 Samuel": ["2 samuel", "second samuel", "two samuel"],
  "1 Kings": ["1 kings", "first kings", "one kings"],
  "2 Kings": ["2 kings", "second kings", "two kings"],
  Psalms: ["psalm", "psalms", "salms", "salm"],
  Proverbs: ["proverbs", "proverb", "proverbz"],
  Isaiah: ["isaiah", "isiah", "isaia", "iziah"],
  Jeremiah: ["jeremiah", "jeremeya"],
  Ezekiel: ["ezekiel", "ezekial"],
  Daniel: ["daniel", "danial"],
  Matthew: ["matthew", "mathew"],
  Mark: ["mark"],
  Luke: ["luke", "luuk"],
  John: ["john", "jon", "jhn"],
  Acts: ["acts", "act"],
  Romans: ["romans", "roman"],
  "1 Corinthians": [
    "1 corinthians",
    "first corinthians",
    "one corinthians",
    "corinthians one",
    "first corinthian"
  ],
  "2 Corinthians": [
    "2 corinthians",
    "second corinthians",
    "two corinthians",
    "corinthians two",
    "second corinthian"
  ],
  Galatians: ["galatians", "galations"],
  Ephesians: ["ephesians", "efesians"],
  Philippians: ["philippians", "filippians"],
  Colossians: ["colossians", "colosians"],
  "1 Thessalonians": ["1 thessalonians", "first thessalonians", "one thessalonians"],
  "2 Thessalonians": ["2 thessalonians", "second thessalonians", "two thessalonians"],
  "1 Timothy": ["1 timothy", "first timothy", "one timothy"],
  "2 Timothy": ["2 timothy", "second timothy", "two timothy", "second timoty"],
  Titus: ["titus"],
  Philemon: ["philemon", "filemon"],
  Hebrews: ["hebrews"],
  James: ["james"],
  "1 Peter": ["1 peter", "first peter", "one peter"],
  "2 Peter": ["2 peter", "second peter", "two peter"],
  "1 John": ["1 john", "first john", "one john"],
  "2 John": ["2 john", "second john", "two john"],
  "3 John": ["3 john", "third john", "three john"],
  Jude: ["jude"],
  Revelation: ["revelation", "revelations"],
};

const NUMBER_WORDS: Record<string, number> = {
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
};

const ORDINAL_BOOK_PREFIX: Record<string, string> = {
  first: "1",
  second: "2",
  third: "3",
};

type BookMatch = {
  canonicalBook: string;
  consumed: number;
  score: number;
};

export interface ParserDebug {
  rawTranscript: string;
  normalizedReference: string;
  canonicalBookMatch?: string;
  parserConfidence: number;
}

export interface ParseOutput {
  query: VerseQuery;
  debug: ParserDebug;
}

function normalizeInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[,:;()]/g, " ")
    .replace(/\bverses\b/g, "verse")
    .replace(/\bchapters\b/g, "chapter")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumberToken(token: string): string {
  if (ORDINAL_BOOK_PREFIX[token]) {
    return ORDINAL_BOOK_PREFIX[token];
  }
  return token;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(i));
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function findBook(tokens: string[]): BookMatch | undefined {
  let best: BookMatch | undefined;

  for (const [canonicalBook, aliases] of Object.entries(BOOK_ALIASES)) {
    for (const alias of aliases) {
      const aliasTokens = alias.split(" ");
      const spokenSlice = tokens.slice(0, aliasTokens.length).join(" ");
      if (!spokenSlice) continue;

      if (spokenSlice === alias) {
        const exact = { canonicalBook, consumed: aliasTokens.length, score: 0.99 };
        if (!best || exact.score > best.score) best = exact;
        continue;
      }

      const distance = levenshtein(spokenSlice, alias);
      const maxLen = Math.max(spokenSlice.length, alias.length);
      const score = 1 - distance / Math.max(maxLen, 1);
      if (score > 0.72) {
        const candidate = { canonicalBook, consumed: aliasTokens.length, score: score * 0.85 };
        if (!best || candidate.score > best.score) best = candidate;
      }
    }
  }

  return best;
}

function parseSpokenNumber(tokens: string[], startIndex: number): { value?: number; consumed: number } {
  const first = tokens[startIndex];
  if (!first) return { consumed: 0 };
  if (/^\d+$/.test(first)) return { value: Number(first), consumed: 1 };

  let value = 0;
  let consumed = 0;
  for (let i = startIndex; i < tokens.length; i += 1) {
    const token = tokens[i];
    const number = NUMBER_WORDS[token];
    if (number === undefined) break;
    consumed += 1;

    if (number === 100) {
      value = Math.max(value, 1) * 100;
    } else {
      value += number;
    }

    if (consumed >= 3) break;
  }

  return consumed > 0 ? { value, consumed } : { consumed: 0 };
}


function parseNumberSpan(span: string[]): number | undefined {
  if (span.length === 0) return undefined;
  const parsed = parseSpokenNumber(span, 0);
  if (!parsed.value || parsed.consumed !== span.length) return undefined;
  return parsed.value;
}

function parseReferenceTokens(tokens: string[]): Omit<VerseQuery, "raw" | "kind"> {
  const bookMatch = findBook(tokens);
  if (!bookMatch) return { phrase: tokens.join(" "), confidence: 0.2 };

  let pointer = bookMatch.consumed;
  const hasChapterWord = tokens[pointer] === "chapter";
  if (hasChapterWord) pointer += 1;

  const verseWordIndex = tokens.indexOf("verse", pointer);

  let chapterValue: number | undefined;
  let chapterConsumed = 0;
  let verseValue: number | undefined;
  let verseConsumed = 0;

  if (verseWordIndex > pointer) {
    const chapterChunk = parseSpokenNumber(tokens, pointer);
    chapterValue = chapterChunk.value;
    chapterConsumed = chapterChunk.consumed;

    const verseChunk = parseSpokenNumber(tokens, verseWordIndex + 1);
    verseValue = verseChunk.value;
    verseConsumed = verseChunk.consumed;
    pointer = verseWordIndex + 1;
  } else if (hasChapterWord) {
    const chapterChunk = parseSpokenNumber(tokens, pointer);
    chapterValue = chapterChunk.value;
    chapterConsumed = chapterChunk.consumed;
    pointer += chapterConsumed;

    const maybeVerseWord = tokens[pointer] === "verse" ? pointer + 1 : pointer;
    const verseChunk = parseSpokenNumber(tokens, maybeVerseWord);
    verseValue = verseChunk.value;
    verseConsumed = verseChunk.consumed;
    pointer = maybeVerseWord;
  } else {
    const remainder = tokens.slice(pointer);
    let bestInference: { chapter: number; chapterSize: number; verse: number; verseSize: number; score: number } | undefined;

    for (let chapterSize = 1; chapterSize <= Math.min(3, remainder.length - 1); chapterSize += 1) {
      const chapterTokens = remainder.slice(0, chapterSize);
      const chapterParsed = parseNumberSpan(chapterTokens);
      if (!chapterParsed) continue;

      for (let verseSize = 1; verseSize <= Math.min(3, remainder.length - chapterSize); verseSize += 1) {
        const possibleVerse = parseNumberSpan(remainder.slice(chapterSize, chapterSize + verseSize));
        if (!possibleVerse) continue;

        const chapterRaw = chapterTokens.join(" ");
        const verseRaw = remainder.slice(chapterSize, chapterSize + verseSize).join(" ");
        const chapterIsTensPair = /^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+\w+$/.test(chapterRaw);
        const verseIsTensPair = /^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+\w+$/.test(verseRaw);

        if (chapterSize > 1 && !chapterIsTensPair) continue;
        if (verseSize > 1 && !verseIsTensPair) continue;

        const consumed = chapterSize + verseSize;
        const tailToken = remainder[consumed];
        const tailBonus = !tailToken || tailToken === "to" || tailToken === "through" || tailToken === "-" ? 0.5 : 0;
        const score = consumed + tailBonus - chapterSize * 0.05;

        if (!bestInference || score > bestInference.score) {
          bestInference = {
            chapter: chapterParsed,
            chapterSize,
            verse: possibleVerse,
            verseSize,
            score,
          };
        }
      }
    }

    if (bestInference) {
      chapterValue = bestInference.chapter;
      chapterConsumed = bestInference.chapterSize;
      verseValue = bestInference.verse;
      verseConsumed = bestInference.verseSize;
      pointer = bookMatch.consumed + bestInference.chapterSize;
    }
  }

  if (!chapterValue) {
    return {
      canonicalBook: bookMatch.canonicalBook,
      phrase: tokens.join(" "),
      confidence: Math.max(bookMatch.score - 0.2, 0.2),
    };
  }

  if (!verseValue) {
    return {
      canonicalBook: bookMatch.canonicalBook,
      chapter: chapterValue,
      confidence: Math.max(bookMatch.score - 0.1, 0.3),
    };
  }

  let verseEnd = verseValue;
  const rangeTokenIndex = pointer + verseConsumed;
  if (tokens[rangeTokenIndex] === "to" || tokens[rangeTokenIndex] === "through" || tokens[rangeTokenIndex] === "-") {
    const rangePart = parseSpokenNumber(tokens, rangeTokenIndex + 1);
    if (rangePart.value && rangePart.value >= verseValue) {
      verseEnd = rangePart.value;
    }
  }

  return {
    canonicalBook: bookMatch.canonicalBook,
    chapter: chapterValue,
    verseStart: verseValue,
    verseEnd,
    normalized: `${bookMatch.canonicalBook} ${chapterValue}:${verseValue}${verseEnd > verseValue ? `-${verseEnd}` : ""}`,
    confidence: Math.min(0.99, bookMatch.score + 0.08),
  };
}

function classifyQuery(parsed: Omit<VerseQuery, "raw" | "kind">): QueryType {
  if (parsed.canonicalBook && parsed.chapter && parsed.verseStart) return "spoken_reference";
  return "phrase";
}

export function parseScriptureQuery(raw: string): ParseOutput {
  const normalizedRaw = normalizeInput(raw);
  const tokens = normalizedRaw.split(" ").filter(Boolean).map(toNumberToken);
  const parsed = parseReferenceTokens(tokens);
  const kind = classifyQuery(parsed);
  const query: VerseQuery = {
    raw,
    kind,
    ...parsed,
  };

  return {
    query,
    debug: {
      rawTranscript: raw,
      normalizedReference: query.normalized ?? normalizedRaw,
      canonicalBookMatch: query.canonicalBook,
      parserConfidence: query.confidence ?? 0,
    },
  };
}
