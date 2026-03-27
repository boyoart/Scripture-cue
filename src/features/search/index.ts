import type { VerseQuery } from "../../types/search";
import type { VerseResult } from "../../types/verse";

interface TranslationOption {
  code: string;
  name: string;
  language: string;
  isDefault: boolean;
}

declare global {
  interface Window {
    __TAURI__?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
      core?: {
        invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

const FALLBACK_TRANSLATIONS: TranslationOption[] = [
  { code: "KJV", name: "King James Version", language: "en", isDefault: true },
  { code: "WEB", name: "World English Bible", language: "en", isDefault: false }
];

function getInvoke() {
  return window.__TAURI__?.invoke ?? window.__TAURI__?.core?.invoke ?? null;
}

export async function fetchBundledTranslations(): Promise<TranslationOption[]> {
  const invoke = getInvoke();
  if (!invoke) {
    return FALLBACK_TRANSLATIONS;
  }

  try {
    return await invoke<TranslationOption[]>("get_translations");
  } catch {
    return FALLBACK_TRANSLATIONS;
  }
}

export async function searchBundledBible(query: VerseQuery): Promise<VerseResult[]> {
  const invoke = getInvoke();
  if (!invoke) {
    return [];
  }

  return invoke<VerseResult[]>("search_verses", {
    query: query.raw,
    translationCode: query.translationCode ?? "KJV",
    maxResults: 30
  });
}
