export interface VerseResult {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  translationCode: string;
  text: string;
  confidence?: number;
}

export interface VerseMetadata {
  reference: string;
  translationCode: string;
  theme: string;
  status: "Idle" | "Previewed" | "Ready to Present";
}
