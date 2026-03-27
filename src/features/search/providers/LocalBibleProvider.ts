import type { BibleProvider } from "../../../services/interfaces";
import type { VerseQuery } from "../../../types/search";
import type { VerseResult } from "../../../types/verse";
import { LocalBibleDatabase } from "../db/localBibleDatabase";

function normalizeInput(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export class LocalBibleProvider implements BibleProvider {
  private readonly database = LocalBibleDatabase.initialize();

  async search(query: VerseQuery): Promise<VerseResult[]> {
    const translationCode = query.translationCode ?? "KJV";
    const translation = this.database.translations.find((row) => row.code === translationCode);

    if (!translation) {
      return [];
    }

    if (query.kind === "phrase" && query.phrase) {
      return this.findPhraseMatches(query.phrase, translation.id);
    }

    if (!query.canonicalBook || !query.chapter || !query.verseStart) {
      return [];
    }

    const normalizedBook = normalizeInput(query.canonicalBook);
    const alias = this.database.aliases.find(
      (row) => row.translationId === translation.id && row.normalizedAlias === normalizedBook
    );

    if (!alias) {
      return [];
    }

    const verseEnd = query.verseEnd ?? query.verseStart;
    const rows = this.database.verses
      .filter(
        (verse) =>
          verse.translationId === translation.id &&
          verse.bookId === alias.bookId &&
          verse.chapter === query.chapter &&
          verse.verse >= query.verseStart! &&
          verse.verse <= verseEnd
      )
      .sort((a, b) => a.verse - b.verse);

    return rows.map((row) => {
      const book = this.database.books.find((bookRow) => bookRow.id === row.bookId)!;
      return {
        id: `verse-${row.id}`,
        reference: `${book.name} ${row.chapter}:${row.verse}`,
        translationCode,
        text: row.text,
        status: "found",
        matchType: query.kind,
        confidence: query.confidence
      } satisfies VerseResult;
    });
  }

  private findPhraseMatches(phrase: string, translationId: number): VerseResult[] {
    const normalizedPhrase = normalizeInput(phrase);

    const scoredRows = this.database.verses
      .filter((verse) => verse.translationId === translationId)
      .map((verse) => {
        const normalizedText = normalizeInput(verse.text);
        const includes = normalizedText.includes(normalizedPhrase);
        const overlap = normalizedPhrase
          .split(" ")
          .filter(Boolean)
          .reduce((score, token) => (normalizedText.includes(token) ? score + 1 : score), 0);

        return {
          verse,
          score: includes ? 100 : overlap
        };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return scoredRows.map(({ verse, score }) => {
      const book = this.database.books.find((bookRow) => bookRow.id === verse.bookId)!;
      const maxScore = Math.max(normalizedPhrase.split(" ").filter(Boolean).length, 1);
      const confidence = Math.min(1, score / maxScore);

      return {
        id: `verse-${verse.id}`,
        reference: `${book.name} ${verse.chapter}:${verse.verse}`,
        translationCode: "KJV",
        text: verse.text,
        status: "found",
        matchType: "phrase",
        confidence
      } satisfies VerseResult;
    });
  }
}
