import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { SearchResult } from "../api";
import { getPresentationFontCssFamily } from "../features/display/presentationStyling";
import PresentationSurface from "./PresentationSurface";
import {
  getProjectorStorageKey,
  PROJECTOR_STATE_EVENT,
  readProjectorState,
  type ProjectorPayload,
  type ReferencePlacement
} from "../features/display/projectorSync";

type ProjectorViewState = {
  result: SearchResult;
  verseText: string;
  showReference: boolean;
  referencePlacement: ReferencePlacement;
  useSafeMargins: boolean;
  displayMode: ProjectorPayload["displayMode"];
  backgroundMode: ProjectorPayload["backgroundMode"];
  customBackgroundPath: string | null;
  customBackgroundSource: string | null;
  backgroundDimStrength: number;
  blurBackgroundImage: boolean;
  previewFontFamily: ProjectorPayload["previewFontFamily"];
  previewFontSizePx: number;
  projectionFontFamily: ProjectorPayload["projectionFontFamily"];
  projectionFontSizePx: number;
  projectionLineHeight: number;
};

const EMPTY_RESULT: SearchResult = {
  found: false,
  translation: "KJV",
  reference: "No result",
  theme: "Scripture Lookup",
  verses: [],
  message: "Awaiting verse from operator console."
};

const EMPTY_STATE: ProjectorViewState = {
  result: EMPTY_RESULT,
  verseText: "Awaiting verse from operator console.",
  showReference: true,
  referencePlacement: "top-left",
  useSafeMargins: true,
  displayMode: "fullscreen",
  backgroundMode: "solid-dark",
  customBackgroundPath: null,
  customBackgroundSource: null,
  backgroundDimStrength: 0.5,
  blurBackgroundImage: false,
  previewFontFamily: "Inter",
  previewFontSizePx: 21,
  projectionFontFamily: "Inter",
  projectionFontSizePx: 64,
  projectionLineHeight: 1.5
};

export default function ProjectorView() {
  const [state, setState] = useState<ProjectorViewState>(() => {
    const persisted = readProjectorState();
    return { ...EMPTY_STATE, ...persisted };
  });

  useEffect(() => {
    const storageKey = getProjectorStorageKey();

    const syncFromStorage = () => {
      const next = readProjectorState();
      if (next) {
        setState((prev) => ({ ...prev, ...next }));
      }
    };

    syncFromStorage();

    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        syncFromStorage();
      }
    };

    const unlistenPromise = listen<ProjectorPayload>(PROJECTOR_STATE_EVENT, (event) => {
      if (event.payload) {
        setState((prev) => ({ ...prev, ...event.payload }));
      }
    });

    const syncTimer = window.setInterval(syncFromStorage, 500);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(syncTimer);
      window.removeEventListener("storage", onStorage);
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const verseText = useMemo(() => {
    return state.verseText.trim() ? state.verseText : "Awaiting verse from operator console.";
  }, [state.verseText]);

  const backgroundImageSrc = useMemo(() => {
    if (state.backgroundMode !== "custom-image" || !state.customBackgroundSource) {
      return null;
    }

    return state.customBackgroundSource;
  }, [state.backgroundMode, state.customBackgroundSource]);

  const dimOpacity = state.backgroundMode === "custom-image" ? Math.min(state.backgroundDimStrength, 0.8) : 0.35;

  useEffect(() => {
    console.info("[presentation-background] projector received state", {
      backgroundMode: state.backgroundMode,
      rawPath: state.customBackgroundPath,
      renderSource: backgroundImageSrc,
      hasBackground: Boolean(backgroundImageSrc)
    });
  }, [backgroundImageSrc, state.backgroundMode, state.customBackgroundPath]);

  return (
    <PresentationSurface
      as="main"
      className="projector-screen"
      contentClassName={`projector-screen__content projector-screen__content--${state.displayMode} ${state.useSafeMargins ? "projector-screen__content--safe" : ""}`}
      backgroundMode={state.backgroundMode}
      backgroundSource={backgroundImageSrc}
      blurBackgroundImage={state.blurBackgroundImage}
      dimOpacity={dimOpacity}
      containerProps={{
        "aria-live": "polite",
        "data-background-received": String(Boolean(backgroundImageSrc))
      }}
    >
      {state.showReference ? (
        <p className={`projector-screen__reference projector-screen__reference--${state.referencePlacement}`}>
          {state.result.reference}
        </p>
      ) : null}
      <pre
        className={`projector-screen__verse ${state.result.found ? "" : "projector-screen__verse--empty"}`}
        style={{
          fontFamily: getPresentationFontCssFamily(state.projectionFontFamily),
          fontSize: `${state.projectionFontSizePx}px`,
          lineHeight: state.projectionLineHeight
        }}
      >
        {verseText}
      </pre>
    </PresentationSurface>
  );
}
