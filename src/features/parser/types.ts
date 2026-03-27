import type { QueryType, VerseQuery } from "../../types/search";

export interface ParseMeta {
  confidence: number;
  normalizedInput: string;
  matchedPattern: "exact_reference" | "spoken_chapter_verse" | "spoken_spaced" | "phrase";
}

export interface VerseParserResult {
  query: VerseQuery;
  meta: ParseMeta;
}

export type ParserKind = QueryType;
