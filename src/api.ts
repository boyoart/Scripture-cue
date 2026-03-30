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

export async function searchKjv(reference: string): Promise<SearchResult> {
  return invoke<SearchResult>("search_kjv_reference", { reference });
}