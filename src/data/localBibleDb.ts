import type { VerseResult } from "../types/verse";

const baseVerses: Omit<VerseResult, "translationCode">[] = [
  {
    id: "psalm-23-1",
    book: "Psalm",
    chapter: 23,
    verse: 1,
    reference: "Psalm 23:1",
    text: "The Lord is my shepherd, I lack nothing."
  },
  {
    id: "psalm-23-2",
    book: "Psalm",
    chapter: 23,
    verse: 2,
    reference: "Psalm 23:2",
    text: "He makes me lie down in green pastures, he leads me beside quiet waters."
  },
  {
    id: "psalm-23-3",
    book: "Psalm",
    chapter: 23,
    verse: 3,
    reference: "Psalm 23:3",
    text: "He refreshes my soul. He guides me along the right paths for his name's sake."
  },
  {
    id: "john-3-16",
    book: "John",
    chapter: 3,
    verse: 16,
    reference: "John 3:16",
    text: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life."
  },
  {
    id: "romans-8-28",
    book: "Romans",
    chapter: 8,
    verse: 28,
    reference: "Romans 8:28",
    text: "And we know that in all things God works for the good of those who love him, who have been called according to his purpose."
  },
  {
    id: "isaiah-40-31",
    book: "Isaiah",
    chapter: 40,
    verse: 31,
    reference: "Isaiah 40:31",
    text: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles."
  }
];

const supportedTranslations = ["NIV", "ESV", "KJV", "NLT"] as const;

export type SupportedTranslation = (typeof supportedTranslations)[number];

export function getSupportedTranslations(): SupportedTranslation[] {
  return [...supportedTranslations];
}

export function getLocalBibleDb(translationCode: SupportedTranslation): VerseResult[] {
  return baseVerses.map((verse) => ({
    ...verse,
    id: `${verse.id}-${translationCode.toLowerCase()}`,
    translationCode
  }));
}
