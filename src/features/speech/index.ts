import { parseScriptureQuery, type ParseOutput } from "../parser";

export const SPEECH_FEATURE_READY = true;

export interface SpeechNormalizationResult extends ParseOutput {
  transcript: string;
}

export function normalizeSpokenTranscript(transcript: string): SpeechNormalizationResult {
  const parsed = parseScriptureQuery(transcript);
  return {
    ...parsed,
    transcript,
  };
}
