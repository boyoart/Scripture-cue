import { LocalBibleProvider } from "./providers/LocalBibleProvider";
import { VerseSearchService } from "./services/verseSearchService";

export const SEARCH_FEATURE_READY = true;

export const localBibleProvider = new LocalBibleProvider();
export const verseSearchService = new VerseSearchService(localBibleProvider);

export { LocalBibleProvider } from "./providers/LocalBibleProvider";
export { VerseSearchService } from "./services/verseSearchService";
