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

const CANONICAL_TO_DB_BOOK: Record<string, string> = {
  Psalm: "Psalms",
  Psalms: "Psalms",
  "First Corinthians": "1 Corinthians",
  "Second Corinthians": "2 Corinthians",
  "Song of Songs": "Song of Solomon"
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

function getInvoke(): InvokeFn | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__TAURI__?.invoke ?? window.__TAURI__?.tauri?.invoke ?? null;
}

function resolveDbBookName(book: string): string {
  return CANONICAL_TO_DB_BOOK[book] ?? book;
}

export const localBibleProvider: BibleProvider = {
  async search(query: VerseQuery): Promise<VerseResult[]> {
    const translationCode = (query.translationCode as TranslationCode | undefined) ?? DEFAULT_TRANSLATION;
    const canonicalBook = query.canonicalBook ?? query.book;

    if (!canonicalBook || !query.chapter) {
      return [];
    }

    const verseStart = query.verseStart ?? 1;
    const verseEnd = query.verseEnd ?? query.verseStart ?? verseStart;

    const invoke = getInvoke();
    if (!invoke) {
      return [];
    }

    let rows: KjvVerseRow[] = [];

    const dbBook = resolveDbBookName(canonicalBook);

    const requestPayload: SearchKjvPayload = {
      book: dbBook,
      chapter: query.chapter,
      verseStart,
      verseEnd,
      translation: translationCode
    };

    console.debug("[search_kjv] frontend outgoing payload", {
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

    console.debug("[search_kjv] frontend received rows", rows);
    console.debug("[search_kjv] frontend row count", rows.length);

    if (rows.length === 0) {
      return [];
    }

    const firstVerse = rows[0].verse;
    const lastVerse = rows[rows.length - 1].verse;

    const mapped: VerseResult = {
      id: `${translationCode}-${rows[0].book}-${query.chapter}-${firstVerse}-${lastVerse}`,
      reference: toReference(rows[0].book, query.chapter, firstVerse, lastVerse),
      translationCode,
      text: rows.map((row) => row.text).join(" "),
      verses: rows,
      confidence: query.confidence ?? 0.95
    };

    console.debug("[search_kjv] final UI result payload", mapped);

    return [mapped];
  }
};
