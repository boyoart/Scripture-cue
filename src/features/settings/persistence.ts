import type { SearchResult } from "../../api";
import type { ReferencePlacement } from "../display/projectorSync";

const SETTINGS_STORAGE_KEY = "scripture-cue:app-settings:v1";

export type PersistedAppSettings = {
  showPresentationReference: boolean;
  referencePlacement: ReferencePlacement;
  useSafeMargins: boolean;
  selectedTranslation: string;
  reopenProjectorOnLaunch: boolean;
  wasProjectorWindowOpen: boolean;
  lastReference: string | null;
  helpPanelExpanded: boolean;
};

const DEFAULT_APP_SETTINGS: PersistedAppSettings = {
  showPresentationReference: true,
  referencePlacement: "top-left",
  useSafeMargins: true,
  selectedTranslation: "KJV",
  reopenProjectorOnLaunch: false,
  wasProjectorWindowOpen: false,
  lastReference: null,
  helpPanelExpanded: true
};

function isReferencePlacement(value: unknown): value is ReferencePlacement {
  return value === "top-left" || value === "top-center" || value === "bottom-left";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function getDefaultAppSettings(): PersistedAppSettings {
  return { ...DEFAULT_APP_SETTINGS };
}

export function readAppSettings(): PersistedAppSettings {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return getDefaultAppSettings();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedAppSettings>;
    return {
      showPresentationReference: asBoolean(parsed.showPresentationReference, DEFAULT_APP_SETTINGS.showPresentationReference),
      referencePlacement: isReferencePlacement(parsed.referencePlacement)
        ? parsed.referencePlacement
        : DEFAULT_APP_SETTINGS.referencePlacement,
      useSafeMargins: asBoolean(parsed.useSafeMargins, DEFAULT_APP_SETTINGS.useSafeMargins),
      selectedTranslation: asString(parsed.selectedTranslation, DEFAULT_APP_SETTINGS.selectedTranslation),
      reopenProjectorOnLaunch: asBoolean(parsed.reopenProjectorOnLaunch, DEFAULT_APP_SETTINGS.reopenProjectorOnLaunch),
      wasProjectorWindowOpen: asBoolean(parsed.wasProjectorWindowOpen, DEFAULT_APP_SETTINGS.wasProjectorWindowOpen),
      lastReference: asNullableString(parsed.lastReference),
      helpPanelExpanded: asBoolean(parsed.helpPanelExpanded, DEFAULT_APP_SETTINGS.helpPanelExpanded)
    };
  } catch {
    return getDefaultAppSettings();
  }
}

export function writeAppSettings(settings: PersistedAppSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function settingsFromSnapshot(input: {
  showPresentationReference: boolean;
  referencePlacement: ReferencePlacement;
  useSafeMargins: boolean;
  selectedTranslation: string;
  reopenProjectorOnLaunch: boolean;
  wasProjectorWindowOpen: boolean;
  helpPanelExpanded: boolean;
  result: SearchResult;
}): PersistedAppSettings {
  return {
    showPresentationReference: input.showPresentationReference,
    referencePlacement: input.referencePlacement,
    useSafeMargins: input.useSafeMargins,
    selectedTranslation: input.selectedTranslation,
    reopenProjectorOnLaunch: input.reopenProjectorOnLaunch,
    wasProjectorWindowOpen: input.wasProjectorWindowOpen,
    lastReference: input.result.found ? input.result.reference : null,
    helpPanelExpanded: input.helpPanelExpanded
  };
}
