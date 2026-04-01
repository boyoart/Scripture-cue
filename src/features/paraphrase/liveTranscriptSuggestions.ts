const FILLER_ONLY_PATTERN = /^(?:\s|uh|um|hmm|mm|yeah|okay|ok|so|well|you know|i mean|right|alright|amen|thank you|thanks|please|let's|lets)+$/i;

const FILLER_SEGMENTS = [
  /\b(let'?s talk about|in the book of|talked about|the bible says|you know|brethren|children of god|open your bible to|i want us to look at|that place where jesus talked about)\b/gi,
  /\b(uh|um|hmm|okay|ok|well|i mean|like|anyway|amen|hallelujah)\b/gi
];

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
  ten: "10"
};

const CONCEPT_ALIASES: Array<{ phrase: string; aliases: string[]; reason: "iconic_phrase" | "parable_phrase" | "keyword_phrase"; weight: number }> = [
  { phrase: "ten virgins", aliases: ["ten virgins", "10 virgins", "parable of the ten virgins", "parable of 10 virgins"], reason: "parable_phrase", weight: 0.98 },
  { phrase: "prodigal son", aliases: ["prodigal son", "lost son", "far country"], reason: "parable_phrase", weight: 0.97 },
  { phrase: "good samaritan", aliases: ["good samaritan"], reason: "parable_phrase", weight: 0.95 },
  { phrase: "lost sheep", aliases: ["lost sheep", "ninety and nine", "ninety nine sheep"], reason: "parable_phrase", weight: 0.93 },
  { phrase: "lost coin", aliases: ["lost coin", "ten pieces of silver"], reason: "parable_phrase", weight: 0.91 },
  { phrase: "sower and the seed", aliases: ["sower and the seed", "parable of the sower", "seed fell by the wayside"], reason: "parable_phrase", weight: 0.92 },
  { phrase: "blind bartimaeus", aliases: ["blind bartimaeus", "bartimaeus"], reason: "keyword_phrase", weight: 0.97 },
  { phrase: "issue of blood", aliases: ["issue of blood", "woman with the issue of blood"], reason: "keyword_phrase", weight: 0.98 },
  { phrase: "valley of dry bones", aliases: ["valley of dry bones", "dry bones"], reason: "keyword_phrase", weight: 0.97 },
  { phrase: "zacchaeus", aliases: ["zacchaeus", "sycamore tree"], reason: "keyword_phrase", weight: 0.9 },
  { phrase: "woman at the well", aliases: ["woman at the well", "samaritan woman", "living water"], reason: "keyword_phrase", weight: 0.92 },
  { phrase: "lazarus", aliases: ["lazarus", "come forth"], reason: "keyword_phrase", weight: 0.91 },
  { phrase: "feeding of the five thousand", aliases: ["feeding of the five thousand", "feeding of the 5000", "five loaves and two fishes"], reason: "keyword_phrase", weight: 0.93 },
  { phrase: "walking on water", aliases: ["walking on water", "jesus walked on water"], reason: "keyword_phrase", weight: 0.9 },
  { phrase: "armor of god", aliases: ["armor of god", "whole armor of god", "whole armour of god"], reason: "iconic_phrase", weight: 0.98 },
  { phrase: "faith without works is dead", aliases: ["faith without works is dead", "faith without works"], reason: "iconic_phrase", weight: 0.99 },
  { phrase: "the lord is my shepherd", aliases: ["the lord is my shepherd", "lord is my shepherd", "i shall not want"], reason: "iconic_phrase", weight: 0.99 },
  { phrase: "fruit of the spirit", aliases: ["fruit of the spirit"], reason: "iconic_phrase", weight: 0.95 },
  { phrase: "fearfully and wonderfully made", aliases: ["fearfully and wonderfully made"], reason: "iconic_phrase", weight: 0.93 },
  { phrase: "peace that passes understanding", aliases: ["peace that passeth understanding", "peace that passes understanding"], reason: "iconic_phrase", weight: 0.93 },
  { phrase: "all things work together for good", aliases: ["all things work together for good", "all things work for good"], reason: "iconic_phrase", weight: 0.93 },
  { phrase: "by his stripes we are healed", aliases: ["by his stripes we are healed", "with his stripes we are healed"], reason: "iconic_phrase", weight: 0.94 },
  { phrase: "fiery furnace", aliases: ["fiery furnace", "shadrach meshach and abednego"], reason: "keyword_phrase", weight: 0.89 },
  { phrase: "daniel in the lions den", aliases: ["daniel in the lions den", "daniel and the lions den", "lion's den"], reason: "keyword_phrase", weight: 0.89 },
  { phrase: "joseph and his brothers", aliases: ["joseph and his brothers", "coat of many colors"], reason: "keyword_phrase", weight: 0.88 },
  { phrase: "widow of zarephath", aliases: ["widow of zarephath", "jar of oil did not run dry", "barrel of meal"], reason: "keyword_phrase", weight: 0.88 },
  { phrase: "widow's mite", aliases: ["widow's mite", "widows mite", "two mites"], reason: "keyword_phrase", weight: 0.9 }
];

const STOPWORDS = new Set(["the", "and", "that", "this", "with", "from", "into", "your", "our", "for", "are", "was", "were", "have", "has", "had", "will", "shall", "would", "could", "should", "just", "about", "because", "while", "when", "what", "where", "which", "then", "than", "them", "they", "their", "there", "here", "who", "whom", "why", "how", "you", "your", "yours", "him", "his", "her", "hers", "its", "it's", "a", "an", "to", "of", "in", "on", "is", "it", "we", "i"]);

export type TranscriptAnchor = { phrase: string; weight: number; reason: "iconic_phrase" | "parable_phrase" | "keyword_phrase" };
export type TranscriptAnchorPlan = { shouldSearch: boolean; anchors: TranscriptAnchor[]; reason?: string; cleanedTranscript?: string };

function normalize(rawTranscript: string): string {
  let normalized = rawTranscript.toLowerCase();
  for (const fillerPattern of FILLER_SEGMENTS) {
    normalized = normalized.replace(fillerPattern, " ");
  }

  normalized = normalized.replace(/[^a-z0-9\s']/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();

  const numberExpanded = normalized
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => {
      const mapped = NUMBER_WORDS[token];
      return mapped ? [token, mapped] : [token];
    })
    .join(" ");

  return numberExpanded.replace(/\bvirgin\b/g, "virgins").replace(/\bpasseth\b/g, "passes").replace(/\s+/g, " ").trim();
}

function toKeywordAnchors(normalizedTranscript: string): TranscriptAnchor[] {
  const words = normalizedTranscript.split(" ").filter((word) => word.length > 1);
  if (words.length < 4) return [];

  const anchors: TranscriptAnchor[] = [];
  for (const windowSize of [5, 4, 3]) {
    for (let index = 0; index <= words.length - windowSize; index += 1) {
      const slice = words.slice(index, index + windowSize);
      const nonStop = slice.filter((word) => !STOPWORDS.has(word));
      if (nonStop.length < 2) continue;
      const phrase = nonStop.join(" ");
      const weight = Math.min(0.56 + nonStop.length * 0.06, 0.79);
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
    if (concept.aliases.some((alias) => normalize(alias).split(" ").every((token) => normalized.includes(token)))) {
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
