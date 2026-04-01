import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";
import { writeText } from "@tauri-apps/api/clipboard";
import { searchKjv, type SearchResult } from "./api";
import MicrophoneMeter from "./components/MicrophoneMeter";
import PresentationSurface from "./components/PresentationSurface";
import { normalizeTranscriptToReference, type NormalizedResult } from "./features/parser";
import { CANONICAL_BOOK_DICTIONARY } from "./features/parser/spokenBookMatcher";
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
  type ProjectorPayload,
  type ReferencePlacement
} from "./features/display/projectorSync";
import {
  getBackgroundImageSource,
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
import { APP_BRANDING } from "./branding";

type HistoryItem = {
  reference: string;
  timestampMs: number;
  repeats: number;
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

const HISTORY_DUPLICATE_COOLDOWN_MS = 10_000;
const AUTO_SEARCH_DUPLICATE_COOLDOWN_MS = 8_000;
const AUTO_MEDIUM_CONFIDENCE = 0.68;
const AUTO_HIGH_PRIORITY_CONFIDENCE = 0.78;
const AUTO_FINAL_CONFIDENCE = 0.82;
const AUTO_BOOK_ANCHOR_CONFIDENCE = 0.42;
const AUTO_BOOK_CANDIDATE_HOLD_MS = 2200;
const MAX_FAVORITE_REFERENCES = 24;

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
  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialSettings.displayMode);
  const [softwareTheme, setSoftwareTheme] = useState<SoftwareTheme>(initialSettings.softwareTheme);
  const [backgroundMode, setBackgroundMode] = useState<PresentationBackgroundMode>(initialSettings.backgroundMode);
  const [customBackgroundPath, setCustomBackgroundPath] = useState<string | null>(initialSettings.customBackgroundPath);
  const [customBackgroundSource, setCustomBackgroundSource] = useState<string | null>(null);
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
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const projectorWindowRef = useRef<WebviewWindow | null>(null);
  const lastHistoryEntryRef = useRef<{ reference: string; timestampMs: number } | null>(null);
  const lastAutoSearchRef = useRef<{ normalizedReference: string; timestampMs: number } | null>(null);
  const startupRestoreStartedRef = useRef(false);
  const autoListeningSessionRef = useRef(false);
  const interimCaptureRef = useRef<{ transcript: string; normalizedReference: string; timestampMs: number } | null>(null);
  const autoBookAnchorRef = useRef<{ canonicalBook: string; timestampMs: number } | null>(null);
  const fullscreenViewportRef = useRef<HTMLDivElement | null>(null);
  const fullscreenContentRef = useRef<HTMLDivElement | null>(null);
  const fullscreenVerseRef = useRef<HTMLPreElement | null>(null);
  const [detectionPulseKey, setDetectionPulseKey] = useState(0);
  const { bars, micState, transcript, errorMessage, lastErrorCode, lastStopReason, listening, startListening, stopListening } = useSpeechMeter();
  const isListeningModeActive = persistentListeningMode !== "off";

  const verseText = useMemo(() => {
    if (!result.found || result.verses.length === 0) {
      return result.message ?? "No result loaded yet.";
    }

    return result.verses.map((v) => `${v.verse}. ${v.text}`).join("\n");
  }, [result]);

  const hasCustomPresentationBackground = backgroundMode === "custom-image" && Boolean(customBackgroundSource);
  const previewDimOpacity = hasCustomPresentationBackground ? Math.min(backgroundDimStrength, 0.8) : 0.35;
  const fullscreenDimOpacity = backgroundMode === "custom-image" ? Math.min(backgroundDimStrength, 0.8) : 0.35;
  const isTransparentLowerThird = displayMode === "lower-third" && lowerThirdOutputMode === "transparent";
  const isChromaLowerThird = displayMode === "lower-third" && lowerThirdOutputMode === "chroma-key";
  const isVersePreviewUsingCustomImage = hasCustomPresentationBackground;
  const isProjectorUsingCustomImage = backgroundMode === "custom-image" && Boolean(customBackgroundSource);
  const isFullscreenUsingCustomImage = isPresentationMode && backgroundMode === "custom-image" && Boolean(customBackgroundSource);

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
      backgroundMode,
      customBackgroundPath,
      customBackgroundSource,
      backgroundDimStrength,
      blurBackgroundImage,
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
      backgroundMode,
      customBackgroundPath,
      customBackgroundSource,
      backgroundDimStrength,
      blurBackgroundImage,
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
        return;
      }

      const nextSource = await getBackgroundImageSource(customBackgroundPath);
      if (isCurrent) {
        setCustomBackgroundSource(nextSource);
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
        displayMode,
        softwareTheme,
        backgroundMode,
        customBackgroundPath,
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
    displayMode,
    softwareTheme,
    backgroundMode,
    customBackgroundPath,
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
    setPersistentListeningMode(listeningMode === "auto" ? "auto_active" : "manual_active");
    autoListeningSessionRef.current = listeningMode === "auto";
    await startListening();
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
      setSpeechNotice(`Auto mode presenting: "${spokenTranscript}" → ${nextReference}`);
      await handleSearch(nextReference, "spoken");
    },
    [handleSearch, listeningMode, triggerDetectionPulse]
  );

  const tryAutoCaptureCandidate = useCallback(
    async (spokenTranscript: string, source: DetectionSignalSource) => {
      if (listeningMode !== "auto") {
        return false;
      }

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
      setSpeechNotice(
        source === "interim"
          ? `Auto mode caught quickly: "${nextReference}"`
          : `Auto mode presenting: "${spokenTranscript}" → ${nextReference}`
      );
      setListeningState("processing");
      await handleSearch(nextReference, "spoken");

      if (source === "interim" && listening) {
        stopListening("idle");
      }

      return true;
    },
    [handleSearch, listening, listeningMode, stopListening, triggerDetectionPulse]
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
      const selected = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
      });

      if (!selected || Array.isArray(selected)) {
        setSessionNotice("Background selection canceled.");
        return;
      }

      setCustomBackgroundPath(selected);
      setBackgroundMode("custom-image");
      setStatus("Custom presentation background selected");
      setSessionNotice(`Custom background selected: ${selected}`);
    } catch (error) {
      const details = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
      setSessionNotice(`Background selection failed: ${details}`);
      setStatus("Background selection failed");
    }
  }, []);

  const handleResetBackgroundImage = useCallback(() => {
    setCustomBackgroundPath(null);
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

  const liveConfidencePercent = speechDebug ? Math.round(speechDebug.confidence * 100) : null;
  const uniqueHistoryReferences = useMemo(() => [...new Set(history.map((item) => item.reference))], [history]);
  const topDetectedMatches = useMemo(() => uniqueHistoryReferences.slice(0, 6), [uniqueHistoryReferences]);
  const recentSessionEntries = useMemo(() => sessionLog.slice(0, 5), [sessionLog]);
  const historyReferenceCursor = useMemo(() => Math.max(0, uniqueHistoryReferences.indexOf(activeReference)), [activeReference, uniqueHistoryReferences]);

  const handleNavigateHistoryReference = useCallback(
    async (direction: "previous" | "next") => {
      if (uniqueHistoryReferences.length === 0) {
        return;
      }
      const activeIndex = uniqueHistoryReferences.indexOf(activeReference);
      const safeIndex = activeIndex === -1 ? 0 : activeIndex;
      const nextIndex = direction === "previous"
        ? Math.max(0, safeIndex - 1)
        : Math.min(uniqueHistoryReferences.length - 1, safeIndex + 1);
      const nextReference = uniqueHistoryReferences[nextIndex];
      setReferenceInput(nextReference);
      await handleSearch(nextReference, "typed");
    },
    [activeReference, handleSearch, uniqueHistoryReferences]
  );

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
      await existing.show();
      await existing.setFocus();
      setStatus("Projector view focused");
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
          <div className="brand-block">
            <img src={APP_BRANDING.logoUrl} alt={`${APP_BRANDING.productName} logo`} className="brand-block__logo" />
            <div>
              <p className="eyebrow">{APP_BRANDING.productName.toUpperCase()}</p>
              <h1>{APP_BRANDING.subtitle}</h1>
            </div>
          </div>
          <div className="topbar-actions topbar-actions--desktop">
            <div className="menu-cluster" role="menubar" aria-label="Application menu">
              <details className="app-menu">
                <summary>File</summary>
                <div className="app-menu__panel">
                  <button type="button" onClick={() => void handleOpenProjectorView()}>{isProjectorWindowOpen ? "Focus Projector View" : "Open Projector View"}</button>
                  <button type="button" onClick={() => void exportSessionLog("txt")}>Export Session TXT</button>
                  <button type="button" onClick={() => void exportSessionLog("csv")}>Export Session CSV</button>
                </div>
              </details>
              <details className="app-menu">
                <summary>View</summary>
                <div className="app-menu__panel">
                  <button type="button" onClick={() => setActiveDialog("history")}>History / Session</button>
                  <button type="button" onClick={() => setActiveDialog("settings")}>Theme, Font & Background</button>
                  <button type="button" onClick={() => setActiveDialog("help")}>Quick Help</button>
                </div>
              </details>
              <details className="app-menu">
                <summary>Presentation</summary>
                <div className="app-menu__panel">
                  <button type="button" onClick={() => void togglePresentationMode()}>{isPresentationMode ? "Exit Fullscreen" : "Present Fullscreen"}</button>
                  <button type="button" onClick={toggleDisplayMode}>{displayMode === "lower-third" ? "Use Fullscreen Mode" : "Use Lower Third Mode"}</button>
                  <button type="button" onClick={handleRepresentCurrentVerse}>Re-present Current Verse</button>
                  <button type="button" onClick={handleClearCurrentVerse}>Clear Current Verse</button>
                </div>
              </details>
              <details className="app-menu">
                <summary>Tools</summary>
                <div className="app-menu__panel">
                  <button type="button" onClick={() => setActiveDialog("settings")}>Settings</button>
                  <button type="button" onClick={() => setActiveDialog("debug")}>Debug / Advanced</button>
                  <button type="button" onClick={() => void handleCopyCurrentReference()}>Copy Current Reference</button>
                </div>
              </details>
              <details className="app-menu">
                <summary>Help</summary>
                <div className="app-menu__panel">
                  <button type="button" onClick={() => setActiveDialog("help")}>Quick Start</button>
                  <button type="button" onClick={() => setActiveDialog("history")}>Operator Session Center</button>
                </div>
              </details>
            </div>
            <div className="topbar-status">
              <label className="compact-control" htmlFor="topbar-translation-select">
                Translation
                <select id="topbar-translation-select" value={selectedTranslation} onChange={(e) => setSelectedTranslation(e.target.value)}>
                  <option value="KJV">KJV</option>
                </select>
              </label>
              <label className="compact-control" htmlFor="topbar-listening-select">
                Listening
                <select id="topbar-listening-select" value={listeningMode} onChange={(e) => setListeningMode(e.target.value as ListeningMode)}>
                  <option value="manual">Manual</option>
                  <option value="auto">Auto</option>
                </select>
              </label>
              <div className="service-pill">State: {listeningStateLabel}</div>
              <div className="service-pill">Transcription: {listening ? "Connected" : "Standby"}</div>
              <div key={detectionPulseKey} className="service-pill service-pill--detection" aria-live="polite">
                <span className="detection-dot" aria-hidden="true" />
                Detection Ready
              </div>
              {isRestoringStartupState ? <div className="service-pill">Restoring startup state…</div> : null}
              <button
                className={`present-button ${isListeningModeActive ? "mic-toggle-button--live" : ""}`}
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
          </div>
        </header>

        <div className="workspace-grid workspace-grid--dashboard">
          <section className="panel-card preview-card">
            <header className="panel-card__header">
              <h2>Live Scripture Workspace</h2>
              <p>Primary scripture monitor for lookup, confidence preview, and display actions.</p>
            </header>
            <div className="panel-card__body">
              <div className="search-controls">
                <label className="field-label" htmlFor="reference-input">Reference</label>
                <div className="search-row">
                  <input
                    id="reference-input"
                    ref={referenceInputRef}
                    value={referenceInput}
                    onChange={(e) => setReferenceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSearch();
                    }}
                    placeholder="Genesis 1:1"
                  />
                  <button className="run-search-button" onClick={() => void handleSearch()} disabled={isLoading}>
                    {isLoading ? "Searching..." : "Search"}
                  </button>
                </div>
                <p className="shortcut-hint">Tip: Alt+F focuses this field. Alt+Enter runs search.</p>
              </div>

              <header className="panel-card__header"><h2>Verse Preview</h2><p>Large-format text for confidence monitor and projection checks.</p></header>
                <PresentationSurface
                  as="div"
                  className={`verse-preview-shell ${hasCustomPresentationBackground ? "verse-preview-shell--image" : ""}`}
                  contentClassName="verse-preview-shell__content"
                  backgroundMode={backgroundMode}
                  backgroundSource={customBackgroundSource}
                  blurBackgroundImage={blurBackgroundImage}
                  dimOpacity={previewDimOpacity}
                  containerProps={{ "data-background-received": String(hasCustomPresentationBackground) }}
                >
                  <pre
                    className={`verse-preview ${result.found ? "" : "verse-preview--empty"}`}
                    style={{ fontFamily: getPresentationFontCssFamily(previewFontFamily), fontSize: `${previewFontSizePx}px` }}
                  >
                    {verseText}
                  </pre>
                </PresentationSurface>
                {didFullscreenHitAutoFitMinimum && result.found ? (
                  <p className="autofit-warning-note">
                    Auto-fit hit the minimum projection size for this passage. Split into multiple slides if readability is low.
                  </p>
                ) : null}
                <div className="service-actions service-actions--main">
                  <button className="present-button" type="button" onClick={() => void toggleProjectorView()}>
                    {isProjectorWindowOpen ? "Focus Display" : "Show on Display"}
                  </button>
                  <button className="present-button present-button--secondary" type="button" onClick={handleRepresentCurrentVerse}>
                    Re-present
                  </button>
                  <button className="present-button present-button--secondary" type="button" onClick={handleClearCurrentVerse}>
                    Clear
                  </button>
                </div>
                <div className="service-actions service-actions--compact">
                  <button className="present-button present-button--secondary" type="button" onClick={() => void handleNavigateHistoryReference("previous")} disabled={historyReferenceCursor <= 0}>
                    Previous Verse
                  </button>
                  <button className="present-button present-button--secondary" type="button" onClick={() => void handleNavigateHistoryReference("next")} disabled={historyReferenceCursor >= Math.max(uniqueHistoryReferences.length - 1, 0)}>
                    Next Verse
                  </button>
                </div>
              </div>
          </section>

          <section className="panel-card">
            <header className="panel-card__header">
              <h2>Detected Verse Matches</h2>
              <p>Detection review queue with fast recall and confidence details.</p>
            </header>
            <div className="panel-card__body search-controls">
              {topDetectedMatches.length === 0 ? <p className="history-empty">Detected verse matches will appear here.</p> : (
                <ul className="history-list">
                  {topDetectedMatches.map((match) => (
                    <li key={match}>
                      <button className="history-list__item" type="button" onClick={() => void handleSearch(match, "typed")}>
                        <span className="history-list__reference">{match}</span>
                        <span className="history-list__meta">Present now</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="metadata-grid">
                <div><dt>Last detected</dt><dd>{speechDebug?.normalizedReference ?? "Awaiting detection"}</dd></div>
                <div><dt>Confidence</dt><dd>{speechDebug ? `${liveConfidencePercent}%` : "N/A"}</dd></div>
                <div><dt>Match source</dt><dd>{speechDebug?.debug.bookMatchSource ?? "None"}</dd></div>
                <div><dt>Ambiguity</dt><dd>{speechDebug ? (speechDebug.ambiguity === "clear" ? "Clear" : "Manual review") : "N/A"}</dd></div>
              </dl>
            </div>
          </section>

          <section className="panel-card">
            <header className="panel-card__header">
              <h2>Live Detection & Support</h2>
              <p>Speech feed, paraphrase placeholder, and operator activity context.</p>
            </header>
            <div className="panel-card__body search-controls">
              <MicrophoneMeter bars={bars} micState={micState} />
              <p className="mic-status-line">Current transcript: {transcript.trim() || "Awaiting speech input..."}</p>
              {errorMessage ? <p className="mic-status-line mic-status-line--error">{errorMessage}</p> : null}
              {speechNotice ? <p className="mic-status-line">{speechNotice}</p> : null}
              <section className="quick-actions-panel">
                <h3>Paraphrase Matches</h3>
                <p className="history-empty">Paraphrase support lane remains available for future inference logic.</p>
              </section>
              <section className="quick-actions-panel">
                <h3>Recent Activity Feed</h3>
                {recentSessionEntries.length === 0 ? (
                  <p className="history-empty">No verses presented in this session yet.</p>
                ) : (
                  <ul className="history-list">
                    {recentSessionEntries.map((entry) => (
                      <li key={entry.id}>
                        <button className="history-list__item" type="button" onClick={() => void handleRecallSessionEntry(entry)}>
                          <span className="history-list__reference">{entry.reference}</span>
                          <span className="history-list__meta">Source: {entry.sourceType}</span>
                          <span className="history-list__time">{formatSessionTimestamp(entry.timestampMs)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="metadata-strip-card panel-card">
                <dl className="metadata-grid">
                  <div><dt>Reference</dt><dd>{activeReference || result.reference}</dd></div>
                  <div><dt>Translation</dt><dd>{result.translation}</dd></div>
                  <div><dt>Theme</dt><dd>{result.theme}</dd></div>
                  <div><dt>Status</dt><dd>{result.found ? "Loaded" : "No Result"}</dd></div>
                </dl>
              </section>
            </div>
          </section>
        </div>

        <div className="workspace-grid workspace-grid--bottom">
          <section className="panel-card">
            <header className="panel-card__header"><h2>Session Stats</h2></header>
            <div className="panel-card__body">
              <dl className="metadata-grid">
                <div><dt>Status</dt><dd>{status}</dd></div>
                <div><dt>Search history</dt><dd>{history.length} entries</dd></div>
                <div><dt>Session log</dt><dd>{sessionLog.length} entries</dd></div>
                <div><dt>Projector</dt><dd>{isProjectorWindowOpen ? "Open" : "Closed"}</dd></div>
              </dl>
            </div>
          </section>

          <section className="panel-card">
            <header className="panel-card__header"><h2>Manual Controls</h2></header>
            <div className="panel-card__body search-controls">
              <div className="service-actions service-actions--compact">
                <button className="present-button present-button--secondary" type="button" onClick={() => setActiveDialog("history")}>Open Session Center</button>
                <button className="present-button present-button--secondary" type="button" onClick={() => setActiveDialog("settings")}>Open Settings</button>
              </div>
              <p className="history-empty">Secondary controls moved to the top desktop menu for cleaner operation flow.</p>
            </div>
          </section>

          <section className="panel-card favorites-panel" aria-label="Quick presets">
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
                          <option value="solid-dark">Solid dark</option>
                          <option value="custom-image">Custom image</option>
                        </select>
                      </div>
                      <div className="service-actions">
                        <button className="present-button present-button--secondary" type="button" onClick={() => void handlePickBackgroundImage()}>Choose Background Image</button>
                        <button className="present-button present-button--secondary" type="button" onClick={handleResetBackgroundImage}>Use Solid Dark</button>
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
                  {historyPanelTab === "recent-history" ? (
                    <>
                      <div className="history-pagination">
                        <label className="field-label" htmlFor="recent-history-page-size">Page size</label>
                        <select id="recent-history-page-size" value={String(recentHistoryPageSize)} onChange={(e) => { setRecentHistoryPageSize(Number(e.target.value)); setRecentHistoryPage(1); }}>
                          <option value="5">5</option><option value="8">8</option><option value="12">12</option><option value="20">20</option>
                        </select>
                      </div>
                      {history.length === 0 ? <p className="history-empty">No successful searches yet.</p> : (<><ul className="history-list">{pagedHistory.map((item, idx) => (
                        <li key={`${item.reference}-${item.timestampMs}-${idx}`}><button className="history-list__item" onClick={() => setReferenceInput(item.reference)}><span className="history-list__reference">{item.reference}</span><span className="history-list__meta">{item.repeats > 1 ? `Repeated ${item.repeats}x` : "Ready to search"}</span><span className="history-list__time">{new Date(item.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></button></li>
                      ))}</ul><div className="history-pagination history-pagination--actions"><button className="present-button present-button--secondary" type="button" onClick={() => setRecentHistoryPage((value) => Math.max(1, value - 1))} disabled={recentHistoryPage <= 1}>Previous</button><p className="history-empty">Page {recentHistoryPage} of {recentHistoryPageCount}</p><button className="present-button present-button--secondary" type="button" onClick={() => setRecentHistoryPage((value) => Math.min(recentHistoryPageCount, value + 1))} disabled={recentHistoryPage >= recentHistoryPageCount}>Next</button></div></>)}
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
                      {sessionLog.length === 0 ? <p className="history-empty">No verses presented in this session yet.</p> : filteredSessionLog.length === 0 ? <p className="history-empty">No {sessionLogFilter} entries in this session log yet.</p> : (<><ol className="session-log-list" aria-label="Service session log">{pagedSessionLog.map((entry) => (<li key={entry.id}><button className="history-list__item" onClick={() => void handleRecallSessionEntry(entry)}><span className="history-list__reference">{entry.reference}</span><span className="history-list__meta">Source: {entry.sourceType}</span><span className="history-list__time">{formatSessionTimestamp(entry.timestampMs)}</span></button></li>))}</ol><div className="history-pagination history-pagination--actions"><button className="present-button present-button--secondary" type="button" onClick={() => setSessionLogPage((value) => Math.max(1, value - 1))} disabled={sessionLogPage <= 1}>Previous</button><p className="history-empty">Page {sessionLogPage} of {sessionLogPageCount}</p><button className="present-button present-button--secondary" type="button" onClick={() => setSessionLogPage((value) => Math.min(sessionLogPageCount, value + 1))} disabled={sessionLogPage >= sessionLogPageCount}>Next</button></div></>)}
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
