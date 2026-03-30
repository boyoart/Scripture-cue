import { parseScriptureInput } from "../../parser";
import type { BibleProvider } from "../../../services/interfaces";
import type { VerseQuery } from "../../../types/search";
import type { VerseResult } from "../../../types/verse";

export type SearchOutcome = {
  query: VerseQuery;
  results: VerseResult[];
  status: "found" | "not_found";
};

export class VerseSearchService {
  constructor(private readonly provider: BibleProvider) {}

  async resolve(rawInput: string, translationCode: string): Promise<SearchOutcome> {
    const query = parseScriptureInput(rawInput, translationCode);
    const results = await this.provider.search(query);

    return {
      query,
      results,
      status: results.length > 0 ? "found" : "not_found"
    };
  }
}
