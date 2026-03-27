import type { SpeechResult } from "../../services/interfaces";

type RecognitionFactory = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: (() => void) | null;
  onnomatch: (() => void) | null;
  start: () => void;
  stop: () => void;
};

interface WindowWithSpeech extends Window {
  webkitSpeechRecognition?: RecognitionFactory;
  SpeechRecognition?: RecognitionFactory;
}

export async function captureSpeechInput(): Promise<SpeechResult> {
  const speechWindow = window as WindowWithSpeech;
  const recognitionCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

  if (!recognitionCtor) {
    return {
      transcript: "",
      confidence: 0
    };
  }

  return new Promise<SpeechResult>((resolve, reject) => {
    const recognition = new recognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const top = event.results[0]?.[0];
      resolve({ transcript: top?.transcript ?? "", confidence: top?.confidence });
      recognition.stop();
    };

    recognition.onerror = () => {
      reject(new Error("Speech recognition failed."));
      recognition.stop();
    };

    recognition.onnomatch = () => {
      resolve({ transcript: "", confidence: 0 });
      recognition.stop();
    };

    recognition.start();
  });
}
