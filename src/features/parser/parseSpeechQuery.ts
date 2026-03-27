export type ParsedSearchQuery = {
  raw: string;
  normalized: string;
};

const MULTI_SPACE_REGEX = /\s+/g;

export function parseSpeechQuery(input: string): ParsedSearchQuery {
  const normalized = input.trim().replace(MULTI_SPACE_REGEX, " ");

  return {
    raw: input,
    normalized
  };
}
