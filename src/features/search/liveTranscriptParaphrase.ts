import type { ParaphraseMatch } from "../../api";
import { CANONICAL_BOOK_DICTIONARY } from "../parser/spokenBookMatcher";

export type SuggestionStrength = "likely" | "possible";

export type TranscriptSuggestionCandidate = {
  anchorId: string;
  anchorLabel: string;
  normalizedAnchor: string;
  searchPhrase: string;
  expectedReferences: string[];
  strength: SuggestionStrength;
  anchorTerms: string[];
  mentionedBooks: string[];
};

export type TranscriptSuggestion = {
  id: string;
  transcript: string;
  anchorLabel: string;
  searchPhrase: string;
  strength: SuggestionStrength;
  confidenceLabel: string;
  matches: ParaphraseMatch[];
  createdAtMs: number;
};

type ConceptAnchor = {
  id: string;
  label: string;
  aliases: string[];
  searchPhrase: string;
  expectedReferences: string[];
  strength: SuggestionStrength;
};

const FILLER_PATTERNS = [
  /\b(let'?s talk about|talked about|let'?s look at|i want us to look at|open your bible to|the bible says|in the book of|you know|brethren|children of god)\b/g,
  /\b(uh|um|hmm|okay|ok|well|i mean|like|anyway|amen|hallelujah|praise the lord)\b/g
];

const CONCEPT_ANCHORS: ConceptAnchor[] = [
  { id: "ten-virgins", label: "Parable of the Ten Virgins", aliases: ["ten virgins", "10 virgins", "parable of the ten virgins"], searchPhrase: "parable ten virgins bridegroom lamp oil", expectedReferences: ["Matthew 25:1-13"], strength: "likely" },
  { id: "prodigal-son", label: "Prodigal Son", aliases: ["prodigal son", "lost son", "younger son came to himself"], searchPhrase: "prodigal son far country came to himself", expectedReferences: ["Luke 15:11-32"], strength: "likely" },
  { id: "blind-bartimaeus", label: "Blind Bartimaeus", aliases: ["blind bartimaeus", "bartimaeus", "son of david have mercy on me"], searchPhrase: "blind bartimaeus son of david have mercy", expectedReferences: ["Mark 10:46-52", "Luke 18:35-43"], strength: "likely" },
  { id: "issue-of-blood", label: "Woman with the issue of blood", aliases: ["issue of blood", "woman with the issue of blood", "touched the hem of his garment"], searchPhrase: "woman issue of blood touched hem garment", expectedReferences: ["Mark 5:25-34", "Luke 8:43-48"], strength: "likely" },
  { id: "dry-bones", label: "Valley of dry bones", aliases: ["dry bones", "valley of dry bones"], searchPhrase: "valley dry bones ezekiel", expectedReferences: ["Ezekiel 37:1-14"], strength: "likely" },
  { id: "armor-of-god", label: "Armor of God", aliases: ["armor of god", "whole armor of god", "whole armour of god"], searchPhrase: "whole armor of god stand against", expectedReferences: ["Ephesians 6:11-17"], strength: "likely" },
  { id: "faith-without-works", label: "Faith without works is dead", aliases: ["faith without works is dead", "faith without works"], searchPhrase: "faith without works is dead", expectedReferences: ["James 2:17", "James 2:26"], strength: "likely" },
  { id: "lord-shepherd", label: "The Lord is my shepherd", aliases: ["lord is my shepherd", "the lord is my shepherd"], searchPhrase: "the lord is my shepherd i shall not want", expectedReferences: ["Psalms 23:1"], strength: "likely" },
  { id: "fruit-of-spirit", label: "Fruit of the Spirit", aliases: ["fruit of the spirit"], searchPhrase: "fruit of the spirit love joy peace", expectedReferences: ["Galatians 5:22-23"], strength: "likely" },
  { id: "zacchaeus", label: "Zacchaeus", aliases: ["zacchaeus", "chief publican", "sycamore tree"], searchPhrase: "zacchaeus sycamore tree", expectedReferences: ["Luke 19:1-10"], strength: "possible" },
  { id: "lazarus", label: "Lazarus", aliases: ["lazarus", "come forth"], searchPhrase: "lazarus come forth", expectedReferences: ["John 11:1-44"], strength: "possible" },
  { id: "woman-at-well", label: "Woman at the well", aliases: ["woman at the well", "samaritan woman", "living water"], searchPhrase: "woman at the well living water", expectedReferences: ["John 4:1-26"], strength: "possible" },
  { id: "feeding-5000", label: "Feeding of the five thousand", aliases: ["feeding of the five thousand", "five loaves and two fishes", "fed five thousand"], searchPhrase: "five loaves two fishes fed five thousand", expectedReferences: ["Matthew 14:13-21", "John 6:1-14"], strength: "possible" },
  { id: "good-samaritan", label: "Good Samaritan", aliases: ["good samaritan"], searchPhrase: "parable good samaritan", expectedReferences: ["Luke 10:25-37"], strength: "possible" },
  { id: "lost-sheep", label: "Lost sheep", aliases: ["lost sheep", "ninety and nine"], searchPhrase: "lost sheep ninety and nine", expectedReferences: ["Luke 15:3-7", "Matthew 18:12-14"], strength: "possible" }
];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function stripFiller(text: string): string {
  let next = text.toLowerCase();
  for (const pattern of FILLER_PATTERNS) {
    next = next.replace(pattern, " ");
  }
  return normalizeText(next);
}

function detectMentionedBooks(transcript: string): string[] {
  const normalized = normalizeText(transcript);
  return CANONICAL_BOOK_DICTIONARY.filter((book) => normalized.includes(normalizeText(book)));
}

export function extractTranscriptSuggestionCandidate(transcript: string): TranscriptSuggestionCandidate | null {
  const normalizedTranscript = stripFiller(transcript);
  if (!normalizedTranscript || normalizedTranscript.split(" ").length < 2) {
    return null;
  }

  const mentionedBooks = detectMentionedBooks(transcript);

  let bestMatch: { anchor: ConceptAnchor; score: number; normalizedAlias: string } | null = null;
  for (const anchor of CONCEPT_ANCHORS) {
    for (const alias of anchor.aliases) {
      const normalizedAlias = normalizeText(alias);
      if (!normalizedAlias) {
        continue;
      }
      if (normalizedTranscript.includes(normalizedAlias)) {
        const aliasScore = normalizedAlias.split(" ").length + (anchor.strength === "likely" ? 2 : 1);
        if (!bestMatch || aliasScore > bestMatch.score) {
          bestMatch = { anchor, score: aliasScore, normalizedAlias };
        }
      }
    }
  }

  if (bestMatch) {
    return {
      anchorId: bestMatch.anchor.id,
      anchorLabel: bestMatch.anchor.label,
      normalizedAnchor: bestMatch.normalizedAlias,
      searchPhrase: bestMatch.anchor.searchPhrase,
      expectedReferences: bestMatch.anchor.expectedReferences,
      strength: bestMatch.anchor.strength,
      anchorTerms: bestMatch.normalizedAlias.split(" ").filter((token) => token.length > 2),
      mentionedBooks
    };
  }

  const fallbackTerms = normalizedTranscript.split(" ").filter((token) => token.length > 2).slice(0, 8);
  if (fallbackTerms.length < 2) {
    return null;
  }

  const fallbackAnchor = fallbackTerms.slice(0, 4).join(" ");
  return {
    anchorId: `general:${fallbackAnchor}`,
    anchorLabel: fallbackAnchor,
    normalizedAnchor: fallbackAnchor,
    searchPhrase: fallbackTerms.join(" "),
    expectedReferences: [],
    strength: "possible",
    anchorTerms: fallbackTerms,
    mentionedBooks
  };
}

export function rankTranscriptParaphraseMatches(matches: ParaphraseMatch[], candidate: TranscriptSuggestionCandidate): ParaphraseMatch[] {
  const expectedReferencePrefixSet = new Set(candidate.expectedReferences.map((reference) => reference.split(":")[0].toLowerCase()));
  const boostedBooks = new Set(candidate.mentionedBooks.map((book) => book.toLowerCase()));

  return [...matches]
    .map((match) => {
      const loweredRef = match.reference.toLowerCase();
      const loweredText = match.text.toLowerCase();
      let boost = 0;

      if (expectedReferencePrefixSet.has(match.reference.split(":")[0].toLowerCase())) {
        boost += 0.26;
      }

      const hitTerms = candidate.anchorTerms.filter((term) => loweredText.includes(term)).length;
      if (hitTerms > 0) {
        boost += Math.min(hitTerms * 0.06, 0.24);
      }

      for (const mentionedBook of boostedBooks) {
        if (loweredRef.startsWith(mentionedBook)) {
          boost += 0.14;
          break;
        }
      }

      return { match, score: Math.min(match.confidence + boost, 1) };
    })
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.match);
}

export function buildTranscriptSuggestionId(candidate: TranscriptSuggestionCandidate): string {
  const bookSuffix = candidate.mentionedBooks.slice(0, 2).join("|");
  return `${candidate.anchorId}:${candidate.searchPhrase}:${bookSuffix}`;
}

export function getStrengthLabel(strength: SuggestionStrength): string {
  return strength === "likely" ? "Likely" : "Possible";
}
