import type { VerseQuery } from "../../types/search";
import type { VerseResult } from "../../types/verse";

const LOCAL_BIBLE_DB: VerseResult[] = [
  {
    id: "isaiah-40-31-niv",
    reference: "Isaiah 40:31",
    translationCode: "NIV",
    text: "but those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint."
  },
  {
    id: "john-3-16-esv",
    reference: "John 3:16",
    translationCode: "ESV",
    text: "For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life."
  },
  {
    id: "psalm-23-1-3-niv",
    reference: "Psalm 23:1-3",
    translationCode: "NIV",
    text: "The Lord is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul."
  },
  {
    id: "romans-8-28-nlt",
    reference: "Romans 8:28",
    translationCode: "NLT",
    text: "And we know that God causes everything to work together for the good of those who love God and are called according to his purpose for them."
  }
];

function referenceMatches(query: VerseQuery, verse: VerseResult): boolean {
  if (!query.canonicalBook || !query.chapter) {
    return false;
  }

  const normalizedReference = verse.reference.toLowerCase();
  const bookMatch = normalizedReference.startsWith(query.canonicalBook.toLowerCase());
  const chapterMatch = normalizedReference.includes(`${query.chapter}:`);

  if (!bookMatch || !chapterMatch) {
    return false;
  }

  if (!query.verseStart) {
    return true;
  }

  return normalizedReference.includes(`:${query.verseStart}`);
}

export async function searchLocalBibleDb(query: VerseQuery): Promise<VerseResult[]> {
  await new Promise((resolve) => setTimeout(resolve, 250));

  const translation = query.translationCode;
  const scopedByTranslation = translation
    ? LOCAL_BIBLE_DB.filter((verse) => verse.translationCode === translation)
    : LOCAL_BIBLE_DB;

  if (query.kind === "exact_reference") {
    return scopedByTranslation.filter((verse) => referenceMatches(query, verse));
  }

  const phrase = query.phrase?.toLowerCase() ?? query.normalized?.toLowerCase() ?? "";
  if (!phrase) {
    return [];
  }

  return scopedByTranslation.filter((verse) => {
    return (
      verse.reference.toLowerCase().includes(phrase) ||
      verse.text.toLowerCase().includes(phrase)
    );
  });
}
