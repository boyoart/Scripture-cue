import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";
import { writeText } from "@tauri-apps/api/clipboard";
import { searchKjv, searchKjvParaphrase, type ParaphraseMatch, type SearchResult } from "./api";
import MicrophoneMeter from "./components/MicrophoneMeter";
import PresentationSurface from "./components/PresentationSurface";
import { normalizeTranscriptToReference, type NormalizedResult } from "./features/parser";
import { CANONICAL_BOOK_DICTIONARY } from "./features/parser/spokenBookMatcher";
import { buildTranscriptAnchorPlan } from "./features/paraphrase/liveTranscriptSuggestions";
import { useSpeechMeter } from "./features/speech/useSpeechMeter";
import {
  PROJECTOR_WINDOW_LABEL,
  PROJECTOR_STATE_EVENT,
  getProjectorRouteUrl,
  writeProjectorState,
  type DisplayMode,
  type LowerThirdOutputMode,
  type ListeningMode,
  type PresentationBackgroundMode,
  type PresentationGradientDirection,
  type ProjectorPayload,
  type ReferencePlacement
} from "./features/display/projectorSync";
import {
  getBackgroundImageSource,
  isSupportedBackgroundImagePath,
  getPresentationFontCssFamily,
  PRESENTATION_FONT_OPTIONS
} from "./features/display/presentationStyling";
import { useAutoFitPresentationText } from "./features/display/useAutoFitPresentationText";
import {
  getComputedProjectionTypography,
  getProjectionVerseStyle,
  type ProjectionTypography
} from "./features/display/projectionTypography";
import {
  readAppSettings,
  settingsFromSnapshot,
  writeAppSettings,
  type SoftwareTheme
} from "./features/settings";
import {
  addSessionLogEntry,
  formatSessionTimestamp,
  toSessionLogCsv,
  toSessionLogText,
  type SessionLogEntry,
  type SessionSourceType
} from "./features/history/sessionLog";
import {
  buildTranscriptSuggestionId,
  extractTranscriptSuggestionCandidate,
  getStrengthLabel,
  rankTranscriptParaphraseMatches,
  type TranscriptSuggestion
} from "./features/search/liveTranscriptParaphrase";
import { APP_BRANDING } from "./branding";

type HistoryItem = {
  reference: string;
  timestampMs: number;
  repeats: number;
};

type DetectedMatchCard = {
  id: string;
  reference: string;
  confidence: string;
  preview: string;
  timestampMs: number;
  sourceLabel: string;
  isPending: boolean;
};

type DetectionQueueItem = {
  id: string;
  reference: string;
  transcript: string;
  confidence: number;
  timestampMs: number;
  autoPresented: boolean;
};

type LiveSuggestionState = TranscriptSuggestion & {
  topReference: string;
};

type LiveParaphraseSuggestion = ParaphraseMatch & {
  id: string;
  sourceAnchor: string;
  sourceReason: "iconic_phrase" | "parable_phrase" | "keyword_phrase";
  sourceTranscript: string;
  transcriptLabel: "likely" | "possible";
  score: number;
};

type ListeningPersistentMode = "off" | "manual_active" | "auto_active";
type ListeningWorkflowState =
  | "idle"
  | "listening"
  | "hearing_speech"
  | "processing"
  | "verse_loaded"
  | "waiting_for_speech"
  | "retry"
  | "error";
type SessionLogFilter = "all" | "typed" | "spoken";
type DetectionSignalSource = "final" | "interim";
type HistoryPanelTab = "recent-history" | "session-log";
type OperatorDialog = "settings" | "history" | "help" | "debug" | null;
type ShortcutDefinition = { keys: string; action: string };
type TopMenuKey = "command" | null;

const HISTORY_DUPLICATE_COOLDOWN_MS = 10_000;
const AUTO_SEARCH_DUPLICATE_COOLDOWN_MS = 8_000;
const AUTO_MEDIUM_CONFIDENCE = 0.68;
const AUTO_HIGH_PRIORITY_CONFIDENCE = 0.78;
const AUTO_FINAL_CONFIDENCE = 0.82;
const AUTO_BOOK_ANCHOR_CONFIDENCE = 0.42;
const AUTO_BOOK_CANDIDATE_HOLD_MS = 2200;
const MAX_FAVORITE_REFERENCES = 24;
const LIVE_PARAPHRASE_DEBOUNCE_MS = 900;
const LIVE_PARAPHRASE_DUPLICATE_COOLDOWN_MS = 9_000;

const SHORTCUT_REFERENCE: ShortcutDefinition[] = [
  { keys: "Alt+F", action: "Focus search input" },
  { keys: "Alt+Enter", action: "Search current reference" },
  { keys: "Alt+M", action: "Start/Stop listening" },
  { keys: "Alt+A", action: "Toggle Auto Listening mode" },
  { keys: "Alt+P", action: "Open/Focus projector view" },
  { keys: "Alt+Shift+P", action: "Toggle fullscreen presentation" },
  { keys: "Alt+L", action: "Toggle Lower Third mode" },
  { keys: "Alt+Backspace", action: "Clear current verse" },
  { keys: "Alt+R", action: "Re-present current verse" },
  { keys: "Alt+,", action: "Open Settings" },
  { keys: "Alt+H", action: "Open History / Session" }
];

const EMPTY_RESULT: SearchResult = {
  found: false,
  translation: "KJV",
  reference: "No result",
  theme: "Scripture Lookup",
  verses: [],
  message: "No result loaded yet."
};

const THEME_OPTIONS: Array<{ value: SoftwareTheme; label: string; description: string }> = [
  { value: "midnight", label: "Midnight", description: "Deep blue stage-style console." },
  { value: "charcoal", label: "Charcoal", description: "Neutral dark gray production look." },
  { value: "royal-blue", label: "Royal Blue", description: "Blue-forward confidence monitor UI." },
  { value: "warm-church", label: "Warm Church", description: "Warmer neutral palette for softer contrast." },
  { value: "high-contrast", label: "High Contrast", description: "Maximum readability and edge clarity." }
];

export default function App() {
  const initialSettings = useMemo(() => readAppSettings(), []);
  const [referenceInput, setReferenceInput] = useState("John 3:16");
  const [activeReference, setActiveReference] = useState("John 3:16");
  const [result, setResult] = useState<SearchResult>(EMPTY_RESULT);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sessionLog, setSessionLog] = useState<SessionLogEntry[]>([]);
  const [historyPanelTab, setHistoryPanelTab] = useState<HistoryPanelTab>("recent-history");
  const [recentHistoryPage, setRecentHistoryPage] = useState(1);
  const [recentHistoryPageSize, setRecentHistoryPageSize] = useState(8);
  const [sessionLogPage, setSessionLogPage] = useState(1);
  const [sessionLogPageSize, setSessionLogPageSize] = useState(8);
  const [sessionLogFilter, setSessionLogFilter] = useState<SessionLogFilter>("all");
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [isLoading, setIsLoading] = useState(false);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [speechDebug, setSpeechDebug] = useState<NormalizedResult | null>(null);
  const [listeningState, setListeningState] = useState<ListeningWorkflowState>("idle");
  const [persistentListeningMode, setPersistentListeningMode] = useState<ListeningPersistentMode>("off");
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [showPresentationReference, setShowPresentationReference] = useState(initialSettings.showPresentationReference);
  const [referencePlacement, setReferencePlacement] = useState<ReferencePlacement>(initialSettings.referencePlacement);
  const [useSafeMargins, setUseSafeMargins] = useState(initialSettings.useSafeMargins);
  const [selectedTranslation, setSelectedTranslation] = useState(initialSettings.selectedTranslation);
  const [reopenProjectorOnLaunch, setReopenProjectorOnLaunch] = useState(initialSettings.reopenProjectorOnLaunch);
  const [helpPanelExpanded, setHelpPanelExpanded] = useState(initialSettings.helpPanelExpanded);
  const [isProjectorWindowOpen, setIsProjectorWindowOpen] = useState(initialSettings.wasProjectorWindowOpen);
  const [isRestoringStartupState, setIsRestoringStartupState] = useState(true);
  const [listeningMode, setListeningMode] = useState<ListeningMode>(initialSettings.listeningMode);
  const [detectionDisplayMode, setDetectionDisplayMode] = useState<"auto" | "manual">(initialSettings.detectionDisplayMode);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialSettings.displayMode);
  const [softwareTheme, setSoftwareTheme] = useState<SoftwareTheme>(initialSettings.softwareTheme);
  const [backgroundMode, setBackgroundMode] = useState<PresentationBackgroundMode>(initialSettings.backgroundMode);
  const [customBackgroundPath, setCustomBackgroundPath] = useState<string | null>(initialSettings.customBackgroundPath);
  const [customBackgroundSource, setCustomBackgroundSource] = useState<string | null>(null);
  const [customBackgroundError, setCustomBackgroundError] = useState<string | null>(null);
  const [solidBackgroundColor, setSolidBackgroundColor] = useState(initialSettings.solidBackgroundColor);
  const [gradientStartColor, setGradientStartColor] = useState(initialSettings.gradientStartColor);
  const [gradientEndColor, setGradientEndColor] = useState(initialSettings.gradientEndColor);
  const [gradientDirection, setGradientDirection] = useState<PresentationGradientDirection>(initialSettings.gradientDirection);
  const [backgroundDimStrength, setBackgroundDimStrength] = useState(initialSettings.backgroundDimStrength);
  const [blurBackgroundImage, setBlurBackgroundImage] = useState(initialSettings.blurBackgroundImage);
  const [previewFontFamily, setPreviewFontFamily] = useState(initialSettings.previewFontFamily);
  const [previewFontSizePx, setPreviewFontSizePx] = useState(initialSettings.previewFontSizePx);
  const [projectionFontFamily, setProjectionFontFamily] = useState(initialSettings.projectionFontFamily);
  const [projectionFontSizePx, setProjectionFontSizePx] = useState(initialSettings.projectionFontSizePx);
  const [projectionLineHeight, setProjectionLineHeight] = useState(initialSettings.projectionLineHeight);
  const [lowerThirdOutputMode, setLowerThirdOutputMode] = useState<LowerThirdOutputMode>(initialSettings.lowerThirdOutputMode);
  const [lowerThirdChromaKeyColor, setLowerThirdChromaKeyColor] = useState(initialSettings.lowerThirdChromaKeyColor);
  const [favoriteReferences, setFavoriteReferences] = useState<string[]>(initialSettings.favoriteReferences);
  const [activeDialog, setActiveDialog] = useState<OperatorDialog>(null);
  const [openTopMenu, setOpenTopMenu] = useState<TopMenuKey>(null);
  const [showParaphraseLane, setShowParaphraseLane] = useState(true);
  const [paraphraseInput, setParaphraseInput] = useState("");
  const [paraphraseMatches, setParaphraseMatches] = useState<ParaphraseMatch[]>([]);
  const [liveTranscriptSuggestions, setLiveTranscriptSuggestions] = useState<LiveSuggestionState[]>([]);
  const [liveParaphraseSuggestions, setLiveParaphraseSuggestions] = useState<LiveParaphraseSuggestion[]>([]);
  const [isLiveParaphraseLoading, setIsLiveParaphraseLoading] = useState(false);
  const [paraphraseNotice, setParaphraseNotice] = useState<string | null>(null);
  const [isParaphraseLoading, setIsParaphraseLoading] = useState(false);
  const [detectionQueue, setDetectionQueue] = useState<DetectionQueueItem[]>([]);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const projectorWindowRef = useRef<WebviewWindow | null>(null);
  const lastHistoryEntryRef = useRef<{ reference: string; timestampMs: number } | null>(null);
  const lastAutoSearchRef = useRef<{ normalizedReference: string; timestampMs: number } | null>(null);
  const startupRestoreStartedRef = useRef(false);
  const lastLiveParaphraseCaptureRef = useRef<{ key: string; timestampMs: number } | null>(null);
  const autoListeningSessionRef = useRef(false);
  const interimCaptureRef = useRef<{ transcript: string; normalizedReference: string; timestampMs: number } | null>(null);
  const lastLiveSuggestionRef = useRef<{ suggestionId: string; timestampMs: number } | null>(null);
  const autoBookAnchorRef = useRef<{ canonicalBook: string; timestampMs: number } | null>(null);
  const fullscreenViewportRef = useRef<HTMLDivElement | null>(null);
  const fullscreenContentRef = useRef<HTMLDivElement | null>(null);
  const fullscreenVerseRef = useRef<HTMLPreElement | null>(null);
  const [detectionPulseKey, setDetectionPulseKey] = useState(0);
  const { bars, micState, transcript, errorMessage, lastErrorCode, lastStopReason, listening, startListening, stopListening } = useSpeechMeter();
  const isListeningModeActive = persistentListeningMode !== "off";
  const isManualOperatorMode = listeningMode === "manual";
  const openDialogFromMenu = useCallback((dialog: Exclude<OperatorDialog, null>) => {
    setOpenTopMenu(null);
    setActiveDialog(dialog);
  }, []);

  const runMenuAction = useCallback((action: () => void | Promise<void>) => {
    setOpenTopMenu(null);
    void action();
  }, []);

  const verseText = useMemo(() => {
    if (!result.found || result.verses.length === 0) {
      return result.message ?? "No result loaded yet.";
    }

    return result.verses.map((v) => `${v.verse}. ${v.text}`).join("\n");
  }, [result]);
  const previewVerseText = result.found ? verseText : "";

  const presentationBackgroundState = useMemo(() => ({
    backgroundMode,
    customBackgroundPath,
    customBackgroundSource,
    customBackgroundError,
    solidBackgroundColor,
    gradientStartColor,
    gradientEndColor,
    gradientDirection,
    backgroundDimStrength,
    blurBackgroundImage
  }), [
    backgroundMode,
    customBackgroundPath,
    customBackgroundSource,
    customBackgroundError,
    solidBackgroundColor,
    gradientStartColor,
    gradientEndColor,
    gradientDirection,
    backgroundDimStrength,
    blurBackgroundImage
  ]);

  const hasCustomPresentationBackground = presentationBackgroundState.backgroundMode === "custom-image" &&
    Boolean(presentationBackgroundState.customBackgroundSource);
  const effectivePresentationBackgroundMode: PresentationBackgroundMode = presentationBackgroundState.backgroundMode === "custom-image" &&
    !presentationBackgroundState.customBackgroundSource
    ? "solid-dark"
    : presentationBackgroundState.backgroundMode;
  const previewDimOpacity = hasCustomPresentationBackground ? Math.min(presentationBackgroundState.backgroundDimStrength, 0.8) : 0.35;
  const fullscreenDimOpacity = presentationBackgroundState.backgroundMode === "custom-image"
    ? Math.min(presentationBackgroundState.backgroundDimStrength, 0.8)
    : 0.35;
  const isTransparentLowerThird = displayMode === "lower-third" && lowerThirdOutputMode === "transparent";
  const isChromaLowerThird = displayMode === "lower-third" && lowerThirdOutputMode === "chroma-key";
  const isVersePreviewUsingCustomImage = hasCustomPresentationBackground;
  const isProjectorUsingCustomImage = presentationBackgroundState.backgroundMode === "custom-image" && Boolean(presentationBackgroundState.customBackgroundSource);
  const isFullscreenUsingCustomImage = isPresentationMode &&
    presentationBackgroundState.backgroundMode === "custom-image" &&
    Boolean(presentationBackgroundState.customBackgroundSource);

  const triggerDetectionPulse = useCallback(() => {
    setDetectionPulseKey((value) => value + 1);
  }, []);

  const projectorPayload: ProjectorPayload = useMemo(
    () => ({
      result,
      verseText,
      showReference: showPresentationReference,
      referencePlacement,
      useSafeMargins,
      displayMode,
      backgroundMode: effectivePresentationBackgroundMode,
      customBackgroundPath: presentationBackgroundState.customBackgroundPath,
      customBackgroundSource: presentationBackgroundState.customBackgroundSource,
      customBackgroundError: presentationBackgroundState.customBackgroundError,
      solidBackgroundColor: presentationBackgroundState.solidBackgroundColor,
      gradientStartColor: presentationBackgroundState.gradientStartColor,
      gradientEndColor: presentationBackgroundState.gradientEndColor,
      gradientDirection: presentationBackgroundState.gradientDirection,
      backgroundDimStrength: presentationBackgroundState.backgroundDimStrength,
      blurBackgroundImage: presentationBackgroundState.blurBackgroundImage,
      previewFontFamily,
      previewFontSizePx,
      projectionFontFamily,
      projectionFontSizePx,
      projectionLineHeight,
      lowerThirdOutputMode,
      lowerThirdChromaKeyColor
    }),
    [
      result,
      verseText,
      showPresentationReference,
      referencePlacement,
      useSafeMargins,
      displayMode,
      presentationBackgroundState,
      effectivePresentationBackgroundMode,
      previewFontFamily,
      previewFontSizePx,
      projectionFontFamily,
      projectionFontSizePx,
      projectionLineHeight,
      lowerThirdOutputMode,
      lowerThirdChromaKeyColor
    ]
  );
  const presentationState = projectorPayload;
  const projectionTypography = useMemo<ProjectionTypography>(() => ({
    fontFamily: projectionFontFamily,
    baseFontSizePx: projectionFontSizePx,
    lineHeight: projectionLineHeight
  }), [projectionFontFamily, projectionFontSizePx, projectionLineHeight]);

  const {
    fittedFontSizePx: fullscreenFittedFontSizePx,
    fittedLineHeight: fullscreenFittedLineHeight,
    didHitMinimum: didFullscreenHitAutoFitMinimum,
    shouldTopBias: shouldFullscreenTopBias
  } = useAutoFitPresentationText({
    viewportRef: fullscreenViewportRef,
    contentRef: fullscreenContentRef,
    verseRef: fullscreenVerseRef,
    preferredFontSizePx: projectionTypography.baseFontSizePx,
    preferredLineHeight: projectionTypography.lineHeight,
    displayMode: presentationState.displayMode,
    contentKey: `${presentationState.result.reference}|${presentationState.verseText}|${presentationState.showReference}|${presentationState.referencePlacement}`
  });


  const fullscreenTypography = useMemo(() => {
    return getComputedProjectionTypography(
      projectionTypography,
      fullscreenFittedFontSizePx,
      fullscreenFittedLineHeight
    );
  }, [projectionTypography, fullscreenFittedFontSizePx, fullscreenFittedLineHeight]);

  useEffect(() => {
    let isCurrent = true;

    const loadBackgroundSource = async () => {
      if (!customBackgroundPath) {
        setCustomBackgroundSource(null);
        setCustomBackgroundError(null);
        return;
      }

      const nextSource = await getBackgroundImageSource(customBackgroundPath);
      if (isCurrent) {
        if (nextSource) {
          setCustomBackgroundSource(nextSource);
          setCustomBackgroundError(null);
        } else {
          setCustomBackgroundError("Unable to load the selected background image. Falling back to solid dark.");
          setCustomBackgroundSource(null);
          setStatus("Background load failed");
          setSessionNotice("Background image failed to load. Falling back to solid dark.");
        }
      }
    };

    void loadBackgroundSource();

    return () => {
      isCurrent = false;
    };
  }, [customBackgroundPath]);

  useEffect(() => {
    if (backgroundMode !== "custom-image") {
      return;
    }
    console.info("[presentation-background] shared state updated", {
      rawPath: customBackgroundPath,
      renderSource: customBackgroundSource
    });
  }, [backgroundMode, customBackgroundPath, customBackgroundSource]);

  useEffect(() => {
    if (!customBackgroundError) {
      return;
    }
    setSessionNotice(customBackgroundError);
  }, [customBackgroundError]);

  useEffect(() => {
    if (!openTopMenu) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (!target.closest(".menu-cluster")) {
        setOpenTopMenu(null);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenTopMenu(null);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [openTopMenu]);

  useEffect(() => {
    if (!isPresentationMode) {
      return;
    }
    console.info("[presentation-background] fullscreen received state", {
      backgroundMode: presentationState.backgroundMode,
      rawPath: presentationState.customBackgroundPath,
      renderSource: presentationState.customBackgroundSource,
      hasBackground: Boolean(presentationState.customBackgroundSource)
    });
  }, [isPresentationMode, presentationState.backgroundMode, presentationState.customBackgroundPath, presentationState.customBackgroundSource]);

  useEffect(() => {
    document.body.dataset.theme = softwareTheme;
    return () => {
      delete document.body.dataset.theme;
    };
  }, [softwareTheme]);

  useEffect(() => {
    setRecentHistoryPage((current) => Math.min(current, Math.max(1, Math.ceil(history.length / recentHistoryPageSize))));
  }, [history.length, recentHistoryPageSize]);

  useEffect(() => {
    const nextFilteredLength =
      sessionLogFilter === "all" ? sessionLog.length : sessionLog.filter((entry) => entry.sourceType === sessionLogFilter).length;
    setSessionLogPage((current) => Math.min(current, Math.max(1, Math.ceil(nextFilteredLength / sessionLogPageSize))));
  }, [sessionLog, sessionLogFilter, sessionLogPageSize]);

  useEffect(() => {
    writeProjectorState(projectorPayload);
    void emit(PROJECTOR_STATE_EVENT, projectorPayload).catch((error) => {
      console.warn("[projector] failed to emit sync event", error);
    });
  }, [projectorPayload]);

  useEffect(() => {
    writeAppSettings(
      settingsFromSnapshot({
        showPresentationReference,
        referencePlacement,
        useSafeMargins,
        selectedTranslation,
        reopenProjectorOnLaunch,
        wasProjectorWindowOpen: isProjectorWindowOpen,
        helpPanelExpanded,
        listeningMode,
        detectionDisplayMode,
        displayMode,
        softwareTheme,
        backgroundMode,
        customBackgroundPath,
        solidBackgroundColor,
        gradientStartColor,
        gradientEndColor,
        gradientDirection,
        backgroundDimStrength,
        blurBackgroundImage,
        previewFontFamily,
        previewFontSizePx,
        projectionFontFamily,
        projectionFontSizePx,
        projectionLineHeight,
        lowerThirdOutputMode,
        lowerThirdChromaKeyColor,
        favoriteReferences,
        result
      })
    );
  }, [
    showPresentationReference,
    referencePlacement,
    useSafeMargins,
    selectedTranslation,
    reopenProjectorOnLaunch,
    isProjectorWindowOpen,
    helpPanelExpanded,
    listeningMode,
    detectionDisplayMode,
    displayMode,
    softwareTheme,
    backgroundMode,
    customBackgroundPath,
    solidBackgroundColor,
    gradientStartColor,
    gradientEndColor,
    gradientDirection,
    backgroundDimStrength,
    blurBackgroundImage,
    previewFontFamily,
    previewFontSizePx,
    projectionFontFamily,
    projectionFontSizePx,
    projectionLineHeight,
    lowerThirdOutputMode,
    lowerThirdChromaKeyColor,
    favoriteReferences,
    result
  ]);

  const filteredSessionLog = useMemo(() => {
    if (sessionLogFilter === "all") {
      return sessionLog;
    }

    return sessionLog.filter((entry) => entry.sourceType === sessionLogFilter);
  }, [sessionLog, sessionLogFilter]);

  const recentHistoryPageCount = Math.max(1, Math.ceil(history.length / recentHistoryPageSize));
  const pagedHistory = useMemo(() => {
    const startIndex = (recentHistoryPage - 1) * recentHistoryPageSize;
    return history.slice(startIndex, startIndex + recentHistoryPageSize);
  }, [history, recentHistoryPage, recentHistoryPageSize]);

  const sessionLogPageCount = Math.max(1, Math.ceil(filteredSessionLog.length / sessionLogPageSize));
  const pagedSessionLog = useMemo(() => {
    const startIndex = (sessionLogPage - 1) * sessionLogPageSize;
    return filteredSessionLog.slice(startIndex, startIndex + sessionLogPageSize);
  }, [filteredSessionLog, sessionLogPage, sessionLogPageSize]);

  const pushHistoryWithCooldown = useCallback((nextReference: string) => {
    const now = Date.now();
    const last = lastHistoryEntryRef.current;
    const isDuplicateWithinCooldown =
      last?.reference === nextReference && now - last.timestampMs < HISTORY_DUPLICATE_COOLDOWN_MS;

    lastHistoryEntryRef.current = { reference: nextReference, timestampMs: now };

    setHistory((prev) => {
      if (isDuplicateWithinCooldown) return prev;
      const existingIndex = prev.findIndex((item) => item.reference === nextReference);

      if (existingIndex >= 0) {
        const existingItem = prev[existingIndex];
        const nextEntry: HistoryItem = {
          ...existingItem,
          timestampMs: now,
          repeats: existingItem.repeats + 1
        };
        const withoutExisting = prev.filter((_, index) => index !== existingIndex);
        return [nextEntry, ...withoutExisting];
      }

      return [{ reference: nextReference, timestampMs: now, repeats: 1 }, ...prev];
    });
  }, []);

  const syncProjectorNow = useCallback(
    async (nextStatus = "Projector updated") => {
      writeProjectorState(projectorPayload);
      try {
        await emit(PROJECTOR_STATE_EVENT, projectorPayload);
        setStatus(nextStatus);
      } catch (error) {
        console.warn("[projector] manual sync failed", error);
        setStatus("Projector sync failed");
      }
    },
    [projectorPayload]
  );

  const handleClearCurrentVerse = useCallback(() => {
    setActiveReference("");
    setResult({ ...EMPTY_RESULT, message: "Verse cleared by operator." });
    setListeningState("idle");
    setStatus("Current verse cleared");
  }, []);

  const handleRepresentCurrentVerse = useCallback(() => {
    void syncProjectorNow("Current verse re-presented");
  }, [syncProjectorNow]);

  const focusSearchInput = useCallback(() => {
    referenceInputRef.current?.focus();
    referenceInputRef.current?.select();
    setStatus("Reference input focused");
  }, []);

  const toggleAutoListeningMode = useCallback(() => {
    setListeningMode((previousMode) => {
      const nextMode: ListeningMode = previousMode === "auto" ? "manual" : "auto";
      setStatus(nextMode === "auto" ? "Listening mode set to Auto" : "Listening mode set to Manual");
      if (nextMode !== "auto") {
        autoListeningSessionRef.current = false;
      }
      return nextMode;
    });
  }, []);

  const toggleDisplayMode = useCallback(() => {
    setDisplayMode((previousMode) => {
      const nextMode: DisplayMode = previousMode === "fullscreen" ? "lower-third" : "fullscreen";
      setStatus(nextMode === "lower-third" ? "Lower Third mode enabled" : "Fullscreen mode enabled");
      return nextMode;
    });
  }, []);

  const queueDetectedReference = useCallback(
    (reference: string, transcript: string, confidence: number, autoPresented: boolean) => {
      const normalizedReference = reference.trim();
      if (!normalizedReference) {
        return;
      }

      const now = Date.now();
      const id = `${normalizedReference}-${now}`;
      setDetectionQueue((previous) => {
        const recentDuplicate = previous.find(
          (entry) => entry.reference === normalizedReference && now - entry.timestampMs < AUTO_SEARCH_DUPLICATE_COOLDOWN_MS
        );
        if (recentDuplicate) {
          return previous;
        }

        const nextEntry: DetectionQueueItem = {
          id,
          reference: normalizedReference,
          transcript: transcript.trim(),
          confidence,
          timestampMs: now,
          autoPresented
        };
        return [nextEntry, ...previous].slice(0, 50);
      });
    },
    []
  );

  const handleParaphraseSearch = useCallback(async () => {
    const trimmedPhrase = paraphraseInput.trim();
    if (!trimmedPhrase || !showParaphraseLane) {
      return;
    }

    try {
      setIsParaphraseLoading(true);
      setParaphraseNotice(null);
      const matches = await searchKjvParaphrase(trimmedPhrase, 10);
      setParaphraseMatches(matches);
      if (matches.length === 0) {
        setParaphraseNotice("No exact or close phrase matches found. Try a shorter phrase.");
      } else {
        setParaphraseNotice(`Showing ${matches.length} exact or close phrase matches for "${trimmedPhrase}".`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error, null, 2);
      setParaphraseMatches([]);
      setParaphraseNotice(`Paraphrase search failed: ${message}`);
    } finally {
      setIsParaphraseLoading(false);
    }
  }, [paraphraseInput, showParaphraseLane]);

  const queueLiveTranscriptSuggestion = useCallback(
    async (spokenTranscript: string) => {
      if (!showParaphraseLane) {
        return;
      }
      const transcriptAnchorPlan = buildTranscriptAnchorPlan(spokenTranscript);
      if (!transcriptAnchorPlan.shouldSearch) {
        return;
      }

      const candidate = extractTranscriptSuggestionCandidate(spokenTranscript);
      if (!candidate) {
        return;
      }

      const suggestionId = buildTranscriptSuggestionId(candidate);
      const now = Date.now();
      const previous = lastLiveSuggestionRef.current;
      if (previous && previous.suggestionId === suggestionId && now - previous.timestampMs < AUTO_SEARCH_DUPLICATE_COOLDOWN_MS) {
        return;
      }

      const matches = await searchKjvParaphrase(candidate.searchPhrase, 8);
      if (!matches.length) {
        return;
      }

      const rankedMatches = rankTranscriptParaphraseMatches(matches, candidate).slice(0, 5);
      const topReference = rankedMatches[0]?.reference ?? "Unknown";
      const confidenceLabel = `${getStrengthLabel(candidate.strength)} • suggested from transcript`;
      const nextSuggestion: LiveSuggestionState = {
        id: `${suggestionId}:${now}`,
        transcript: spokenTranscript.trim(),
        anchorLabel: candidate.anchorLabel,
        searchPhrase: candidate.searchPhrase,
        strength: candidate.strength,
        confidenceLabel,
        matches: rankedMatches,
        createdAtMs: now,
        topReference
      };

      lastLiveSuggestionRef.current = { suggestionId, timestampMs: now };
      setLiveTranscriptSuggestions((existing) => [nextSuggestion, ...existing].slice(0, 12));
      setParaphraseNotice(`${getStrengthLabel(candidate.strength)} transcript suggestion: ${candidate.anchorLabel}`);
    },
    [showParaphraseLane]
  );


  const handleClearParaphraseMatches = useCallback(() => {
    setParaphraseMatches([]);
    setLiveTranscriptSuggestions([]);
    setLiveParaphraseSuggestions([]);
    setParaphraseNotice(null);
    lastLiveParaphraseCaptureRef.current = null;
    lastLiveSuggestionRef.current = null;
    setStatus("Paraphrase matches cleared");
  }, []);
  const runLiveParaphraseSuggestions = useCallback(
    async (spokenTranscript: string) => {
      const anchorPlan = buildTranscriptAnchorPlan(spokenTranscript);
      if (!anchorPlan.shouldSearch || anchorPlan.anchors.length === 0) {
        setIsLiveParaphraseLoading(false);
        return;
      }

      const dedupeKey = `${anchorPlan.anchors.map((anchor) => anchor.phrase).join("|")}::${spokenTranscript.trim().toLowerCase()}`;
      const now = Date.now();
      const lastCapture = lastLiveParaphraseCaptureRef.current;
      if (lastCapture && lastCapture.key === dedupeKey && now - lastCapture.timestampMs < LIVE_PARAPHRASE_DUPLICATE_COOLDOWN_MS) {
        return;
      }
      lastLiveParaphraseCaptureRef.current = { key: dedupeKey, timestampMs: now };

      try {
        setIsLiveParaphraseLoading(true);
        const anchorResults = await Promise.all(
          anchorPlan.anchors.map(async (anchor) => ({
            anchor,
            matches: await searchKjvParaphrase(anchor.phrase, 6)
          }))
        );

        const merged = new Map<string, LiveParaphraseSuggestion>();
        for (const resultSet of anchorResults) {
          for (const match of resultSet.matches) {
            const weightedScore = Math.min((match.confidence * 0.76) + (resultSet.anchor.weight * 0.24), 1);
            if (weightedScore < 0.52) {
              continue;
            }
            const id = `${match.reference}-${match.text.slice(0, 20)}`;
            const transcriptLabel: "likely" | "possible" = weightedScore >= 0.72 ? "likely" : "possible";
            const existing = merged.get(id);
            if (!existing || existing.score < weightedScore) {
              merged.set(id, {
                ...match,
                id,
                sourceAnchor: resultSet.anchor.phrase,
                sourceReason: resultSet.anchor.reason,
                sourceTranscript: spokenTranscript.trim(),
                transcriptLabel,
                score: weightedScore
              });
            }
          }
        }

        const ranked = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 8);
        if (ranked.length > 0) {
          setLiveParaphraseSuggestions(ranked);
          const likelyCount = ranked.filter((item) => item.transcriptLabel === "likely").length;
          setParaphraseNotice(
            `Suggested from transcript: ${ranked.length} match${ranked.length === 1 ? "" : "es"} (${likelyCount} likely, ${ranked.length - likelyCount} possible).`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Live paraphrase suggestion failed.";
        setParaphraseNotice(`Live suggestion warning: ${message}`);
      } finally {
        setIsLiveParaphraseLoading(false);
      }
    },
    []
  );

  const handleSearch = useCallback(
    async (overrideReference?: string, sourceType: SessionSourceType = "typed") => {
      const trimmed = (overrideReference ?? referenceInput).trim();
      if (!trimmed) return;

      try {
        setIsLoading(true);
        setStatus("Searching...");
        setListeningState("processing");

        const response = await searchKjv(trimmed);
        setResult(response);

        if (response.found && response.verses.length > 0) {
          setActiveReference(response.reference);
          setReferenceInput(response.reference);
          pushHistoryWithCooldown(response.reference);
          setSessionLog((prev) => addSessionLogEntry(prev, { reference: response.reference, sourceType }));
          setListeningState("verse_loaded");
          setStatus("Verse loaded");
        } else {
          setListeningState("idle");
          setStatus(response.message ?? "No result found");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error, null, 2);

        setResult({ ...EMPTY_RESULT, message: `Search failed: ${message}` });
        setListeningState("error");
        setStatus("Search failed");
      } finally {
        setIsLoading(false);
      }
    },
    [pushHistoryWithCooldown, referenceInput]
  );

  const handleStartListening = useCallback(async () => {
    setSpeechNotice(null);
    setListeningState("listening");
    try {
      await startListening();
      setPersistentListeningMode(listeningMode === "auto" ? "auto_active" : "manual_active");
      autoListeningSessionRef.current = listeningMode === "auto";
    } catch (error) {
      autoListeningSessionRef.current = false;
      setPersistentListeningMode("off");
      setListeningState("error");
      const message = error instanceof Error ? error.message : "Unable to start listening.";
      setSpeechNotice(message);
    }
  }, [listeningMode, startListening]);

  const handleStopListening = useCallback(() => {
    autoListeningSessionRef.current = false;
    setPersistentListeningMode("off");
    stopListening("idle");
    setListeningState("idle");
    setStatus("Listening stopped");
  }, [stopListening]);

  const runSpeechSearch = useCallback(
    async (spokenTranscript: string) => {
      if (!spokenTranscript.trim()) return;
      void queueLiveTranscriptSuggestion(spokenTranscript);

      const normalized = normalizeTranscriptToReference(spokenTranscript, "KJV");
      setSpeechDebug(normalized);

      const normalizedValue = normalized.normalizedReference.trim();
      const hasBookAnchor = Boolean(normalized.canonicalBook) && normalized.confidence >= AUTO_BOOK_ANCHOR_CONFIDENCE;
      if (hasBookAnchor && normalized.canonicalBook) {
        autoBookAnchorRef.current = { canonicalBook: normalized.canonicalBook, timestampMs: Date.now() };
      }
      const recentBookAnchor = autoBookAnchorRef.current;
      const hasRecentMatchingBookAnchor =
        Boolean(
          recentBookAnchor &&
            normalized.canonicalBook &&
            recentBookAnchor.canonicalBook === normalized.canonicalBook &&
            Date.now() - recentBookAnchor.timestampMs <= AUTO_BOOK_CANDIDATE_HOLD_MS
        );
      const hasStrongCandidate =
        normalized.query.kind === "spoken_reference" &&
        normalized.ambiguity === "clear" &&
        Boolean(normalized.structuredReference) &&
        normalized.confidence >= (hasRecentMatchingBookAnchor ? 0.76 : AUTO_FINAL_CONFIDENCE);
      const hasMediumCandidate =
        normalized.query.kind === "spoken_reference" &&
        normalized.ambiguity === "clear" &&
        Boolean(normalized.structuredReference) &&
        normalized.confidence >= (hasRecentMatchingBookAnchor ? 0.62 : AUTO_MEDIUM_CONFIDENCE);

      const nextReference = normalizedValue || spokenTranscript.trim();

      if (listeningMode === "manual") {
        setReferenceInput(nextReference);
        autoListeningSessionRef.current = false;
        setListeningState("idle");
        setSpeechNotice(`Manual mode captured: "${spokenTranscript}" (confirm search before presenting)`);
        return;
      }

      if (!hasStrongCandidate) {
        if (hasMediumCandidate && normalizedValue) {
          setReferenceInput(normalizedValue);
          setListeningState("waiting_for_speech");
          setSpeechNotice(`Auto mode held medium-confidence candidate: "${normalizedValue}"`);
          return;
        }
        setListeningState("waiting_for_speech");
        if (hasBookAnchor && normalized.canonicalBook) {
          setSpeechNotice(`Auto mode heard "${normalized.canonicalBook}" and is waiting for chapter/verse.`);
        } else {
          setSpeechNotice("Auto mode ignored non-reference speech.");
        }
        return;
      }

      const now = Date.now();
      const lastAutoSearch = lastAutoSearchRef.current;
      const duplicateAutoSearch =
        lastAutoSearch?.normalizedReference === nextReference &&
        now - lastAutoSearch.timestampMs < AUTO_SEARCH_DUPLICATE_COOLDOWN_MS;

      if (duplicateAutoSearch) {
        setListeningState("waiting_for_speech");
        setSpeechNotice(`Auto mode duplicate suppressed: "${nextReference}"`);
        return;
      }

      lastAutoSearchRef.current = { normalizedReference: nextReference, timestampMs: now };
      setActiveReference(nextReference);
      setReferenceInput(nextReference);
      triggerDetectionPulse();
      queueDetectedReference(nextReference, spokenTranscript, normalized.confidence, detectionDisplayMode === "auto");

      if (detectionDisplayMode === "auto") {
        setSpeechNotice(`Auto mode presenting: "${spokenTranscript}" → ${nextReference}`);
        await handleSearch(nextReference, "spoken");
      } else {
        setSpeechNotice(`Manual display mode: detected "${nextReference}" and queued for operator confirmation.`);
        setListeningState("waiting_for_speech");
      }
    },
    [detectionDisplayMode, handleSearch, listeningMode, queueDetectedReference, queueLiveTranscriptSuggestion, triggerDetectionPulse]
  );

  const tryAutoCaptureCandidate = useCallback(
    async (spokenTranscript: string, source: DetectionSignalSource) => {
      if (listeningMode !== "auto") {
        return false;
      }
      void queueLiveTranscriptSuggestion(spokenTranscript);

      const normalized = normalizeTranscriptToReference(spokenTranscript, "KJV");
      const hasBookAnchor = Boolean(normalized.canonicalBook) && normalized.confidence >= AUTO_BOOK_ANCHOR_CONFIDENCE;
      if (hasBookAnchor && normalized.canonicalBook) {
        autoBookAnchorRef.current = { canonicalBook: normalized.canonicalBook, timestampMs: Date.now() };
      }
      const recentBookAnchor = autoBookAnchorRef.current;
      const hasRecentMatchingBookAnchor =
        Boolean(
          recentBookAnchor &&
            normalized.canonicalBook &&
            recentBookAnchor.canonicalBook === normalized.canonicalBook &&
            Date.now() - recentBookAnchor.timestampMs <= AUTO_BOOK_CANDIDATE_HOLD_MS
        );
      const hasCandidate =
        normalized.query.kind === "spoken_reference" &&
        normalized.ambiguity === "clear" &&
        Boolean(normalized.structuredReference) &&
        normalized.confidence >= (hasRecentMatchingBookAnchor ? 0.7 : AUTO_HIGH_PRIORITY_CONFIDENCE);

      if (!hasCandidate) {
        return false;
      }

      const nextReference = normalized.normalizedReference.trim();
      if (!nextReference) {
        return false;
      }

      const now = Date.now();
      const lastAutoSearch = lastAutoSearchRef.current;
      const duplicateAutoSearch =
        lastAutoSearch?.normalizedReference === nextReference &&
        now - lastAutoSearch.timestampMs < AUTO_SEARCH_DUPLICATE_COOLDOWN_MS;

      if (duplicateAutoSearch) {
        setListeningState("waiting_for_speech");
        setSpeechNotice(`Auto mode duplicate suppressed: "${nextReference}"`);
        return true;
      }

      lastAutoSearchRef.current = { normalizedReference: nextReference, timestampMs: now };
      interimCaptureRef.current = { transcript: spokenTranscript, normalizedReference: nextReference, timestampMs: now };
      setActiveReference(nextReference);
      setReferenceInput(nextReference);
      triggerDetectionPulse();
      queueDetectedReference(nextReference, spokenTranscript, normalized.confidence, detectionDisplayMode === "auto");
      setSpeechNotice(
        detectionDisplayMode === "auto"
          ? source === "interim"
            ? `Auto mode caught quickly: "${nextReference}"`
            : `Auto mode presenting: "${spokenTranscript}" → ${nextReference}`
          : `Manual display mode queued: "${nextReference}".`
      );
      if (detectionDisplayMode === "auto") {
        setListeningState("processing");
        await handleSearch(nextReference, "spoken");
      } else {
        setListeningState("waiting_for_speech");
      }

      if (detectionDisplayMode === "auto" && source === "interim" && listening) {
        stopListening("idle");
      }

      return true;
    },
    [detectionDisplayMode, handleSearch, listening, listeningMode, queueDetectedReference, queueLiveTranscriptSuggestion, stopListening, triggerDetectionPulse]
  );

  const exportSessionLog = useCallback(
    async (format: "txt" | "csv") => {
      try {
        setSessionNotice(null);
        const suggestedName = `scripture-cue-session-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.${format}`;
        const targetPath = await save({
          defaultPath: suggestedName,
          filters: format === "txt" ? [{ name: "Text", extensions: ["txt"] }] : [{ name: "CSV", extensions: ["csv"] }]
        });

        if (!targetPath) {
          setStatus("Session export canceled");
          setSessionNotice("Export canceled.");
          return;
        }

        const content = format === "txt" ? toSessionLogText(sessionLog) : toSessionLogCsv(sessionLog);
        await writeTextFile(targetPath, content);
        setStatus(`Session log exported (${format.toUpperCase()})`);
        setSessionNotice(`Exported ${format.toUpperCase()} to ${targetPath}`);
      } catch (error) {
        console.error("[session] export failed", error);
        const details = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
        setStatus("Session export failed");
        setSessionNotice(`Export failed: ${details}`);
      }
    },
    [sessionLog]
  );

  const handleClearSessionLog = useCallback(() => {
    if (sessionLog.length === 0) {
      setSessionNotice("Session log is already empty.");
      return;
    }

    const confirmed = window.confirm("Clear the session log for this service? Current verse will stay loaded.");
    if (!confirmed) return;

    setSessionLog([]);
    setSessionNotice("Session log cleared.");
    setStatus("Session log cleared");
  }, [sessionLog.length]);

  const handleCopyCurrentReference = useCallback(async () => {
    if (!result.reference || result.reference === EMPTY_RESULT.reference) {
      setSessionNotice("No loaded reference to copy.");
      return;
    }

    try {
      await writeText(result.reference);
      setSessionNotice(`Copied reference: ${result.reference}`);
      setStatus("Current reference copied");
    } catch (error) {
      console.error("[session] copy reference failed", error);
      const details = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
      setSessionNotice(`Copy failed: ${details}`);
      setStatus("Copy reference failed");
    }
  }, [result.reference]);

  const handleRecallSessionEntry = useCallback(
    async (entry: SessionLogEntry) => {
      setActiveReference(entry.reference);
      setReferenceInput(entry.reference);
      await handleSearch(entry.reference, entry.sourceType);
    },
    [handleSearch]
  );

  const handlePickBackgroundImage = useCallback(async () => {
    try {
      console.info("[presentation-background] background picker clicked");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
      });
      console.info("[presentation-background] dialog selection returned", { selected });

      if (!selected) {
        return;
      }

      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) {
        return;
      }

      if (!isSupportedBackgroundImagePath(selectedPath)) {
        setStatus("Background selection failed");
        setSessionNotice("Selected file is not a supported image. Please choose PNG, JPG, JPEG, or WEBP.");
        return;
      }

      const resolvedSource = await getBackgroundImageSource(selectedPath);
      if (!resolvedSource) {
        setStatus("Background selection failed");
        setSessionNotice("Unable to load the selected background image. Try another file.");
        return;
      }

      setCustomBackgroundPath(selectedPath);
      setCustomBackgroundSource(resolvedSource);
      setCustomBackgroundError(null);
      setBackgroundMode("custom-image");
      setStatus("Custom presentation background selected");
      setSessionNotice(`Custom background selected: ${selectedPath}`);
    } catch (error) {
      const details = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
      setSessionNotice(`Background selection failed: ${details}`);
      setStatus("Background selection failed");
    }
  }, []);

  const handleResetBackgroundImage = useCallback(() => {
    setCustomBackgroundPath(null);
    setCustomBackgroundSource(null);
    setCustomBackgroundError(null);
    setBackgroundMode("solid-dark");
    setStatus("Presentation background reset to solid dark");
  }, []);

  const handleSaveFavoriteReference = useCallback(() => {
    const nextFavorite = (result.found ? result.reference : referenceInput).trim();
    if (!nextFavorite) {
      setStatus("No reference available to save");
      return;
    }

    setFavoriteReferences((previous) => {
      if (previous.includes(nextFavorite)) {
        setStatus(`Favorite already saved: ${nextFavorite}`);
        return previous;
      }
      const next = [nextFavorite, ...previous].slice(0, MAX_FAVORITE_REFERENCES);
      setStatus(`Favorite saved: ${nextFavorite}`);
      return next;
    });
  }, [referenceInput, result.found, result.reference]);

  const handleRemoveFavoriteReference = useCallback((favorite: string) => {
    setFavoriteReferences((previous) => previous.filter((item) => item !== favorite));
    setStatus(`Favorite removed: ${favorite}`);
  }, []);

  const handleRecallFavoriteReference = useCallback(
    async (favorite: string) => {
      setActiveReference(favorite);
      setReferenceInput(favorite);
      await handleSearch(favorite, "typed");
    },
    [handleSearch]
  );

  useEffect(() => {
    const existingWindow = WebviewWindow.getByLabel(PROJECTOR_WINDOW_LABEL);
    if (!existingWindow) {
      setIsProjectorWindowOpen(false);
      projectorWindowRef.current = null;
      return;
    }

    projectorWindowRef.current = existingWindow;
    setIsProjectorWindowOpen(true);

    const unlistenPromise = existingWindow.once("tauri://close-requested", () => {
      projectorWindowRef.current = null;
      setIsProjectorWindowOpen(false);
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (!isListeningModeActive) {
      setListeningState("idle");
      return;
    }
    if (micState === "listening") {
      setListeningState(transcript.trim() ? "hearing_speech" : "listening");
      return;
    }
    if (micState === "processing") {
      setListeningState("processing");
      return;
    }
    if (micState === "error") {
      setListeningState("error");
      return;
    }
    if (micState === "idle" && (listeningState === "listening" || listeningState === "hearing_speech")) {
      setListeningState("waiting_for_speech");
    }
  }, [isListeningModeActive, listeningState, micState, transcript]);

  useEffect(() => {
    if (showParaphraseLane) {
      return;
    }
    setLiveTranscriptSuggestions([]);
    lastLiveSuggestionRef.current = null;
  }, [showParaphraseLane]);

  useEffect(() => {
    if (micState !== "success") return;

    const processAndContinue = async () => {
      const interimHit = interimCaptureRef.current;
      if (interimHit && Date.now() - interimHit.timestampMs < 3_500) {
        interimCaptureRef.current = null;
      } else if (transcript.trim()) {
        await runSpeechSearch(transcript);
      }

      if (autoListeningSessionRef.current) {
        setListeningState("waiting_for_speech");
        await startListening();
      }
    };

    void processAndContinue();
  }, [micState, runSpeechSearch, startListening, transcript]);

  useEffect(() => {
    if (listeningMode !== "auto" || !listening || !transcript.trim()) {
      return;
    }

    const captureId = window.setTimeout(() => {
      void tryAutoCaptureCandidate(transcript, "interim");
    }, 180);

    return () => window.clearTimeout(captureId);
  }, [listening, listeningMode, transcript, tryAutoCaptureCandidate]);

  useEffect(() => {
    if (!showParaphraseLane || !isListeningModeActive || !transcript.trim()) {
      return;
    }

    const anchorPlan = buildTranscriptAnchorPlan(transcript);
    if (!anchorPlan.shouldSearch) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void runLiveParaphraseSuggestions(transcript);
    }, LIVE_PARAPHRASE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isListeningModeActive, runLiveParaphraseSuggestions, showParaphraseLane, transcript]);

  useEffect(() => {
    if (listeningMode !== "auto" || !autoListeningSessionRef.current || listening) {
      return;
    }
    if (micState === "error") {
      return;
    }
    if (lastStopReason === "no-speech" || lastStopReason === "interrupted") {
      setListeningState("retry");
      setSpeechNotice(lastStopReason === "no-speech" ? "No speech detected; still listening in Auto mode." : "Recognition interrupted; retrying Auto listening.");
      const retryId = window.setTimeout(() => {
        setListeningState("waiting_for_speech");
        void startListening();
      }, 320);
      return () => window.clearTimeout(retryId);
    }
  }, [lastStopReason, listening, listeningMode, micState, startListening]);

  useEffect(() => {
    if (listeningMode !== "auto") {
      autoListeningSessionRef.current = false;
      setPersistentListeningMode((previous) => (previous === "off" ? "off" : "manual_active"));
    } else if (listening) {
      autoListeningSessionRef.current = true;
      setPersistentListeningMode("auto_active");
    }
  }, [listening, listeningMode]);

  useEffect(() => {
    if (!isListeningModeActive) {
      return;
    }
    if (
      micState === "error" &&
      (lastStopReason === "fatal" || lastErrorCode === "not-allowed" || lastErrorCode === "service-not-allowed" || lastErrorCode === "audio-capture")
    ) {
      autoListeningSessionRef.current = false;
      setPersistentListeningMode("off");
      setStatus("Listening stopped due to microphone/permission failure");
    }
  }, [isListeningModeActive, lastErrorCode, lastStopReason, micState]);

  const listeningStateLabel = useMemo(() => {
    switch (listeningState) {
      case "listening":
        return "Listening";
      case "hearing_speech":
        return "Hearing speech";
      case "processing":
        return "Processing";
      case "verse_loaded":
        return "Verse Loaded";
      case "waiting_for_speech":
        return "Waiting for speech";
      case "retry":
        return "Retry";
      case "error":
        return "Error";
      default:
        return "Idle";
    }
  }, [listeningState]);

  const detectedMatchCards = useMemo<DetectedMatchCard[]>(() => {
    const searchedCards = history.slice(0, 12).map((item) => {
      const latestSource = sessionLog.find((entry) => entry.reference === item.reference)?.sourceType;
      const sourceLabel = latestSource === "spoken" ? "Spoken match" : "Typed lookup";
      const baseConfidence = latestSource === "spoken" ? 84 : 97;
      const confidenceBonus = Math.min(item.repeats, 5);
      const confidence = Math.min(baseConfidence + confidenceBonus, 99);
      const preview =
        result.reference === item.reference && result.found && result.verses.length > 0
          ? result.verses.slice(0, 1).map((verse) => verse.text).join(" ")
          : "Ready to project on display.";

      return {
        id: `history-${item.reference}-${item.timestampMs}`,
        reference: item.reference,
        confidence: `${confidence}%`,
        preview,
        timestampMs: item.timestampMs,
        sourceLabel,
        isPending: false
      };
    });

    const pendingCards = detectionQueue.map((entry) => ({
      id: entry.id,
      reference: entry.reference,
      confidence: `${Math.round(entry.confidence * 100)}%`,
      preview: entry.transcript ? `Heard: "${entry.transcript}"` : "Detected spoken reference awaiting review.",
      timestampMs: entry.timestampMs,
      sourceLabel: entry.autoPresented ? "Spoken (auto displayed)" : "Spoken detection (manual review)",
      isPending: !entry.autoPresented
    }));

    return [...pendingCards, ...searchedCards]
      .sort((a, b) => b.timestampMs - a.timestampMs)
      .slice(0, 24);
  }, [detectionQueue, history, result.found, result.reference, result.verses, sessionLog]);

  const togglePresentationMode = useCallback(async () => {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      await root.requestFullscreen();
      setIsPresentationMode(true);
      return;
    }

    await document.exitFullscreen();
    setIsPresentationMode(false);
  }, []);

  const handleOpenProjectorView = useCallback(async () => {
    const existing = WebviewWindow.getByLabel(PROJECTOR_WINDOW_LABEL);
    if (existing) {
      projectorWindowRef.current = existing;
      setIsProjectorWindowOpen(true);
      try {
        await existing.unminimize();
      } catch {
        // no-op: window may not be minimized on this platform/runtime.
      }
      try {
        await existing.show();
        await existing.setFocus();
        setStatus("Projector view focused");
      } catch (error) {
        const msg = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
        setStatus(`Projector focus fallback: ${msg}`);
      }
      return;
    }

    try {
      const projectorWindow = new WebviewWindow(PROJECTOR_WINDOW_LABEL, {
        url: getProjectorRouteUrl(window.location.pathname),
        title: "Scripture Cue Projector",
        width: 1600,
        height: 900,
        resizable: true,
        fullscreen: false,
        decorations: !(displayMode === "lower-third" && lowerThirdOutputMode === "transparent"),
        transparent: displayMode === "lower-third" && lowerThirdOutputMode === "transparent",
        center: true
      });

      projectorWindowRef.current = projectorWindow;
      writeProjectorState(projectorPayload);

      projectorWindow.once("tauri://created", () => {
        setIsProjectorWindowOpen(true);
        setStatus("Projector view ready");
      });

      projectorWindow.once("tauri://error", (event) => {
        projectorWindowRef.current = null;
        setIsProjectorWindowOpen(false);
        const msg =
          event.payload instanceof Error
            ? event.payload.message
            : typeof event.payload === "string"
              ? event.payload
              : JSON.stringify(event.payload ?? "Unknown projector error");
        setStatus(`Projector failed to open: ${msg}`);
      });

      projectorWindow.once("tauri://close-requested", () => {
        projectorWindowRef.current = null;
        setIsProjectorWindowOpen(false);
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
      setStatus(`Projector failed to open: ${msg}`);
    }
  }, [displayMode, lowerThirdOutputMode, projectorPayload]);

  const handleCloseProjectorView = useCallback(async () => {
    const target = projectorWindowRef.current ?? WebviewWindow.getByLabel(PROJECTOR_WINDOW_LABEL);
    if (!target) {
      setIsProjectorWindowOpen(false);
      return;
    }

    await target.close();
    projectorWindowRef.current = null;
    setIsProjectorWindowOpen(false);
  }, []);

  const toggleProjectorView = useCallback(async () => {
    if (isProjectorWindowOpen) {
      await handleCloseProjectorView();
      setStatus("Projector view closed");
      return;
    }

    await handleOpenProjectorView();
  }, [handleCloseProjectorView, handleOpenProjectorView, isProjectorWindowOpen]);

  useEffect(() => {
    if (!isRestoringStartupState || startupRestoreStartedRef.current) return;
    startupRestoreStartedRef.current = true;

    const restoreOnStartup = async () => {
      const restoredReference = initialSettings.lastReference;

      if (restoredReference) {
        setActiveReference(restoredReference);
        setReferenceInput(restoredReference);
        await handleSearch(restoredReference, "typed");
      }

      if (initialSettings.reopenProjectorOnLaunch && initialSettings.wasProjectorWindowOpen) {
        await handleOpenProjectorView();
      }

      setStatus(restoredReference ? "Settings and last verse restored" : "Settings restored");
      setIsRestoringStartupState(false);
    };

    void restoreOnStartup();
  }, [handleOpenProjectorView, handleSearch, initialSettings, isRestoringStartupState]);

  useEffect(() => {
    const onFullscreenChange = () => setIsPresentationMode(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!activeDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDialog(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeDialog]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.repeat) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "f" && !event.shiftKey) {
        event.preventDefault();
        focusSearchInput();
        return;
      }

      if (key === "enter" && !event.shiftKey) {
        event.preventDefault();
        void handleSearch();
        return;
      }

      if (key === "m" && !event.shiftKey) {
        event.preventDefault();
        if (isListeningModeActive) {
          handleStopListening();
        } else {
          void handleStartListening();
        }
        return;
      }

      if (key === "a" && !event.shiftKey) {
        event.preventDefault();
        toggleAutoListeningMode();
        return;
      }

      if (key === "p" && !event.shiftKey) {
        event.preventDefault();
        void handleOpenProjectorView();
        return;
      }

      if (key === "p" && event.shiftKey) {
        event.preventDefault();
        void togglePresentationMode();
        return;
      }

      if (key === "l" && !event.shiftKey) {
        event.preventDefault();
        toggleDisplayMode();
        return;
      }

      if (key === "backspace" && !event.shiftKey) {
        event.preventDefault();
        handleClearCurrentVerse();
        return;
      }

      if (key === "r" && !event.shiftKey) {
        event.preventDefault();
        handleRepresentCurrentVerse();
        return;
      }

      if (key === "," && !event.shiftKey) {
        event.preventDefault();
        setActiveDialog("settings");
        return;
      }

      if (key === "h" && !event.shiftKey) {
        event.preventDefault();
        setActiveDialog("history");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    focusSearchInput,
    handleClearCurrentVerse,
    handleOpenProjectorView,
    handleRepresentCurrentVerse,
    handleSearch,
    handleStartListening,
    handleStopListening,
    isListeningModeActive,
    toggleAutoListeningMode,
    toggleDisplayMode,
    togglePresentationMode
  ]);

  return (
    <>
      <div className={`app-shell ${isPresentationMode ? "app-shell--presentation-active" : ""}`}>
        <header className="app-shell__topbar">
          <div className="topbar-brand-row">
            <div className="brand-block">
              <img src={APP_BRANDING.logoUrl} alt={`${APP_BRANDING.productName} logo`} className="brand-block__logo" />
              <div className="brand-block__text">
                <p className="eyebrow">Desktop Operator Surface</p>
                <h1>{APP_BRANDING.productName}</h1>
                <p className="brand-subtitle">{APP_BRANDING.subtitle}</p>
              </div>
            </div>
            <div className="menu-cluster" role="menubar" aria-label="Application menu">
              <div className="app-menu">
                <button
                  type="button"
                  className={`app-menu__trigger ${openTopMenu === "command" ? "app-menu__trigger--open" : ""}`}
                  onClick={() => setOpenTopMenu((current) => (current === "command" ? null : "command"))}
                >
                  Menu
                </button>
                {openTopMenu === "command" ? (
                  <div className="app-menu__panel" role="menu" aria-label="Command menu">
                    <p className="app-menu__group-label">Panels</p>
                    <button type="button" role="menuitem" onClick={() => openDialogFromMenu("settings")}>Settings</button>
                    <button type="button" role="menuitem" onClick={() => openDialogFromMenu("history")}>History / Session Center</button>
                    <button type="button" role="menuitem" onClick={() => openDialogFromMenu("help")}>Help</button>
                    <button type="button" role="menuitem" onClick={() => openDialogFromMenu("debug")}>Debug / Advanced</button>
                    <p className="app-menu__group-label">Actions</p>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(handleOpenProjectorView)}>{isProjectorWindowOpen ? "Focus Projector View" : "Open Projector View"}</button>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(togglePresentationMode)}>{isPresentationMode ? "Exit Fullscreen" : "Present Fullscreen"}</button>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(() => toggleDisplayMode())}>{displayMode === "lower-third" ? "Use Fullscreen Mode" : "Use Lower Third Mode"}</button>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(async () => exportSessionLog("txt"))}>Export Session TXT</button>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(async () => exportSessionLog("csv"))}>Export Session CSV</button>
                    <button type="button" role="menuitem" onClick={() => runMenuAction(handleCopyCurrentReference)}>Copy Current Reference</button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="topbar-controls">
            <label className="compact-control" htmlFor="topbar-translation-select">
              Translation
              <select id="topbar-translation-select" value={selectedTranslation} onChange={(e) => setSelectedTranslation(e.target.value)}>
                <option value="KJV">King James Version (KJV)</option>
              </select>
            </label>
            <label className="inline-check topbar-toggle">
              <input type="checkbox" checked={showParaphraseLane} onChange={(e) => setShowParaphraseLane(e.target.checked)} />
              Paraphrase
            </label>
            <label className="compact-control" htmlFor="topbar-listening-select">
              Listening
              <select id="topbar-listening-select" value={listeningMode} onChange={(e) => setListeningMode(e.target.value as ListeningMode)}>
                <option value="manual">Manual</option>
                <option value="auto">Auto</option>
              </select>
            </label>
            <label className="compact-control" htmlFor="topbar-detection-display-select">
              Detected Display
              <select
                id="topbar-detection-display-select"
                value={detectionDisplayMode}
                onChange={(e) => setDetectionDisplayMode(e.target.value as "auto" | "manual")}
              >
                <option value="auto">Auto Display</option>
                <option value="manual">Manual Display</option>
              </select>
            </label>
          </div>

          <div className="topbar-status">
            <div className="service-pill">State: {listeningStateLabel}</div>
            <div className="service-pill">Active: {activeReference || "None"}</div>
            <div className="service-pill">
              <span className={`connection-dot ${listening ? "connection-dot--active" : ""}`} aria-hidden="true" />
              {listening ? "Transcription service connected" : "Transcription standby"}
            </div>
            <div key={detectionPulseKey} className="service-pill service-pill--detection" aria-live="polite">
              <span className="detection-dot" aria-hidden="true" />
              Detection
            </div>
            {isRestoringStartupState ? <div className="service-pill">Restoring…</div> : null}
            <button
              className={`topbar-listen-button ${
                isListeningModeActive ? "topbar-listen-button--active mic-toggle-button--live" : "topbar-listen-button--idle"
              }`}
              onClick={() => {
                if (isListeningModeActive) {
                  handleStopListening();
                } else {
                  void handleStartListening();
                }
              }}
              disabled={isLoading}
            >
              {isListeningModeActive ? "Stop Listening" : "Start Listening"}
            </button>
          </div>
        </header>

        <div className="workspace-grid workspace-grid--dashboard">
          <section className="panel-card transcript-card">
            <header className="panel-card__header">
              <h2>Live Transcript</h2>
              <p>Speech appears here while listening is active.</p>
            </header>
            <div className="panel-card__body search-controls transcript-body">
              <MicrophoneMeter bars={bars} micState={micState} />
              {transcript.trim() ? (
                <p className="mic-status-line transcript-entry">{transcript.trim()}</p>
              ) : (
                <div className="empty-state-block">
                  <p className="empty-state-block__title">Waiting for transcript</p>
                  <p className="empty-state-block__copy">Start listening to capture spoken references in real time.</p>
                </div>
              )}
              {errorMessage ? <p className="mic-status-line mic-status-line--error">{errorMessage}</p> : null}
              {speechNotice ? <p className="mic-status-line">{speechNotice}</p> : null}
            </div>
          </section>

          <section className="panel-card preview-card">
            <header className="panel-card__header">
              <h2>Main Verse Display</h2>
              <p>Lookup by reference and present the active verse.</p>
            </header>
            <div className="panel-card__body search-controls verse-display-body">
              <label className="field-label" htmlFor="reference-input">Enter Bible Reference</label>
              <div className="search-row">
                <input
                  id="reference-input"
                  ref={referenceInputRef}
                  value={referenceInput}
                  onChange={(e) => setReferenceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSearch();
                  }}
                  placeholder="e.g., John 3:16"
                />
                <button className="run-search-button" onClick={() => void handleSearch()} disabled={isLoading}>
                  {isLoading ? "Searching..." : "Display"}
                </button>
              </div>
              <PresentationSurface
                as="div"
                className={`verse-preview-shell ${hasCustomPresentationBackground ? "verse-preview-shell--image" : ""}`}
                contentClassName="verse-preview-shell__content"
                backgroundMode={effectivePresentationBackgroundMode}
                backgroundSource={presentationBackgroundState.customBackgroundSource}
                solidBackgroundColor={presentationBackgroundState.solidBackgroundColor}
                gradientStartColor={presentationBackgroundState.gradientStartColor}
                gradientEndColor={presentationBackgroundState.gradientEndColor}
                gradientDirection={presentationBackgroundState.gradientDirection}
                blurBackgroundImage={presentationBackgroundState.blurBackgroundImage}
                dimOpacity={previewDimOpacity}
                containerProps={{ "data-background-received": String(hasCustomPresentationBackground) }}
              >
                <pre
                  className={`verse-preview ${result.found ? "" : "verse-preview--empty"}`}
                  style={{ fontFamily: getPresentationFontCssFamily(previewFontFamily), fontSize: `${previewFontSizePx}px` }}
                >
                  {previewVerseText || "Verse content will appear here once a reference is loaded."}
                </pre>
              </PresentationSurface>
            </div>
          </section>

          <section className="panel-card detected-card">
            <header className="panel-card__header">
              <h2>Detected Verse Matches</h2>
              <p>Recent spoken or typed verse results.</p>
            </header>
            <div className="panel-card__body search-controls">
              {detectedMatchCards.length === 0 ? (
                <div className="empty-state-block">
                  <p className="empty-state-block__title">No verse matches yet</p>
                  <p className="empty-state-block__copy">Detected verse matches will appear here once searches begin.</p>
                </div>
              ) : (
                <ul className="detected-list">
                  {detectedMatchCards.map((match) => (
                    <li key={match.id} className={`detected-list__item ${match.isPending ? "detected-list__item--pending" : ""}`}>
                      <div className="detected-list__row">
                        <span className="history-list__reference">{match.reference}</span>
                        <span className="confidence-pill">{match.confidence} confidence</span>
                      </div>
                      <p className="history-list__meta">{match.sourceLabel}</p>
                      <p className="detected-list__preview">{match.preview}</p>
                      {isManualOperatorMode ? (
                        <button
                          className="present-button present-button--secondary detected-list__action"
                          type="button"
                          onClick={() => {
                            setDetectionQueue((previous) => previous.filter((entry) => entry.id !== match.id));
                            void handleSearch(match.reference, "spoken");
                          }}
                        >
                          {match.isPending ? "Review & Display" : "Show on Display"}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="panel-card paraphrase-card">
            <header className="panel-card__header panel-card__header--paraphrase">
              <div className="panel-card__header-copy">
                <h2>Paraphrase Matches</h2>
                <p>Optional lane for paraphrase-led lookup.</p>
              </div>
              <button
                className="icon-button icon-button--subtle"
                type="button"
                onClick={handleClearParaphraseMatches}
                disabled={isParaphraseLoading || isLiveParaphraseLoading}
                title="Clear paraphrase matches"
                aria-label="Clear paraphrase matches"
              >
                ↺
              </button>
            </header>
            <div className="panel-card__body search-controls paraphrase-panel-body">
              {showParaphraseLane ? (
                <>
                  {paraphraseNotice ? <p className="mic-status-line">{paraphraseNotice}</p> : null}
                  <section className="paraphrase-section">
                    <label className="field-label" htmlFor="paraphrase-panel-input">Search by Paraphrase</label>
                    <div className="paraphrase-search-row">
                      <input
                        className="paraphrase-search-row__input"
                        id="paraphrase-panel-input"
                        value={paraphraseInput}
                        onChange={(e) => setParaphraseInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleParaphraseSearch();
                        }}
                        placeholder="e.g., God loved the world"
                      />
                      <button
                        className="present-button present-button--secondary paraphrase-search-row__button"
                        type="button"
                        onClick={() => void handleParaphraseSearch()}
                        disabled={isParaphraseLoading}
                      >
                        {isParaphraseLoading ? "Searching..." : "Search"}
                      </button>
                    </div>
                  </section>

                  <div className="paraphrase-panel-sections">
                    <section className="live-suggestions-block paraphrase-section">
                      <h3 className="field-label">Transcript-fed Suggestions</h3>
                      {liveTranscriptSuggestions.length === 0 ? (
                        <p className="history-empty">Waiting for scripture-like phrases from live transcript.</p>
                      ) : (
                        <ul className="detected-list paraphrase-list">
                          {liveTranscriptSuggestions.map((suggestion) => (
                            <li key={suggestion.id} className="detected-list__item">
                              <div className="detected-list__row">
                                <span className="history-list__reference">{suggestion.topReference}</span>
                                <span className="confidence-pill">{suggestion.confidenceLabel}</span>
                              </div>
                              <p className="history-list__meta">{suggestion.anchorLabel} • {new Date(suggestion.createdAtMs).toLocaleTimeString()}</p>
                              <p className="detected-list__preview">“{suggestion.transcript}”</p>
                              <p className="history-list__meta">Top match: {suggestion.matches[0]?.reference ?? "Unknown"}</p>
                              {isManualOperatorMode ? (
                                <button
                                  className="present-button present-button--secondary detected-list__action"
                                  type="button"
                                  onClick={() => {
                                    const reference = suggestion.matches[0]?.reference;
                                    if (!reference) return;
                                    void handleSearch(reference, "typed");
                                  }}
                                  disabled={!suggestion.matches[0]?.reference}
                                >
                                  Show Suggested Match
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="live-suggestions-section paraphrase-section">
                    <div className="live-suggestions-section__header">
                      <h3>Transcript Anchor Suggestions</h3>
                      <p>Suggested from transcript concept anchors.</p>
                    </div>
                    {isLiveParaphraseLoading ? <p className="history-empty">Scanning transcript for likely scripture paraphrases...</p> : null}
                    {liveParaphraseSuggestions.length === 0 ? (
                      <p className="history-empty">No live transcript suggestions yet.</p>
                    ) : (
                      <ul className="detected-list paraphrase-list">
                        {liveParaphraseSuggestions.map((match) => (
                          <li key={match.id} className="detected-list__item">
                            <div className="detected-list__row">
                              <span className="history-list__reference">{match.reference}</span>
                              <span className="confidence-pill">{match.transcriptLabel === "likely" ? "Likely" : "Possible"}</span>
                            </div>
                            <p className="history-list__meta">Suggested from transcript anchor: "{match.sourceAnchor}"</p>
                            <p className="detected-list__preview">{match.text}</p>
                            {isManualOperatorMode ? (
                              <button className="present-button present-button--secondary detected-list__action" type="button" onClick={() => void handleSearch(match.reference, "typed")}>
                                Show on Display
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    </section>

                    <section className="paraphrase-section">
                      <h3 className="field-label">Typed Paraphrase Results</h3>
                      {paraphraseMatches.length === 0 ? (
                        <p className="history-empty">Enter a phrase below to find likely local KJV matches.</p>
                      ) : (
                        <ul className="detected-list paraphrase-list">
                          {paraphraseMatches.map((match) => (
                            <li key={`${match.reference}-${match.text.slice(0, 16)}`} className="detected-list__item">
                              <div className="detected-list__row">
                                <span className="history-list__reference">{match.reference}</span>
                                <span className="confidence-pill">{match.confidenceLabel}</span>
                              </div>
                              <p className="history-list__meta">Matched terms: {match.matchedTerms}</p>
                              <p className="detected-list__preview">{match.text}</p>
                              {isManualOperatorMode ? (
                                <button className="present-button present-button--secondary detected-list__action" type="button" onClick={() => void handleSearch(match.reference, "typed")}>
                                  Show on Display
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                </>
              ) : (
                <p className="history-empty">Paraphrase lane is turned off from the top bar.</p>
              )}
            </div>
          </section>
        </div>

        <div className="workspace-grid workspace-grid--bottom">
          <section className="panel-card">
            <header className="panel-card__header"><h2>Session Stats</h2></header>
            <div className="panel-card__body">
              <dl className="session-stats-grid">
                <div className="stat-tile"><dt>Transcripts</dt><dd>{history.length}</dd></div>
                <div className="stat-tile"><dt>Verses Detected</dt><dd>{sessionLog.length}</dd></div>
                <div className="stat-tile"><dt>Projector</dt><dd>{isProjectorWindowOpen ? "Connected" : "Offline"}</dd></div>
                <div className="stat-tile stat-tile--status"><dt>Status</dt><dd>{status}</dd></div>
              </dl>
            </div>
          </section>

          <section className="panel-card">
            <header className="panel-card__header"><h2>Manual Controls</h2></header>
            <div className="panel-card__body search-controls">
              <p className="history-empty">Manual controls keep display actions in one compact place while search stays in the main verse and paraphrase panels.</p>
              {isManualOperatorMode ? (
                <div className="service-actions service-actions--compact manual-controls-grid">
                  <button className="present-button present-button--secondary" type="button" onClick={() => void toggleProjectorView()}>
                    {isProjectorWindowOpen ? "Focus Display" : "Show on Display"}
                  </button>
                  <button className="present-button present-button--secondary" type="button" onClick={() => void togglePresentationMode()}>
                    {isPresentationMode ? "Exit Fullscreen" : "Present Fullscreen"}
                  </button>
                  <button className="present-button present-button--secondary" type="button" onClick={handleRepresentCurrentVerse}>Re-present</button>
                  <button className="present-button present-button--secondary" type="button" onClick={handleClearCurrentVerse}>Hide</button>
                </div>
              ) : (
                <p className="history-empty">Auto listening mode hides manual display actions to keep the flow clean.</p>
              )}
            </div>
          </section>
        </div>
      </div>
      {activeDialog ? (
        <div className="operator-dialog-backdrop" role="presentation" onClick={() => setActiveDialog(null)}>
          <section className="operator-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="operator-dialog__header">
              <h2>
                {activeDialog === "settings"
                  ? "Settings"
                  : activeDialog === "history"
                    ? "History / Session"
                    : activeDialog === "help"
                      ? "Quick Start / Help"
                      : "Debug / Advanced"}
              </h2>
              <button className="present-button present-button--secondary" type="button" onClick={() => setActiveDialog(null)}>
                Close
              </button>
            </header>
            <div className="operator-dialog__body">
              {activeDialog === "settings" ? (
                <div className="search-controls">
                  <details className="settings-section" open>
                    <summary>Appearance</summary>
                    <div className="settings-section__body">
                      <div className="translation-row">
                        <label className="field-label" htmlFor="software-theme-select">Theme</label>
                        <select id="software-theme-select" value={softwareTheme} onChange={(e) => setSoftwareTheme(e.target.value as SoftwareTheme)}>
                          {THEME_OPTIONS.map((theme) => (
                            <option key={theme.value} value={theme.value}>{theme.label}</option>
                          ))}
                        </select>
                      </div>
                      <p className="session-notice">{THEME_OPTIONS.find((theme) => theme.value === softwareTheme)?.description}</p>
                    </div>
                  </details>
                  <details className="settings-section" open>
                    <summary>Fonts</summary>
                    <div className="settings-section__body">
                      <div className="translation-row">
                        <label className="field-label" htmlFor="preview-font-family-select">Preview font family</label>
                        <select id="preview-font-family-select" value={previewFontFamily} onChange={(e) => setPreviewFontFamily(e.target.value as typeof previewFontFamily)}>
                          {PRESENTATION_FONT_OPTIONS.map((fontOption) => (
                            <option key={`preview-${fontOption.value}`} value={fontOption.value}>{fontOption.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="translation-row">
                        <label className="field-label" htmlFor="preview-font-size-input">Preview font size ({previewFontSizePx}px)</label>
                        <input id="preview-font-size-input" type="range" min={14} max={56} step={1} value={previewFontSizePx} onChange={(e) => setPreviewFontSizePx(Number(e.target.value))} />
                      </div>
                      <div className="translation-row">
                        <label className="field-label" htmlFor="projection-font-family-select">Projection font family</label>
                        <select id="projection-font-family-select" value={projectionFontFamily} onChange={(e) => setProjectionFontFamily(e.target.value as typeof projectionFontFamily)}>
                          {PRESENTATION_FONT_OPTIONS.map((fontOption) => (
                            <option key={`projector-${fontOption.value}`} value={fontOption.value}>{fontOption.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="translation-row">
                        <label className="field-label" htmlFor="projection-font-size-input">Projection font size ({projectionFontSizePx}px)</label>
                        <input id="projection-font-size-input" type="range" min={30} max={120} step={1} value={projectionFontSizePx} onChange={(e) => setProjectionFontSizePx(Number(e.target.value))} />
                      </div>
                      <div className="translation-row">
                        <label className="field-label" htmlFor="projection-line-height-input">Projection line height ({projectionLineHeight.toFixed(2)})</label>
                        <input id="projection-line-height-input" type="range" min={1.1} max={2.2} step={0.05} value={projectionLineHeight} onChange={(e) => setProjectionLineHeight(Number(e.target.value))} />
                      </div>
                    </div>
                  </details>
                  <details className="settings-section" open>
                    <summary>Presentation Background</summary>
                    <div className="settings-section__body">
                      <div className="translation-row">
                        <label className="field-label" htmlFor="background-mode-select">Background style</label>
                        <select id="background-mode-select" value={backgroundMode} onChange={(e) => setBackgroundMode(e.target.value as PresentationBackgroundMode)}>
                          <option value="solid-dark">Solid Dark</option>
                          <option value="solid-light">Solid Light</option>
                          <option value="solid-custom">Solid Custom Color</option>
                          <option value="gradient-two-color">Two-Color Gradient</option>
                          <option value="custom-image">Custom image</option>
                        </select>
                      </div>
                      {(backgroundMode === "solid-custom" || backgroundMode === "gradient-two-color") ? (
                        <div className="translation-row">
                          <label className="field-label" htmlFor="background-primary-color">Primary color</label>
                          <input
                            id="background-primary-color"
                            type="color"
                            value={backgroundMode === "solid-custom" ? solidBackgroundColor : gradientStartColor}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (backgroundMode === "solid-custom") {
                                setSolidBackgroundColor(next);
                              } else {
                                setGradientStartColor(next);
                              }
                            }}
                          />
                        </div>
                      ) : null}
                      {backgroundMode === "gradient-two-color" ? (
                        <>
                          <div className="translation-row">
                            <label className="field-label" htmlFor="background-secondary-color">Secondary color</label>
                            <input
                              id="background-secondary-color"
                              type="color"
                              value={gradientEndColor}
                              onChange={(e) => setGradientEndColor(e.target.value)}
                            />
                          </div>
                          <div className="translation-row">
                            <label className="field-label" htmlFor="gradient-direction-select">Gradient direction</label>
                            <select id="gradient-direction-select" value={gradientDirection} onChange={(e) => setGradientDirection(e.target.value as PresentationGradientDirection)}>
                              <option value="top-bottom">Top to Bottom</option>
                              <option value="left-right">Left to Right</option>
                              <option value="diagonal">Diagonal</option>
                            </select>
                          </div>
                        </>
                      ) : null}
                      <div className="service-actions">
                        <button className="present-button present-button--secondary" type="button" onClick={() => void handlePickBackgroundImage()}>Choose Background Image</button>
                        <button className="present-button present-button--secondary" type="button" onClick={handleResetBackgroundImage}>Reset to Solid Dark</button>
                      </div>
                      <p className="session-notice">Current image: {customBackgroundPath ?? "None selected"}</p>
                      <label className="inline-check">
                        <input type="checkbox" checked={blurBackgroundImage} onChange={(e) => setBlurBackgroundImage(e.target.checked)} disabled={backgroundMode !== "custom-image"} />
                        Blur custom image for readability
                      </label>
                      <div className="translation-row">
                        <label className="field-label" htmlFor="background-dim-input">Image dim strength ({Math.round(backgroundDimStrength * 100)}%)</label>
                        <input id="background-dim-input" type="range" min={0.2} max={0.9} step={0.05} value={backgroundDimStrength} disabled={backgroundMode !== "custom-image"} onChange={(e) => setBackgroundDimStrength(Number(e.target.value))} />
                      </div>
                    </div>
                  </details>
                  <details className="settings-section" open>
                    <summary>Display Options</summary>
                    <div className="settings-section__body">
                      <div className="translation-row">
                        <label className="field-label" htmlFor="display-mode-select">Display mode</label>
                        <select id="display-mode-select" value={displayMode} onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}>
                          <option value="fullscreen">Fullscreen</option>
                          <option value="lower-third">Lower Third</option>
                        </select>
                      </div>
                      {displayMode === "lower-third" ? (
                        <>
                          <div className="translation-row">
                            <label className="field-label" htmlFor="lower-third-output-mode-select">Lower Third output</label>
                            <select
                              id="lower-third-output-mode-select"
                              value={lowerThirdOutputMode}
                              onChange={(e) => setLowerThirdOutputMode(e.target.value as LowerThirdOutputMode)}
                            >
                              <option value="transparent">Transparent (OBS preferred)</option>
                              <option value="chroma-key">Chroma Key fallback</option>
                            </select>
                          </div>
                          <div className="translation-row">
                            <label className="field-label" htmlFor="lower-third-chroma-input">Chroma key color</label>
                            <input
                              id="lower-third-chroma-input"
                              type="color"
                              value={lowerThirdChromaKeyColor}
                              disabled={lowerThirdOutputMode !== "chroma-key"}
                              onChange={(e) => setLowerThirdChromaKeyColor(e.target.value)}
                            />
                          </div>
                        </>
                      ) : null}
                      <label className="inline-check">
                        <input type="checkbox" checked={showPresentationReference} onChange={(e) => setShowPresentationReference(e.target.checked)} />
                        Show reference in presenter view
                      </label>
                      <div className="translation-row">
                        <label className="field-label" htmlFor="reference-placement-select">Reference placement</label>
                        <select id="reference-placement-select" value={referencePlacement} onChange={(e) => setReferencePlacement(e.target.value as ReferencePlacement)}>
                          <option value="top-left">Top-left</option>
                          <option value="top-center">Top-center</option>
                          <option value="bottom-left">Bottom-left</option>
                        </select>
                      </div>
                      <label className="inline-check">
                        <input type="checkbox" checked={useSafeMargins} onChange={(e) => setUseSafeMargins(e.target.checked)} />
                        Use projector safe margins
                      </label>
                    </div>
                  </details>
                  <details className="settings-section" open>
                    <summary>Listening</summary>
                    <div className="settings-section__body">
                      <div className="translation-row">
                        <label className="field-label" htmlFor="listening-mode-select">Listening mode</label>
                        <select id="listening-mode-select" value={listeningMode} onChange={(e) => setListeningMode(e.target.value as ListeningMode)}>
                          <option value="manual">Manual (operator confirms search)</option>
                          <option value="auto">Auto (high-confidence spoken references present automatically)</option>
                        </select>
                      </div>
                      <label className="inline-check">
                        <input type="checkbox" checked={reopenProjectorOnLaunch} onChange={(e) => setReopenProjectorOnLaunch(e.target.checked)} />
                        Reopen projector window on startup
                      </label>
                    </div>
                  </details>
                  <details className="settings-section" open>
                    <summary>Support & Advanced</summary>
                    <div className="settings-section__body">
                      <div className="service-actions">
                        <button className="present-button present-button--secondary" type="button" onClick={() => setActiveDialog("help")}>
                          Open Help
                        </button>
                        <button className="present-button present-button--secondary" type="button" onClick={() => setActiveDialog("debug")}>
                          Open Debug Tools
                        </button>
                      </div>
                      {isProjectorWindowOpen ? (
                        <button className="present-button present-button--secondary" type="button" onClick={() => void handleCloseProjectorView()}>
                          Close Projector View
                        </button>
                      ) : null}
                      <p className="session-notice">Debug tools are intentionally hidden from the default operator surface.</p>
                    </div>
                  </details>
                </div>
              ) : null}

              {activeDialog === "history" ? (
                <div className="session-log-body">
                  <div className="session-log-actions">
                    <button className={`present-button present-button--secondary ${historyPanelTab === "recent-history" ? "present-button--active" : ""}`} type="button" onClick={() => setHistoryPanelTab("recent-history")}>Recent History</button>
                    <button className={`present-button present-button--secondary ${historyPanelTab === "session-log" ? "present-button--active" : ""}`} type="button" onClick={() => setHistoryPanelTab("session-log")}>Service Session Log</button>
                  </div>
                  <section className="quick-actions-panel favorites-panel" aria-label="Quick presets">
                    <div className="favorites-panel__header">
                      <h3>Favorites / Quick Presets</h3>
                      <button className="present-button present-button--secondary" type="button" onClick={handleSaveFavoriteReference}>Save Current</button>
                    </div>
                    {favoriteReferences.length === 0 ? (
                      <p className="history-empty">No favorites saved yet.</p>
                    ) : (
                      <ul className="favorites-list">
                        {favoriteReferences.map((favorite) => (
                          <li key={favorite} className="favorites-list__item">
                            <button className="history-list__item" type="button" onClick={() => void handleRecallFavoriteReference(favorite)}>
                              <span className="history-list__reference">{favorite}</span>
                              <span className="history-list__meta">Recall preset</span>
                            </button>
                            <button className="favorite-remove-button" type="button" onClick={() => handleRemoveFavoriteReference(favorite)}>
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  {historyPanelTab === "recent-history" ? (
                    <>
                      <div className="history-pagination">
                        <label className="field-label" htmlFor="recent-history-page-size">Page size</label>
                        <select id="recent-history-page-size" value={String(recentHistoryPageSize)} onChange={(e) => { setRecentHistoryPageSize(Number(e.target.value)); setRecentHistoryPage(1); }}>
                          <option value="5">5</option><option value="8">8</option><option value="12">12</option><option value="20">20</option>
                        </select>
                      </div>
                      {history.length === 0 ? (
                        <p className="history-empty">No successful searches yet.</p>
                      ) : (
                        <>
                          <ul className="history-list">
                            {pagedHistory.map((item, idx) => (
                              <li key={`${item.reference}-${item.timestampMs}-${idx}`}>
                                <button className="history-list__item" onClick={() => setReferenceInput(item.reference)}>
                                  <span className="history-list__reference">{item.reference}</span>
                                  <span className="history-list__meta">
                                    {item.repeats > 1 ? `Repeated ${item.repeats}x` : "Ready to search"}
                                  </span>
                                  <span className="history-list__time">
                                    {new Date(item.timestampMs).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit"
                                    })}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                          <div className="history-pagination history-pagination--actions">
                            <button
                              className="present-button present-button--secondary"
                              type="button"
                              onClick={() => setRecentHistoryPage((value) => Math.max(1, value - 1))}
                              disabled={recentHistoryPage <= 1}
                            >
                              Previous
                            </button>
                            <p className="history-empty">
                              Page {recentHistoryPage} of {recentHistoryPageCount}
                            </p>
                            <button
                              className="present-button present-button--secondary"
                              type="button"
                              onClick={() => setRecentHistoryPage((value) => Math.min(recentHistoryPageCount, value + 1))}
                              disabled={recentHistoryPage >= recentHistoryPageCount}
                            >
                              Next
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="session-log-actions session-log-actions--filters">
                        <button className="present-button present-button--secondary" type="button" onClick={() => void exportSessionLog("txt")}>Export TXT</button>
                        <button className="present-button present-button--secondary" type="button" onClick={() => void exportSessionLog("csv")}>Export CSV</button>
                      </div>
                      <div className="session-log-actions">
                        <button className={`present-button present-button--secondary ${sessionLogFilter === "all" ? "present-button--active" : ""}`} type="button" onClick={() => { setSessionLogFilter("all"); setSessionLogPage(1); }}>All</button>
                        <button className={`present-button present-button--secondary ${sessionLogFilter === "typed" ? "present-button--active" : ""}`} type="button" onClick={() => { setSessionLogFilter("typed"); setSessionLogPage(1); }}>Typed</button>
                        <button className={`present-button present-button--secondary ${sessionLogFilter === "spoken" ? "present-button--active" : ""}`} type="button" onClick={() => { setSessionLogFilter("spoken"); setSessionLogPage(1); }}>Spoken</button>
                      </div>
                      <div className="session-log-actions">
                        <button className="present-button present-button--secondary" type="button" onClick={() => void handleCopyCurrentReference()}>Copy Current Reference</button>
                        <button className="present-button present-button--secondary" type="button" onClick={handleClearSessionLog}>Clear Session Log</button>
                      </div>
                      <div className="history-pagination">
                        <label className="field-label" htmlFor="session-log-page-size">Page size</label>
                        <select id="session-log-page-size" value={String(sessionLogPageSize)} onChange={(e) => { setSessionLogPageSize(Number(e.target.value)); setSessionLogPage(1); }}>
                          <option value="5">5</option><option value="8">8</option><option value="12">12</option><option value="20">20</option>
                        </select>
                      </div>
                      {sessionNotice ? <p className="session-notice">{sessionNotice}</p> : null}
                      {sessionLog.length === 0 ? (
                        <p className="history-empty">No verses presented in this session yet.</p>
                      ) : filteredSessionLog.length === 0 ? (
                        <p className="history-empty">No {sessionLogFilter} entries in this session log yet.</p>
                      ) : (
                        <>
                          <ol className="session-log-list" aria-label="Service session log">
                            {pagedSessionLog.map((entry) => (
                              <li key={entry.id}>
                                <button className="history-list__item" onClick={() => void handleRecallSessionEntry(entry)}>
                                  <span className="history-list__reference">{entry.reference}</span>
                                  <span className="history-list__meta">Source: {entry.sourceType}</span>
                                  <span className="history-list__time">{formatSessionTimestamp(entry.timestampMs)}</span>
                                </button>
                              </li>
                            ))}
                          </ol>
                          <div className="history-pagination history-pagination--actions">
                            <button
                              className="present-button present-button--secondary"
                              type="button"
                              onClick={() => setSessionLogPage((value) => Math.max(1, value - 1))}
                              disabled={sessionLogPage <= 1}
                            >
                              Previous
                            </button>
                            <p className="history-empty">
                              Page {sessionLogPage} of {sessionLogPageCount}
                            </p>
                            <button
                              className="present-button present-button--secondary"
                              type="button"
                              onClick={() => setSessionLogPage((value) => Math.min(sessionLogPageCount, value + 1))}
                              disabled={sessionLogPage >= sessionLogPageCount}
                            >
                              Next
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {activeDialog === "help" ? (
                <details className="quick-start" open={helpPanelExpanded} onToggle={(event) => setHelpPanelExpanded(event.currentTarget.open)}>
                  <summary>{helpPanelExpanded ? "Hide help panel" : "Show help panel"}</summary>
                  <ul>
                    <li><strong>Typing search:</strong> Enter a reference and press Enter or click Search.</li>
                    <li><strong>Listening modes:</strong> Manual captures references for review; Auto presents high-confidence spoken references.</li>
                    <li><strong>Display modes:</strong> Toggle Fullscreen or Lower Third for projector/fullscreen output layout.</li>
                    <li><strong>Backgrounds:</strong> Choose solid dark or custom image with optional blur/dim for readability.</li>
                    <li><strong>Themes:</strong> Software themes style the operator console only, not projector scripture backgrounds.</li>
                  </ul>
                  <div className="shortcut-reference">
                    <p className="field-label">Keyboard shortcuts</p>
                    <ul>
                      {SHORTCUT_REFERENCE.map((shortcut) => (
                        <li key={shortcut.keys}>
                          <strong>{shortcut.keys}</strong> — {shortcut.action}
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              ) : null}

              {activeDialog === "debug" ? (
                <div className="search-controls">
                  <section className="panel-card">
                    <header className="panel-card__header"><h2>Speech Debug</h2><p>Shows transcript parsing, confidence, and ambiguity before auto-search.</p></header>
                    <div className="panel-card__body">
                      {speechDebug ? (
                        <dl className="debug-grid">
                          <div><dt>Heard transcript</dt><dd>{speechDebug.rawTranscript}</dd></div>
                          <div><dt>Matched book</dt><dd>{speechDebug.canonicalBook ?? "Uncertain"}</dd></div>
                          <div><dt>Normalized reference</dt><dd>{speechDebug.normalizedReference}</dd></div>
                          <div><dt>Confidence</dt><dd>{(speechDebug.confidence * 100).toFixed(1)}%</dd></div>
                          <div><dt>Ambiguity</dt><dd>{speechDebug.ambiguity === "clear" ? "Clear" : "Ambiguous - manual review"}</dd></div>
                          <div><dt>Book source</dt><dd>{speechDebug.debug.bookMatchSource}</dd></div>
                          {speechDebug.debug.reason ? <div><dt>Match note</dt><dd>{speechDebug.debug.reason}</dd></div> : null}
                        </dl>
                      ) : <p className="history-empty">No speech transcript captured yet.</p>}
                    </div>
                  </section>
                  <section className="panel-card">
                    <header className="panel-card__header"><h2>Presentation Background Debug</h2><p>Lightweight visibility into shared background propagation.</p></header>
                    <div className="panel-card__body">
                      <dl className="debug-grid">
                        <div><dt>Raw file path</dt><dd>{customBackgroundPath ?? "None selected"}</dd></div>
                        <div>
                          <dt>Renderable source</dt>
                          <dd>
                            {customBackgroundSource
                              ? `${customBackgroundSource.slice(0, 120)}${customBackgroundSource.length > 120 ? "…" : ""}`
                              : "Not available"}
                          </dd>
                        </div>
                        <div><dt>Verse preview using custom image</dt><dd>{isVersePreviewUsingCustomImage ? "Yes" : "No"}</dd></div>
                        <div><dt>Projector using custom image</dt><dd>{isProjectorUsingCustomImage ? "Yes" : "No"}</dd></div>
                        <div><dt>Fullscreen using custom image</dt><dd>{isFullscreenUsingCustomImage ? "Yes" : "No"}</dd></div>
                      </dl>
                    </div>
                  </section>
                  <section className="panel-card">
                    <header className="panel-card__header"><h2>Canonical Book Coverage</h2><p>Configured spoken-book dictionary for all supported KJV books.</p></header>
                    <div className="panel-card__body"><p className="coverage-count">{CANONICAL_BOOK_DICTIONARY.length} books configured.</p></div>
                  </section>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {isPresentationMode ? (
        <PresentationSurface
          as="section"
          className={`presentation-mode presentation-mode--${displayMode} ${isTransparentLowerThird ? "presentation-mode--transparent-lower-third" : ""} ${isChromaLowerThird ? "presentation-mode--chroma-lower-third" : ""}`}
          contentClassName={`presentation-mode__content presentation-mode__content--${presentationState.displayMode} ${presentationState.useSafeMargins ? "presentation-mode__content--safe" : ""}`}
          backgroundMode={presentationState.backgroundMode}
          backgroundSource={presentationState.customBackgroundSource}
          solidBackgroundColor={presentationState.solidBackgroundColor}
          gradientStartColor={presentationState.gradientStartColor}
          gradientEndColor={presentationState.gradientEndColor}
          gradientDirection={presentationState.gradientDirection}
          blurBackgroundImage={presentationState.blurBackgroundImage}
          dimOpacity={isTransparentLowerThird ? 0 : fullscreenDimOpacity}
          containerProps={{
            "aria-live": "polite",
            "data-lower-third-output-mode": lowerThirdOutputMode,
            style: { "--lower-third-chroma-key": lowerThirdChromaKeyColor } as CSSProperties
          }}
        >
          <div className="presentation-branding">
            <img src={APP_BRANDING.logoUrl} alt="" aria-hidden="true" />
            <span>{APP_BRANDING.productName}</span>
          </div>
          <button className="presentation-exit-button" onClick={() => void togglePresentationMode()}>Exit Fullscreen</button>
          {didFullscreenHitAutoFitMinimum && presentationState.result.found ? (
            <p className="presentation-fit-warning" role="status">
              Passage reached minimum auto-fit size. Consider splitting into multiple slides for maximum readability.
            </p>
          ) : null}
          <div
            ref={fullscreenViewportRef}
            className={`presentation-mode__scripture-viewport ${shouldFullscreenTopBias ? "presentation-mode__scripture-viewport--top-biased" : ""}`}
          >
            <div ref={fullscreenContentRef} className="presentation-mode__scripture-content">
              {presentationState.showReference ? (
                <p className={`presentation-mode__reference presentation-mode__reference--${presentationState.referencePlacement}`}>{presentationState.result.reference}</p>
              ) : null}
              <pre
                ref={fullscreenVerseRef}
                className={`presentation-mode__verse ${presentationState.result.found ? "" : "presentation-mode__verse--empty"}`}
                style={getProjectionVerseStyle(fullscreenTypography)}
              >
                {presentationState.verseText}
              </pre>
            </div>
          </div>
        </PresentationSurface>
      ) : null}
    </>
  );
}
