export interface BibleBookRecord {
  id: string;
  name: string;
  abbreviations: string[];
  chapters: string[][];
}

export interface BibleTranslationRecord {
  code: string;
  name: string;
  language: string;
  publicDomain: boolean;
  license: string;
  source: string;
  books: BibleBookRecord[];
}

export interface TranslationSummary {
  code: string;
  name: string;
  language: string;
  publicDomain: boolean;
}

export interface VerseRow {
  id: string;
  translationCode: string;
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
}
