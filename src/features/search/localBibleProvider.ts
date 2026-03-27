import { BIBLE_DB, type TranslationCode } from "../../data/bibleDb";
import type { BibleProvider } from "../../services/interfaces";
import type { VerseQuery } from "../../types/search";
import type { VerseResult } from "../../types/verse";

function toReference(book: string, chapter: number, verseStart: number, verseEnd?: number): string {
  return verseEnd && verseEnd !== verseStart
    ? `${book} ${chapter}:${verseStart}-${verseEnd}`
    : `${book} ${chapter}:${verseStart}`;
}

function asResults(rows: { book: string; chapter: number; verse: number; text: string }[], translationCode: TranslationCode): VerseResult[] {
  return rows.map((row) => ({
    id: `${translationCode}-${row.book}-${row.chapter}-${row.verse}`,
    reference: `${row.book} ${row.chapter}:${row.verse}`,
    translationCode,
    text: row.text,
    confidence: 1
  }));
}

export const localBibleProvider: BibleProvider = {
  async search(query: VerseQuery): Promise<VerseResult[]> {
    const translationCode = (query.translationCode || "NIV") as TranslationCode;
    const db = BIBLE_DB[translationCode] ?? BIBLE_DB.NIV;

    if (!query.canonicalBook || !query.chapter) {
      return [];
    }

    const verseStart = query.verseStart ?? 1;
    const verseEnd = query.verseEnd ?? query.verseStart ?? verseStart;

    const rows = db.filter((row) => {
      return (
        row.book.toLowerCase() === query.canonicalBook?.toLowerCase() &&
        row.chapter === query.chapter &&
        row.verse >= verseStart &&
        row.verse <= verseEnd
      );
    });

    if (rows.length === 0) {
      return [];
    }

    const firstVerse = rows[0].verse;
    const lastVerse = rows[rows.length - 1].verse;

    return [
      {
        id: `${translationCode}-${query.canonicalBook}-${query.chapter}-${firstVerse}-${lastVerse}`,
        reference: toReference(query.canonicalBook, query.chapter, firstVerse, lastVerse),
        translationCode,
        text: rows.map((row) => row.text).join(" "),
        confidence: query.confidence ?? 0.95
      },
      ...asResults(rows, translationCode)
    ];
  }
};
