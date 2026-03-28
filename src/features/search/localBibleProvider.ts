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

type SearchKjvPayload = {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  translation: TranslationCode;
};

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

declare global {
  interface Window {
    __TAURI__?: {
      invoke?: InvokeFn;
      tauri?: {
        invoke?: InvokeFn;
      };
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

  return window.__TAURI__?.invoke ?? window.__TAURI__?.tauri?.invoke ?? null;
}

export const localBibleProvider: BibleProvider = {
  async search(query: VerseQuery): Promise<VerseResult[]> {
    const translationCode = DEFAULT_TRANSLATION;
    const book = query.book ?? query.canonicalBook;

    if (!book || !query.chapter) {
      return [];
    }

    const verseStart = query.verseStart ?? 1;
    const verseEnd = query.verseEnd ?? query.verseStart ?? verseStart;

    const invoke = getInvoke();
    if (!invoke) {
      return [];
    }

    let rows: KjvVerseRow[] = [];

    const requestPayload: SearchKjvPayload = {
      book,
      chapter: query.chapter,
      verseStart,
      verseEnd,
      translation: translationCode
    };

    console.debug("[search_kjv] frontend outgoing search payload", {
      request: requestPayload,
      rawQuery: query.raw,
      normalized: query.normalized
    });

    try {
      console.debug("[search_kjv] tauri invoke payload", requestPayload);
      rows = await invoke<KjvVerseRow[]>("search_kjv", {
        request: requestPayload
      });
    } catch (error) {
      console.debug("[search_kjv] invoke failed", error);
      return [];
    }

    console.debug("[search_kjv] frontend received result payload", rows);
    console.debug("[search_kjv] frontend SQL row count", rows.length);

    if (rows.length === 0) {
      return [];
    }

    const firstVerse = rows[0].verse;
    const lastVerse = rows[rows.length - 1].verse;

    const mapped = [
      {
        id: `${translationCode}-${book}-${query.chapter}-${firstVerse}-${lastVerse}`,
        reference: toReference(book, query.chapter, firstVerse, lastVerse),
        translationCode,
        text: rows.map((row) => row.text).join(" "),
        confidence: query.confidence ?? 0.95
      },
      ...asResults(rows, translationCode)
    ];

    console.debug("[search_kjv] final UI result payload", mapped[0]);

    return mapped;
  }
};
