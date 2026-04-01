const FILLER_ONLY_PATTERN = /^(?:\s|uh|um|hmm|mm|yeah|okay|ok|so|well|you know|i mean|right|alright|amen|thank you|thanks|please|let's|lets)+$/i;

const SCRIPTURE_KEYWORDS = ["lord","god","jesus","christ","shepherd","faith","works","grace","mercy","kingdom","parable","cross","gospel","spirit","salvation","righteous","sin","forgive","repent","resurrection","covenant","commandment","armor","light","darkness","vine","bread of life","good shepherd"] as const;

const ICONIC_ANCHORS: Array<{ pattern: RegExp; anchor: string; weight: number }> = [
  { pattern: /\bthe lord is my shepherd\b/i, anchor: "the lord is my shepherd", weight: 0.98 },
  { pattern: /\bfaith without works is dead\b/i, anchor: "faith without works is dead", weight: 0.97 },
  { pattern: /\barmor of god\b/i, anchor: "armor of god", weight: 0.95 },
  { pattern: /\bfruit of the spirit\b/i, anchor: "fruit of the spirit", weight: 0.92 },
  { pattern: /\bbe still and know that i am god\b/i, anchor: "be still and know that i am god", weight: 0.95 },
  { pattern: /\blove your enemies\b/i, anchor: "love your enemies", weight: 0.9 },
  { pattern: /\bwalk by faith\b/i, anchor: "walk by faith", weight: 0.84 },
  { pattern: /\bvalley of the shadow of death\b/i, anchor: "valley of the shadow of death", weight: 0.94 }
];

const STOPWORDS = new Set(["the","and","that","this","with","from","into","your","our","for","are","was","were","have","has","had","will","shall","would","could","should","just","about","because","while","when","what","where","which","then","than","them","they","their","there","here","who","whom","why","how","you","your","yours","him","his","her","hers","its","it's","a","an","to","of","in","on","is","it","we","i"]);

export type TranscriptAnchor = { phrase: string; weight: number; reason: "iconic_phrase" | "parable_phrase" | "keyword_phrase" };
export type TranscriptAnchorPlan = { shouldSearch: boolean; anchors: TranscriptAnchor[]; reason?: string };

function normalize(rawTranscript: string): string {
  return rawTranscript.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
}

function countKeywordHits(normalizedTranscript: string): number {
  return SCRIPTURE_KEYWORDS.reduce((count, keyword) => (normalizedTranscript.includes(keyword) ? count + 1 : count), 0);
}

function toKeywordAnchors(normalizedTranscript: string): TranscriptAnchor[] {
  const words = normalizedTranscript.split(" ").filter(Boolean);
  if (words.length < 4) return [];

  const anchors: TranscriptAnchor[] = [];
  for (const windowSize of [8, 7, 6, 5, 4]) {
    for (let index = 0; index <= words.length - windowSize; index += 1) {
      const slice = words.slice(index, index + windowSize);
      const nonStopCount = slice.filter((word) => !STOPWORDS.has(word)).length;
      if (nonStopCount < 3) continue;
      const joined = slice.join(" ").trim();
      const keywordHits = countKeywordHits(joined);
      if (keywordHits === 0) continue;
      const weight = Math.min(0.55 + keywordHits * 0.08 + nonStopCount * 0.02, 0.89);
      anchors.push({ phrase: joined, weight, reason: "keyword_phrase" });
    }
  }

  return anchors;
}

export function buildTranscriptAnchorPlan(rawTranscript: string): TranscriptAnchorPlan {
  const normalized = normalize(rawTranscript);
  if (!normalized) return { shouldSearch: false, anchors: [], reason: "empty transcript" };
  if (FILLER_ONLY_PATTERN.test(normalized)) return { shouldSearch: false, anchors: [], reason: "filler speech" };

  const anchors: TranscriptAnchor[] = [];
  for (const iconicAnchor of ICONIC_ANCHORS) {
    if (iconicAnchor.pattern.test(normalized)) {
      anchors.push({ phrase: iconicAnchor.anchor, weight: iconicAnchor.weight, reason: "iconic_phrase" });
    }
  }

  const parableMatch = normalized.match(/\bparable of (?:the )?([a-z\s]{3,45})\b/i);
  if (parableMatch) {
    anchors.push({ phrase: `parable of ${parableMatch[1].trim()}`, weight: 0.9, reason: "parable_phrase" });
  }

  anchors.push(...toKeywordAnchors(normalized));

  const deduped = new Map<string, TranscriptAnchor>();
  for (const anchor of anchors) {
    const existing = deduped.get(anchor.phrase);
    if (!existing || existing.weight < anchor.weight) deduped.set(anchor.phrase, anchor);
  }

  const ranked = [...deduped.values()].sort((a, b) => b.weight - a.weight).slice(0, 3);
  if (ranked.length === 0) return { shouldSearch: false, anchors: [], reason: "no scripture-like anchors found" };

  return { shouldSearch: true, anchors: ranked };
}
