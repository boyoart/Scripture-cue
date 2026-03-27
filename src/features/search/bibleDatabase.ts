import type { VerseQuery } from "../../types/search";
import type { VerseResult } from "../../types/verse";
import type {
  BibleBookRecord,
  BibleTranslationRecord,
  TranslationSummary,
  VerseRow
} from "./bibleTypes";
import { SEEDED_TRANSLATIONS } from "./seedTranslations";

interface TranslationIndex {
  definition: BibleTranslationRecord;
  byBookAlias: Map<string, BibleBookRecord>;
  verses: VerseRow[];
}

export class LocalBibleDatabase {
  private readonly translationIndexes = new Map<string, TranslationIndex>();

  constructor(seedData: BibleTranslationRecord[]) {
    seedData.forEach((translation) => {
      const byBookAlias = new Map<string, BibleBookRecord>();
      const verses: VerseRow[] = [];

      translation.books.forEach((book) => {
        [book.id, book.name, ...book.abbreviations].forEach((alias) => {
          byBookAlias.set(normalizeBookKey(alias), book);
        });

        book.chapters.forEach((chapter, chapterIdx) => {
          chapter.forEach((text, verseIdx) => {
            if (!text?.trim()) {
              return;
            }

            verses.push({
              id: `${translation.code}-${book.id}-${chapterIdx + 1}-${verseIdx + 1}`,
              translationCode: translation.code,
              bookId: book.id,
              bookName: book.name,
              chapter: chapterIdx + 1,
              verse: verseIdx + 1,
              text
            });
          });
        });
      });

      this.translationIndexes.set(translation.code, {
        definition: translation,
        byBookAlias,
        verses
      });
    });
  }

  listTranslations(): TranslationSummary[] {
    return [...this.translationIndexes.values()].map(({ definition }) => ({
      code: definition.code,
      name: definition.name,
      language: definition.language,
      publicDomain: definition.publicDomain
    }));
  }

  getTranslationInfo(code: string): BibleTranslationRecord | undefined {
    return this.translationIndexes.get(code)?.definition;
  }

  search(query: VerseQuery): VerseResult[] {
    const code = query.translationCode ?? "KJV";
    const translation = this.translationIndexes.get(code);

    if (!translation) {
      return [];
    }

    if (query.kind === "exact_reference" && query.canonicalBook && query.chapter) {
      const book = translation.byBookAlias.get(normalizeBookKey(query.canonicalBook));
      if (!book) {
        return [];
      }

      const chapter = query.chapter;
      const start = query.verseStart ?? 1;
      const end = query.verseEnd ?? query.verseStart ?? start;

      return translation.verses
        .filter(
          (row) =>
            row.bookId === book.id &&
            row.chapter === chapter &&
            row.verse >= start &&
            row.verse <= end
        )
        .map(toVerseResult);
    }

    const phrase = query.phrase?.trim().toLowerCase();
    if (!phrase) {
      return [];
    }

    return translation.verses
      .filter((row) => row.text.toLowerCase().includes(phrase))
      .slice(0, 25)
      .map(toVerseResult);
  }
}

function toVerseResult(row: VerseRow): VerseResult {
  return {
    id: row.id,
    reference: `${row.bookName} ${row.chapter}:${row.verse}`,
    translationCode: row.translationCode,
    text: row.text
  };
}

function normalizeBookKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const localBibleDatabase = new LocalBibleDatabase(SEEDED_TRANSLATIONS);
