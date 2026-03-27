import type { VerseResult } from "../../types/verse";
import { localBibleDatabase } from "../search";

export interface PreviewMetadata {
  reference: string;
  translationCode: string;
  translationName: string;
  source: string;
  verseCount: number;
  status: "Previewed" | "No Result";
}

export function buildPreviewMetadata(results: VerseResult[], translationCode: string): PreviewMetadata {
  const translation = localBibleDatabase.getTranslationInfo(translationCode);
  const first = results[0];

  return {
    reference: first?.reference ?? "—",
    translationCode,
    translationName: translation?.name ?? translationCode,
    source: translation?.source ?? "Unknown source",
    verseCount: results.length,
    status: results.length > 0 ? "Previewed" : "No Result"
  };
}

export const DISPLAY_FEATURE_READY = true;
