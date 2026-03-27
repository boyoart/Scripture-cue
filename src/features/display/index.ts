import type { VerseMetadata, VerseResult } from "../../types/verse";

export function buildVersePreview(verses: VerseResult[]): string {
  if (verses.length === 0) {
    return "No verse selected yet. Search by reference or keyword.";
  }

  return verses.map((verse) => verse.text).join("\n");
}

export function buildMetadata(verses: VerseResult[]): VerseMetadata {
  if (verses.length === 0) {
    return {
      reference: "-",
      translationCode: "-",
      theme: "-",
      status: "Idle"
    };
  }

  const [first] = verses;
  const last = verses[verses.length - 1];
  const reference = verses.length > 1 ? `${first.reference}-${last.verse}` : first.reference;

  return {
    reference,
    translationCode: first.translationCode,
    theme: "Comfort & Assurance",
    status: "Ready to Present"
  };
}
