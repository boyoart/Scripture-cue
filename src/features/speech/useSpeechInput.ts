import { useMemo, useState } from "react";
import { MockSpeechProvider } from "./mockSpeechProvider";
import type { SpeechInputState, SpeechProvider } from "./types";

type UseSpeechInputOptions = {
  provider?: SpeechProvider;
  processingDelayMs?: number;
  onTranscript?: (transcript: string) => void;
};

type SpeechUiModel = {
  state: SpeechInputState;
  statusText: string;
  actionLabel: string;
  canStart: boolean;
  canRetry: boolean;
  isBusy: boolean;
  errorMessage?: string;
  confidence?: number;
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function getStatusText(state: SpeechInputState): string {
  switch (state) {
    case "idle":
      return "Microphone idle. Click to start speech input.";
    case "listening":
      return "Listening... speak a verse reference or topic.";
    case "processing":
      return "Processing transcript...";
    case "success":
      return "Transcript captured and synced to search.";
    case "error":
      return "Speech input failed. Please retry.";
    default:
      return "Microphone idle.";
  }
}

export function useSpeechInput(options: UseSpeechInputOptions = {}) {
  const provider = useMemo(() => options.provider ?? new MockSpeechProvider({ failOnAttemptNumbers: [3] }), [options.provider]);
  const processingDelayMs = options.processingDelayMs ?? 450;

  const [state, setState] = useState<SpeechInputState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [confidence, setConfidence] = useState<number>();

  const startListening = async () => {
    if (state === "listening" || state === "processing") {
      return;
    }

    setErrorMessage(undefined);
    setConfidence(undefined);
    setState("listening");

    try {
      const speechResult = await provider.listen();
      setState("processing");
      await sleep(processingDelayMs);

      options.onTranscript?.(speechResult.transcript);
      setConfidence(speechResult.confidence);
      setState("success");
    } catch (error) {
      const fallbackMessage = "Unable to capture speech input. Please retry.";
      setErrorMessage(error instanceof Error ? error.message : fallbackMessage);
      setState("error");
    }
  };

  const resetToIdle = () => {
    setErrorMessage(undefined);
    setConfidence(undefined);
    setState("idle");
  };

  const uiModel: SpeechUiModel = {
    state,
    statusText: getStatusText(state),
    actionLabel: state === "idle" ? "Start Listening" : state === "error" ? "Retry Listening" : "Listening",
    canStart: state === "idle" || state === "error" || state === "success",
    canRetry: state === "error",
    isBusy: state === "listening" || state === "processing",
    errorMessage,
    confidence
  };

  return {
    ...uiModel,
    startListening,
    resetToIdle
  };
}
