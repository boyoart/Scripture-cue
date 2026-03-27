import { DEFAULT_TRANSLATION, type TranslationCode } from "../../data/bibleDb";
import type { BibleProvider } from "../../services/interfaces";
import type { VerseQuery } from "../../types/search";
import type { VerseResult } from "../../types/verse";

type KjvVerseRow = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

declare global {
  interface Window {
    __TAURI__?: {
      invoke?: InvokeFn;
    };
  }
}

function toReference(book: string, chapter: number, verseStart: number, verseEnd?: number): string {
  return verseEnd && verseEnd !== verseStart
    ? `${book} ${chapter}:${verseStart}-${verseEnd}`
    : `${book} ${chapter}:${verseStart}`;
}

function asResults(rows: KjvVerseRow[], translationCode: TranslationCode): VerseResult[] {
  return rows.map((row) => ({
    id: `${translationCode}-${row.book}-${row.chapter}-${row.verse}`,
    reference: `${row.book} ${row.chapter}:${row.verse}`,
    translationCode,
    text: row.text,
    confidence: 1
  }));
}

function getInvoke(): InvokeFn | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__TAURI__?.invoke ?? null;
}

export const localBibleProvider: BibleProvider = {
  async search(query: VerseQuery): Promise<VerseResult[]> {
    const translationCode = DEFAULT_TRANSLATION;

    if (!query.canonicalBook || !query.chapter) {
      return [];
    }

    const verseStart = query.verseStart ?? 1;
    const verseEnd = query.verseEnd ?? query.verseStart ?? verseStart;

    const invoke = getInvoke();
    if (!invoke) {
      return [];
    }

    let rows: KjvVerseRow[] = [];

    try {
      rows = await invoke<KjvVerseRow[]>("search_kjv", {
        request: {
          canonicalBook: query.canonicalBook,
          chapter: query.chapter,
          verseStart,
          verseEnd
        }
      });
    } catch {
      return [];
    }

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
