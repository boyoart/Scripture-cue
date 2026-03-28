export interface VerseLine {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface VerseResult {
  id: string;
  reference: string;
  translationCode: string;
  text: string;
  verses: VerseLine[];
  confidence?: number;
}
