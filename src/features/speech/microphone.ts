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
  if (!navigator.mediaDevices?.getUserMedia) {
    onLevels(Array(10).fill(0.04));
    return () => undefined;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const timeDomainData = new Uint8Array(analyser.fftSize);
    let smoothedEnergy = 0;

    const realtimeTimer = window.setInterval(() => {
      analyser.getByteTimeDomainData(timeDomainData);
      let rms = 0;
      for (let i = 0; i < timeDomainData.length; i += 1) {
        const sample = (timeDomainData[i] - 128) / 128;
        rms += sample * sample;
      }
      rms = Math.sqrt(rms / timeDomainData.length);
      const gatedRms = Math.max(0, rms - 0.018);
      smoothedEnergy = smoothedEnergy * 0.78 + gatedRms * 0.22;

      analyser.getByteFrequencyData(frequencyData);
      const stride = Math.max(1, Math.floor(frequencyData.length / 10));
      const levels = Array.from({ length: 10 }, (_, index) => {
        const sample = (frequencyData[index * stride] ?? 0) / 255;
        const weightedSample = sample * (0.4 + Math.min(1, smoothedEnergy * 22));
        const restingFloor = 0.03;
        return Math.min(1, Math.max(restingFloor, weightedSample));
      });
      onLevels(levels);
    }, 80);

    return () => {
      window.clearInterval(realtimeTimer);
      source.disconnect();
      analyser.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      audioContext.close().catch(() => undefined);
    };
  } catch {
    onLevels(Array(10).fill(0.04));
    return () => undefined;
  }
}
