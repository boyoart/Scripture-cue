import type { SpeechResult } from "../../services/interfaces";

export type MicState = "idle" | "listening" | "processing" | "success" | "error";

type SpeechRecognitionEventPayload = Event & {
  resultIndex?: number;
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal?: boolean }>;
};

type SpeechCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventPayload) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type TranscriptChunk = {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  receivedAt: number;
};

function getSpeechConstructor(): SpeechCtor | null {
  const win = window as Window & { webkitSpeechRecognition?: SpeechCtor; SpeechRecognition?: SpeechCtor };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export async function captureTranscript(simulatedFallback: string): Promise<SpeechResult> {
  const SpeechRecognition = getSpeechConstructor();

  if (!SpeechRecognition) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { transcript: simulatedFallback, confidence: 0.62 };
  }

  return new Promise<SpeechResult>((resolve, reject) => {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let settled = false;

    recognition.onresult = (event) => {
      const result = event.results[0]?.[0];
      if (!result) {
        return;
      }

      settled = true;
      resolve({ transcript: result.transcript, confidence: result.confidence });
      recognition.stop();
    };

    recognition.onerror = (event) => {
      if (!settled) {
        settled = true;
        reject(new Error(event.error || "Speech recognition failed"));
      }
    };

    recognition.onend = () => {
      if (!settled) {
        settled = true;
        reject(new Error("Speech ended before transcript was captured"));
      }
    };

    recognition.start();
  });
}

export async function createLiveTranscriptStream(
  onChunk: (chunk: TranscriptChunk) => void,
  simulatedFallback: string
): Promise<() => void> {
  const SpeechRecognition = getSpeechConstructor();

  if (!SpeechRecognition) {
    const samplePhrases = [
      simulatedFallback,
      "john chapter 3 verse 16",
      "psalm twenty three one to three",
      "first corinthians thirteen four",
      "isaiah forty thirty one"
    ];
    let index = 0;
    const fallbackTimer = window.setInterval(() => {
      onChunk({
        transcript: samplePhrases[index % samplePhrases.length],
        confidence: 0.63,
        isFinal: true,
        receivedAt: Date.now()
      });
      index += 1;
    }, 2600);

    return () => window.clearInterval(fallbackTimer);
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let active = true;

  recognition.onresult = (event) => {
    const startAt = event.resultIndex ?? 0;
    for (let index = startAt; index < event.results.length; index += 1) {
      const result = event.results[index];
      const first = result?.[0];
      if (!first) {
        continue;
      }

      onChunk({
        transcript: first.transcript.trim(),
        confidence: first.confidence || 0.55,
        isFinal: Boolean(result.isFinal),
        receivedAt: Date.now()
      });
    }
  };

  recognition.onerror = () => {
    if (!active) {
      return;
    }
    onChunk({ transcript: "", confidence: 0, isFinal: true, receivedAt: Date.now() });
  };

  recognition.onend = () => {
    if (!active) {
      return;
    }
    try {
      recognition.start();
    } catch {
      // no-op
    }
  };

  recognition.start();

  return () => {
    active = false;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.stop();
  };
}

export async function createMicLevelStream(onLevels: (levels: number[]) => void): Promise<() => void> {
  const fallbackTimer = window.setInterval(() => {
    onLevels(Array.from({ length: 10 }, () => 0.2 + Math.random() * 0.7));
  }, 120);

  if (!navigator.mediaDevices?.getUserMedia) {
    return () => window.clearInterval(fallbackTimer);
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const realtimeTimer = window.setInterval(() => {
      analyser.getByteFrequencyData(data);
      const stride = Math.max(1, Math.floor(data.length / 10));
      const levels = Array.from({ length: 10 }, (_, index) => {
        const sample = data[index * stride] ?? 0;
        return Math.max(0.08, sample / 255);
      });
      onLevels(levels);
    }, 90);

    return () => {
      window.clearInterval(fallbackTimer);
      window.clearInterval(realtimeTimer);
      source.disconnect();
      analyser.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      audioContext.close().catch(() => undefined);
    };
  } catch {
    return () => window.clearInterval(fallbackTimer);
  }
}
