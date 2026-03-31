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
  viewportRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  verseRef: RefObject<HTMLElement | null>;
  preferredFontSizePx: number;
  preferredLineHeight: number;
  displayMode: "fullscreen" | "lower-third";
  contentKey: string;
};

export type AutoFitTextResult = {
  verseStyle: CSSProperties;
  didHitMinimum: boolean;
  shouldTopBias: boolean;
};

export function useAutoFitPresentationText({
  viewportRef,
  contentRef,
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
    didHitMinimum: false,
    shouldTopBias: false
  });
  const rafRef = useRef<number | null>(null);

  const measureAndFit = useMemo(() => {
    return () => {
      const container = viewportRef.current;
      const content = contentRef.current;
      const verse = verseRef.current;
      if (!container || !content || !verse) {
        return;
      }

      const canFit = () => {
        return (
          content.scrollHeight <= container.clientHeight + HEIGHT_TOLERANCE_PX
          && content.scrollWidth <= container.clientWidth + WIDTH_TOLERANCE_PX
        );
      };

      let nextFontSize = preferredFontSizePx;
      let nextLineHeight = preferredLineHeight;
      let didHitMinimum = false;
      let shouldTopBias = false;

      verse.style.fontSize = `${nextFontSize}px`;
      verse.style.lineHeight = `${nextLineHeight}`;

      if (!canFit()) {
        shouldTopBias = true;
        for (let candidate = preferredFontSizePx - 1; candidate >= minimumFontSize; candidate -= 1) {
          const reduction = preferredFontSizePx - candidate;
          const candidateLineHeight = clamp(preferredLineHeight - reduction * 0.0125, minimumLineHeight, preferredLineHeight);
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
        didHitMinimum,
        shouldTopBias
      };

      setFit((previous) => {
        if (
          previous.fontSizePx === normalizedFit.fontSizePx
          && previous.lineHeight === normalizedFit.lineHeight
          && previous.didHitMinimum === normalizedFit.didHitMinimum
          && previous.shouldTopBias === normalizedFit.shouldTopBias
        ) {
          return previous;
        }

        return normalizedFit;
      });
    };
  }, [contentRef, displayMode, minimumFontSize, minimumLineHeight, preferredFontSizePx, preferredLineHeight, verseRef, viewportRef]);

  useLayoutEffect(() => {
    measureAndFit();
  }, [measureAndFit, contentKey]);

  useEffect(() => {
    const container = viewportRef.current;
    const content = contentRef.current;
    if (!container || !content) {
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
    resizeObserver.observe(content);

    window.addEventListener("resize", queueMeasure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", queueMeasure);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [contentRef, measureAndFit, viewportRef]);

  return {
    verseStyle: {
      fontSize: `${fit.fontSizePx}px`,
      lineHeight: fit.lineHeight
    },
    didHitMinimum: fit.didHitMinimum,
    shouldTopBias: fit.shouldTopBias
  };
}
