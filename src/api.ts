import { invoke } from "@tauri-apps/api/tauri";

export type VerseRow = {
  reference: string;
  verse: number;
  text: string;
};

export type SearchResult = {
  found: boolean;
  translation: "KJV";
  reference: string;
  theme: string;
  verses: VerseRow[];
  message?: string;
};

export type ParaphraseMatch = {
  reference: string;
  text: string;
  confidence: number;
  confidenceLabel: string;
  matchedTerms: number;
};

export async function searchKjv(reference: string): Promise<SearchResult> {
  return invoke<SearchResult>("search_kjv_reference", { reference });
}

export async function searchKjvParaphrase(phrase: string, limit = 12): Promise<ParaphraseMatch[]> {
  return invoke<ParaphraseMatch[]>("search_kjv_paraphrase", { phrase, limit });
}
