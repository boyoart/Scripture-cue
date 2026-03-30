import type { SearchResult } from "../../api";

export const PROJECTOR_WINDOW_LABEL = "projector";
export const PROJECTOR_VIEW_QUERY = "projector";
export const PROJECTOR_STATE_EVENT = "projector:state-updated";
const PROJECTOR_STATE_STORAGE_KEY = "scripture-cue:projector-state";

export type ReferencePlacement = "top-left" | "top-center" | "bottom-left";

export type ProjectorPayload = {
  result: SearchResult;
  verseText: string;
  showReference: boolean;
  referencePlacement: ReferencePlacement;
  useSafeMargins: boolean;
};

export function readProjectorState(): ProjectorPayload | null {
  const raw = localStorage.getItem(PROJECTOR_STATE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ProjectorPayload;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeProjectorState(payload: ProjectorPayload) {
  localStorage.setItem(PROJECTOR_STATE_STORAGE_KEY, JSON.stringify(payload));
}

export function getProjectorStorageKey() {
  return PROJECTOR_STATE_STORAGE_KEY;
}

export function getProjectorRouteUrl(currentPathname: string) {
  const safePath = currentPathname.endsWith("/") ? `${currentPathname}index.html` : currentPathname;
  return `${safePath}?view=${PROJECTOR_VIEW_QUERY}`;
}
