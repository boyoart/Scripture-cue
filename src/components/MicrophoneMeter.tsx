import type { MicState } from "../features/speech/useSpeechMeter";

type MicrophoneMeterProps = {
  bars: number[];
  micState: MicState;
};

const LABELS: Record<MicState, string> = {
  idle: "Idle",
  listening: "Listening",
  processing: "Processing",
  success: "Captured",
  error: "Error"
};

export default function MicrophoneMeter({ bars, micState }: MicrophoneMeterProps) {
  return (
    <div className={`microphone-meter microphone-meter--${micState}`} aria-live="polite">
      <div className="microphone-meter__bars" role="img" aria-label={`Microphone state: ${LABELS[micState]}`}>
        {bars.map((barHeight, index) => (
          <span
            key={`bar-${index}`}
            className="microphone-meter__bar"
            style={{ transform: `scaleY(${barHeight})` }}
          />
        ))}
      </div>
      <span className="microphone-meter__label">{LABELS[micState]}</span>
    </div>
  );
}
