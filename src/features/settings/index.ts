import { localBibleDatabase } from "../search";

export function getAvailableTranslations() {
  return localBibleDatabase.listTranslations();
}

export const SETTINGS_FEATURE_READY = true;
