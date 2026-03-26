export type QueryType = "exact_reference" | "spoken_reference" | "phrase";

export interface VerseQuery {
  kind: QueryType;
  raw: string;
  normalized?: string;
  canonicalBook?: string;
  chapter?: number;
  verseStart?: number;
  verseEnd?: number;
  phrase?: string;
  translationCode?: string;
  confidence?: number;
}
