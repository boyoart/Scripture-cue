import { getSupportedTranslations, type SupportedTranslation } from "../../data/localBibleDb";

export const DEFAULT_TRANSLATION: SupportedTranslation = "NIV";

export function getTranslationOptions(): SupportedTranslation[] {
  return getSupportedTranslations();
}
