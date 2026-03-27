import { parseScriptureQuery } from "../parser";
import type { VerseResult } from "../../types/verse";

export const SEARCH_FEATURE_READY = true;

const MOCK_VERSE_DB: Record<string, string> = {
  "John 3:16": "For God so loved the world that he gave his one and only Son...",
  "1 Corinthians 13:4": "Love is patient, love is kind. It does not envy...",
  "2 Timothy 1:7": "For God has not given us a spirit of fear, but of power and of love and of a sound mind.",
  "Psalms 23:1-3": "The Lord is my shepherd; I shall not want...",
  "Isaiah 40:31": "But they that wait upon the LORD shall renew their strength...",
};

export interface SearchResolution {
  verse?: VerseResult;
  normalizedReference?: string;
  canonicalBook?: string;
  confidence: number;
  rawTranscript: string;
}

export function resolveSearchInput(raw: string, translationCode = "NIV"): SearchResolution {
  const { query, debug } = parseScriptureQuery(raw);

  const normalizedReference = query.normalized;
  const verseText = normalizedReference ? MOCK_VERSE_DB[normalizedReference] : undefined;
  const verse = normalizedReference && verseText
    ? {
        id: normalizedReference,
        reference: normalizedReference,
        translationCode,
        text: verseText,
        confidence: query.confidence,
      }
    : undefined;

  return {
    verse,
    normalizedReference,
    canonicalBook: query.canonicalBook,
    confidence: query.confidence ?? 0,
    rawTranscript: debug.rawTranscript,
  };
}
