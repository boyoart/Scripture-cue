import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: {
      transcript: string;
    };
  }>;
};

type SpeechRecognitionFactory = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionFactory;
    SpeechRecognition?: SpeechRecognitionFactory;
  }
}

export type MicState = "idle" | "listening" | "processing" | "success" | "error";

export type SpeechMeterState = {
  bars: number[];
  micState: MicState;
  transcript: string;
  errorMessage: string | null;
  listening: boolean;
  startListening: () => Promise<void>;
  stopListening: (nextState?: MicState) => void;
};

const BAR_COUNT = 14;
const FFT_SIZE = 256;

function createFallbackBars(seed: number): number[] {
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    const wave = Math.sin(seed / 6 + index * 0.62);
    const shimmer = Math.sin(seed / 11 + index * 0.2);
    const value = 0.2 + Math.abs(wave) * 0.58 + (shimmer + 1) * 0.06;
    return Math.min(1, Math.max(0.12, value));
  });
}

export function useSpeechMeter(): SpeechMeterState {
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: BAR_COUNT }, () => 0.12));
  const [micState, setMicState] = useState<MicState>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const fallbackTickRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const hasTranscriptRef = useRef(false);

  const RecognitionCtor = useMemo(() => window.SpeechRecognition ?? window.webkitSpeechRecognition, []);

  const clearAudioPipeline = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    streamRef.current = null;

    analyserRef.current?.disconnect();
    analyserRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const stopListening = useCallback((nextState: MicState = "processing") => {
    recognitionRef.current?.stop();
    clearAudioPipeline();
    setListening(false);
    setBars(Array.from({ length: BAR_COUNT }, () => 0.12));
    setMicState((current: MicState) => (current === "error" ? "error" : nextState));
  }, [clearAudioPipeline]);

  const startListening = useCallback(async () => {
    if (listening) {
      return;
    }

    setErrorMessage(null);
    hasTranscriptRef.current = false;
    setTranscript("");
    setMicState("listening");
    setListening(true);

    let useFallbackAnimation = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source.connect(analyser);
      analyserRef.current = analyser;

      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const bucketSize = Math.floor(frequencyData.length / BAR_COUNT);

      const animate = () => {
        const activeAnalyser = analyserRef.current;
        if (!activeAnalyser || !listening) {
          return;
        }

        activeAnalyser.getByteFrequencyData(frequencyData);
        const nextBars = Array.from({ length: BAR_COUNT }, (_, index) => {
          const start = index * bucketSize;
          const end = index === BAR_COUNT - 1 ? frequencyData.length : start + bucketSize;
          let sum = 0;
          for (let i = start; i < end; i += 1) {
            sum += frequencyData[i];
          }
          const average = sum / Math.max(1, end - start);
          const normalized = average / 255;
          return Math.max(0.12, Math.min(1, normalized * 1.8));
        });

        setBars(nextBars);
        frameRef.current = requestAnimationFrame(animate);
      };

      frameRef.current = requestAnimationFrame(animate);
    } catch (error) {
      useFallbackAnimation = true;
      console.warn("Microphone access unavailable; using fallback animation.", error);
    }

    if (useFallbackAnimation) {
      const animateFallback = () => {
        if (!listening) {
          return;
        }
        fallbackTickRef.current += 1;
        setBars(createFallbackBars(fallbackTickRef.current));
        frameRef.current = requestAnimationFrame(animateFallback);
      };

      frameRef.current = requestAnimationFrame(animateFallback);
    }

    if (!RecognitionCtor) {
      setMicState("error");
      setErrorMessage("Speech recognition is not available in this environment.");
      stopListening("error");
      return;
    }

    {
      const recognition = new RecognitionCtor();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        const text = Array.from(
          event.results as ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
        )
          .map((result) => result[0].transcript)
          .join(" ")
          .trim();

        if (text) {
          setTranscript(text);
        }

        const latestResult = event.results[event.resultIndex];
        if (latestResult?.isFinal && text) {
          hasTranscriptRef.current = true;
          setMicState("success");
          stopListening("success");
        }
      };

      recognition.onerror = (event: { error: string }) => {
        setMicState("error");
        setErrorMessage(`Speech recognition error: ${event.error}`);
        stopListening("error");
      };

      recognition.onend = () => {
        if (hasTranscriptRef.current) {
          return;
        }
        setMicState((current: MicState) => (current === "error" ? "error" : "idle"));
        setListening(false);
      };

      recognition.start();
    }
  }, [RecognitionCtor, listening, stopListening]);

  useEffect(() => {
    if (micState !== "success") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMicState("idle");
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [micState]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      clearAudioPipeline();
    };
  }, [clearAudioPipeline]);

  return {
    bars,
    micState,
    transcript,
    errorMessage,
    listening,
    startListening,
    stopListening
  };
}
