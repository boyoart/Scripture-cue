import type { SpeechCaptureResult, SpeechProvider } from "./types";

export type MockSpeechProviderOptions = {
  delayMs?: number;
  failOnAttemptNumbers?: number[];
  transcripts?: string[];
};

const DEFAULT_TRANSCRIPTS = [
  "Psalm 23 verse 1 through 3",
  "John 3 16",
  "Romans 8 28",
  "Isaiah 40 31"
];

export class MockSpeechProvider implements SpeechProvider {
  private readonly delayMs: number;
  private readonly failOnAttemptNumbers: Set<number>;
  private readonly transcripts: string[];
  private attempt = 0;

  constructor(options: MockSpeechProviderOptions = {}) {
    this.delayMs = options.delayMs ?? 1200;
    this.failOnAttemptNumbers = new Set(options.failOnAttemptNumbers ?? []);
    this.transcripts = options.transcripts?.length ? options.transcripts : DEFAULT_TRANSCRIPTS;
  }

  async listen(): Promise<SpeechCaptureResult> {
    this.attempt += 1;

    await new Promise((resolve) => {
      window.setTimeout(resolve, this.delayMs);
    });

    if (this.failOnAttemptNumbers.has(this.attempt)) {
      throw new Error("We could not hear your voice clearly. Please try again.");
    }

    const transcript = this.transcripts[(this.attempt - 1) % this.transcripts.length];

    return {
      transcript,
      confidence: 0.88
    };
  }
}
