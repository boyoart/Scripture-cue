import type { MatchType } from "./search";

export interface VerseResult {
  id: string;
  reference: string;
  translationCode: string;
  text: string;
  status: "found" | "not_found" | "error";
  matchType: MatchType;
  confidence?: number;
}
