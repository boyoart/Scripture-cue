export type SpeechInputState = "idle" | "listening" | "processing" | "success" | "error";

export interface SpeechCaptureResult {
  transcript: string;
  confidence?: number;
}

export interface SpeechProvider {
  listen(): Promise<SpeechCaptureResult>;
}

export interface SpeechSessionResult {
  state: SpeechInputState;
  transcript: string;
  errorMessage?: string;
}
