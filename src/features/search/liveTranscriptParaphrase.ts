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
  /\b(let'?s talk about|let'?s look at|the bible says|the bible talks about|in the book of|talked about|i want us to see|i want us to look at|open your bible to|you know|brethren|children of god|we are going to talk about|we're going to talk about|that place where jesus talked about)\b/g,
  /\b(uh|um|hmm|okay|ok|well|i mean|like|anyway|amen|hallelujah|praise the lord)\b/g
];

const CONCEPT_ANCHORS: ConceptAnchor[] = [
  { id: "issue-of-blood", label: "Woman with the issue of blood", aliases: ["issue of blood", "woman with the issue of blood", "touched the hem of his garment"], searchPhrase: "woman issue of blood touched hem garment", expectedReferences: ["Mark 5:25-34", "Luke 8:43-48"], strength: "strong" },
  { id: "ten-virgins", label: "Parable of the Ten Virgins", aliases: ["ten virgins", "10 virgins", "parable of the ten virgins", "parable of 10 virgins", "virgins with lamps", "wise and foolish virgins"], searchPhrase: "parable ten virgins bridegroom lamp oil", expectedReferences: ["Matthew 25:1-13"], strength: "strong" },
  { id: "prodigal-son", label: "Prodigal Son", aliases: ["prodigal son", "lost son", "far country", "came to himself"], searchPhrase: "prodigal son far country came to himself", expectedReferences: ["Luke 15:11-32"], strength: "strong" },
  { id: "good-samaritan", label: "Good Samaritan", aliases: ["good samaritan", "neighbor on the road to jericho", "who is my neighbor"], searchPhrase: "parable good samaritan neighbor jericho", expectedReferences: ["Luke 10:25-37"], strength: "strong" },
  { id: "lost-sheep", label: "Lost sheep", aliases: ["lost sheep", "ninety and nine", "ninety nine sheep"], searchPhrase: "lost sheep ninety and nine", expectedReferences: ["Luke 15:3-7", "Matthew 18:12-14"], strength: "likely" },
  { id: "lost-coin", label: "Lost coin", aliases: ["lost coin", "woman who lost a coin", "ten pieces of silver"], searchPhrase: "lost coin ten pieces of silver", expectedReferences: ["Luke 15:8-10"], strength: "likely" },
  { id: "sower-seed", label: "Sower and the seed", aliases: ["sower and the seed", "parable of the sower", "seed fell by the wayside"], searchPhrase: "parable sower seed wayside thorny good ground", expectedReferences: ["Matthew 13:3-9", "Mark 4:3-9", "Luke 8:5-8"], strength: "strong" },
  { id: "blind-bartimaeus", label: "Blind Bartimaeus", aliases: ["blind bartimaeus", "bartimaeus", "son of david have mercy on me"], searchPhrase: "blind bartimaeus son of david have mercy", expectedReferences: ["Mark 10:46-52", "Luke 18:35-43"], strength: "strong" },
  { id: "zacchaeus", label: "Zacchaeus", aliases: ["zacchaeus", "chief publican", "sycamore tree"], searchPhrase: "zacchaeus sycamore tree", expectedReferences: ["Luke 19:1-10"], strength: "likely" },
  { id: "lazarus", label: "Lazarus", aliases: ["lazarus", "lazarus come forth", "come forth"], searchPhrase: "lazarus come forth", expectedReferences: ["John 11:1-44"], strength: "likely" },
  { id: "woman-at-well", label: "Woman at the well", aliases: ["woman at the well", "samaritan woman", "living water"], searchPhrase: "woman at the well living water", expectedReferences: ["John 4:1-26"], strength: "strong" },
  { id: "feeding-5000", label: "Feeding of the five thousand", aliases: ["feeding of the five thousand", "feeding of the 5000", "five loaves and two fishes", "fed five thousand"], searchPhrase: "five loaves two fishes fed five thousand", expectedReferences: ["Matthew 14:13-21", "John 6:1-14"], strength: "strong" },
  { id: "walking-on-water", label: "Walking on water", aliases: ["walking on water", "jesus walked on water", "come out on the water"], searchPhrase: "jesus walking on water", expectedReferences: ["Matthew 14:22-33", "Mark 6:45-52"], strength: "likely" },
  { id: "dry-bones", label: "Valley of dry bones", aliases: ["dry bones", "valley of dry bones", "can these bones live"], searchPhrase: "valley dry bones ezekiel", expectedReferences: ["Ezekiel 37:1-14"], strength: "strong" },
  { id: "armor-of-god", label: "Armor of God", aliases: ["armor of god", "whole armor of god", "whole armour of god", "put on the whole armor"], searchPhrase: "whole armor of god stand against", expectedReferences: ["Ephesians 6:11-17"], strength: "strong" },
  { id: "fruit-of-spirit", label: "Fruit of the Spirit", aliases: ["fruit of the spirit", "fruit of the holy spirit"], searchPhrase: "fruit of the spirit love joy peace", expectedReferences: ["Galatians 5:22-23"], strength: "likely" },
  { id: "faith-without-works", label: "Faith without works is dead", aliases: ["faith without works is dead", "faith without works"], searchPhrase: "faith without works is dead", expectedReferences: ["James 2:17", "James 2:26"], strength: "strong" },
  { id: "lord-shepherd", label: "The Lord is my shepherd", aliases: ["lord is my shepherd", "the lord is my shepherd", "i shall not want"], searchPhrase: "the lord is my shepherd i shall not want", expectedReferences: ["Psalms 23:1"], strength: "strong" },
  { id: "peace-passes-understanding", label: "Peace that passeth understanding", aliases: ["peace that passeth understanding", "peace that passes understanding"], searchPhrase: "peace passes understanding", expectedReferences: ["Philippians 4:7"], strength: "likely" },
  { id: "all-things-good", label: "All things work together for good", aliases: ["all things work together for good", "all things work for good"], searchPhrase: "all things work together for good", expectedReferences: ["Romans 8:28"], strength: "likely" },
  { id: "by-his-stripes", label: "By His stripes we are healed", aliases: ["by his stripes we are healed", "with his stripes we are healed"], searchPhrase: "by his stripes we are healed", expectedReferences: ["Isaiah 53:5", "1 Peter 2:24"], strength: "likely" },
  { id: "house-on-rock", label: "House built on the rock", aliases: ["house built on the rock", "wise man built his house upon the rock", "built on the rock"], searchPhrase: "house built on rock", expectedReferences: ["Matthew 7:24-27", "Luke 6:47-49"], strength: "likely" },
  { id: "fiery-furnace", label: "Fiery furnace", aliases: ["fiery furnace", "three hebrew boys", "shadrach meshach and abednego"], searchPhrase: "fiery furnace shadrach meshach abednego", expectedReferences: ["Daniel 3:1-30"], strength: "likely" },
  { id: "daniel-lions-den", label: "Daniel in the lions den", aliases: ["daniel in the lions den", "daniel and the lions den", "lion's den"], searchPhrase: "daniel lions den", expectedReferences: ["Daniel 6:1-28"], strength: "strong" },
  { id: "joseph-brothers", label: "Joseph and his brothers", aliases: ["joseph and his brothers", "joseph sold by his brothers", "coat of many colors"], searchPhrase: "joseph brothers coat of many colors", expectedReferences: ["Genesis 37:3-36", "Genesis 45:1-15"], strength: "likely" },
  { id: "good-shepherd", label: "Good shepherd", aliases: ["good shepherd", "i am the good shepherd"], searchPhrase: "i am the good shepherd", expectedReferences: ["John 10:11-14"], strength: "likely" },
  { id: "serpent-wilderness", label: "Serpent in the wilderness", aliases: ["serpent in the wilderness", "brazen serpent", "lifted up the serpent"], searchPhrase: "serpent wilderness lifted up", expectedReferences: ["Numbers 21:4-9", "John 3:14"], strength: "possible" },
  { id: "jonah-fish", label: "Jonah and the fish", aliases: ["jonah and the fish", "jonah and the whale", "jonah in the belly of the fish"], searchPhrase: "jonah fish whale belly", expectedReferences: ["Jonah 1:17", "Jonah 2:1-10"], strength: "likely" },
  { id: "widows-mite", label: "Widow's mite", aliases: ["widow's mite", "widows mite", "two mites"], searchPhrase: "widows mite two mites", expectedReferences: ["Mark 12:41-44", "Luke 21:1-4"], strength: "likely" }
];

function expandAliasVariants(alias: string): string[] {
  const variants = new Set([alias]);
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    if (alias.includes(word)) {
      variants.add(alias.replace(new RegExp(`\\b${word}\\b`, "g"), digit));
    }
    if (alias.includes(digit)) {
      variants.add(alias.replace(new RegExp(`\\b${digit}\\b`, "g"), word));
    }
  }
  if (alias.includes("virgins")) variants.add(alias.replace(/\bvirgins\b/g, "virgin"));
  if (alias.includes("works")) variants.add(alias.replace(/\bworks\b/g, "work"));
  return [...variants];
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bpasseth\b/g, "passes")
    .replace(/\barmour\b/g, "armor")
    .replace(/\bvirgin\b/g, "virgins")
    .replace(/\bbones\b/g, "bone")
    .replace(/\bworks\b/g, "work")
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
  const transcriptTokens = new Set(normalizedTranscript.split(" ").filter((token) => token.length > 1));

  for (const anchor of CONCEPT_ANCHORS) {
    for (const alias of anchor.aliases.flatMap(expandAliasVariants)) {
      const normalizedAlias = normalizeText(alias);
      if (!normalizedAlias) continue;

      const aliasTokens = normalizedAlias.split(" ").filter((token) => token.length > 1);
      const hitCount = aliasTokens.filter((token) => transcriptTokens.has(token)).length;
      if (hitCount === 0) continue;

      const coverage = hitCount / aliasTokens.length;
      if (coverage < 0.66 && !normalizedTranscript.includes(normalizedAlias)) {
        continue;
      }

      const strengthBoost = anchor.strength === "strong" ? 2.4 : anchor.strength === "likely" ? 1.6 : 1;
      const exactBoost = normalizedTranscript.includes(normalizedAlias) ? 1.2 : 0;
      const aliasScore = (coverage * 4) + (aliasTokens.length * 0.25) + strengthBoost + exactBoost;
      if (!bestMatch || aliasScore > bestMatch.score) {
        bestMatch = { anchor, score: aliasScore, normalizedAlias };
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
      const loweredText = normalizeText(match.text);
      let boost = 0;

      const refBook = match.reference.split(":")[0].toLowerCase();
      if (expectedReferencePrefixSet.has(refBook)) {
        boost += candidate.strength === "strong" ? 0.5 : 0.34;
      }

      const hitTerms = candidate.anchorTerms.filter((term) => loweredText.includes(term)).length;
      if (hitTerms > 0) {
        boost += Math.min(hitTerms * 0.08, 0.32);
      }

      for (const mentionedBook of boostedBooks) {
        if (loweredRef.startsWith(mentionedBook)) {
          boost += 0.22;
          break;
        }
      }

      const noisePenalty = hitTerms === 0 && match.confidence < 0.72 ? 0.22 : 0;
      const score = Math.max(0, Math.min(match.confidence + boost - noisePenalty, 1));
      return { match, score };
    })
    .sort((left, right) => right.score - left.score)
    .map((entry) => ({ ...entry.match, confidence: entry.score }));
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
