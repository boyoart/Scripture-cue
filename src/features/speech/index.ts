import type { SpeechResult } from "../../services/interfaces";

const SIMULATED_TRANSCRIPTS = ["Isaiah 40 31", "John 3 16", "Psalm 23 1 3"];

export type SpeechCaptureState = "idle" | "listening" | "processing" | "success" | "error";

let simulatedCursor = 0;

export async function captureSpeechTranscript(): Promise<SpeechResult> {
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (typeof window === "undefined") {
    throw new Error("Speech input is unavailable outside the desktop runtime.");
  }

  const random = SIMULATED_TRANSCRIPTS[simulatedCursor % SIMULATED_TRANSCRIPTS.length];
  simulatedCursor += 1;

  await new Promise((resolve) => setTimeout(resolve, 450));

  return {
    transcript: random,
    confidence: 0.82
  };
}
