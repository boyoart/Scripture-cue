export const SUPPORTED_TRANSLATIONS = ["KJV"] as const;

export type TranslationCode = (typeof SUPPORTED_TRANSLATIONS)[number];

export const DEFAULT_TRANSLATION: TranslationCode = "KJV";

export const KJV_RESOURCE_RELATIVE_PATH = "bibles/KJV.db";
