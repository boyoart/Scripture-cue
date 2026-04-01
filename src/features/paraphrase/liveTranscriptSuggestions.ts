const FILLER_ONLY_PATTERN = /^(?:\s|uh|um|hmm|mm|yeah|okay|ok|so|well|you know|i mean|right|alright|amen|thank you|thanks|please|let's|lets)+$/i;

const FILLER_SEGMENTS = [
  /\b(let'?s talk about|in the book of|talked about|the bible says|you know|brethren|children of god|open your bible to|i want us to look at)\b/gi,
  /\b(uh|um|hmm|okay|ok|well|i mean|like|anyway|amen|hallelujah)\b/gi
];

const CONCEPT_ALIASES: Array<{ phrase: string; aliases: string[]; reason: "iconic_phrase" | "parable_phrase" | "keyword_phrase"; weight: number }> = [
  { phrase: "ten virgins", aliases: ["ten virgins", "10 virgins", "parable of the ten virgins"], reason: "parable_phrase", weight: 0.95 },
  { phrase: "prodigal son", aliases: ["prodigal son", "lost son"], reason: "parable_phrase", weight: 0.93 },
  { phrase: "blind bartimaeus", aliases: ["blind bartimaeus", "bartimaeus"], reason: "keyword_phrase", weight: 0.92 },
  { phrase: "issue of blood", aliases: ["issue of blood", "woman with the issue of blood"], reason: "keyword_phrase", weight: 0.94 },
  { phrase: "valley of dry bones", aliases: ["valley of dry bones", "dry bones"], reason: "keyword_phrase", weight: 0.93 },
  { phrase: "armor of god", aliases: ["armor of god", "whole armor of god", "whole armour of god"], reason: "iconic_phrase", weight: 0.95 },
  { phrase: "faith without works is dead", aliases: ["faith without works is dead", "faith without works"], reason: "iconic_phrase", weight: 0.96 },
  { phrase: "the lord is my shepherd", aliases: ["the lord is my shepherd", "lord is my shepherd"], reason: "iconic_phrase", weight: 0.97 },
  { phrase: "fruit of the spirit", aliases: ["fruit of the spirit"], reason: "iconic_phrase", weight: 0.91 }
];

const STOPWORDS = new Set(["the", "and", "that", "this", "with", "from", "into", "your", "our", "for", "are", "was", "were", "have", "has", "had", "will", "shall", "would", "could", "should", "just", "about", "because", "while", "when", "what", "where", "which", "then", "than", "them", "they", "their", "there", "here", "who", "whom", "why", "how", "you", "your", "yours", "him", "his", "her", "hers", "its", "it's", "a", "an", "to", "of", "in", "on", "is", "it", "we", "i"]);

export type TranscriptAnchor = { phrase: string; weight: number; reason: "iconic_phrase" | "parable_phrase" | "keyword_phrase" };
export type TranscriptAnchorPlan = { shouldSearch: boolean; anchors: TranscriptAnchor[]; reason?: string; cleanedTranscript?: string };

function normalize(rawTranscript: string): string {
  let normalized = rawTranscript.toLowerCase();
  for (const fillerPattern of FILLER_SEGMENTS) {
    normalized = normalized.replace(fillerPattern, " ");
  }
  return normalized.replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
}

function toKeywordAnchors(normalizedTranscript: string): TranscriptAnchor[] {
  const words = normalizedTranscript.split(" ").filter((word) => word.length > 1);
  if (words.length < 3) return [];

  const anchors: TranscriptAnchor[] = [];
  for (const windowSize of [5, 4, 3]) {
    for (let index = 0; index <= words.length - windowSize; index += 1) {
      const slice = words.slice(index, index + windowSize);
      const nonStop = slice.filter((word) => !STOPWORDS.has(word));
      if (nonStop.length < 2) continue;
      const phrase = nonStop.join(" ");
      const weight = Math.min(0.58 + nonStop.length * 0.07, 0.82);
      anchors.push({ phrase, weight, reason: "keyword_phrase" });
    }
  }

  return anchors;
}

export function buildTranscriptAnchorPlan(rawTranscript: string): TranscriptAnchorPlan {
  const normalized = normalize(rawTranscript);
  if (!normalized) return { shouldSearch: false, anchors: [], reason: "empty transcript" };
  if (FILLER_ONLY_PATTERN.test(normalized)) return { shouldSearch: false, anchors: [], reason: "filler speech" };

  const anchors: TranscriptAnchor[] = [];
  for (const concept of CONCEPT_ALIASES) {
    if (concept.aliases.some((alias) => normalized.includes(alias))) {
      anchors.push({ phrase: concept.phrase, weight: concept.weight, reason: concept.reason });
    }
  }

  anchors.push(...toKeywordAnchors(normalized));

  const deduped = new Map<string, TranscriptAnchor>();
  for (const anchor of anchors) {
    const existing = deduped.get(anchor.phrase);
    if (!existing || existing.weight < anchor.weight) deduped.set(anchor.phrase, anchor);
  }

  const ranked = [...deduped.values()].sort((a, b) => b.weight - a.weight).slice(0, 4);
  if (ranked.length === 0) return { shouldSearch: false, anchors: [], reason: "no scripture-like anchors found", cleanedTranscript: normalized };

  return { shouldSearch: true, anchors: ranked, cleanedTranscript: normalized };
}
