type CanonicalBookEntry = {
  canonical: string;
  aliases: string[];
};

const CANONICAL_BOOKS: CanonicalBookEntry[] = [
  { canonical: "Genesis", aliases: ["genesis", "gen"] },
  { canonical: "Exodus", aliases: ["exodus", "exo", "exod"] },
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
  { canonical: "Nehemiah", aliases: ["nehemiah", "neh", "nehemia"] },
  { canonical: "Esther", aliases: ["esther"] },
  { canonical: "Job", aliases: ["job"] },
  { canonical: "Psalms", aliases: ["psalm", "psalms", "psalm's", "ps"] },
  { canonical: "Proverbs", aliases: ["proverb", "proverbs", "prov"] },
  {
    canonical: "Ecclesiastes",
    aliases: ["ecclesiastes", "eccl", "ecclesiastic", "eccleasiastes", "ecclesiasties", "ecclessiastes"]
  },
  { canonical: "Song of Solomon", aliases: ["song", "song of songs", "song of solomon"] },
  { canonical: "Isaiah", aliases: ["isaiah", "isa"] },
  { canonical: "Jeremiah", aliases: ["jeremiah", "jer"] },
  {
    canonical: "Lamentations",
    aliases: ["lamentation", "lamentations", "lam", "lamintations", "lamenations"]
  },
  { canonical: "Ezekiel", aliases: ["ezekiel", "ezek"] },
  { canonical: "Daniel", aliases: ["daniel", "dan"] },
  { canonical: "Hosea", aliases: ["hosea", "hos"] },
  { canonical: "Joel", aliases: ["joel"] },
  { canonical: "Amos", aliases: ["amos"] },
  { canonical: "Obadiah", aliases: ["obadiah", "obad", "obediah"] },
  { canonical: "Jonah", aliases: ["jonah"] },
  { canonical: "Micah", aliases: ["micah", "mic"] },
  { canonical: "Nahum", aliases: ["nahum", "nah", "nahem"] },
  { canonical: "Habakkuk", aliases: ["habakkuk", "hab", "habakuk", "habacuc", "habakkak"] },
  { canonical: "Zephaniah", aliases: ["zephaniah", "zeph", "zephania", "zefaniah", "zefeniah"] },
  { canonical: "Haggai", aliases: ["haggai", "hag", "hagee", "haggi"] },
  { canonical: "Zechariah", aliases: ["zechariah", "zech", "zachariah"] },
  { canonical: "Malachi", aliases: ["malachi", "mal", "malakai"] },
  { canonical: "Matthew", aliases: ["matthew", "matt"] },
  { canonical: "Mark", aliases: ["mark", "mrk"] },
  { canonical: "Luke", aliases: ["luke", "luk"] },
  { canonical: "John", aliases: ["john", "jn"] },
  { canonical: "Acts", aliases: ["acts"] },
  { canonical: "Romans", aliases: ["romans", "rom"] },
  { canonical: "1 Corinthians", aliases: ["1 corinthians", "first corinthians", "one corinthians", "1st corinthians", "1 cor"] },
  { canonical: "2 Corinthians", aliases: ["2 corinthians", "second corinthians", "two corinthians", "2nd corinthians", "2 cor"] },
  { canonical: "Galatians", aliases: ["galatians", "gal"] },
  { canonical: "Ephesians", aliases: ["ephesians", "eph"] },
  { canonical: "Philippians", aliases: ["philippians", "phil"] },
  { canonical: "Colossians", aliases: ["colossians", "col"] },
  {
    canonical: "1 Thessalonians",
    aliases: ["1 thessalonians", "first thessalonians", "one thessalonians", "1st thessalonians", "first thesselonians", "1 thess", "first thess"]
  },
  {
    canonical: "2 Thessalonians",
    aliases: ["2 thessalonians", "second thessalonians", "two thessalonians", "2nd thessalonians", "second thesselonians", "2 thess", "second thess"]
  },
  { canonical: "1 Timothy", aliases: ["1 timothy", "first timothy", "one timothy", "1st timothy", "1 tim"] },
  { canonical: "2 Timothy", aliases: ["2 timothy", "second timothy", "two timothy", "2nd timothy", "2 tim"] },
  { canonical: "Titus", aliases: ["titus", "tit"] },
  { canonical: "Philemon", aliases: ["philemon", "phlm", "phileman", "filemon", "philemin"] },
  { canonical: "Hebrews", aliases: ["hebrews", "heb"] },
  { canonical: "James", aliases: ["james", "jas"] },
  { canonical: "1 Peter", aliases: ["1 peter", "first peter", "one peter", "1st peter", "1 pet"] },
  { canonical: "2 Peter", aliases: ["2 peter", "second peter", "two peter", "2nd peter", "2 pet"] },
  { canonical: "1 John", aliases: ["1 john", "first john", "one john", "1st john"] },
  { canonical: "2 John", aliases: ["2 john", "second john", "two john", "2nd john"] },
  { canonical: "3 John", aliases: ["3 john", "third john", "three john", "3rd john"] },
  { canonical: "Jude", aliases: ["jude"] },
  { canonical: "Revelation", aliases: ["revelation", "revelations", "rev"] }
];

type FlattenedAlias = {
  alias: string;
  aliasTokens: string[];
  canonical: string;
};

function normalizeAlias(alias: string): string {
  return alias
    .toLowerCase()
    .replace(/\bfirst\b/g, "1")
    .replace(/\bsecond\b/g, "2")
    .replace(/\bthird\b/g, "3")
    .replace(/\b1st\b/g, "1")
    .replace(/\b2nd\b/g, "2")
    .replace(/\b3rd\b/g, "3")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FLATTENED_ALIASES: FlattenedAlias[] = CANONICAL_BOOKS.flatMap((book) =>
  book.aliases.map((alias) => {
    const normalizedAlias = normalizeAlias(alias);
    return {
      alias: normalizedAlias,
      aliasTokens: normalizedAlias.split(" ").filter(Boolean),
      canonical: book.canonical
    };
  })
);

const MAX_ALIAS_TOKEN_LENGTH = Math.max(...FLATTENED_ALIASES.map((entry) => entry.aliasTokens.length));

export type MatchResult = {
  canonicalBook?: string;
  consumedTokenCount: number;
  confidence: number;
  ambiguous: boolean;
  source: "none" | "exact" | "fuzzy";
  bestCandidate?: string;
  reason?: string;
};

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + substitutionCost
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarityScore(a: string, b: string): number {
  if (!a || !b) {
    return 0;
  }

  const distance = levenshteinDistance(a, b);
  const longestLength = Math.max(a.length, b.length);
  return longestLength === 0 ? 0 : 1 - distance / longestLength;
}

function fuzzyThresholdByTokenCount(tokenCount: number): number {
  if (tokenCount <= 1) {
    return 0.95;
  }

  if (tokenCount === 2) {
    return 0.92;
  }

  return 0.88;
}

export function matchSpokenBook(transcript: string): MatchResult {
  const tokens = normalizeAlias(transcript).split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return { consumedTokenCount: 0, confidence: 0, ambiguous: true, source: "none", reason: "No transcript tokens" };
  }

  for (let tokenLength = Math.min(tokens.length, MAX_ALIAS_TOKEN_LENGTH); tokenLength >= 1; tokenLength -= 1) {
    const candidate = tokens.slice(0, tokenLength).join(" ");
    const exactMatch = FLATTENED_ALIASES.find((entry) => entry.alias === candidate);

    if (exactMatch) {
      return {
        canonicalBook: exactMatch.canonical,
        consumedTokenCount: tokenLength,
        confidence: 1,
        ambiguous: false,
        source: "exact",
        bestCandidate: exactMatch.canonical
      };
    }
  }

  let bestFuzzyMatch: { canonical: string; consumedTokenCount: number; score: number } | undefined;
  let secondBestScore = 0;

  for (let tokenLength = Math.min(tokens.length, MAX_ALIAS_TOKEN_LENGTH); tokenLength >= 1; tokenLength -= 1) {
    const candidate = tokens.slice(0, tokenLength).join(" ");

    for (const alias of FLATTENED_ALIASES) {
      if (alias.aliasTokens.length !== tokenLength) {
        continue;
      }

      const score = similarityScore(candidate, alias.alias);

      if (!bestFuzzyMatch || score > bestFuzzyMatch.score) {
        secondBestScore = bestFuzzyMatch?.score ?? secondBestScore;
        bestFuzzyMatch = { canonical: alias.canonical, consumedTokenCount: tokenLength, score };
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }
  }

  if (!bestFuzzyMatch) {
    return { consumedTokenCount: 0, confidence: 0, ambiguous: true, source: "none", reason: "No fuzzy candidate" };
  }

  const minimumScore = fuzzyThresholdByTokenCount(bestFuzzyMatch.consumedTokenCount);
  const margin = bestFuzzyMatch.score - secondBestScore;
  const hasSafeConfidence = bestFuzzyMatch.score >= minimumScore && margin >= 0.05;

  if (!hasSafeConfidence) {
    return {
      consumedTokenCount: 0,
      confidence: bestFuzzyMatch.score,
      ambiguous: true,
      source: "none",
      bestCandidate: bestFuzzyMatch.canonical,
      reason: `Fuzzy score ${bestFuzzyMatch.score.toFixed(2)} below safety rules`
    };
  }

  return {
    canonicalBook: bestFuzzyMatch.canonical,
    consumedTokenCount: bestFuzzyMatch.consumedTokenCount,
    confidence: bestFuzzyMatch.score,
    ambiguous: false,
    source: "fuzzy",
    bestCandidate: bestFuzzyMatch.canonical
  };
}

export const CANONICAL_BOOK_DICTIONARY = CANONICAL_BOOKS.map((entry) => entry.canonical);
