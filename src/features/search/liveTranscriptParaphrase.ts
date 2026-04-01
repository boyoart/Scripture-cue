import type { ParaphraseMatch } from "../../api";

export type SuggestionStrength = "likely" | "possible";

export type TranscriptSuggestionCandidate = {
  anchorId: string;
  anchorLabel: string;
  normalizedAnchor: string;
  searchPhrase: string;
  expectedReferences: string[];
  strength: SuggestionStrength;
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
  /\b(uh|um|hmm|okay|ok|well|you know|i mean|like|anyway)\b/g,
  /\b(amen|hallelujah|praise the lord)\b/g,
  /\b(let'?s pray|turn with me|if you can|right now|this morning)\b/g
];

const CONCEPT_ANCHORS: ConceptAnchor[] = [
  {
    id: "ten-virgins",
    label: "Parable of the Ten Virgins",
    aliases: ["parable of the ten virgins", "ten virgins", "five wise and five foolish"],
    searchPhrase: "parable of the ten virgins bridegroom lamp oil",
    expectedReferences: ["Matthew 25:1-13"],
    strength: "likely"
  },
  {
    id: "lord-shepherd",
    label: "The Lord is my shepherd",
    aliases: ["the lord is my shepherd", "my shepherd", "i shall not want"],
    searchPhrase: "the lord is my shepherd i shall not want",
    expectedReferences: ["Psalms 23:1"],
    strength: "likely"
  },
  {
    id: "faith-without-works",
    label: "Faith without works",
    aliases: ["faith without works is dead", "faith without works", "works is dead"],
    searchPhrase: "faith without works is dead",
    expectedReferences: ["James 2:17", "James 2:26"],
    strength: "likely"
  },
  {
    id: "armor-of-god",
    label: "Armor of God",
    aliases: ["armor of god", "whole armour of god", "helmet of salvation", "sword of the spirit"],
    searchPhrase: "whole armour of god stand against wiles",
    expectedReferences: ["Ephesians 6:11-17"],
    strength: "likely"
  },
  {
    id: "valley-shadow-death",
    label: "Valley of the shadow of death",
    aliases: ["valley of the shadow of death", "shadow of death"],
    searchPhrase: "yea though i walk through the valley of the shadow of death",
    expectedReferences: ["Psalms 23:4"],
    strength: "possible"
  },
  {
    id: "beatitudes",
    label: "Beatitudes",
    aliases: ["blessed are the", "sermon on the mount", "beatitudes"],
    searchPhrase: "blessed are the poor in spirit",
    expectedReferences: ["Matthew 5:3-12"],
    strength: "possible"
  }
];

function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  for (const pattern of FILLER_PATTERNS) {
    normalized = normalized.replace(pattern, " ");
  }

  return normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTranscriptSuggestionCandidate(transcript: string): TranscriptSuggestionCandidate | null {
  const normalizedTranscript = normalizeText(transcript);
  if (!normalizedTranscript) {
    return null;
  }

  const words = normalizedTranscript.split(" ").filter(Boolean);
  if (words.length < 3) {
    return null;
  }

  let bestMatch: { anchor: ConceptAnchor; score: number } | null = null;

  for (const anchor of CONCEPT_ANCHORS) {
    let score = 0;
    let matchedAlias = "";
    for (const alias of anchor.aliases) {
      const normalizedAlias = normalizeText(alias);
      if (normalizedTranscript.includes(normalizedAlias)) {
        score = Math.max(score, normalizedAlias.split(" ").length + 3);
        matchedAlias = normalizedAlias;
      }
    }

    if (!matchedAlias) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { anchor, score };
    }
  }

  if (!bestMatch) {
    return null;
  }

  const { anchor } = bestMatch;
  return {
    anchorId: anchor.id,
    anchorLabel: anchor.label,
    normalizedAnchor: normalizeText(anchor.label),
    searchPhrase: anchor.searchPhrase,
    expectedReferences: anchor.expectedReferences,
    strength: anchor.strength
  };
}

export function rankTranscriptParaphraseMatches(
  matches: ParaphraseMatch[],
  candidate: TranscriptSuggestionCandidate
): ParaphraseMatch[] {
  const expectedReferencePrefixSet = new Set(candidate.expectedReferences.map((reference) => reference.split(":")[0]));

  return [...matches]
    .map((match) => {
      let boost = 0;
      if (expectedReferencePrefixSet.has(match.reference.split(":")[0])) {
        boost += 0.24;
      }

      const loweredText = match.text.toLowerCase();
      const loweredAnchor = candidate.normalizedAnchor;
      if (loweredAnchor.length >= 8 && loweredText.includes(loweredAnchor.split(" ").slice(0, 3).join(" "))) {
        boost += 0.12;
      }

      return {
        match,
        score: match.confidence + boost
      };
    })
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.match);
}

export function buildTranscriptSuggestionId(candidate: TranscriptSuggestionCandidate): string {
  return `${candidate.anchorId}:${candidate.searchPhrase}`;
}

export function getStrengthLabel(strength: SuggestionStrength): string {
  return strength === "likely" ? "Likely" : "Possible";
}
