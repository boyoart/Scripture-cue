import { getTranslationRecords, type TranslationCode, type VerseRecord } from "./localBibleDb";

export type SearchResult = {
  match: VerseRecord | null;
  source: "reference" | "keyword" | "none";
};

export function searchScripture(query: string, translation: TranslationCode): SearchResult {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { match: null, source: "none" };
  }

  const normalizedQuery = trimmedQuery.toLowerCase();
  const verses = getTranslationRecords(translation);

  const referenceMatch = verses.find((verse) => verse.reference.toLowerCase() === normalizedQuery);
  if (referenceMatch) {
    return { match: referenceMatch, source: "reference" };
  }

  const keywordMatch = verses.find(
    (verse) =>
      verse.reference.toLowerCase().includes(normalizedQuery) ||
      verse.text.toLowerCase().includes(normalizedQuery) ||
      verse.theme.toLowerCase().includes(normalizedQuery)
  );

  return {
    match: keywordMatch ?? null,
    source: keywordMatch ? "keyword" : "none"
  };
}
