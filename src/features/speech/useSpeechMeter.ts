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
export type StopReason = "final" | "no-speech" | "interrupted" | "fatal" | "stopped" | null;

export type SpeechMeterState = {
  bars: number[];
  micState: MicState;
  transcript: string;
  errorMessage: string | null;
  lastErrorCode: string | null;
  lastStopReason: StopReason;
  listening: boolean;
  startListening: () => Promise<void>;
  stopListening: (nextState?: MicState) => void;
};

const BAR_COUNT = 14;
const FFT_SIZE = 1024;
const SILENT_BARS = Array.from({ length: BAR_COUNT }, () => 0.04);

const FATAL_ERROR_CODES = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);
const NON_FATAL_ERROR_CODES = new Set(["no-speech", "aborted", "network"]);

function normalizeErrorCode(code: string | undefined): string {
  return (code ?? "unknown").trim().toLowerCase();
}

export function useSpeechMeter(): SpeechMeterState {
  const [bars, setBars] = useState<number[]>(SILENT_BARS);
  const [micState, setMicState] = useState<MicState>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);
  const [lastStopReason, setLastStopReason] = useState<StopReason>(null);
  const [listening, setListening] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const hasTranscriptRef = useRef(false);
  const stopReasonRef = useRef<StopReason>(null);
  const listeningRef = useRef(false);

  const RecognitionCtor = useMemo(() => window.SpeechRecognition ?? window.webkitSpeechRecognition, []);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

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

    setBars((prev) => prev.map((value) => Math.max(0.04, value * 0.78)));
  }, []);

  const stopListening = useCallback((nextState: MicState = "processing") => {
    if (stopReasonRef.current === null) {
      stopReasonRef.current = nextState === "success" ? "final" : "stopped";
      setLastStopReason(stopReasonRef.current);
    }

    recognitionRef.current?.stop();
    clearAudioPipeline();
    setListening(false);
    setMicState((current: MicState) => (current === "error" ? "error" : nextState));
  }, [clearAudioPipeline]);

  const startListening = useCallback(async () => {
    if (listeningRef.current) {
      return;
    }

    setErrorMessage(null);
    setLastErrorCode(null);
    setLastStopReason(null);
    stopReasonRef.current = null;
    hasTranscriptRef.current = false;
    setTranscript("");
    setMicState("listening");
    setListening(true);

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
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;

      const samples = new Float32Array(analyser.fftSize);
      let smoothedEnergy = 0;

      const animate = () => {
        const activeAnalyser = analyserRef.current;
        if (!activeAnalyser || !listeningRef.current) {
          return;
        }

        activeAnalyser.getFloatTimeDomainData(samples);

        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) {
          sum += samples[i] * samples[i];
        }

        const rms = Math.sqrt(sum / Math.max(1, samples.length));
        const gated = Math.max(0, rms - 0.01);
        smoothedEnergy = smoothedEnergy * 0.82 + gated * 0.18;
        const base = Math.min(1, smoothedEnergy * 9);

        setBars((prevBars) =>
          prevBars.map((prevValue, index) => {
            const weight = 0.58 + (BAR_COUNT - index) * 0.04;
            const target = Math.max(0.04, Math.min(1, base * weight));
            const eased = prevValue * 0.64 + target * 0.36;
            return Number.isFinite(eased) ? eased : 0.04;
          })
        );

        frameRef.current = requestAnimationFrame(animate);
      };

      frameRef.current = requestAnimationFrame(animate);
    } catch (error) {
      setMicState("error");
      setLastErrorCode("audio-capture");
      setLastStopReason("fatal");
      setErrorMessage(`Microphone access failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      stopReasonRef.current = "fatal";
      stopListening("error");
      return;
    }

    if (!RecognitionCtor) {
      setMicState("error");
      setErrorMessage("Speech recognition is not available in this environment.");
      setLastErrorCode("unavailable");
      setLastStopReason("fatal");
      stopReasonRef.current = "fatal";
      stopListening("error");
      return;
    }

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
        stopReasonRef.current = "final";
        setLastStopReason("final");
        setMicState("success");
        stopListening("success");
      }
    };

    recognition.onerror = (event: { error: string }) => {
      const code = normalizeErrorCode(event.error);
      setLastErrorCode(code);

      if (FATAL_ERROR_CODES.has(code)) {
        stopReasonRef.current = "fatal";
        setLastStopReason("fatal");
        setMicState("error");
        setErrorMessage(`Speech recognition error: ${code}`);
        stopListening("error");
        return;
      }

      if (NON_FATAL_ERROR_CODES.has(code)) {
        stopReasonRef.current = code === "no-speech" ? "no-speech" : "interrupted";
        setLastStopReason(stopReasonRef.current);
        setMicState("idle");
        setErrorMessage(null);
        stopListening("idle");
        return;
      }

      stopReasonRef.current = "interrupted";
      setLastStopReason("interrupted");
      setMicState("error");
      setErrorMessage(`Speech recognition error: ${code}`);
      stopListening("error");
    };

    recognition.onend = () => {
      if (hasTranscriptRef.current || stopReasonRef.current === "fatal") {
        return;
      }

      if (stopReasonRef.current === null) {
        stopReasonRef.current = "interrupted";
        setLastStopReason("interrupted");
      }

      setMicState((current: MicState) => (current === "error" ? "error" : "idle"));
      setListening(false);
      clearAudioPipeline();
    };

    recognition.start();
  }, [RecognitionCtor, clearAudioPipeline, stopListening]);

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
    lastErrorCode,
    lastStopReason,
    listening,
    startListening,
    stopListening
  };
}
