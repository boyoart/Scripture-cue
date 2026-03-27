export type VerseRow = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

export const SUPPORTED_TRANSLATIONS = ["NIV", "ESV", "KJV", "NLT"] as const;

export type TranslationCode = (typeof SUPPORTED_TRANSLATIONS)[number];

const BASE_VERSES: VerseRow[] = [
  {
    book: "John",
    chapter: 3,
    verse: 16,
    text: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life."
  },
  {
    book: "Psalm",
    chapter: 23,
    verse: 1,
    text: "The Lord is my shepherd, I lack nothing."
  },
  {
    book: "Psalm",
    chapter: 23,
    verse: 2,
    text: "He makes me lie down in green pastures, he leads me beside quiet waters."
  },
  {
    book: "Psalm",
    chapter: 23,
    verse: 3,
    text: "He refreshes my soul. He guides me along the right paths for his name's sake."
  },
  {
    book: "Isaiah",
    chapter: 40,
    verse: 31,
    text: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles."
  },
  {
    book: "Matthew",
    chapter: 11,
    verse: 11,
    text: "Truly I tell you, among those born of women there has not risen anyone greater than John the Baptist."
  },
  {
    book: "1 Corinthians",
    chapter: 13,
    verse: 4,
    text: "Love is patient, love is kind. It does not envy, it does not boast, it is not proud."
  },
  {
    book: "Romans",
    chapter: 8,
    verse: 28,
    text: "And we know that in all things God works for the good of those who love him, who have been called according to his purpose."
  }
];

function withTranslationTag(text: string, translation: TranslationCode): string {
  if (translation === "KJV") {
    return `${text} (KJV sample)`;
  }

  if (translation === "NLT") {
    return `${text} (NLT sample)`;
  }

  if (translation === "ESV") {
    return `${text} (ESV sample)`;
  }

  return text;
}

export const BIBLE_DB: Record<TranslationCode, VerseRow[]> = {
  NIV: BASE_VERSES,
  ESV: BASE_VERSES.map((row) => ({ ...row, text: withTranslationTag(row.text, "ESV") })),
  KJV: BASE_VERSES.map((row) => ({ ...row, text: withTranslationTag(row.text, "KJV") })),
  NLT: BASE_VERSES.map((row) => ({ ...row, text: withTranslationTag(row.text, "NLT") }))
};
