import type { ParaphraseMatch } from "../../api";
import { CANONICAL_BOOK_DICTIONARY } from "../parser/spokenBookMatcher";

export type SuggestionStrength = "strong" | "likely" | "possible";

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

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12"
};

const FILLER_PATTERNS = [
  /\b(let'?s talk about|talked about|let'?s look at|i want us to look at|open your bible to|the bible says|in the book of|you know|brethren|children of god|that place where jesus talked about)\b/g,
  /\b(uh|um|hmm|okay|ok|well|i mean|like|anyway|amen|hallelujah|praise the lord)\b/g
];

const CONCEPT_ANCHORS: ConceptAnchor[] = [
  { id: "issue-of-blood", label: "Woman with the issue of blood", aliases: ["issue of blood", "woman with the issue of blood", "touched the hem of his garment"], searchPhrase: "woman issue of blood touched hem garment", expectedReferences: ["Mark 5:25-34", "Luke 8:43-48"], strength: "strong" },
  { id: "ten-virgins", label: "Parable of the Ten Virgins", aliases: ["ten virgins", "10 virgins", "parable of the ten virgins", "parable of 10 virgins", "virgins with lamps", "wise and foolish virgins"], searchPhrase: "parable ten virgins bridegroom lamp oil", expectedReferences: ["Matthew 25:1-13"], strength: "strong" },
  { id: "prodigal-son", label: "Prodigal Son", aliases: ["prodigal son", "lost son", "younger son came to himself", "far country"], searchPhrase: "prodigal son far country came to himself", expectedReferences: ["Luke 15:11-32"], strength: "strong" },
  { id: "good-samaritan", label: "Good Samaritan", aliases: ["good samaritan", "neighbor on the road to jericho"], searchPhrase: "parable good samaritan neighbor", expectedReferences: ["Luke 10:25-37"], strength: "likely" },
  { id: "lost-sheep", label: "Lost sheep", aliases: ["lost sheep", "ninety and nine", "ninety nine sheep"], searchPhrase: "lost sheep ninety and nine", expectedReferences: ["Luke 15:3-7", "Matthew 18:12-14"], strength: "likely" },
  { id: "lost-coin", label: "Lost coin", aliases: ["lost coin", "woman who lost a coin", "ten pieces of silver"], searchPhrase: "lost coin ten pieces of silver", expectedReferences: ["Luke 15:8-10"], strength: "likely" },
  { id: "sower-seed", label: "Sower and the seed", aliases: ["sower and the seed", "parable of the sower", "seed fell by the wayside"], searchPhrase: "parable sower seed wayside thorny ground", expectedReferences: ["Matthew 13:3-9", "Mark 4:3-9", "Luke 8:5-8"], strength: "likely" },
  { id: "blind-bartimaeus", label: "Blind Bartimaeus", aliases: ["blind bartimaeus", "bartimaeus", "son of david have mercy on me"], searchPhrase: "blind bartimaeus son of david have mercy", expectedReferences: ["Mark 10:46-52", "Luke 18:35-43"], strength: "strong" },
  { id: "zacchaeus", label: "Zacchaeus", aliases: ["zacchaeus", "chief publican", "sycamore tree"], searchPhrase: "zacchaeus sycamore tree", expectedReferences: ["Luke 19:1-10"], strength: "likely" },
  { id: "lazarus", label: "Lazarus raised", aliases: ["lazarus", "lazarus come forth", "come forth"], searchPhrase: "lazarus come forth", expectedReferences: ["John 11:1-44"], strength: "likely" },
  { id: "woman-at-well", label: "Woman at the well", aliases: ["woman at the well", "samaritan woman", "living water"], searchPhrase: "woman at the well living water", expectedReferences: ["John 4:1-26"], strength: "likely" },
  { id: "feeding-5000", label: "Feeding of the five thousand", aliases: ["feeding of the five thousand", "feeding of the 5000", "five loaves and two fishes", "fed five thousand"], searchPhrase: "five loaves two fishes fed five thousand", expectedReferences: ["Matthew 14:13-21", "John 6:1-14"], strength: "likely" },
  { id: "walking-on-water", label: "Walking on water", aliases: ["walking on water", "jesus walked on water", "come out on the water"], searchPhrase: "jesus walking on water", expectedReferences: ["Matthew 14:22-33", "Mark 6:45-52"], strength: "likely" },
  { id: "healing-blind-man", label: "Healing the blind man", aliases: ["healing the blind man", "opened the eyes of the blind", "man born blind"], searchPhrase: "healing blind man eyes opened", expectedReferences: ["John 9:1-12", "Mark 8:22-26"], strength: "possible" },
  { id: "dry-bones", label: "Valley of dry bones", aliases: ["dry bones", "valley of dry bones", "can these bones live"], searchPhrase: "valley dry bones ezekiel", expectedReferences: ["Ezekiel 37:1-14"], strength: "strong" },
  { id: "armor-of-god", label: "Armor of God", aliases: ["armor of god", "whole armor of god", "whole armour of god", "put on the whole armor"], searchPhrase: "whole armor of god stand against", expectedReferences: ["Ephesians 6:11-17"], strength: "strong" },
  { id: "fruit-of-spirit", label: "Fruit of the Spirit", aliases: ["fruit of the spirit", "fruit of the holy spirit"], searchPhrase: "fruit of the spirit love joy peace", expectedReferences: ["Galatians 5:22-23"], strength: "strong" },
  { id: "faith-without-works", label: "Faith without works is dead", aliases: ["faith without works is dead", "faith without works"], searchPhrase: "faith without works is dead", expectedReferences: ["James 2:17", "James 2:26"], strength: "strong" },
  { id: "lord-shepherd", label: "The Lord is my shepherd", aliases: ["lord is my shepherd", "the lord is my shepherd", "i shall not want"], searchPhrase: "the lord is my shepherd i shall not want", expectedReferences: ["Psalms 23:1"], strength: "strong" },
  { id: "fearfully-made", label: "Fearfully and wonderfully made", aliases: ["fearfully and wonderfully made"], searchPhrase: "fearfully and wonderfully made", expectedReferences: ["Psalms 139:14"], strength: "likely" },
  { id: "peace-passes-understanding", label: "Peace that passeth understanding", aliases: ["peace that passeth understanding", "peace that passes understanding"], searchPhrase: "peace passes understanding", expectedReferences: ["Philippians 4:7"], strength: "likely" },
  { id: "all-things-good", label: "All things work together for good", aliases: ["all things work together for good", "all things work for good"], searchPhrase: "all things work together for good", expectedReferences: ["Romans 8:28"], strength: "likely" },
  { id: "by-his-stripes", label: "By His stripes we are healed", aliases: ["by his stripes we are healed", "with his stripes we are healed"], searchPhrase: "by his stripes we are healed", expectedReferences: ["Isaiah 53:5", "1 Peter 2:24"], strength: "likely" },
  { id: "house-on-rock", label: "House built on the rock", aliases: ["house built on the rock", "wise man built his house upon the rock", "built on the rock"], searchPhrase: "house built on rock", expectedReferences: ["Matthew 7:24-27", "Luke 6:47-49"], strength: "likely" },
  { id: "fiery-furnace", label: "Fiery furnace", aliases: ["fiery furnace", "three hebrew boys", "shadrach meshach and abednego"], searchPhrase: "fiery furnace shadrach meshach abednego", expectedReferences: ["Daniel 3:1-30"], strength: "likely" },
  { id: "daniel-lions-den", label: "Daniel in the lions den", aliases: ["daniel in the lions den", "daniel and the lions den", "lion's den"], searchPhrase: "daniel lions den", expectedReferences: ["Daniel 6:1-28"], strength: "likely" },
  { id: "joseph-brothers", label: "Joseph and his brothers", aliases: ["joseph and his brothers", "joseph sold by his brothers", "coat of many colors"], searchPhrase: "joseph brothers coat of many colors", expectedReferences: ["Genesis 37:3-36", "Genesis 45:1-15"], strength: "possible" },
  { id: "widow-zarephath", label: "Widow of Zarephath", aliases: ["widow of zarephath", "jar of oil did not run dry", "barrel of meal"], searchPhrase: "widow of zarephath oil meal", expectedReferences: ["1 Kings 17:8-16"], strength: "possible" },
  { id: "widows-mite", label: "Widow's mite", aliases: ["widow's mite", "widows mite", "two mites"], searchPhrase: "widows mite two mites", expectedReferences: ["Mark 12:41-44", "Luke 21:1-4"], strength: "likely" }
];

function normalizeNumbers(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens
    .flatMap((token) => {
      const clean = token.trim();
      const maybeNumber = NUMBER_WORDS[clean];
      if (!maybeNumber) {
        return [clean];
      }
      return [clean, maybeNumber];
    })
    .join(" ");
}

function normalizeText(text: string): string {
  const lowered = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const numberExpanded = normalizeNumbers(lowered);
  return numberExpanded
    .replace(/\bvirgin\b/g, "virgins")
    .replace(/\bbones\b/g, "bone")
    .replace(/\bworks\b/g, "work")
    .replace(/\bpasseth\b/g, "passes")
    .replace(/\s+/g, " ")
    .trim();
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
        const strengthBoost = anchor.strength === "strong" ? 3 : anchor.strength === "likely" ? 2 : 1;
        const aliasScore = normalizedAlias.split(" ").length + strengthBoost;
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
  if (fallbackTerms.length < 4) {
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
        boost += candidate.strength === "strong" ? 0.38 : 0.3;
      }

      const hitTerms = candidate.anchorTerms.filter((term) => loweredText.includes(term)).length;
      if (hitTerms > 0) {
        boost += Math.min(hitTerms * 0.06, 0.24);
      }

      for (const mentionedBook of boostedBooks) {
        if (loweredRef.startsWith(mentionedBook)) {
          boost += 0.18;
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
  if (strength === "strong") {
    return "Strong";
  }
  return strength === "likely" ? "Likely" : "Possible";
}
