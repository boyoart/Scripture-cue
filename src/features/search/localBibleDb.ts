export type TranslationCode = "KJV";

export type VerseRecord = {
  reference: string;
  text: string;
  theme: string;
};

export const SUPPORTED_TRANSLATIONS: TranslationCode[] = ["KJV"];