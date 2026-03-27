import type { VerseQuery } from "../types/search";
import type { VerseResult } from "../types/verse";

export interface SpeechResult {
  transcript: string;
  confidence?: number;
}

export interface SpeechProvider {
  listen(): Promise<SpeechResult>;
}

export interface BibleProvider {
  search(query: VerseQuery): Promise<VerseResult[]>;
}
