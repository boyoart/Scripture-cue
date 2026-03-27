import type { BibleProvider } from "../../services/interfaces";
import type { VerseQuery } from "../../types/search";
import type { VerseResult } from "../../types/verse";
import { localBibleDatabase } from "./bibleDatabase";

export class LocalBibleProvider implements BibleProvider {
  async search(query: VerseQuery): Promise<VerseResult[]> {
    return localBibleDatabase.search(query);
  }
}

export const localBibleProvider = new LocalBibleProvider();
