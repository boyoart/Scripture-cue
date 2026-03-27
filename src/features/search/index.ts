import { getLocalBibleDb, type SupportedTranslation } from "../../data/localBibleDb";
import type { VerseQuery } from "../../types/search";
import type { VerseResult } from "../../types/verse";

export function searchVerses(query: VerseQuery, translationCode: SupportedTranslation): VerseResult[] {
  const db = getLocalBibleDb(translationCode);

  if (query.kind === "exact_reference" && query.canonicalBook && query.chapter && query.verseStart) {
    const end = query.verseEnd ?? query.verseStart;
    return db.filter(
      (item) =>
        item.book.toLowerCase() === query.canonicalBook?.toLowerCase() &&
        item.chapter === query.chapter &&
        item.verse >= query.verseStart! &&
        item.verse <= end
    );
  }

  if (query.phrase) {
    return db.filter(
      (item) =>
        item.text.toLowerCase().includes(query.phrase!) || item.reference.toLowerCase().includes(query.phrase!)
    );
  }

  return [];
}
