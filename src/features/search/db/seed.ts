export type TranslationRow = {
  id: number;
  code: string;
  name: string;
};

export type BookRow = {
  id: number;
  translationId: number;
  name: string;
  testament: "OT" | "NT";
  sortOrder: number;
};

export type VerseRow = {
  id: number;
  translationId: number;
  bookId: number;
  chapter: number;
  verse: number;
  text: string;
};

export type BookAliasRow = {
  id: number;
  translationId: number;
  bookId: number;
  alias: string;
  normalizedAlias: string;
};

export const SEEDED_TRANSLATIONS: TranslationRow[] = [{ id: 1, code: "KJV", name: "King James Version" }];

export const SEEDED_BOOKS: BookRow[] = [
  { id: 1, translationId: 1, name: "Psalm", testament: "OT", sortOrder: 19 },
  { id: 2, translationId: 1, name: "John", testament: "NT", sortOrder: 43 },
  { id: 3, translationId: 1, name: "Romans", testament: "NT", sortOrder: 45 },
  { id: 4, translationId: 1, name: "Isaiah", testament: "OT", sortOrder: 23 },
  { id: 5, translationId: 1, name: "1 Corinthians", testament: "NT", sortOrder: 46 },
  { id: 6, translationId: 1, name: "2 Timothy", testament: "NT", sortOrder: 55 }
];

export const SEEDED_ALIASES: BookAliasRow[] = [
  { id: 1, translationId: 1, bookId: 1, alias: "Psalm", normalizedAlias: "psalm" },
  { id: 2, translationId: 1, bookId: 1, alias: "Psalms", normalizedAlias: "psalms" },
  { id: 3, translationId: 1, bookId: 2, alias: "John", normalizedAlias: "john" },
  { id: 4, translationId: 1, bookId: 3, alias: "Romans", normalizedAlias: "romans" },
  { id: 5, translationId: 1, bookId: 4, alias: "Isaiah", normalizedAlias: "isaiah" },
  { id: 6, translationId: 1, bookId: 5, alias: "1 Corinthians", normalizedAlias: "1 corinthians" },
  { id: 7, translationId: 1, bookId: 5, alias: "First Corinthians", normalizedAlias: "first corinthians" },
  { id: 8, translationId: 1, bookId: 6, alias: "2 Timothy", normalizedAlias: "2 timothy" },
  { id: 9, translationId: 1, bookId: 6, alias: "Second Timothy", normalizedAlias: "second timothy" }
];

export const SEEDED_VERSES: VerseRow[] = [
  {
    id: 1,
    translationId: 1,
    bookId: 1,
    chapter: 23,
    verse: 1,
    text: "The LORD is my shepherd; I shall not want."
  },
  {
    id: 2,
    translationId: 1,
    bookId: 1,
    chapter: 23,
    verse: 2,
    text: "He maketh me to lie down in green pastures: he leadeth me beside the still waters."
  },
  {
    id: 3,
    translationId: 1,
    bookId: 1,
    chapter: 23,
    verse: 3,
    text: "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake."
  },
  {
    id: 4,
    translationId: 1,
    bookId: 2,
    chapter: 3,
    verse: 16,
    text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."
  },
  {
    id: 5,
    translationId: 1,
    bookId: 3,
    chapter: 8,
    verse: 28,
    text: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose."
  },
  {
    id: 6,
    translationId: 1,
    bookId: 4,
    chapter: 40,
    verse: 31,
    text: "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint."
  },
  {
    id: 7,
    translationId: 1,
    bookId: 5,
    chapter: 13,
    verse: 4,
    text: "Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up."
  },
  {
    id: 8,
    translationId: 1,
    bookId: 6,
    chapter: 1,
    verse: 7,
    text: "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind."
  }
];
