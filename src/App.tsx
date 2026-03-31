import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";
import { writeText } from "@tauri-apps/api/clipboard";
import { searchKjv, type SearchResult } from "./api";
import MicrophoneMeter from "./components/MicrophoneMeter";
import { normalizeTranscriptToReference, type NormalizedResult } from "./features/parser";
import { CANONICAL_BOOK_DICTIONARY } from "./features/parser/spokenBookMatcher";
import { useSpeechMeter } from "./features/speech/useSpeechMeter";
import {
  PROJECTOR_WINDOW_LABEL,
  PROJECTOR_STATE_EVENT,
  getProjectorRouteUrl,
  writeProjectorState,
  type DisplayMode,
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

type HistoryItem = {
  reference: string;
  timestampMs: number;
  repeats: number;
};

type ListeningWorkflowState = "idle" | "listening" | "processing" | "verse_loaded" | "waiting_for_speech" | "error";
type SessionLogFilter = "all" | "typed" | "spoken";
type DetectionSignalSource = "final" | "interim";

const HISTORY_DUPLICATE_COOLDOWN_MS = 10_000;
const AUTO_SEARCH_DUPLICATE_COOLDOWN_MS = 8_000;
const AUTO_HIGH_PRIORITY_CONFIDENCE = 0.68;
const AUTO_FINAL_CONFIDENCE = 0.74;

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
  const [reference, setReference] = useState("John 3:16");
  const [result, setResult] = useState<SearchResult>(EMPTY_RESULT);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sessionLog, setSessionLog] = useState<SessionLogEntry[]>([]);
  const [sessionLogFilter, setSessionLogFilter] = useState<SessionLogFilter>("all");
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [isLoading, setIsLoading] = useState(false);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [speechDebug, setSpeechDebug] = useState<NormalizedResult | null>(null);
  const [listeningState, setListeningState] = useState<ListeningWorkflowState>("idle");
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
  const [backgroundDimStrength, setBackgroundDimStrength] = useState(initialSettings.backgroundDimStrength);
  const [blurBackgroundImage, setBlurBackgroundImage] = useState(initialSettings.blurBackgroundImage);
  const [previewFontFamily, setPreviewFontFamily] = useState(initialSettings.previewFontFamily);
  const [previewFontSizePx, setPreviewFontSizePx] = useState(initialSettings.previewFontSizePx);
  const [projectionFontFamily, setProjectionFontFamily] = useState(initialSettings.projectionFontFamily);
  const [projectionFontSizePx, setProjectionFontSizePx] = useState(initialSettings.projectionFontSizePx);
  const [projectionLineHeight, setProjectionLineHeight] = useState(initialSettings.projectionLineHeight);
  const projectorWindowRef = useRef<WebviewWindow | null>(null);
  const lastHistoryEntryRef = useRef<{ reference: string; timestampMs: number } | null>(null);
  const lastAutoSearchRef = useRef<{ normalizedReference: string; timestampMs: number } | null>(null);
  const startupRestoreStartedRef = useRef(false);
  const autoListeningSessionRef = useRef(false);
  const interimCaptureRef = useRef<{ transcript: string; normalizedReference: string; timestampMs: number } | null>(null);
  const [detectionPulseKey, setDetectionPulseKey] = useState(0);
  const { bars, micState, transcript, errorMessage, lastStopReason, listening, startListening, stopListening } = useSpeechMeter();

  const verseText = useMemo(() => {
    if (!result.found || result.verses.length === 0) {
      return result.message ?? "No result loaded yet.";
    }

    return result.verses.map((v) => `${v.verse}. ${v.text}`).join("\n");
  }, [result]);

  const customBackgroundSource = useMemo(() => getBackgroundImageSource(customBackgroundPath), [customBackgroundPath]);
  const hasCustomPresentationBackground = backgroundMode === "custom-image" && Boolean(customBackgroundSource);
  const presentationBackgroundStyle = useMemo(
    () =>
      customBackgroundSource
        ? {
            backgroundImage: `url("${customBackgroundSource}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat"
          }
        : undefined,
    [customBackgroundSource]
  );
  const previewSurfaceStyle = useMemo(
    () =>
      hasCustomPresentationBackground
        ? {
            ...presentationBackgroundStyle
          }
        : undefined,
    [hasCustomPresentationBackground, presentationBackgroundStyle]
  );
  const fullscreenSurfaceStyle = useMemo(
    () =>
      backgroundMode === "custom-image" && customBackgroundSource
        ? {
            backgroundImage: `url("${customBackgroundSource}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat"
          }
        : undefined,
    [backgroundMode, customBackgroundSource]
  );
  const previewDimOpacity = hasCustomPresentationBackground ? Math.min(backgroundDimStrength, 0.8) : 0.35;
  const fullscreenDimOpacity = backgroundMode === "custom-image" ? Math.min(backgroundDimStrength, 0.8) : 0.35;
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
      projectionLineHeight
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
      projectionLineHeight
    ]
  );
  const presentationState = projectorPayload;

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
    result
  ]);

  const filteredSessionLog = useMemo(() => {
    if (sessionLogFilter === "all") {
      return sessionLog;
    }

    return sessionLog.filter((entry) => entry.sourceType === sessionLogFilter);
  }, [sessionLog, sessionLogFilter]);

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
        return [nextEntry, ...withoutExisting].slice(0, 20);
      }

      return [{ reference: nextReference, timestampMs: now, repeats: 1 }, ...prev].slice(0, 20);
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
    setResult({ ...EMPTY_RESULT, message: "Verse cleared by operator." });
    setListeningState("idle");
    setStatus("Current verse cleared");
  }, []);

  const handleRepresentCurrentVerse = useCallback(() => {
    void syncProjectorNow("Current verse re-presented");
  }, [syncProjectorNow]);

  const handleSearch = useCallback(
    async (overrideReference?: string, sourceType: SessionSourceType = "typed") => {
      const trimmed = (overrideReference ?? reference).trim();
      if (!trimmed) return;

      try {
        setIsLoading(true);
        setStatus("Searching...");
        setListeningState("processing");

        const response = await searchKjv(trimmed);
        setResult(response);

        if (response.found && response.verses.length > 0) {
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
    [pushHistoryWithCooldown, reference]
  );

  async function handleStartListening() {
    setSpeechNotice(null);
    setListeningState("listening");
    autoListeningSessionRef.current = listeningMode === "auto";
    await startListening();
  }

  function handleStopListening() {
    autoListeningSessionRef.current = false;
    stopListening("idle");
    setListeningState("idle");
    setStatus("Listening stopped");
  }

  const runSpeechSearch = useCallback(
    async (spokenTranscript: string) => {
      if (!spokenTranscript.trim()) return;

      const normalized = normalizeTranscriptToReference(spokenTranscript, "KJV");
      setSpeechDebug(normalized);

      const normalizedValue = normalized.normalizedReference.trim();
      const canAutoSearch =
        normalized.query.kind === "spoken_reference" &&
        normalized.ambiguity === "clear" &&
        Boolean(normalized.structuredReference) &&
        normalized.confidence >= AUTO_FINAL_CONFIDENCE;

      const nextReference = canAutoSearch ? normalizedValue || spokenTranscript.trim() : spokenTranscript.trim();
      setReference(nextReference);

      if (listeningMode === "manual") {
        autoListeningSessionRef.current = false;
        setListeningState("idle");
        setSpeechNotice(`Manual mode captured: "${spokenTranscript}" (confirm search before presenting)`);
        return;
      }

      if (!canAutoSearch) {
        setListeningState("waiting_for_speech");
        setSpeechNotice("Auto mode ignored non-reference speech.");
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
      const hasCandidate =
        normalized.query.kind === "spoken_reference" &&
        normalized.ambiguity === "clear" &&
        Boolean(normalized.structuredReference) &&
        normalized.confidence >= AUTO_HIGH_PRIORITY_CONFIDENCE;

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
      setReference(nextReference);
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
      setReference(entry.reference);
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
    if (micState === "listening") {
      setListeningState("listening");
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
    if (micState === "idle" && listeningState === "listening") {
      setListeningState("waiting_for_speech");
    }
  }, [listeningState, micState]);

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
      setListeningState("waiting_for_speech");
      setSpeechNotice(lastStopReason === "no-speech" ? "No speech detected; still listening in Auto mode." : "Recognition interrupted; retrying Auto listening.");
      const retryId = window.setTimeout(() => {
        void startListening();
      }, 320);
      return () => window.clearTimeout(retryId);
    }
  }, [lastStopReason, listening, listeningMode, micState, startListening]);

  useEffect(() => {
    if (listeningMode !== "auto") {
      autoListeningSessionRef.current = false;
    } else if (listening) {
      autoListeningSessionRef.current = true;
    }
  }, [listening, listeningMode]);

  const listeningStateLabel = useMemo(() => {
    switch (listeningState) {
      case "listening":
        return "Listening";
      case "processing":
        return "Processing";
      case "verse_loaded":
        return "Verse Loaded";
      case "waiting_for_speech":
        return "Waiting for speech";
      case "error":
        return "Error";
      default:
        return "Idle";
    }
  }, [listeningState]);

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
        decorations: true,
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
  }, [projectorPayload]);

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

  useEffect(() => {
    if (!isRestoringStartupState || startupRestoreStartedRef.current) return;
    startupRestoreStartedRef.current = true;

    const restoreOnStartup = async () => {
      const restoredReference = initialSettings.lastReference;

      if (restoredReference) {
        setReference(restoredReference);
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

  return (
    <>
      <div className={`app-shell ${isPresentationMode ? "app-shell--presentation-active" : ""}`}>
        <header className="app-shell__topbar">
          <div>
            <p className="eyebrow">SCRIPTURE CUE</p>
            <h1>Presentation Operator Console</h1>
          </div>
          <div className="topbar-actions">
            <div className="service-pill">{status}</div>
            <div key={detectionPulseKey} className="service-pill service-pill--detection" aria-live="polite">
              <span className="detection-dot" aria-hidden="true" />
              Scripture detection
            </div>
            <div className="service-pill">Listening: {listeningMode === "auto" ? "Auto" : "Manual"}</div>
            <div className="service-pill">Display: {displayMode === "lower-third" ? "Lower Third" : "Fullscreen"}</div>
            {isRestoringStartupState ? <div className="service-pill">Restoring startup state…</div> : null}
            <button className="present-button" onClick={() => void handleOpenProjectorView()} disabled={isLoading}>
              {isProjectorWindowOpen ? "Focus Projector View" : "Open Projector View"}
            </button>
            {isProjectorWindowOpen ? (
              <button className="present-button present-button--secondary" onClick={() => void handleCloseProjectorView()}>
                Close Projector View
              </button>
            ) : null}
            <button className="present-button" onClick={() => void togglePresentationMode()} disabled={isLoading}>
              {isPresentationMode ? "Exit Fullscreen" : "Present Fullscreen"}
            </button>
          </div>
        </header>

        <div className="workspace-grid">
          <div className="workspace-column">
            <section className="panel-card">
              <header className="panel-card__header">
                <h2>Scripture Search</h2>
                <p>Operator-ready lookup with the bundled KJV database.</p>
              </header>

              <div className="panel-card__body search-controls">
                <label className="field-label" htmlFor="reference-input">Reference</label>
                <div className="search-row">
                  <input
                    id="reference-input"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSearch();
                    }}
                    placeholder="Genesis 1:1"
                  />
                  <button className="run-search-button" onClick={() => void handleSearch()} disabled={isLoading}>
                    {isLoading ? "Searching..." : "Search"}
                  </button>
                </div>

                <div className="translation-row">
                  <label className="field-label" htmlFor="listening-mode-select">Listening mode</label>
                  <select
                    id="listening-mode-select"
                    value={listeningMode}
                    onChange={(e) => setListeningMode(e.target.value as ListeningMode)}
                  >
                    <option value="manual">Manual (operator confirms search)</option>
                    <option value="auto">Auto (high-confidence spoken references present automatically)</option>
                  </select>
                </div>

                <div className="mic-controls-row">
                  <button
                    className={`mic-toggle-button ${listening ? "mic-toggle-button--live" : ""}`}
                    onClick={() => {
                      if (listening) {
                        handleStopListening();
                      } else {
                        void handleStartListening();
                      }
                    }}
                    disabled={isLoading}
                  >
                    {listening ? "Stop Listening" : "Start Listening"}
                  </button>
                  <span className={`mic-state-chip mic-state-chip--${listeningState}`}>{listeningStateLabel}</span>
                </div>

                <MicrophoneMeter bars={bars} micState={micState} />
                {errorMessage ? <p className="mic-status-line mic-status-line--error">{errorMessage}</p> : null}
                {speechNotice ? <p className="mic-status-line">{speechNotice}</p> : null}

                <div className="translation-row">
                  <label className="field-label" htmlFor="translation-select">Translation</label>
                  <select id="translation-select" value={selectedTranslation} onChange={(e) => setSelectedTranslation(e.target.value)}>
                    <option value="KJV">KJV</option>
                  </select>
                </div>

                <div className="translation-row">
                  <label className="field-label" htmlFor="display-mode-select">Display mode</label>
                  <select id="display-mode-select" value={displayMode} onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}>
                    <option value="fullscreen">Fullscreen</option>
                    <option value="lower-third">Lower Third</option>
                  </select>
                </div>

                <label className="inline-check">
                  <input type="checkbox" checked={showPresentationReference} onChange={(e) => setShowPresentationReference(e.target.checked)} />
                  Show reference in presenter view
                </label>

                <div className="translation-row">
                  <label className="field-label" htmlFor="reference-placement-select">Reference placement</label>
                  <select
                    id="reference-placement-select"
                    value={referencePlacement}
                    onChange={(e) => setReferencePlacement(e.target.value as ReferencePlacement)}
                  >
                    <option value="top-left">Top-left</option>
                    <option value="top-center">Top-center</option>
                    <option value="bottom-left">Bottom-left</option>
                  </select>
                </div>

                <label className="inline-check">
                  <input type="checkbox" checked={useSafeMargins} onChange={(e) => setUseSafeMargins(e.target.checked)} />
                  Use projector safe margins
                </label>

                <label className="inline-check">
                  <input type="checkbox" checked={reopenProjectorOnLaunch} onChange={(e) => setReopenProjectorOnLaunch(e.target.checked)} />
                  Reopen projector window on startup
                </label>

                <div className="service-actions">
                  <button className="present-button present-button--secondary" type="button" onClick={handleClearCurrentVerse}>
                    Clear Current Verse
                  </button>
                  <button className="present-button" type="button" onClick={handleRepresentCurrentVerse}>
                    Re-present Current Verse
                  </button>
                </div>
              </div>
            </section>

            <section className="panel-card">
              <header className="panel-card__header">
                <h2>Presentation Background</h2>
                <p>Independent projector/presenter background controls for scripture readability.</p>
              </header>
              <div className="panel-card__body search-controls">
                <div className="translation-row">
                  <label className="field-label" htmlFor="background-mode-select">Background style</label>
                  <select
                    id="background-mode-select"
                    value={backgroundMode}
                    onChange={(e) => setBackgroundMode(e.target.value as PresentationBackgroundMode)}
                  >
                    <option value="solid-dark">Solid dark</option>
                    <option value="custom-image">Custom image</option>
                  </select>
                </div>
                <div className="service-actions">
                  <button className="present-button present-button--secondary" type="button" onClick={() => void handlePickBackgroundImage()}>
                    Choose Background Image
                  </button>
                  <button className="present-button present-button--secondary" type="button" onClick={handleResetBackgroundImage}>
                    Use Solid Dark
                  </button>
                </div>
                <p className="session-notice">Current image: {customBackgroundPath ?? "None selected"}</p>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={blurBackgroundImage}
                    onChange={(e) => setBlurBackgroundImage(e.target.checked)}
                    disabled={backgroundMode !== "custom-image"}
                  />
                  Blur custom image for readability
                </label>
                <div className="translation-row">
                  <label className="field-label" htmlFor="background-dim-input">
                    Image dim strength ({Math.round(backgroundDimStrength * 100)}%)
                  </label>
                  <input
                    id="background-dim-input"
                    type="range"
                    min={0.2}
                    max={0.9}
                    step={0.05}
                    value={backgroundDimStrength}
                    disabled={backgroundMode !== "custom-image"}
                    onChange={(e) => setBackgroundDimStrength(Number(e.target.value))}
                  />
                </div>
              </div>
            </section>

            <section className="panel-card">
              <header className="panel-card__header">
                <h2>Font Controls</h2>
                <p>Separate typography controls for operator preview and projector/fullscreen output.</p>
              </header>
              <div className="panel-card__body search-controls">
                <div className="translation-row">
                  <label className="field-label" htmlFor="preview-font-family-select">Preview font family</label>
                  <select
                    id="preview-font-family-select"
                    value={previewFontFamily}
                    onChange={(e) => setPreviewFontFamily(e.target.value as typeof previewFontFamily)}
                  >
                    {PRESENTATION_FONT_OPTIONS.map((fontOption) => (
                      <option key={`preview-${fontOption.value}`} value={fontOption.value}>{fontOption.label}</option>
                    ))}
                  </select>
                </div>
                <div className="translation-row">
                  <label className="field-label" htmlFor="preview-font-size-input">Preview font size ({previewFontSizePx}px)</label>
                  <input
                    id="preview-font-size-input"
                    type="range"
                    min={14}
                    max={56}
                    step={1}
                    value={previewFontSizePx}
                    onChange={(e) => setPreviewFontSizePx(Number(e.target.value))}
                  />
                </div>
                <div className="translation-row">
                  <label className="field-label" htmlFor="projection-font-family-select">Projection font family</label>
                  <select
                    id="projection-font-family-select"
                    value={projectionFontFamily}
                    onChange={(e) => setProjectionFontFamily(e.target.value as typeof projectionFontFamily)}
                  >
                    {PRESENTATION_FONT_OPTIONS.map((fontOption) => (
                      <option key={`projector-${fontOption.value}`} value={fontOption.value}>{fontOption.label}</option>
                    ))}
                  </select>
                </div>
                <div className="translation-row">
                  <label className="field-label" htmlFor="projection-font-size-input">Projection font size ({projectionFontSizePx}px)</label>
                  <input
                    id="projection-font-size-input"
                    type="range"
                    min={30}
                    max={120}
                    step={1}
                    value={projectionFontSizePx}
                    onChange={(e) => setProjectionFontSizePx(Number(e.target.value))}
                  />
                </div>
                <div className="translation-row">
                  <label className="field-label" htmlFor="projection-line-height-input">Projection line height ({projectionLineHeight.toFixed(2)})</label>
                  <input
                    id="projection-line-height-input"
                    type="range"
                    min={1.1}
                    max={2.2}
                    step={0.05}
                    value={projectionLineHeight}
                    onChange={(e) => setProjectionLineHeight(Number(e.target.value))}
                  />
                </div>
              </div>
            </section>

            <section className="panel-card">
              <header className="panel-card__header">
                <h2>Software Theme</h2>
                <p>Operator UI theme presets. These never change projector scripture backgrounds.</p>
              </header>
              <div className="panel-card__body search-controls">
                <div className="translation-row">
                  <label className="field-label" htmlFor="software-theme-select">Theme</label>
                  <select
                    id="software-theme-select"
                    value={softwareTheme}
                    onChange={(e) => setSoftwareTheme(e.target.value as SoftwareTheme)}
                  >
                    {THEME_OPTIONS.map((theme) => (
                      <option key={theme.value} value={theme.value}>{theme.label}</option>
                    ))}
                  </select>
                </div>
                <p className="session-notice">
                  {THEME_OPTIONS.find((theme) => theme.value === softwareTheme)?.description}
                </p>
              </div>
            </section>

            <section className="panel-card">
              <header className="panel-card__header">
                <h2>Quick Start</h2>
                <p>Compact first-use guidance. Collapse when not needed.</p>
              </header>

              <div className="panel-card__body">
                <details className="quick-start" open={helpPanelExpanded} onToggle={(event) => setHelpPanelExpanded(event.currentTarget.open)}>
                  <summary>{helpPanelExpanded ? "Hide help panel" : "Show help panel"}</summary>
                  <ul>
                    <li><strong>Typing search:</strong> Enter a reference and press Enter or click Search.</li>
                    <li><strong>Listening modes:</strong> Manual captures references for review; Auto presents high-confidence spoken references.</li>
                    <li><strong>Display modes:</strong> Toggle Fullscreen or Lower Third for projector/fullscreen output layout.</li>
                    <li><strong>Backgrounds:</strong> Choose solid dark or custom image with optional blur/dim for readability.</li>
                    <li><strong>Themes:</strong> Software themes style the operator console only, not projector scripture backgrounds.</li>
                  </ul>
                </details>
              </div>
            </section>

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
              <header className="panel-card__header"><h2>Recent History</h2><p>Newest successful scripture loads appear first.</p></header>
              <div className="panel-card__body">
                {history.length === 0 ? <p className="history-empty">No successful searches yet.</p> : (
                  <ul className="history-list">
                    {history.map((item, idx) => (
                      <li key={`${item.reference}-${idx}`}>
                        <button className="history-list__item" onClick={() => setReference(item.reference)}>
                          <span className="history-list__reference">{item.reference}</span>
                          <span className="history-list__meta">{item.repeats > 1 ? `Repeated ${item.repeats}x` : "Ready to search"}</span>
                          <span className="history-list__time">{new Date(item.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="panel-card">
              <header className="panel-card__header"><h2>Service Session Log</h2><p>Chronological verses presented this service with one-click quick recall.</p></header>
              <div className="panel-card__body session-log-body">
                <div className="session-log-actions session-log-actions--filters">
                  <button className="present-button present-button--secondary" type="button" onClick={() => void exportSessionLog("txt")}>Export TXT</button>
                  <button className="present-button present-button--secondary" type="button" onClick={() => void exportSessionLog("csv")}>Export CSV</button>
                </div>
                <div className="session-log-actions">
                  <button className={`present-button present-button--secondary ${sessionLogFilter === "all" ? "present-button--active" : ""}`} type="button" onClick={() => setSessionLogFilter("all")}>All</button>
                  <button className={`present-button present-button--secondary ${sessionLogFilter === "typed" ? "present-button--active" : ""}`} type="button" onClick={() => setSessionLogFilter("typed")}>Typed</button>
                  <button className={`present-button present-button--secondary ${sessionLogFilter === "spoken" ? "present-button--active" : ""}`} type="button" onClick={() => setSessionLogFilter("spoken")}>Spoken</button>
                </div>
                <div className="session-log-actions">
                  <button className="present-button present-button--secondary" type="button" onClick={() => void handleCopyCurrentReference()}>Copy Current Reference</button>
                  <button className="present-button present-button--secondary" type="button" onClick={handleClearSessionLog}>Clear Session Log</button>
                </div>
                {sessionNotice ? <p className="session-notice">{sessionNotice}</p> : null}

                {sessionLog.length === 0 ? <p className="history-empty">No verses presented in this session yet.</p> : filteredSessionLog.length === 0 ? <p className="history-empty">No {sessionLogFilter} entries in this session log yet.</p> : (
                  <ol className="session-log-list" aria-label="Service session log">
                    {filteredSessionLog.map((entry) => (
                      <li key={entry.id}>
                        <button className="history-list__item" onClick={() => void handleRecallSessionEntry(entry)}>
                          <span className="history-list__reference">{entry.reference}</span>
                          <span className="history-list__meta">Source: {entry.sourceType}</span>
                          <span className="history-list__time">{formatSessionTimestamp(entry.timestampMs)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>

          <div className="workspace-column">
            <section className="panel-card preview-card">
              <header className="panel-card__header"><h2>Verse Preview</h2><p>Large-format text for confidence monitor and projection checks.</p></header>
              <div className="panel-card__body">
                <div
                  className={`verse-preview-shell ${hasCustomPresentationBackground ? "verse-preview-shell--image" : ""}`}
                  data-background-received={String(hasCustomPresentationBackground)}
                  style={previewSurfaceStyle}
                >
                  {hasCustomPresentationBackground && blurBackgroundImage ? (
                    <div
                      className={`presentation-background verse-preview__background ${blurBackgroundImage ? "presentation-background--blur" : ""}`}
                      style={presentationBackgroundStyle}
                      aria-hidden="true"
                    />
                  ) : null}
                  <div
                    className="presentation-background__dim verse-preview__dim"
                    style={{ opacity: previewDimOpacity }}
                    aria-hidden="true"
                  />
                  <pre
                    className={`verse-preview ${result.found ? "" : "verse-preview--empty"}`}
                    style={{ fontFamily: getPresentationFontCssFamily(previewFontFamily), fontSize: `${previewFontSizePx}px` }}
                  >
                    {verseText}
                  </pre>
                </div>
              </div>
            </section>

            <section className="panel-card">
              <header className="panel-card__header"><h2>Presentation Background Debug</h2><p>Lightweight visibility into shared background propagation.</p></header>
              <div className="panel-card__body">
                <dl className="debug-grid">
                  <div><dt>Raw file path</dt><dd>{customBackgroundPath ?? "None selected"}</dd></div>
                  <div><dt>Renderable source</dt><dd>{customBackgroundSource ?? "Not available"}</dd></div>
                  <div><dt>Verse preview using custom image</dt><dd>{isVersePreviewUsingCustomImage ? "Yes" : "No"}</dd></div>
                  <div><dt>Projector using custom image</dt><dd>{isProjectorUsingCustomImage ? "Yes" : "No"}</dd></div>
                  <div><dt>Fullscreen using custom image</dt><dd>{isFullscreenUsingCustomImage ? "Yes" : "No"}</dd></div>
                </dl>
              </div>
            </section>

            <section className="panel-card">
              <header className="panel-card__header"><h2>Metadata</h2><p>Quick validation details for the currently loaded passage.</p></header>
              <div className="panel-card__body">
                <dl className="metadata-grid">
                  <div><dt>Reference</dt><dd>{result.reference}</dd></div>
                  <div><dt>Translation</dt><dd>{result.translation}</dd></div>
                  <div><dt>Theme</dt><dd>{result.theme}</dd></div>
                  <div><dt>Status</dt><dd>{result.found ? "Loaded" : "No Result"}</dd></div>
                </dl>
              </div>
            </section>

            <section className="panel-card">
              <header className="panel-card__header"><h2>Canonical Book Coverage</h2><p>Configured spoken-book dictionary for all supported KJV books.</p></header>
              <div className="panel-card__body"><p className="coverage-count">{CANONICAL_BOOK_DICTIONARY.length} books configured.</p></div>
            </section>
          </div>
        </div>
      </div>

      {isPresentationMode ? (
        <section
          className={`presentation-mode presentation-mode--${displayMode}`}
          aria-live="polite"
          style={fullscreenSurfaceStyle}
        >
          {presentationState.backgroundMode === "custom-image" && presentationState.customBackgroundSource && presentationState.blurBackgroundImage ? (
            <div
              className={`presentation-background ${presentationState.blurBackgroundImage ? "presentation-background--blur" : ""}`}
              style={presentationBackgroundStyle}
              aria-hidden="true"
            />
          ) : null}
          <div
            className="presentation-background__dim"
            style={{ opacity: fullscreenDimOpacity }}
            aria-hidden="true"
          />
          <button className="presentation-exit-button" onClick={() => void togglePresentationMode()}>Exit Fullscreen</button>
          <div className={`presentation-mode__content presentation-mode__content--${presentationState.displayMode} ${presentationState.useSafeMargins ? "presentation-mode__content--safe" : ""}`}>
            {presentationState.showReference ? (
              <p className={`presentation-mode__reference presentation-mode__reference--${presentationState.referencePlacement}`}>{presentationState.result.reference}</p>
            ) : null}
            <pre
              className={`presentation-mode__verse ${presentationState.result.found ? "" : "presentation-mode__verse--empty"}`}
              style={{
                fontFamily: getPresentationFontCssFamily(presentationState.projectionFontFamily),
                fontSize: `${presentationState.projectionFontSizePx}px`,
                lineHeight: presentationState.projectionLineHeight
              }}
            >
              {presentationState.verseText}
            </pre>
          </div>
        </section>
      ) : null}
    </>
  );
}
