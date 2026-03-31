import type { SearchResult } from "../../api";
import type {
  DisplayMode,
  ListeningMode,
  PresentationFontFamily,
  PresentationBackgroundMode,
  ReferencePlacement
} from "../display/projectorSync";

const SETTINGS_STORAGE_KEY = "scripture-cue:app-settings:v1";

export type SoftwareTheme = "midnight" | "charcoal" | "royal-blue" | "warm-church" | "high-contrast";

export type PersistedAppSettings = {
  showPresentationReference: boolean;
  referencePlacement: ReferencePlacement;
  useSafeMargins: boolean;
  selectedTranslation: string;
  reopenProjectorOnLaunch: boolean;
  wasProjectorWindowOpen: boolean;
  lastReference: string | null;
  helpPanelExpanded: boolean;
  listeningMode: ListeningMode;
  displayMode: DisplayMode;
  softwareTheme: SoftwareTheme;
  backgroundMode: PresentationBackgroundMode;
  customBackgroundPath: string | null;
  backgroundDimStrength: number;
  blurBackgroundImage: boolean;
  previewFontFamily: PresentationFontFamily;
  previewFontSizePx: number;
  projectionFontFamily: PresentationFontFamily;
  projectionFontSizePx: number;
  projectionLineHeight: number;
};

const DEFAULT_APP_SETTINGS: PersistedAppSettings = {
  showPresentationReference: true,
  referencePlacement: "top-left",
  useSafeMargins: true,
  selectedTranslation: "KJV",
  reopenProjectorOnLaunch: false,
  wasProjectorWindowOpen: false,
  lastReference: null,
  helpPanelExpanded: true,
  listeningMode: "manual",
  displayMode: "fullscreen",
  softwareTheme: "midnight",
  backgroundMode: "solid-dark",
  customBackgroundPath: null,
  backgroundDimStrength: 0.5,
  blurBackgroundImage: false,
  previewFontFamily: "Inter",
  previewFontSizePx: 21,
  projectionFontFamily: "Inter",
  projectionFontSizePx: 64,
  projectionLineHeight: 1.5
};

function isReferencePlacement(value: unknown): value is ReferencePlacement {
  return value === "top-left" || value === "top-center" || value === "bottom-left";
}

function isListeningMode(value: unknown): value is ListeningMode {
  return value === "manual" || value === "auto";
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === "fullscreen" || value === "lower-third";
}

function isBackgroundMode(value: unknown): value is PresentationBackgroundMode {
  return value === "solid-dark" || value === "custom-image";
}

function isSoftwareTheme(value: unknown): value is SoftwareTheme {
  return (
    value === "midnight" ||
    value === "charcoal" ||
    value === "royal-blue" ||
    value === "warm-church" ||
    value === "high-contrast"
  );
}

function isPresentationFontFamily(value: unknown): value is PresentationFontFamily {
  return (
    value === "Inter" ||
    value === "Georgia" ||
    value === "Merriweather" ||
    value === "Montserrat" ||
    value === "Open Sans" ||
    value === "Lora" ||
    value === "Playfair Display" ||
    value === "Roboto"
  );
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asNumberInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
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
      helpPanelExpanded: asBoolean(parsed.helpPanelExpanded, DEFAULT_APP_SETTINGS.helpPanelExpanded),
      listeningMode: isListeningMode(parsed.listeningMode) ? parsed.listeningMode : DEFAULT_APP_SETTINGS.listeningMode,
      displayMode: isDisplayMode(parsed.displayMode) ? parsed.displayMode : DEFAULT_APP_SETTINGS.displayMode,
      softwareTheme: isSoftwareTheme(parsed.softwareTheme) ? parsed.softwareTheme : DEFAULT_APP_SETTINGS.softwareTheme,
      backgroundMode: isBackgroundMode(parsed.backgroundMode) ? parsed.backgroundMode : DEFAULT_APP_SETTINGS.backgroundMode,
      customBackgroundPath: asNullableString(parsed.customBackgroundPath),
      backgroundDimStrength: asNumberInRange(parsed.backgroundDimStrength, DEFAULT_APP_SETTINGS.backgroundDimStrength, 0, 0.9),
      blurBackgroundImage: asBoolean(parsed.blurBackgroundImage, DEFAULT_APP_SETTINGS.blurBackgroundImage),
      previewFontFamily: isPresentationFontFamily(parsed.previewFontFamily)
        ? parsed.previewFontFamily
        : DEFAULT_APP_SETTINGS.previewFontFamily,
      previewFontSizePx: asNumberInRange(parsed.previewFontSizePx, DEFAULT_APP_SETTINGS.previewFontSizePx, 14, 56),
      projectionFontFamily: isPresentationFontFamily(parsed.projectionFontFamily)
        ? parsed.projectionFontFamily
        : DEFAULT_APP_SETTINGS.projectionFontFamily,
      projectionFontSizePx: asNumberInRange(parsed.projectionFontSizePx, DEFAULT_APP_SETTINGS.projectionFontSizePx, 30, 120),
      projectionLineHeight: asNumberInRange(parsed.projectionLineHeight, DEFAULT_APP_SETTINGS.projectionLineHeight, 1.1, 2.2)
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
  listeningMode: ListeningMode;
  displayMode: DisplayMode;
  softwareTheme: SoftwareTheme;
  backgroundMode: PresentationBackgroundMode;
  customBackgroundPath: string | null;
  backgroundDimStrength: number;
  blurBackgroundImage: boolean;
  previewFontFamily: PresentationFontFamily;
  previewFontSizePx: number;
  projectionFontFamily: PresentationFontFamily;
  projectionFontSizePx: number;
  projectionLineHeight: number;
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
    helpPanelExpanded: input.helpPanelExpanded,
    listeningMode: input.listeningMode,
    displayMode: input.displayMode,
    softwareTheme: input.softwareTheme,
    backgroundMode: input.backgroundMode,
    customBackgroundPath: input.customBackgroundPath,
    backgroundDimStrength: input.backgroundDimStrength,
    blurBackgroundImage: input.blurBackgroundImage,
    previewFontFamily: input.previewFontFamily,
    previewFontSizePx: input.previewFontSizePx,
    projectionFontFamily: input.projectionFontFamily,
    projectionFontSizePx: input.projectionFontSizePx,
    projectionLineHeight: input.projectionLineHeight
  };
}
