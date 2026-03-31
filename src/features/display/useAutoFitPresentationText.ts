import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";

const MIN_FULLSCREEN_FONT_PX = 24;
const MIN_LOWER_THIRD_FONT_PX = 20;
const HEIGHT_TOLERANCE_PX = 1;
const WIDTH_TOLERANCE_PX = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export type AutoFitTextOptions = {
  containerRef: RefObject<HTMLElement | null>;
  verseRef: RefObject<HTMLElement | null>;
  preferredFontSizePx: number;
  preferredLineHeight: number;
  displayMode: "fullscreen" | "lower-third";
  contentKey: string;
};

export type AutoFitTextResult = {
  verseStyle: CSSProperties;
  didHitMinimum: boolean;
};

export function useAutoFitPresentationText({
  containerRef,
  verseRef,
  preferredFontSizePx,
  preferredLineHeight,
  displayMode,
  contentKey
}: AutoFitTextOptions): AutoFitTextResult {
  const minimumFontSize = displayMode === "lower-third" ? MIN_LOWER_THIRD_FONT_PX : MIN_FULLSCREEN_FONT_PX;
  const minimumLineHeight = Math.max(1.15, preferredLineHeight - 0.35);
  const [fit, setFit] = useState({
    fontSizePx: preferredFontSizePx,
    lineHeight: preferredLineHeight,
    didHitMinimum: false
  });
  const rafRef = useRef<number | null>(null);

  const measureAndFit = useMemo(() => {
    return () => {
      const container = containerRef.current;
      const verse = verseRef.current;
      if (!container || !verse) {
        return;
      }

      const canFit = () => {
        return (
          container.scrollHeight <= container.clientHeight + HEIGHT_TOLERANCE_PX
          && container.scrollWidth <= container.clientWidth + WIDTH_TOLERANCE_PX
        );
      };

      let nextFontSize = preferredFontSizePx;
      let nextLineHeight = preferredLineHeight;
      let didHitMinimum = false;

      verse.style.fontSize = `${nextFontSize}px`;
      verse.style.lineHeight = `${nextLineHeight}`;

      if (!canFit()) {
        for (let candidate = preferredFontSizePx - 1; candidate >= minimumFontSize; candidate -= 1) {
          const reduction = preferredFontSizePx - candidate;
          const candidateLineHeight = clamp(preferredLineHeight - reduction * 0.01, minimumLineHeight, preferredLineHeight);
          verse.style.fontSize = `${candidate}px`;
          verse.style.lineHeight = `${candidateLineHeight}`;

          if (canFit()) {
            nextFontSize = candidate;
            nextLineHeight = candidateLineHeight;
            didHitMinimum = candidate === minimumFontSize;
            break;
          }

          if (candidate === minimumFontSize) {
            nextFontSize = candidate;
            nextLineHeight = candidateLineHeight;
            didHitMinimum = true;
          }
        }
      }

      const normalizedFit = {
        fontSizePx: roundToTwo(nextFontSize),
        lineHeight: roundToTwo(nextLineHeight),
        didHitMinimum
      };

      setFit((previous) => {
        if (
          previous.fontSizePx === normalizedFit.fontSizePx
          && previous.lineHeight === normalizedFit.lineHeight
          && previous.didHitMinimum === normalizedFit.didHitMinimum
        ) {
          return previous;
        }

        return normalizedFit;
      });
    };
  }, [containerRef, displayMode, minimumFontSize, minimumLineHeight, preferredFontSizePx, preferredLineHeight, verseRef]);

  useLayoutEffect(() => {
    measureAndFit();
  }, [measureAndFit, contentKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const queueMeasure = () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        measureAndFit();
      });
    };

    const resizeObserver = new ResizeObserver(queueMeasure);
    resizeObserver.observe(container);

    window.addEventListener("resize", queueMeasure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", queueMeasure);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [containerRef, measureAndFit]);

  return {
    verseStyle: {
      fontSize: `${fit.fontSizePx}px`,
      lineHeight: fit.lineHeight
    },
    didHitMinimum: fit.didHitMinimum
  };
}
