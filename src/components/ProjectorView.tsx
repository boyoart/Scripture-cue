import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { SearchResult } from "../api";
import {
  getProjectorStorageKey,
  PROJECTOR_STATE_EVENT,
  readProjectorState,
  type ProjectorPayload
} from "../features/display/projectorSync";

type ProjectorViewState = {
  result: SearchResult;
  verseText: string;
  showReference: boolean;
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
  showReference: true
};

export default function ProjectorView() {
  const [state, setState] = useState<ProjectorViewState>(() => readProjectorState() ?? EMPTY_STATE);

  useEffect(() => {
    const storageKey = getProjectorStorageKey();

    const syncFromStorage = () => {
      const next = readProjectorState();
      if (next) {
        setState(next);
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
        setState(event.payload);
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

  return (
    <main className="projector-screen" aria-live="polite">
      <div className="projector-screen__content">
        {state.showReference ? <p className="projector-screen__reference">{state.result.reference}</p> : null}
        <pre className={`projector-screen__verse ${state.result.found ? "" : "projector-screen__verse--empty"}`}>
          {verseText}
        </pre>
      </div>
    </main>
  );
}
