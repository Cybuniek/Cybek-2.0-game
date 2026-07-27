import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { neuraComments } from './data/messages';
import type { NeuraVoiceLine } from './data/neuraVoiceLines';
import { chatAuthors, communicationMessage, groupPublishMessages, pawelDraftMessage } from './data/chatReactions';
import { tracks } from './data/tracks';
import { useSoundscape } from './audio/useSoundscape';
import { useRhythmSfx } from './audio/useRhythmSfx';
import {
  SESSION_BOOT_DURATION_MS,
  SESSION_BOOT_SKIP_AFTER_MS,
  useSessionController,
  type ActiveRun,
} from './controllers/useSessionController';
import { CybekWebcam, type CybekWebcamEvent } from './cybekWebcam';
import { DesktopGrid, DesktopGridItem, type DesktopGridPlacement } from './desktop/DesktopGrid.tsx';
import { DevMenu } from './dev/DevMenu.tsx';
import type { DevOperation } from './dev/devMenuDomain.ts';
import { NeuraPet } from './neura/NeuraPet';
import { appendNeuraPresenceEvent, createNeuraPresenceState } from './neura/NeuraPresenceManager.ts';
import { useEnvironmentalUiEvents } from './neura/useEnvironmentalUiEvents';
import {
  createDefaultNeuraVoiceDirectorState,
  createPresenceStateFromGameState,
  createVoiceQueueItemsFromEvent,
  getNextNeuraVoiceLine,
  markVoiceLinePlayed,
  renderNeuraVoiceDirectorDebug,
} from './neura/NeuraVoiceDirector';
import { loadNeuraVoiceDirectorState, saveNeuraVoiceDirectorState } from './neura/neuraVoiceDirectorStorage';
import {
  clearStorySceneDirectorState,
  completeStoryScene,
  createDefaultStorySceneDirectorState,
  getActiveStoryScene,
  loadStorySceneDirectorState,
  queueStoryScenesForPresenceLevel,
  queueStorySceneForTrigger,
  saveStorySceneDirectorState,
  type StorySceneDirectorState,
} from './neura/StorySceneDirector';
import type { StorySceneTrigger } from './data/dialogue/storyScenes';
import type { NeuraPresenceEventId as DialoguePresenceEventId } from './data/dialogue/dialogueTypes';
import { deriveMainStoryProgress } from './data/dialogue/mainStory';
import {
  addUnique,
  createRemixComparison,
  resultFromDraft,
  triggerEchoAfterPublish,
  upsertDraft,
  upsertPublished,
  type RemixComparison,
} from './gameFlow';
import {
  applyCommunicationAction,
  applyStatsDelta,
  advanceDaySummary,
  beginWork,
  canPublish,
  canStartWork,
  cancelWork,
  finishDay,
  getActionPreview,
  getDraftAge,
  getRhythmStatModifier,
  getStatBand,
  getDecisionDelta,
  type DayDecision,
} from './dayCycle';
import { updateEndingState } from './ending';
import { applyResonanceEffects, updateResonanceState } from './resonance';
import {
  createDraftFromResult,
  createPublishedTrack,
  defaultState,
  getNextDifficulty,
  getTitleReveal,
  improveDraftWithResult,
  loadState,
  maskTrackTitle,
  revealTitleByAccuracy,
  revealTitleFully,
  saveState,
  addMessage,
} from './storage';
import {
  addresses,
  appLabels,
  buttonLabels,
  comparisonLabels,
  iconLabels,
  iconSymbols,
  messengerTabs,
  placeholderLabels,
  statLabels,
  statusLabels,
  windowLabels,
} from './data/uiLabels';
import {
  createRhythmSession,
  estimateRhythmDurationMs,
  finishRhythmSession,
  getRhythmNoteKind,
  getRhythmNoteEndMs,
  getRhythmDifficultyConfig,
  getRhythmSummary,
  getVisibleRhythmNotes,
  holdRhythmLane,
  hitRhythmLane,
  releaseRhythmLane,
  resolveRhythmBeatmap,
  RHYTHM_HIT_LINE_PERCENT,
  RHYTHM_LANES,
  syncRhythmSessionToElapsed,
  type RhythmJudgement,
  type RhythmSession,
} from './rhythm';
import type {
  Difficulty,
  CommunicationAction,
  DraftTrack,
  GameState,
  NeuraPresenceEventId,
  NeuraPresenceEventLogEntry,
  OperationalPowerLevel,
  PerformanceResult,
  PublishedTrack,
  ResonanceVisualEffects,
  RhythmStatModifier,
  RhythmLane,
  RhythmSummary,
  Track,
} from './types';

type WindowId = 'messenger' | 'create' | 'me' | 'player' | 'event' | 'ustniki' | 'titleHub' | null;
type HiddenWindowId = 'lab' | 'archive' | 'broadcast';
type Point = { x: number; y: number };
type HitFeedback = {
  id: number;
  lane: RhythmLane;
  label: string;
  judgement: 'perfect' | 'great' | 'good' | 'miss';
};
type OverlayId =
  | 'webcam'
  | 'stats'
  | 'todo'
  | 'identity'
  | 'neuraDebug'
  | 'neuraEcho';

const BOOT_DURATION_MS = SESSION_BOOT_DURATION_MS;
const NEURA_COMMENT_INTERVAL_MS = 27500;
const NEURA_STORY_BEAT_INTERVAL_MS = 41000;
const NEURA_LOW_FX_STORAGE_KEY = 'ustnik.neura.lowFxMode';
const ENABLE_HIDDEN_WINDOWS = false;
const ENABLE_DEV_TOOLS = import.meta.env.DEV;
const DESKTOP_ICON_PLACEMENTS = {
  messenger: { x: 1, y: 1, width: 1, height: 1 },
  create: { x: 1, y: 2, width: 1, height: 1 },
  me: { x: 1, y: 3, width: 1, height: 1 },
  ustniki: { x: 1, y: 4, width: 1, height: 1 },
  titleHub: { x: 1, y: 5, width: 1, height: 1 },
  todo: { x: 1, y: 6, width: 1, height: 1 },
  devMenu: { x: 2, y: 1, width: 1, height: 1 },
  gridOverlay: { x: 2, y: 2, width: 1, height: 1 },
} satisfies Record<string, DesktopGridPlacement>;
const BOOT_STEPS = [
  'Sprawdzanie integralności systemu',
  'Inicjalizacja kernela',
  'Montowanie systemu plików',
  'Ładowanie sterowników',
  'Inicjalizacja urządzeń',
  'Konfiguracja sieci',
  'Uruchamianie usług systemowych',
  'Inicjalizacja interfejsu',
  'Ładowanie zasobów',
] as const;
const BOOT_LOGS = [
  'Kernel 6.666.0-cybek initialized',
  'CPU: CybekCore(TM) i9-9696K @ 4.20GHz',
  'RAM: 16.0 GB',
  'GPU: CybekVision 3070 Ti',
  'Time: 2025-05-25 21:37:00',
  'Witaj, USTNIK!',
] as const;
type RhythmPhase = 'loading' | 'countdown' | 'playing';

const BeatmapEditor = lazy(() => import('./editor/BeatmapEditor').then((module) => ({ default: module.BeatmapEditor })));
const CutsceneStage = lazy(() => import('./neura/cutscene/CutsceneStage').then((module) => ({ default: module.CutsceneStage })));

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => loadState());
  const shouldStartInEditor = window.location.hash === '#editor';
  const [activeWindow, setActiveWindow] = useState<WindowId>('messenger');
  const [activeHiddenWindow, setActiveHiddenWindow] = useState<HiddenWindowId | null>(null);
  const [messengerTab, setMessengerTab] = useState<'pawel' | 'group'>('pawel');
  const [neuraIndex, setNeuraIndex] = useState(0);
  const [corruptionTick, setCorruptionTick] = useState(0);
  const [selectedPublishedId, setSelectedPublishedId] = useState<string | null>(null);
  const [lastNeuraEventId, setLastNeuraEventId] = useState<NeuraPresenceEventId>('boot');
  const [neuraDebugOverride, setNeuraDebugOverride] = useState<OperationalPowerLevel | null>(null);
  const [neuraLowFxMode, setNeuraLowFxModeState] = useState(() => readStoredNeuraLowFxMode());
  const [neuraEventLog, setNeuraEventLog] = useState<NeuraPresenceEventLogEntry[]>(() => (
    [{ id: 'boot', at: new Date().toISOString() }]
  ));
  const [isNeuraDebugOpen, setIsNeuraDebugOpen] = useState(false);
  const [isDevMenuOpen, setIsDevMenuOpen] = useState(false);
  const [isDesktopGridVisible, setIsDesktopGridVisible] = useState(false);
  const [isDebugOverlayDragEnabled, setIsDebugOverlayDragEnabled] = useState(false);
  const [isTodoVisible, setIsTodoVisible] = useState(true);
  const [environmentEcho, setEnvironmentEcho] = useState<{ id: number; text: string } | null>(null);
  const [storyVoiceLineId, setStoryVoiceLineId] = useState<string | null>(null);
  const [lastDialogueEventId, setLastDialogueEventId] = useState<DialoguePresenceEventId | null>(null);
  const [neuraVoiceDirectorState, setNeuraVoiceDirectorState] = useState(() => loadNeuraVoiceDirectorState());
  const [neuraVoiceDirectorDebug, setNeuraVoiceDirectorDebug] = useState('');
  const neuraVoiceDirectorStateRef = useRef(neuraVoiceDirectorState);
  const didStartNeuraSessionRef = useRef(false);
  const [storySceneDirectorState, setStorySceneDirectorState] = useState(() => loadStorySceneDirectorState());
  const [storySceneLineIndex, setStorySceneLineIndex] = useState(0);
  const storySceneDirectorStateRef = useRef(storySceneDirectorState);
  const neuraPresence = useMemo(
    () => createNeuraPresenceState(gameState, {
      lastEventId: lastNeuraEventId,
      debugOverride: neuraDebugOverride,
      lowFxMode: neuraLowFxMode,
      eventLog: neuraEventLog,
    }),
    [gameState, lastNeuraEventId, neuraDebugOverride, neuraEventLog, neuraLowFxMode],
  );
  const soundscape = useSoundscape(neuraPresence);
  const activeStoryScene = useMemo(
    () => getActiveStoryScene(storySceneDirectorState),
    [storySceneDirectorState],
  );
  const mainStoryProgress = useMemo(
    () => deriveMainStoryProgress(gameState, storySceneDirectorState),
    [gameState, storySceneDirectorState],
  );
  const isStorySceneActive = activeStoryScene !== null;
  const [windowPositions, setWindowPositions] = useState<Record<Exclude<WindowId, null>, Point>>({
    messenger: { x: 170, y: 92 },
    create: { x: 210, y: 116 },
    me: { x: 250, y: 140 },
    player: { x: 300, y: 180 },
    event: { x: 340, y: 120 },
    ustniki: { x: 380, y: 152 },
    titleHub: { x: 420, y: 184 },
  });
  const [overlayPositions, setOverlayPositions] = useState<Record<OverlayId, Point>>({
    webcam: getDefaultWebcamPosition(),
    stats: { x: 1000, y: 280 },
    todo: { x: 180, y: 574 },
    identity: { x: 1000, y: 116 },
    neuraDebug: { x: 24, y: 96 },
    neuraEcho: { x: 820, y: 42 },
  });

  const recordNeuraPresenceEvent = useCallback((eventId: NeuraPresenceEventId) => {
    setLastNeuraEventId(eventId);
    setNeuraEventLog((log) => appendNeuraPresenceEvent(log, eventId));
  }, []);

  const setNeuraLowFxMode = useCallback((enabled: boolean) => {
    setNeuraLowFxModeState(enabled);
    try {
      window.localStorage.setItem(NEURA_LOW_FX_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // localStorage may be unavailable in strict browser privacy modes.
    }
    recordNeuraPresenceEvent('debugSetPower');
  }, [recordNeuraPresenceEvent]);

  const setNeuraOverride = useCallback((level: OperationalPowerLevel | null) => {
    setNeuraDebugOverride(level);
    recordNeuraPresenceEvent('debugSetPower');
  }, [recordNeuraPresenceEvent]);

  const updateStorySceneDirectorState = useCallback((updater: (state: StorySceneDirectorState) => StorySceneDirectorState) => {
    setStorySceneDirectorState((current) => {
      const next = updater(current);
      storySceneDirectorStateRef.current = next;
      return next;
    });
  }, []);

  const queueStoryScene = useCallback((trigger: StorySceneTrigger) => {
    updateStorySceneDirectorState((state) => queueStorySceneForTrigger(state, trigger).state);
  }, [updateStorySceneDirectorState]);

  const queuePresenceStoryScenes = useCallback((level: OperationalPowerLevel) => {
    updateStorySceneDirectorState((state) => queueStoryScenesForPresenceLevel(state, level).state);
  }, [updateStorySceneDirectorState]);

  const handleBootCompleted = useCallback(() => {
    queueStoryScene({ type: 'boot.firstCompleted' });
  }, [queueStoryScene]);

  const handleRunStarted = useCallback(() => {
    recordNeuraPresenceEvent('rhythmStarted');
  }, [recordNeuraPresenceEvent]);

  const handleRunFinished = useCallback((run: ActiveRun) => {
    recordNeuraPresenceEvent('rhythmFinished');
    queueStoryScene({ type: 'rhythm.firstFinished', trackId: run.track.id });
  }, [queueStoryScene, recordNeuraPresenceEvent]);

  const resetSessionDependencies = useCallback(() => {
    setGameState(defaultState);
    const resetDirectorState = createDefaultNeuraVoiceDirectorState();
    neuraVoiceDirectorStateRef.current = resetDirectorState;
    setNeuraVoiceDirectorState(resetDirectorState);
    const resetStorySceneDirectorState = createDefaultStorySceneDirectorState();
    storySceneDirectorStateRef.current = resetStorySceneDirectorState;
    setStorySceneDirectorState(resetStorySceneDirectorState);
    setStorySceneLineIndex(0);
    clearStorySceneDirectorState();
    setStoryVoiceLineId(null);
    setLastDialogueEventId(null);
    setNeuraVoiceDirectorDebug('');
    setActiveWindow('messenger');
    setActiveHiddenWindow(null);
    setSelectedPublishedId(null);
    setNeuraDebugOverride(null);
    setLastNeuraEventId('boot');
    setNeuraEventLog([{ id: 'boot', at: new Date().toISOString() }]);
  }, []);

  const {
    currentScreen: screen,
    bootTargetScreen,
    bootElapsedMs,
    activeRun,
    result,
    startSession,
    resetSession,
    goToScreen,
    completeBoot,
    advanceBoot,
    startRun,
    finishRun,
    returnToDesktop: clearSessionToDesktop,
  } = useSessionController({
    initialScreen: shouldStartInEditor ? 'editor' : 'desktop',
    onBootCompleted: handleBootCompleted,
    onRunStarted: handleRunStarted,
    onRunFinished: handleRunFinished,
    onReset: resetSessionDependencies,
  });

  const advanceStoryScene = useCallback(() => {
    const scene = getActiveStoryScene(storySceneDirectorStateRef.current);
    if (!scene) return;

    if (storySceneLineIndex < scene.lines.length - 1) {
      setStorySceneLineIndex((current) => Math.min(current + 1, scene.lines.length - 1));
      return;
    }

    updateStorySceneDirectorState((state) => completeStoryScene(state, scene.id));
    setStorySceneLineIndex(0);
  }, [storySceneLineIndex, updateStorySceneDirectorState]);

  const showEnvironmentalEcho = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setEnvironmentEcho({ id, text });
    window.setTimeout(() => {
      setEnvironmentEcho((current) => (current?.id === id ? null : current));
    }, 3400);
  }, []);

  const clearActiveCutscene = useCallback(() => {
    setGameState((current) => (
      current.echo.activeCutsceneId
        ? { ...current, echo: { ...current.echo, activeCutsceneId: null } }
        : current
    ));
  }, []);

  const triggerEnvironmentalGlitch = useCallback((intensity: number) => {
    soundscape.triggerGlitch({ reason: 'environment', intensity });
  }, [soundscape.triggerGlitch]);

  useEnvironmentalUiEvents<Exclude<WindowId, null>>({
    isDesktop: screen === 'desktop',
    presenceState: neuraPresence,
    echoState: gameState.echo,
    resonanceState: gameState.resonance,
    activeWindow,
    setWindowPositions,
    onEcho: showEnvironmentalEcho,
    onGlitch: triggerEnvironmentalGlitch,
  });

  useEffect(() => saveState(gameState), [gameState]);
  useEffect(() => saveNeuraVoiceDirectorState(neuraVoiceDirectorState), [neuraVoiceDirectorState]);
  useEffect(() => saveStorySceneDirectorState(storySceneDirectorState), [storySceneDirectorState]);
  useEffect(() => {
    neuraVoiceDirectorStateRef.current = neuraVoiceDirectorState;
  }, [neuraVoiceDirectorState]);
  useEffect(() => {
    storySceneDirectorStateRef.current = storySceneDirectorState;
  }, [storySceneDirectorState]);
  useEffect(() => {
    setStorySceneLineIndex(0);
  }, [activeStoryScene?.id]);
  useEffect(() => {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
  }, [screen]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNeuraIndex((current) => (current + 1) % neuraComments.length);
    }, NEURA_COMMENT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCorruptionTick((current) => current + 1);
    }, 170);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function handleDebugKey(event: KeyboardEvent) {
      if (event.key === 'F8' && ENABLE_DEV_TOOLS) {
        event.preventDefault();
        setIsDesktopGridVisible((current) => !current);
        return;
      }
      if (event.key === 'F9' && ENABLE_DEV_TOOLS) {
        event.preventDefault();
        setIsDevMenuOpen((current) => !current);
        return;
      }
      if (event.key !== 'F10') return;
      event.preventDefault();
      setIsNeuraDebugOpen((current) => !current);
      setIsDebugOverlayDragEnabled((current) => !current);
    }

    window.addEventListener('keydown', handleDebugKey);
    return () => window.removeEventListener('keydown', handleDebugKey);
  }, []);

  useEffect(() => {
    if (!ENABLE_HIDDEN_WINDOWS) {
      delete window.openHiddenWindow;
      return;
    }

    window.openHiddenWindow = (windowId: HiddenWindowId) => {
      setActiveHiddenWindow(windowId);
    };

    return () => {
      delete window.openHiddenWindow;
    };
  }, []);

  useEffect(() => {
    if (screen === 'title') {
      window.render_game_to_text = () =>
        JSON.stringify({
          screen: 'title',
          nextScreen: 'boot',
        });
      window.advanceTime = () => undefined;
      return;
    }

    if (screen === 'boot') {
      const bootProgress = getBootProgress(bootElapsedMs);
      window.render_game_to_text = () =>
        JSON.stringify({
          screen: 'boot',
          progress: bootProgress,
          visibleSteps: getVisibleBootSteps(bootProgress),
          canSkip: bootElapsedMs >= SESSION_BOOT_SKIP_AFTER_MS,
          nextScreen: bootTargetScreen,
        });
      window.advanceTime = advanceBoot;
      return;
    }

    if (screen === 'rhythm') return;

    window.render_game_to_text = () =>
      JSON.stringify({
        screen,
        activeWindow,
        activeRun: activeRun
          ? { track: activeRun.track.title, difficulty: activeRun.difficulty, mode: activeRun.mode }
          : null,
        result: result
          ? { track: result.trackTitle, accuracy: result.accuracy, grade: result.grade }
          : null,
        stats: gameState.stats,
        statBands: {
          performance: getStatBand(gameState.stats.performance),
          cybart: getStatBand(gameState.stats.cybart),
          chatPressure: getStatBand(gameState.stats.chatPressure),
        },
        dayCycle: gameState.dayCycle,
        drafts: gameState.drafts.map((draft) => ({
          track: draft.trackTitle,
          difficulty: draft.difficulty,
          status: draft.status,
          ageDays: getDraftAge(gameState.dayCycle.currentDay, draft),
        })),
        published: gameState.publishedTracks.map((track) => ({
          title: track.trackTitle,
          difficulty: track.difficulty,
          quality: track.quality,
        })),
        soundscape: {
          unlocked: soundscape.isUnlocked,
          muted: soundscape.isMuted,
          activeGlitches: soundscape.activeGlitchCount,
        },
        neuraPresence,
        echo: gameState.echo,
        resonance: gameState.resonance,
        ending: gameState.ending,
        neuraVoiceDirector: {
          activeStoryVoiceLineId: storyVoiceLineId,
          lastDialogueEventId,
          queue: neuraVoiceDirectorState.queue.map((item) => ({
            lineId: item.lineId,
            priority: item.priority,
            sourceEventId: item.sourceEventId,
          })),
          unlockedPacks: neuraVoiceDirectorState.unlockedPackIds,
          debug: neuraVoiceDirectorDebug,
        },
        storyScene: activeStoryScene
          ? {
              id: activeStoryScene.id,
              title: activeStoryScene.title,
              lineIndex: storySceneLineIndex,
              lineCount: activeStoryScene.lines.length,
              speaker: activeStoryScene.lines[storySceneLineIndex]?.speaker ?? null,
              queue: storySceneDirectorState.queue,
              completedSceneIds: storySceneDirectorState.completedSceneIds,
              completedCheckpointIds: storySceneDirectorState.completedCheckpointIds,
            }
          : {
              active: false,
              queue: storySceneDirectorState.queue,
              completedSceneIds: storySceneDirectorState.completedSceneIds,
              completedCheckpointIds: storySceneDirectorState.completedCheckpointIds,
            },
        mainStory: {
          currentBeatId: mainStoryProgress.currentBeat.id,
          actId: mainStoryProgress.currentBeat.actId,
          actLabel: mainStoryProgress.currentBeat.actLabel,
          title: mainStoryProgress.currentBeat.title,
          objective: mainStoryProgress.currentBeat.objective,
          completedBeatIds: mainStoryProgress.completedBeatIds,
          completedCount: mainStoryProgress.completedCount,
          totalCount: mainStoryProgress.totalCount,
          isComplete: mainStoryProgress.isComplete,
        },
      });
    window.advanceTime = () => undefined;
  }, [
    activeRun,
    activeWindow,
    activeStoryScene,
    advanceBoot,
    bootElapsedMs,
    gameState,
    lastDialogueEventId,
    mainStoryProgress,
    neuraPresence,
    neuraVoiceDirectorDebug,
    neuraVoiceDirectorState.queue,
    neuraVoiceDirectorState.unlockedPackIds,
    result,
    screen,
    soundscape.activeGlitchCount,
    soundscape.isMuted,
    soundscape.isUnlocked,
    storySceneDirectorState.completedCheckpointIds,
    storySceneDirectorState.completedSceneIds,
    storySceneDirectorState.queue,
    storySceneLineIndex,
    storyVoiceLineId,
  ]);

  const advanceNeuraVoiceDirector = useCallback((nextGameState: GameState, eventId?: DialoguePresenceEventId) => {
    const now = Date.now();
    const context = {
      gameState: nextGameState,
      presence: createPresenceStateFromGameState(nextGameState, {
        activeWindow,
        screen,
        lastPresenceEventId: eventId ?? lastDialogueEventId,
      }),
      now,
    };
    const queuedState = eventId
      ? createVoiceQueueItemsFromEvent(neuraVoiceDirectorStateRef.current, { eventId, context, now }).state
      : neuraVoiceDirectorStateRef.current;
    const next = getNextNeuraVoiceLine(queuedState, context);
    let nextDirectorState = next.state;

    if (next.line) {
      nextDirectorState = markVoiceLinePlayed(nextDirectorState, { lineId: next.line.id, playedAt: now });
      setStoryVoiceLineId(next.line.audio.id);
      if (next.line.effects?.triggerGlitch) soundscape.triggerGlitch({ reason: 'story', intensity: next.line.glitchIntensity });
    }

    if (eventId) setLastDialogueEventId(eventId);
    setNeuraVoiceDirectorDebug(renderNeuraVoiceDirectorDebug(nextDirectorState, context, next.rejections));
    neuraVoiceDirectorStateRef.current = nextDirectorState;
    setNeuraVoiceDirectorState(nextDirectorState);
  }, [activeWindow, lastDialogueEventId, screen, soundscape]);

  const runStoryAction = useCallback((eventId: DialoguePresenceEventId, nextGameState: GameState) => {
    advanceNeuraVoiceDirector(nextGameState, eventId);
  }, [advanceNeuraVoiceDirector]);

  const runAmbientStoryBeat = useCallback((nextGameState: GameState) => {
    advanceNeuraVoiceDirector(nextGameState);
  }, [advanceNeuraVoiceDirector]);

  useEffect(() => {
    if (didStartNeuraSessionRef.current) return;
    didStartNeuraSessionRef.current = true;
    runStoryAction('session.start', gameState);
  }, [gameState, runStoryAction]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (screen !== 'desktop') return;
      if (isStorySceneActive) return;
      runAmbientStoryBeat(gameState);
    }, NEURA_STORY_BEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [gameState, isStorySceneActive, runAmbientStoryBeat, screen]);

  useEffect(() => {
    queuePresenceStoryScenes(neuraPresence.powerLevel);
  }, [neuraPresence.powerLevel, queuePresenceStoryScenes]);

  const availableCreateTracks = useMemo(
    () => tracks.filter((track) => !gameState.createdTrackIds.includes(track.id)),
    [gameState.createdTrackIds],
  );

  const selectedPublished = gameState.publishedTracks.find((track) => track.id === selectedPublishedId) ?? null;
  const selectedPublishedTrack = selectedPublished
    ? tracks.find((track) => track.id === selectedPublished.trackId) ?? null
    : null;
  const activeRemixDraft = activeRun?.mode === 'remix' && activeRun.draftId
    ? gameState.drafts.find((draft) => draft.id === activeRun.draftId) ?? null
    : null;
  const resonanceEffects = gameState.resonance.effects;
  const rhythmStatModifier = useMemo(
    () => getRhythmStatModifier(gameState.stats),
    [gameState.stats.cybart, gameState.stats.chatPressure, gameState.stats.performance],
  );
  const desktopClassName = [
    'desktop',
    `resonance-${gameState.resonance.level}`,
    gameState.echo.activeCutsceneId ? 'echo-cutscene-active' : '',
  ].filter(Boolean).join(' ');
  const desktopStyle = {
    '--resonance-bloom-inner': `${Math.round(120 + resonanceEffects.bloom * 72)}px`,
    '--resonance-bloom-outer': `${Math.round(38 + resonanceEffects.bloom * 48)}px`,
    '--event-cutscene-bloom': `${Math.round(28 + resonanceEffects.bloom * 62)}px`,
    '--scanline-echo-opacity': String(0.62 + resonanceEffects.glitchIntensity * 0.26),
    '--event-glitch-opacity': String(0.16 + resonanceEffects.glitchIntensity * 0.38),
    '--echo-highlight-glow': `${Math.round(14 + resonanceEffects.uiHighlight * 32)}px`,
    '--echo-choice-glow': `${Math.round(12 + resonanceEffects.uiHighlight * 28)}px`,
  } as CSSProperties;

  function getDisplayTitle(trackId: string, title: string) {
    const isPublished = gameState.publishedTrackIds.includes(trackId);
    return maskTrackTitle(title, getTitleReveal(gameState.titleRevealByTrackId, trackId, isPublished), trackId, corruptionTick);
  }

  function recordDayCycleEvents(previousState: GameState, nextState: GameState) {
    const previousCommitmentStatuses = new Map(
      previousState.dayCycle.commitments.map((commitment) => [commitment.id, commitment.status]),
    );
    const missedCommitment = nextState.dayCycle.commitments.some((commitment) => (
      commitment.status === 'missed' && previousCommitmentStatuses.get(commitment.id) !== 'missed'
    ));
    const fulfilledCommitment = nextState.dayCycle.commitments.some((commitment) => (
      commitment.status === 'fulfilled' && previousCommitmentStatuses.get(commitment.id) !== 'fulfilled'
    ));
    const advancedToNewDay = nextState.dayCycle.currentDay > previousState.dayCycle.currentDay
      && nextState.dayCycle.phase === 'communication';

    if (advancedToNewDay || nextState.dayCycle.phase === 'complete') {
      recordNeuraPresenceEvent('dayAdvanced');
    }
    if (nextState.dayCycle.rejectedCount > previousState.dayCycle.rejectedCount) {
      recordNeuraPresenceEvent('draftRejected');
    }
    if (missedCommitment) {
      recordNeuraPresenceEvent('promiseMissed');
    }

    if (missedCommitment) {
      runStoryAction('commitment.missed', nextState);
    } else if (nextState.dayCycle.rejectedCount > previousState.dayCycle.rejectedCount) {
      runStoryAction('draft.rejected', nextState);
    } else if (advancedToNewDay) {
      runStoryAction('day.advanced', nextState);
    }

    if (fulfilledCommitment) {
      showEnvironmentalEcho('Obietnica domknięta. Czat zapamięta termin lepiej niż ulgę.');
    }
  }

  function commitDay(previousState: GameState, nextState: GameState, windowId: WindowId) {
    setGameState(nextState);
    recordDayCycleEvents(previousState, nextState);
    returnToDesktop(windowId);
  }

  function sendCommunication(action: CommunicationAction, trackId?: string) {
    if (gameState.dayCycle.phase !== 'communication') return;
    const nextDayState = applyCommunicationAction(gameState, action, trackId);
    if (nextDayState === gameState) return;

    const target = trackId
      ? gameState.drafts.find((draft) => draft.trackId === trackId)?.trackTitle
        ?? tracks.find((track) => track.id === trackId)?.title
      : undefined;
    const message = communicationMessage(action, gameState.dayCycle.currentDay, target);
    const nextState: GameState = {
      ...nextDayState,
      groupMessages: [...nextDayState.groupMessages, message],
    };
    setGameState(nextState);
    setMessengerTab('group');
    showEnvironmentalEcho(action === 'silence' ? 'Cisza też jest komunikatem.' : message.text);
  }

  function restForDay() {
    if (gameState.dayCycle.phase !== 'work') return;
    const withRest = {
      ...gameState,
      stats: applyStatsDelta(gameState.stats, getDecisionDelta('rest')),
    };
    const nextState = finishDay(withRest);
    commitDay(gameState, nextState, 'messenger');
  }

  function continueAfterDaySummary() {
    if (gameState.dayCycle.phase !== 'daySummary') return;
    const nextState = advanceDaySummary(gameState);
    setGameState(nextState);
    recordDayCycleEvents(gameState, nextState);
  }

  function startCreate(track: Track) {
    if (gameState.dayCycle.phase !== 'work' || !canStartWork(gameState.stats)) return;
    setGameState(beginWork(gameState));
    startRun(track, track.difficulties[0], 'create');
  }

  function startRemix(draft: DraftTrack) {
    const track = tracks.find((item) => item.id === draft.trackId);
    const nextDifficulty = getNextDifficulty(draft.trackId, draft.difficulty) ?? draft.difficulty;
    if (gameState.dayCycle.phase !== 'work' || !canStartWork(gameState.stats)) return;
    if (track) {
      setGameState(beginWork(gameState));
      startRun(track, nextDifficulty, 'remix', draft.id);
    }
  }

  function saveInitialDraft(status: DraftTrack['status']) {
    if (!result) return;
    const action: DayDecision = status === 'sentToPawel' ? 'sendToPawel' : 'saveDraft';
    const draft = createDraftFromResult(result, status, gameState.dayCycle.currentDay);
    const pawelMessages = status === 'sentToPawel'
      ? addMessage(
          gameState.pawelMessages,
          chatAuthors.cybek,
          pawelDraftMessage(
            result,
            maskTrackTitle(
              result.trackTitle,
              getTitleReveal(gameState.titleRevealByTrackId, result.trackId, gameState.publishedTrackIds.includes(result.trackId)),
              result.trackId,
              corruptionTick,
            ),
          ),
        )
      : gameState.pawelMessages;
    let nextState: GameState = {
      ...gameState,
      createdTrackIds: addUnique(gameState.createdTrackIds, result.trackId),
      titleRevealByTrackId: revealTitleByAccuracy(gameState.titleRevealByTrackId, result.trackId, result.accuracy),
      drafts: upsertDraft(gameState.drafts, draft),
      pawelMessages,
      stats: applyStatsDelta(gameState.stats, getDecisionDelta(action, result.grade, true)),
    };
    nextState = finishDay(nextState);

    runStoryAction(status === 'sentToPawel' ? 'draft.sentToPawel' : 'draft.saved', nextState);
    if (status === 'sentToPawel') {
      queueStoryScene({ type: 'share', channel: 'pawel', trackId: draft.trackId });
    }

    commitDay(gameState, nextState, status === 'sentToPawel' ? 'messenger' : 'me');
    recordNeuraPresenceEvent(status === 'sentToPawel' ? 'sentToPawel' : 'draftSaved');
    if (status === 'sentToPawel') setMessengerTab('pawel');
  }

  function overwriteDraft() {
    if (!result || !activeRun?.draftId) return;
    const current = gameState.drafts.find((draft) => draft.id === activeRun.draftId);
    if (!current) return;
    let nextState: GameState = {
      ...gameState,
      drafts: upsertDraft(gameState.drafts, improveDraftWithResult(current, result, gameState.dayCycle.currentDay)),
      titleRevealByTrackId: revealTitleByAccuracy(gameState.titleRevealByTrackId, result.trackId, result.accuracy),
      stats: applyStatsDelta(gameState.stats, getDecisionDelta('saveDraft', result.grade, true)),
    };
    nextState = finishDay(nextState);

    runStoryAction('draft.saved', nextState);
    queueStoryScene({ type: 'remix.firstOverwritten', trackId: result.trackId });
    commitDay(gameState, nextState, 'me');
    recordNeuraPresenceEvent('draftSaved');
  }

  function sendDraftToPawel(draft: DraftTrack) {
    if (gameState.dayCycle.phase !== 'work') return;
    const resultLike = resultFromDraft(draft);
    let nextState: GameState = {
      ...gameState,
      drafts: upsertDraft(gameState.drafts, { ...draft, status: 'sentToPawel', updatedAt: new Date().toISOString() }),
      titleRevealByTrackId: revealTitleByAccuracy(gameState.titleRevealByTrackId, draft.trackId, draft.bestAccuracy),
      pawelMessages: addMessage(
        gameState.pawelMessages,
        chatAuthors.cybek,
        pawelDraftMessage(
          draft,
          maskTrackTitle(
            draft.trackTitle,
            getTitleReveal(gameState.titleRevealByTrackId, draft.trackId, gameState.publishedTrackIds.includes(draft.trackId)),
            draft.trackId,
            corruptionTick,
          ),
        ),
      ),
      stats: applyStatsDelta(gameState.stats, getDecisionDelta('sendToPawel', resultLike.grade, false)),
    };
    nextState = finishDay(nextState);
    commitDay(gameState, nextState, 'messenger');
    runStoryAction('draft.sentToPawel', nextState);
    queueStoryScene({ type: 'share', channel: 'pawel', trackId: draft.trackId });
    recordNeuraPresenceEvent('sentToPawel');
    setMessengerTab('pawel');
  }

  function publishInitialResult() {
    if (!result || gameState.publishedTrackIds.includes(result.trackId)) return;
    publishDraft(createDraftFromResult(result, 'inDrawer', gameState.dayCycle.currentDay), true);
  }

  function publishDraft(draft: DraftTrack, includeWork = false) {
    if (gameState.publishedTrackIds.includes(draft.trackId) || !canPublish(gameState.stats)) return;

    const published = createPublishedTrack(
      draft,
      gameState.dayCycle.currentDay,
      gameState.dayCycle.lastPublicationDay,
    );
    let nextState: GameState = {
      ...gameState,
      createdTrackIds: addUnique(gameState.createdTrackIds, draft.trackId),
      titleRevealByTrackId: revealTitleFully(gameState.titleRevealByTrackId, draft.trackId),
      drafts: gameState.drafts.filter((item) => item.trackId !== draft.trackId),
      publishedTracks: upsertPublished(gameState.publishedTracks, published),
      publishedTrackIds: addUnique(gameState.publishedTrackIds, draft.trackId),
      groupMessages: [...gameState.groupMessages, ...groupPublishMessages(published)],
      stats: applyStatsDelta(gameState.stats, getDecisionDelta('publish', draft.bestGrade, includeWork)),
    };
    nextState = finishDay(nextState, {
      publishedTrackId: draft.trackId,
      publishedQuality: draft.bestGrade,
    });
    nextState = triggerEchoAfterPublish(nextState, published);
    nextState = updateResonanceState(nextState, draft.bestAccuracy);
    nextState = applyResonanceEffects(nextState);
    nextState = updateEndingState(nextState);

    runStoryAction('track.published', nextState);
    queueStoryScene({ type: 'share', channel: 'chat', trackId: draft.trackId });
    if (gameState.publishedTrackIds.length < tracks.length && nextState.publishedTrackIds.length >= tracks.length) {
      queueStoryScene({ type: 'final.ready' });
      runStoryAction('story.finalSceneUnlocked', nextState);
    }
    if (nextState.stats.chatPressure >= 35) runStoryAction('neura.glitchSpike', nextState);
    showEnvironmentalEcho(nextState.echo.lastPhrase ? `Echo: ${nextState.echo.lastPhrase}` : 'Echo publikacji wraca przez EVENTS');
    commitDay(gameState, nextState, 'messenger');
    recordNeuraPresenceEvent('published');
    setMessengerTab('group');
  }

  function discardInitialResult() {
    if (!result) return;
    let nextState: GameState = {
      ...gameState,
      stats: applyStatsDelta(gameState.stats, getDecisionDelta('discard', result.grade, true)),
      dayCycle: {
        ...gameState.dayCycle,
        rejectedCount: gameState.dayCycle.rejectedCount + 1,
      },
    };
    nextState = finishDay(nextState);
    commitDay(gameState, nextState, 'messenger');
  }

  function discardDraft(draft: DraftTrack) {
    if (gameState.dayCycle.phase !== 'work') return;
    let nextState: GameState = {
      ...gameState,
      drafts: gameState.drafts.filter((item) => item.id !== draft.id),
      stats: applyStatsDelta(gameState.stats, getDecisionDelta('discard', draft.bestGrade, false)),
      dayCycle: {
        ...gameState.dayCycle,
        rejectedCount: gameState.dayCycle.rejectedCount + 1,
      },
    };
    nextState = finishDay(nextState);
    commitDay(gameState, nextState, 'me');
  }

  function cancelPendingWork(windowId: WindowId) {
    setGameState(cancelWork(gameState));
    returnToDesktop(windowId);
  }

  function openPlayer(published: PublishedTrack) {
    setSelectedPublishedId(published.id);
    setActiveWindow('player');
  }

  function returnToDesktop(windowId: WindowId = activeWindow) {
    clearSessionToDesktop();
    setActiveWindow(windowId);
  }

  const applyDevOperation = useCallback((operation: DevOperation) => {
    if (!operation.success) return;
    const previousState = gameState;
    setGameState(operation.nextState);
    recordDayCycleEvents(previousState, operation.nextState);

    if (operation.events.includes('draft.saved')) {
      runStoryAction('draft.saved', operation.nextState);
      recordNeuraPresenceEvent('draftSaved');
    }
    if (operation.events.includes('draft.sentToPawel')) {
      runStoryAction('draft.sentToPawel', operation.nextState);
      recordNeuraPresenceEvent('sentToPawel');
    }
    if (operation.events.includes('draft.rejected')) {
      runStoryAction('draft.rejected', operation.nextState);
      recordNeuraPresenceEvent('draftRejected');
    }
    if (operation.events.includes('track.published')) {
      runStoryAction('track.published', operation.nextState);
      recordNeuraPresenceEvent('published');
    }
  }, [gameState, recordNeuraPresenceEvent, runStoryAction]);

  const triggerDevNeuraEvent = useCallback((eventId: NeuraPresenceEventId) => {
    recordNeuraPresenceEvent(eventId);
    runStoryAction(eventId as DialoguePresenceEventId, gameState);
  }, [gameState, recordNeuraPresenceEvent, runStoryAction]);

  const storySceneOverlay = activeStoryScene ? (
    <Suspense fallback={<SystemOverlayFallback label="Ładowanie cutscenki..." overlay />}>
      <CutsceneStage
        scene={activeStoryScene}
        lineIndex={storySceneLineIndex}
        onAdvance={advanceStoryScene}
        lowFx={neuraPresence.lowFxMode}
        glitchLevel={neuraPresence.glitchIntensity}
      />
    </Suspense>
  ) : null;

  if (screen === 'rhythm' && activeRun) {
    return (
      <>
        <RhythmScreen
          activeRun={activeRun}
          displayTitle={getDisplayTitle(activeRun.track.id, activeRun.track.title)}
          neuraComment={neuraComments[neuraIndex]}
          neuraPresence={neuraPresence}
          resonanceEffects={gameState.resonance.effects}
          statModifier={rhythmStatModifier}
          dayCycle={gameState.dayCycle}
          overlayDragEnabled={isDebugOverlayDragEnabled}
          overlayPositions={overlayPositions}
          onOverlayMove={(overlayId, position) => setOverlayPositions((state) => ({ ...state, [overlayId]: position }))}
          onNeuraPresenceEvent={recordNeuraPresenceEvent}
          onFinish={finishRun}
          onExit={() => returnToDesktop(activeRun.mode === 'create' ? 'create' : 'me')}
          storySceneActive={isStorySceneActive}
        />
        {storySceneOverlay}
      </>
    );
  }

  if (screen === 'title') {
    return (
      <>
        <TitleScreen onStart={startSession} />
        {storySceneOverlay}
      </>
    );
  }

  if (screen === 'boot') {
    return (
      <>
        <BootScreen elapsedMs={bootElapsedMs} onSkip={completeBoot} />
        {storySceneOverlay}
      </>
    );
  }

  if (screen === 'editor') {
    return (
      <>
        <Suspense fallback={<SystemOverlayFallback label="Ładowanie edytora..." />}>
          <BeatmapEditor onExit={() => {
            window.history.replaceState(null, '', window.location.pathname);
            goToScreen('desktop');
          }} />
        </Suspense>
        {storySceneOverlay}
      </>
    );
  }

  if (screen === 'results' && result && activeRun) {
    return (
      <>
        <ResultsScreen
          result={result}
          displayTitle={getDisplayTitle(result.trackId, result.trackTitle)}
          rhythmHint={result.rhythmStatModifier?.neuraHint ?? 'czysty kanał'}
          stats={gameState.stats}
          dayCycle={gameState.dayCycle}
          runMode={activeRun.mode}
          remixComparison={activeRemixDraft ? createRemixComparison(activeRemixDraft, result) : null}
          alreadyPublished={gameState.publishedTrackIds.includes(result.trackId)}
          canPublish={canPublish(gameState.stats)}
          neuraComment={neuraComments[neuraIndex]}
          neuraPresence={neuraPresence}
          overlayDragEnabled={isDebugOverlayDragEnabled}
          overlayPositions={overlayPositions}
          onOverlayMove={(overlayId, position) => setOverlayPositions((state) => ({ ...state, [overlayId]: position }))}
          onNeuraPresenceEvent={recordNeuraPresenceEvent}
          onSave={() => saveInitialDraft('inDrawer')}
          onSendToPawel={() => saveInitialDraft('sentToPawel')}
          onPublish={publishInitialResult}
          onDiscard={discardInitialResult}
          onOverwrite={overwriteDraft}
          onBack={() => cancelPendingWork(activeRun.mode === 'create' ? 'create' : 'me')}
          storySceneActive={isStorySceneActive}
        />
        {storySceneOverlay}
      </>
    );
  }

  return (
    <main className={desktopClassName} style={desktopStyle}>
      <div className="scanlines" />
      <header className="topbar">
        <strong>{appLabels.desktopTitle}</strong>
        <span>{appLabels.prototypeTitle}</span>
        <button onClick={() => {
          window.history.replaceState(null, '', '#editor');
          goToScreen('editor');
        }}>Strojenie rytmu</button>
        <button
          className={`audio-toggle ${soundscape.isMuted ? 'muted' : ''} ${soundscape.isUnlocked ? '' : 'waiting'}`}
          onClick={soundscape.toggleMuted}
          type="button"
        >
          Dźwięk: {soundscape.isMuted ? 'wył.' : 'wł.'}
        </button>
        <button onClick={resetSession}>{buttonLabels.resetSave}</button>
      </header>

      <DesktopGrid showOverlay={isDesktopGridVisible}>
        <DesktopIcon placement={DESKTOP_ICON_PLACEMENTS.messenger} label={iconLabels.messenger} symbol={iconSymbols.messenger} onClick={() => setActiveWindow('messenger')} />
        <DesktopIcon placement={DESKTOP_ICON_PLACEMENTS.create} label={iconLabels.create} symbol={iconSymbols.create} onClick={() => setActiveWindow('create')} />
        <DesktopIcon placement={DESKTOP_ICON_PLACEMENTS.me} label={iconLabels.me} symbol={iconSymbols.me} onClick={() => setActiveWindow('me')} />
        <DesktopIcon placement={DESKTOP_ICON_PLACEMENTS.ustniki} label={iconLabels.ustniki} symbol={iconSymbols.ustniki} onClick={() => setActiveWindow('ustniki')} />
        <DesktopIcon placement={DESKTOP_ICON_PLACEMENTS.titleHub} label={iconLabels.titleHub} symbol={iconSymbols.titleHub} onClick={() => setActiveWindow('titleHub')} />
        <DesktopIcon placement={DESKTOP_ICON_PLACEMENTS.todo} label={iconLabels.todo} symbol={iconSymbols.todo} onClick={() => setIsTodoVisible((current) => !current)} muted />
        {gameState.publishedTracks.map((published, index) => (
          <DesktopIcon
            key={published.id}
            placement={{ x: 1, y: 7 + index, width: 1, height: 1 }}
            label={`${iconLabels.publishedFilePrefix}: ${published.trackTitle}`}
            symbol={iconSymbols.publishedFile}
            onClick={() => openPlayer(published)}
          />
        ))}
        {ENABLE_DEV_TOOLS && (
          <>
            <DesktopIcon placement={DESKTOP_ICON_PLACEMENTS.devMenu} label="Dev Menu" symbol="DEV" onClick={() => setIsDevMenuOpen(true)} />
            <DesktopIcon
              placement={DESKTOP_ICON_PLACEMENTS.gridOverlay}
              label={isDesktopGridVisible ? 'Ukryj siatkę' : 'Pokaż siatkę'}
              symbol="16×9"
              onClick={() => setIsDesktopGridVisible((current) => !current)}
              muted={!isDesktopGridVisible}
            />
          </>
        )}
      </DesktopGrid>

      <DraggableOverlay
        className="system-identity"
        position={overlayPositions.identity}
        onMove={(position) => setOverlayPositions((state) => ({ ...state, identity: position }))}
        dragEnabled={isDebugOverlayDragEnabled}
        ariaLabel="Identyfikacja systemu"
      >
        <strong>Identyfikacja systemu</strong>
        <span>retro-future / osobowość Cybek OS</span>
        <span>sesja: Ustnik online</span>
      </DraggableOverlay>

      <DraggableOverlay
        className="stats-panel"
        position={overlayPositions.stats}
        onMove={(position) => setOverlayPositions((state) => ({ ...state, stats: position }))}
        dragEnabled={isDebugOverlayDragEnabled}
      >
        <StatsPanel stats={gameState.stats} dayCycle={gameState.dayCycle} />
      </DraggableOverlay>
      <PersistentOverlays
        comment={neuraComments[neuraIndex]}
        presenceState={neuraPresence}
        onPresenceEvent={recordNeuraPresenceEvent}
        storyVoiceLineId={storyVoiceLineId}
        webcamEvent="idle"
        dragEnabled={isDebugOverlayDragEnabled}
        webcamPosition={overlayPositions.webcam}
        onWebcamMove={(position) => setOverlayPositions((state) => ({ ...state, webcam: position }))}
        storySceneActive={isStorySceneActive}
      />
      {environmentEcho && (
        <DraggableOverlay
          className="neura-echo"
          position={overlayPositions.neuraEcho}
          onMove={(position) => setOverlayPositions((state) => ({ ...state, neuraEcho: position }))}
          dragEnabled={isDebugOverlayDragEnabled}
        >
          {environmentEcho.text}
        </DraggableOverlay>
      )}
      {gameState.echo.activeCutsceneId && (
        <EventCutsceneStage
          echo={gameState.echo}
          resonance={gameState.resonance}
          ending={gameState.ending}
          stats={gameState.stats}
          mainStoryComplete={mainStoryProgress.isComplete}
          onClose={clearActiveCutscene}
        />
      )}
      {isNeuraDebugOpen && (
        <DraggableOverlay
          className="neura-debug"
          position={overlayPositions.neuraDebug}
          onMove={(position) => setOverlayPositions((state) => ({ ...state, neuraDebug: position }))}
          dragEnabled={isDebugOverlayDragEnabled}
        >
          <NeuraDebugPanel
            presenceState={neuraPresence}
            activeGlitchCount={soundscape.activeGlitchCount}
            onSetOverride={setNeuraOverride}
            onToggleLowFx={() => setNeuraLowFxMode(!neuraPresence.lowFxMode)}
          />
        </DraggableOverlay>
      )}
      {ENABLE_DEV_TOOLS && isDevMenuOpen && (
        <DevMenu
          gameState={gameState}
          neuraPower={neuraPresence.powerLevel}
          onClose={() => setIsDevMenuOpen(false)}
          onApply={applyDevOperation}
          onTriggerNeura={triggerDevNeuraEvent}
          onSetNeuraPower={setNeuraOverride}
        />
      )}
      {storySceneOverlay}

      {isTodoVisible && (
        <DraggableOverlay
          className="todo-widget"
          position={overlayPositions.todo}
          onMove={(position) => setOverlayPositions((state) => ({ ...state, todo: position }))}
          dragEnabled={isDebugOverlayDragEnabled}
        >
          <strong>Plan Występu</strong>
          <span>{mainStoryProgress.currentBeat.actLabel}: {mainStoryProgress.currentBeat.title}</span>
          <span>{mainStoryProgress.currentBeat.objective}</span>
        </DraggableOverlay>
      )}

      <section className="core-loop-strip" aria-label="Ścieżka Występu">
        <strong>Ścieżka Występu:</strong>
        <span>twórz utwór</span>
        <i aria-hidden="true" />
        <span>test rytmiczny</span>
        <i aria-hidden="true" />
        <span>decyzja</span>
        <i aria-hidden="true" />
        <span>szuflada / publikacja / wersja do poprawy</span>
      </section>

      {activeWindow === 'messenger' && (
        <Window
          title={windowLabels.messenger}
          position={windowPositions.messenger}
          onMove={(position) => setWindowPositions((state) => ({ ...state, messenger: position }))}
          onClose={() => setActiveWindow(null)}
        >
          <MessengerWindow
            tab={messengerTab}
            onTabChange={setMessengerTab}
            pawelMessages={gameState.pawelMessages}
            groupMessages={gameState.groupMessages}
            dayCycle={gameState.dayCycle}
            stats={gameState.stats}
            drafts={gameState.drafts}
            availableTracks={availableCreateTracks}
            onCommunication={sendCommunication}
            onRest={restForDay}
            onAdvanceDay={continueAfterDaySummary}
          />
        </Window>
      )}

      {activeWindow === 'create' && (
        <Window
          title={windowLabels.create}
          address={addresses.create}
          position={windowPositions.create}
          onMove={(position) => setWindowPositions((state) => ({ ...state, create: position }))}
          onClose={() => setActiveWindow(null)}
        >
          <CreateWindow
            tracks={availableCreateTracks}
            titleRevealByTrackId={gameState.titleRevealByTrackId}
            publishedTrackIds={gameState.publishedTrackIds}
            corruptionTick={corruptionTick}
            onCreate={startCreate}
            canStart={gameState.dayCycle.phase === 'work' && canStartWork(gameState.stats)}
          />
        </Window>
      )}

      {activeWindow === 'me' && (
        <Window
          title={windowLabels.me}
          address={addresses.me}
          position={windowPositions.me}
          onMove={(position) => setWindowPositions((state) => ({ ...state, me: position }))}
          onClose={() => setActiveWindow(null)}
        >
          <MeWindow
            drafts={gameState.drafts}
            currentDay={gameState.dayCycle.currentDay}
            titleRevealByTrackId={gameState.titleRevealByTrackId}
            publishedTrackIds={gameState.publishedTrackIds}
            corruptionTick={corruptionTick}
            onRemix={startRemix}
            onSendToPawel={sendDraftToPawel}
            onPublish={publishDraft}
            onDiscard={discardDraft}
            canAct={gameState.dayCycle.phase === 'work'}
            canPublish={canPublish(gameState.stats)}
          />
        </Window>
      )}

      {activeWindow === 'player' && selectedPublished && (
        <Window
          title={windowLabels.player}
          position={windowPositions.player}
          onMove={(position) => setWindowPositions((state) => ({ ...state, player: position }))}
          onClose={() => setActiveWindow(null)}
        >
          <PlayerWindow
            published={selectedPublished}
            track={selectedPublishedTrack}
          />
        </Window>
      )}

      {activeWindow === 'ustniki' && (
        <Window
          title={windowLabels.ustniki}
          position={windowPositions.ustniki}
          onMove={(position) => setWindowPositions((state) => ({ ...state, ustniki: position }))}
          onClose={() => setActiveWindow(null)}
        >
          <UstnikiWindow gameState={gameState} />
        </Window>
      )}

      {activeWindow === 'titleHub' && (
        <Window
          title={windowLabels.titleHub}
          position={windowPositions.titleHub}
          onMove={(position) => setWindowPositions((state) => ({ ...state, titleHub: position }))}
          onClose={() => setActiveWindow(null)}
        >
          <TitleHubWindow onReboot={() => {
            setActiveWindow(null);
            goToScreen('title');
          }}
          />
        </Window>
      )}

      {ENABLE_HIDDEN_WINDOWS && activeHiddenWindow === 'lab' && (
        <Window title={windowLabels.hiddenLab} position={windowPositions.event} onMove={() => undefined} onClose={() => setActiveHiddenWindow(null)}>
          <HiddenWindowShell title={windowLabels.hiddenLab} />
        </Window>
      )}
      {ENABLE_HIDDEN_WINDOWS && activeHiddenWindow === 'archive' && (
        <Window title={windowLabels.hiddenArchive} position={windowPositions.ustniki} onMove={() => undefined} onClose={() => setActiveHiddenWindow(null)}>
          <HiddenWindowShell title={windowLabels.hiddenArchive} />
        </Window>
      )}
      {ENABLE_HIDDEN_WINDOWS && activeHiddenWindow === 'broadcast' && (
        <Window title={windowLabels.hiddenBroadcast} position={windowPositions.titleHub} onMove={() => undefined} onClose={() => setActiveHiddenWindow(null)}>
          <HiddenWindowShell title={windowLabels.hiddenBroadcast} />
        </Window>
      )}
    </main>
  );
}

function SystemOverlayFallback({ label, overlay = false }: { label: string; overlay?: boolean }) {
  return (
    <main className={overlay ? 'system-fallback system-fallback-overlay' : 'system-fallback'} aria-live="polite">
      <strong>Cybek OS</strong>
      <span>{label}</span>
    </main>
  );
}

function BootScreen({ elapsedMs, onSkip }: { elapsedMs: number; onSkip: () => void }) {
  const progress = getBootProgress(elapsedMs);
  const visibleSteps = getVisibleBootSteps(progress);
  const visibleLogs = getVisibleBootLogs(progress);
  const canSkip = elapsedMs >= SESSION_BOOT_SKIP_AFTER_MS;

  return (
    <main className="boot-screen" onClick={canSkip ? onSkip : undefined}>
      <div className="boot-scanlines" />
      <section className="boot-terminal" aria-label="Cybek OS boot">
        <h1>Cybek OS v0.7.0</h1>
        <p className="boot-subtitle">Inicjalizacja systemu...</p>

        <div className="boot-checklist">
          {BOOT_STEPS.map((step, index) => {
            const isVisible = index < visibleSteps;
            const isLoading = index === visibleSteps - 1 && progress < 100;
            return (
              <div className={isVisible ? 'boot-step visible' : 'boot-step'} key={step}>
                <span>{isLoading ? '[...]' : '[OK]'}</span>
                <strong>{step}</strong>
                {isLoading && (
                  <em>
                    <i style={{ '--boot-progress': `${Math.max(10, progress)}%` } as CSSProperties} />
                    {progress}%
                  </em>
                )}
              </div>
            );
          })}
        </div>

        <div className="boot-log">
          {BOOT_LOGS.slice(0, visibleLogs).map((line) => (
            <p key={line}>
              <span>&gt; [SYS]</span> {line}
            </p>
          ))}
        </div>

        <footer className="boot-footer">
          <strong>Cybek OS gotowy.</strong>
          <span>{progress >= 100 ? 'Wczytywanie pulpitu...' : canSkip ? 'Kliknij albo naciśnij klawisz, żeby pominąć...' : 'Wczytywanie pulpitu...'}</span>
        </footer>
      </section>

      <aside className="boot-brand" aria-hidden="true">
        <div className="boot-face">
          <span className="boot-hair" />
          <span className="boot-head">
            <i />
            <i />
            <b />
          </span>
        </div>
        <strong>CYBEK <span>OS</span></strong>
      </aside>
    </main>
  );
}

function getBootProgress(elapsedMs: number) {
  return Math.min(100, Math.round((elapsedMs / BOOT_DURATION_MS) * 100));
}

function getVisibleBootSteps(progress: number) {
  return Math.max(1, Math.min(BOOT_STEPS.length, Math.ceil((progress / 100) * BOOT_STEPS.length)));
}

function getVisibleBootLogs(progress: number) {
  return Math.max(0, Math.min(BOOT_LOGS.length, Math.floor(((progress - 42) / 58) * (BOOT_LOGS.length + 1))));
}

function DesktopIcon({
  placement,
  label,
  symbol,
  muted = false,
  onClick,
}: {
  placement: DesktopGridPlacement;
  label: string;
  symbol: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <DesktopGridItem placement={placement}>
      <button className={`desktop-icon ${muted ? 'muted' : ''}`} onClick={onClick} title={label}>
        <span>{symbol}</span>
        <small>{label}</small>
      </button>
    </DesktopGridItem>
  );
}

function TitleScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="boot-screen">
      <div className="boot-scanlines" />
      <section className="boot-terminal" aria-label="Cybek OS title">
        <h1>Cybek OS / title.sys</h1>
        <p className="boot-subtitle">{placeholderLabels.titleScreenSubtitle}</p>
        <div className="boot-log">
          <p><span>&gt; [SYS]</span> {placeholderLabels.titleScreenStatus}</p>
          <p><span>&gt; [SYS]</span> stan: repertuar, czat i Neura spięte w jedną sesję</p>
        </div>
        <footer className="boot-footer">
          <strong>Warstwa tytułowa aktywna.</strong>
          <button className="result-primary" onClick={onStart}>{placeholderLabels.titleScreenStart}</button>
        </footer>
      </section>
    </main>
  );
}

function DraggableOverlay({
  className,
  children,
  position,
  onMove,
  dragEnabled,
  ariaLabel,
}: {
  className: string;
  children: ReactNode;
  position: Point;
  onMove: (position: Point) => void;
  dragEnabled: boolean;
  ariaLabel?: string;
}) {
  const dragRef = useRef<{ startX: number; startY: number; origin: Point } | null>(null);

  function beginDrag(event: PointerEvent<HTMLElement>) {
    if (!dragEnabled) return;
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent<HTMLElement>) {
    if (!dragRef.current || !dragEnabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minX = 8;
    const minY = 8;
    const maxX = Math.max(minX, window.innerWidth - rect.width - 8);
    const maxY = Math.max(minY, window.innerHeight - rect.height - 8);
    onMove({
      x: Math.max(minX, Math.min(maxX, dragRef.current.origin.x + event.clientX - dragRef.current.startX)),
      y: Math.max(minY, Math.min(maxY, dragRef.current.origin.y + event.clientY - dragRef.current.startY)),
    });
  }

  function endDrag() {
    dragRef.current = null;
  }

  return (
    <aside
      className={`${className} overlay-draggable ${dragEnabled ? 'drag-enabled' : ''}`}
      aria-label={ariaLabel}
      style={{ left: position.x, top: position.y }}
      onPointerDown={beginDrag}
      onPointerMove={drag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {children}
    </aside>
  );
}

function Window({
  title,
  address,
  className,
  children,
  position,
  onMove,
  onClose,
}: {
  title: string;
  address?: string;
  className?: string;
  children: ReactNode;
  position: Point;
  onMove: (position: Point) => void;
  onClose?: () => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; origin: Point } | null>(null);

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).tagName === 'BUTTON') return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const windowElement = event.currentTarget.closest('.window');
    const windowRect = windowElement?.getBoundingClientRect();
    const windowWidth = windowRect?.width ?? 360;
    const windowHeight = windowRect?.height ?? 180;
    const minX = window.innerWidth > 540 ? 120 : 18;
    const maxX = Math.max(minX, window.innerWidth - windowWidth - 18);
    const maxY = Math.max(48, window.innerHeight - windowHeight - 18);
    const next = {
      x: Math.max(minX, Math.min(maxX, dragRef.current.origin.x + event.clientX - dragRef.current.startX)),
      y: Math.max(48, Math.min(maxY, dragRef.current.origin.y + event.clientY - dragRef.current.startY)),
    };
    onMove(next);
  }

  function endDrag() {
    dragRef.current = null;
  }

  return (
    <section className={className ? `window ${className}` : 'window'} style={{ left: position.x, top: position.y }}>
      <div className="window-title" onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag}>
        <strong>{title}</strong>
        {onClose && <button onClick={onClose}>{buttonLabels.close}</button>}
      </div>
      {address && <div className="address">{address}</div>}
      <div className="window-body">{children}</div>
    </section>
  );
}

function MessengerWindow({
  tab,
  onTabChange,
  pawelMessages,
  groupMessages,
  dayCycle,
  stats,
  drafts,
  availableTracks,
  onCommunication,
  onRest,
  onAdvanceDay,
}: {
  tab: 'pawel' | 'group';
  onTabChange: (tab: 'pawel' | 'group') => void;
  pawelMessages: GameState['pawelMessages'];
  groupMessages: GameState['groupMessages'];
  dayCycle: GameState['dayCycle'];
  stats: GameState['stats'];
  drafts: DraftTrack[];
  availableTracks: Track[];
  onCommunication: (action: CommunicationAction, trackId?: string) => void;
  onRest: () => void;
  onAdvanceDay: () => void;
}) {
  const messages = tab === 'pawel' ? pawelMessages : groupMessages;
  const targetOptions = [
    ...drafts.map((draft) => ({ id: draft.trackId, title: draft.trackTitle })),
    ...availableTracks.map((track) => ({ id: track.id, title: track.title })),
  ].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const promiseTargetId = targetOptions.some((item) => item.id === selectedTargetId)
    ? selectedTargetId
    : targetOptions[0]?.id;
  const phaseLabel = {
    communication: 'komunikacja',
    work: 'praca',
    result: 'raport z próby',
    daySummary: 'podsumowanie dnia',
    complete: 'sesja domknięta',
  }[dayCycle.phase];
  const actionTitle = (action: CommunicationAction) => {
    const preview = getActionPreview({ stats, dayCycle }, action);
    return `${formatStatDelta(preview.delta)}${preview.warnings.length > 0 ? ` / ${preview.warnings[0]}` : ''}`;
  };

  return (
    <>
      <section className="day-cycle-panel" aria-label="Pętla dnia">
        <strong>Dzień {dayCycle.currentDay}/{dayCycle.totalDays}</strong>
        <span>faza: {phaseLabel}</span>
        {dayCycle.lastDaySummary && (
          <em>
            ostatni dzień: presja {formatSigned(dayCycle.lastDaySummary.pressureDelta)},
            Występ {formatSigned(dayCycle.lastDaySummary.performanceDelta)}
          </em>
        )}
        {dayCycle.commitments.filter((commitment) => commitment.status === 'active').map((commitment) => (
          <em key={commitment.id}>
            zobowiązanie: publikacja do dnia {commitment.dueDay}
          </em>
        ))}
        {dayCycle.phase === 'communication' && (
          <div className="day-actions">
            <strong>Wyślij jeden komunikat</strong>
            <div className="day-action-row">
              <button title={actionTitle('silence')} onClick={() => onCommunication('silence')}>Cisza</button>
              <button title={actionTitle('status')} onClick={() => onCommunication('status')}>Status</button>
              <button title={actionTitle('teaser')} onClick={() => onCommunication('teaser')}>Teaser</button>
              <button title={actionTitle('break')} onClick={() => onCommunication('break')}>Przerwa</button>
              <button title={actionTitle('live')} onClick={() => onCommunication('live')}>Live</button>
            </div>
            <label>
              Cel obietnicy
              <select value={promiseTargetId ?? ''} onChange={(event) => setSelectedTargetId(event.target.value)}>
                {targetOptions.length === 0 && <option value="">brak utworu</option>}
                {targetOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
            <button
              title={actionTitle('promise')}
              disabled={!promiseTargetId}
              onClick={() => promiseTargetId && onCommunication('promise', promiseTargetId)}
            >
              Obietnica publikacji
            </button>
          </div>
        )}
        {dayCycle.phase === 'work' && (
          <div className="day-actions">
            <strong>Wybierz pracę w tym dniu albo odpocznij.</strong>
            <button onClick={onRest}>Odpocznij i zamknij dzień</button>
          </div>
        )}
        {dayCycle.phase === 'daySummary' && (
          <div className="day-actions">
            <strong>Podsumowanie dnia {dayCycle.lastDaySummary?.day ?? dayCycle.currentDay}</strong>
            {dayCycle.lastDaySummary && (
              <em>
                Występ {formatSigned(dayCycle.lastDaySummary.performanceDelta)},
                Cybart.exe {formatSigned(dayCycle.lastDaySummary.cybartDelta)},
                Presja {formatSigned(dayCycle.lastDaySummary.pressureDelta)}.
                {dayCycle.lastDaySummary.missedCommitments > 0
                  ? ` Niespełnione zobowiązania: ${dayCycle.lastDaySummary.missedCommitments}.`
                  : ''}
              </em>
            )}
            <button onClick={onAdvanceDay}>
              {dayCycle.currentDay >= dayCycle.totalDays
                ? 'Zamknij 14-dniową sesję'
                : `Rozpocznij dzień ${dayCycle.currentDay + 1}`}
            </button>
          </div>
        )}
        {dayCycle.phase === 'complete' && <strong>14 dni zapisane w archiwum.</strong>}
      </section>
      <div className="tabs">
        <button className={tab === 'pawel' ? 'active' : ''} onClick={() => onTabChange('pawel')}>
          {messengerTabs.pawel}
        </button>
        <button className={tab === 'group' ? 'active' : ''} onClick={() => onTabChange('group')}>
          {messengerTabs.group}
        </button>
      </div>
      <div className="chat-log">
        {messages.map((message, index) => (
          <p key={`${message.author}-${index}`}>
            <strong>{message.author}:</strong> {message.text}
          </p>
        ))}
      </div>
    </>
  );
}

function CreateWindow({
  tracks: createTracks,
  titleRevealByTrackId,
  publishedTrackIds,
  corruptionTick,
  onCreate,
  canStart,
}: {
  tracks: Track[];
  titleRevealByTrackId: GameState['titleRevealByTrackId'];
  publishedTrackIds: string[];
  corruptionTick: number;
  onCreate: (track: Track) => void;
  canStart: boolean;
}) {
  if (createTracks.length === 0) return <p className="empty">{placeholderLabels.noCreateTracks}</p>;

  return (
    <div className="track-list">
      {createTracks.map((track) => {
        const displayTitle = maskTrackTitle(
          track.title,
          getTitleReveal(titleRevealByTrackId, track.id, publishedTrackIds.includes(track.id)),
          track.id,
          corruptionTick,
        );
        return (
          <article className="track-row" key={track.id}>
            <div>
              <strong className="masked-title">{displayTitle}</strong>
              <span>{track.artist} / {track.bpm} BPM / {track.mood}</span>
              <em>{placeholderLabels.level}: {track.difficulties[0]}</em>
            </div>
            <button disabled={!canStart} onClick={() => onCreate(track)}>
              {canStart ? buttonLabels.createFirstVersion : 'Najpierw komunikacja / odpoczynek'}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function MeWindow({
  drafts,
  currentDay,
  titleRevealByTrackId,
  publishedTrackIds,
  corruptionTick,
  onRemix,
  onSendToPawel,
  onPublish,
  onDiscard,
  canAct,
  canPublish: canPublishAction,
}: {
  drafts: DraftTrack[];
  currentDay: number;
  titleRevealByTrackId: GameState['titleRevealByTrackId'];
  publishedTrackIds: string[];
  corruptionTick: number;
  onRemix: (draft: DraftTrack) => void;
  onSendToPawel: (draft: DraftTrack) => void;
  onPublish: (draft: DraftTrack) => void;
  onDiscard: (draft: DraftTrack) => void;
  canAct: boolean;
  canPublish: boolean;
}) {
  if (drafts.length === 0) return <p className="empty">{placeholderLabels.noDrafts}</p>;

  return (
    <div className="track-list">
      {drafts.map((draft) => {
        const nextDifficulty = getNextDifficulty(draft.trackId, draft.difficulty);
        const displayTitle = maskTrackTitle(
          draft.trackTitle,
          getTitleReveal(titleRevealByTrackId, draft.trackId, publishedTrackIds.includes(draft.trackId)),
          draft.trackId,
          corruptionTick,
        );
        return (
          <article className="track-row" key={draft.id}>
            <div>
              <strong className="masked-title">{displayTitle}</strong>
              <span>{draft.difficulty} / {draft.bestAccuracy}% / {placeholderLabels.grade} {draft.bestGrade} / {draft.qualityProgress} pkt / wiek {getDraftAge(currentDay, draft)} dni</span>
              <em>Status: {statusLabels[draft.status]}</em>
              {!nextDifficulty && <em>Powtarzanie poziomu Cybart z malejącym zyskiem</em>}
            </div>
            <div className="difficulty-row">
              <button disabled={!canAct} onClick={() => onRemix(draft)}>
                {nextDifficulty ? `${buttonLabels.remix}: ${nextDifficulty}` : `${buttonLabels.remix}: Cybart`}
              </button>
              {draft.status === 'inDrawer' && (
                <button disabled={!canAct} onClick={() => onSendToPawel(draft)}>{buttonLabels.sendToPawel}</button>
              )}
              <button disabled={!canAct || !canPublishAction || publishedTrackIds.includes(draft.trackId)} onClick={() => onPublish(draft)}>
                {publishedTrackIds.includes(draft.trackId) ? placeholderLabels.publishedLocked : buttonLabels.publish}
              </button>
              <button disabled={!canAct} onClick={() => onDiscard(draft)}>{buttonLabels.discardDraft}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function didStartHoldLoop(previousSession: RhythmSession, nextSession: RhythmSession, lane: RhythmLane): boolean {
  return nextSession.notes.some((note, index) => (
    note.lane === lane
    && getRhythmNoteKind(note) === 'hold'
    && note.startedAtMs !== undefined
    && !note.judged
    && previousSession.notes[index]?.startedAtMs === undefined
  ));
}

function fadeExpiredHoldOverlays(
  previousSession: RhythmSession,
  nextSession: RhythmSession,
  heldLanes: Set<RhythmLane>,
  fadeOverlay: (lane: RhythmLane) => void,
) {
  previousSession.notes.forEach((note) => {
    if (
      note.startedAtMs === undefined
      || note.judged
      || getRhythmNoteKind(note) !== 'hold'
      || !heldLanes.has(note.lane)
    ) {
      return;
    }

    if (previousSession.elapsedMs < getRhythmNoteEndMs(note) && nextSession.elapsedMs >= getRhythmNoteEndMs(note)) {
      fadeOverlay(note.lane);
    }
  });
}

function RhythmScreen({
  activeRun,
  displayTitle,
  neuraComment,
  neuraPresence,
  resonanceEffects,
  statModifier,
  dayCycle,
  overlayDragEnabled,
  overlayPositions,
  onOverlayMove,
  onNeuraPresenceEvent,
  onFinish,
  onExit,
  storySceneActive,
}: {
  activeRun: ActiveRun;
  displayTitle: string;
  neuraComment: NeuraVoiceLine;
  neuraPresence: ReturnType<typeof createNeuraPresenceState>;
  resonanceEffects: ResonanceVisualEffects;
  statModifier: RhythmStatModifier;
  dayCycle: GameState['dayCycle'];
  overlayDragEnabled: boolean;
  overlayPositions: Record<OverlayId, Point>;
  onOverlayMove: (overlayId: OverlayId, position: Point) => void;
  onNeuraPresenceEvent: (eventId: NeuraPresenceEventId) => void;
  onFinish: (summary: RhythmSummary) => void;
  onExit: () => void;
  storySceneActive: boolean;
}) {
  const initialDurationMs = estimateRhythmDurationMs(activeRun.track);
  const [audioDurationMs, setAudioDurationMs] = useState(initialDurationMs);
  const [phase, setPhase] = useState<RhythmPhase>(() => (activeRun.track.audio?.instrumental ? 'loading' : 'countdown'));
  const [countdownMs, setCountdownMs] = useState(3000);
  const [debugMode, setDebugMode] = useState<'panel' | 'window' | null>(null);
  const beatmap = useMemo(
    () => resolveRhythmBeatmap(activeRun.track, activeRun.difficulty, audioDurationMs),
    [activeRun.difficulty, activeRun.track, audioDurationMs],
  );
  const [session, setSession] = useState<RhythmSession>(() => createRhythmSession(beatmap, activeRun.difficulty, statModifier));
  const [vocalPeaks, setVocalPeaks] = useState<number[]>(() => createFallbackPeaks(beatmap.bpm));
  const [hitFeedbacks, setHitFeedbacks] = useState<HitFeedback[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(session);
  const heldLanesRef = useRef<Set<RhythmLane>>(new Set());
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const phaseRef = useRef<RhythmPhase>(phase);
  const countdownRef = useRef(countdownMs);
  const gameClockFallbackMsRef = useRef(0);
  const rhythmSfx = useRhythmSfx();
  const visibleNotes = getVisibleRhythmNotes(session);
  const summary = getRhythmSummary(session, resonanceEffects);
  const remainingSeconds = Math.max(0, Math.ceil((session.beatmap.durationMs - session.elapsedMs) / 1000));
  const vocalAudioSource = activeRun.track.audio?.vocals;
  const instrumentalAudioSource = activeRun.track.audio?.instrumental;
  const densityConfig = getRhythmDifficultyConfig(activeRun.difficulty);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    countdownRef.current = countdownMs;
  }, [countdownMs]);

  useEffect(() => {
    const nextSession = createRhythmSession(beatmap, activeRun.difficulty, statModifier);
    sessionRef.current = nextSession;
    finishedRef.current = false;
    setSession(nextSession);
    setVocalPeaks(createFallbackPeaks(beatmap.bpm));
    setHitFeedbacks([]);
    heldLanesRef.current.clear();
    rhythmSfx.stopAllHolds();
    gameClockFallbackMsRef.current = 0;
  }, [activeRun.difficulty, beatmap, rhythmSfx, statModifier]);

  useEffect(() => {
    setAudioDurationMs(estimateRhythmDurationMs(activeRun.track));
    setPhase(instrumentalAudioSource ? 'loading' : 'countdown');
    setCountdownMs(3000);
  }, [activeRun.track, instrumentalAudioSource]);

  useEffect(() => {
    if (!instrumentalAudioSource || phase !== 'loading') return;

    const id = window.setTimeout(() => {
      setPhase('countdown');
    }, 1500);

    return () => window.clearTimeout(id);
  }, [instrumentalAudioSource, phase]);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!vocalAudioSource) {
      setVocalPeaks(createFallbackPeaks(beatmap.bpm));
      return;
    }

    let cancelled = false;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      setVocalPeaks(createFallbackPeaks(beatmap.bpm));
      return;
    }
    const audioContext = new AudioContextCtor();

    fetch(vocalAudioSource)
      .then((response) => {
        if (!response.ok) throw new Error('Nie udało się pobrać wokalu.');
        return response.arrayBuffer();
      })
      .then((buffer) => audioContext.decodeAudioData(buffer))
      .then((decoded) => {
        if (!cancelled) setVocalPeaks(buildVocalPeaks(decoded));
      })
      .catch(() => {
        if (!cancelled) setVocalPeaks(createFallbackPeaks(beatmap.bpm));
      })
      .finally(() => {
        void audioContext.close();
      });

    return () => {
      cancelled = true;
    };
  }, [beatmap.bpm, vocalAudioSource]);

  const completeRun = useCallback((sessionToFinish: RhythmSession) => {
    if (finishedRef.current) return;

    rhythmSfx.stopAllHolds();
    const finalSession = finishRhythmSession(sessionToFinish);
    sessionRef.current = finalSession;
    finishedRef.current = true;
    setSession(finalSession);
    onFinishRef.current(getRhythmSummary(finalSession, resonanceEffects));
  }, [resonanceEffects, rhythmSfx]);

  const syncToElapsed = useCallback((elapsedMs: number) => {
    if (finishedRef.current) return;

    const previousSession = sessionRef.current;
    let nextSession = syncRhythmSessionToElapsed(previousSession, elapsedMs);
    heldLanesRef.current.forEach((lane) => {
      const beforeHold = nextSession;
      nextSession = holdRhythmLane(nextSession, lane);
      if (didStartHoldLoop(beforeHold, nextSession, lane)) {
        rhythmSfx.startHold(lane);
      }
    });
    fadeExpiredHoldOverlays(previousSession, nextSession, heldLanesRef.current, rhythmSfx.fadeOverlay);
    sessionRef.current = nextSession;
    setSession(nextSession);

    if (nextSession.isFinished) {
      window.setTimeout(() => completeRun(nextSession), 0);
    }
  }, [completeRun, rhythmSfx]);

  const startPlayback = useCallback(() => {
    if (finishedRef.current || phaseRef.current === 'playing') return;

    phaseRef.current = 'playing';
    setPhase('playing');
    gameClockFallbackMsRef.current = 0;
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = (sessionRef.current.beatmap.sourceStartMs ?? 0) / 1000;
      audio.play().catch(() => undefined);
    }
    syncToElapsed(0);
  }, [syncToElapsed]);

  const stepByMs = useCallback((ms: number) => {
    if (finishedRef.current) return;

    if (phaseRef.current === 'countdown') {
      const nextCountdown = Math.max(0, countdownRef.current - Math.max(0, ms));
      countdownRef.current = nextCountdown;
      setCountdownMs(nextCountdown);
      if (nextCountdown <= 0) startPlayback();
      return;
    }

    if (phaseRef.current !== 'playing') return;

    gameClockFallbackMsRef.current += Math.max(0, ms);
    const audio = audioRef.current;
    const currentBeatmap = sessionRef.current.beatmap;
    const sourceStartMs = currentBeatmap.sourceStartMs ?? 0;
    const sourceEndMs = currentBeatmap.sourceEndMs ?? sourceStartMs + currentBeatmap.durationMs;
    if (audio && !audio.paused && audio.currentTime * 1000 >= sourceEndMs) {
      audio.pause();
      syncToElapsed(currentBeatmap.durationMs);
      return;
    }

    const clockElapsedMs = audio && !audio.paused
      ? Math.max(0, audio.currentTime * 1000 - sourceStartMs)
      : gameClockFallbackMsRef.current;
    gameClockFallbackMsRef.current = Math.max(gameClockFallbackMsRef.current, clockElapsedMs);
    syncToElapsed(Math.max(sessionRef.current.elapsedMs, clockElapsedMs));
  }, [startPlayback, syncToElapsed]);

  const showHitFeedback = useCallback((nextSession: RhythmSession) => {
    const judgement = nextSession.lastJudgement;
    const lane = nextSession.lastLane;
    if (!lane || !judgement || !['perfect', 'great', 'good', 'miss'].includes(judgement)) return;

    const activeHold = nextSession.notes.some((note) =>
      note.lane === lane
      && !note.judged
      && note.startedAtMs !== undefined
      && getRhythmNoteKind(note) === 'hold'
    );
    const feedback: HitFeedback = {
      id: Date.now() + Math.random(),
      lane,
      label: activeHold && judgement === 'good' ? 'Trzymaj' : judgementLabel(judgement),
      judgement: judgement as HitFeedback['judgement'],
    };

    setHitFeedbacks((items) => [...items.slice(-7), feedback]);
    window.setTimeout(() => {
      setHitFeedbacks((items) => items.filter((item) => item.id !== feedback.id));
    }, 520);
  }, []);

  const pressLane = useCallback((lane: RhythmLane) => {
    if (finishedRef.current || phaseRef.current !== 'playing') return;

    heldLanesRef.current.add(lane);
    const previousSession = sessionRef.current;
    const nextSession = hitRhythmLane(previousSession, lane);
    sessionRef.current = nextSession;
    setSession(nextSession);
    if (didStartHoldLoop(previousSession, nextSession, lane)) {
      rhythmSfx.startHold(lane);
    } else {
      rhythmSfx.playTap();
    }
    showHitFeedback(nextSession);
  }, [rhythmSfx, showHitFeedback]);

  const releaseLane = useCallback((lane: RhythmLane) => {
    if (finishedRef.current || phaseRef.current !== 'playing') return;

    heldLanesRef.current.delete(lane);
    rhythmSfx.stopHold(lane);
    const nextSession = releaseRhythmLane(sessionRef.current, lane);
    sessionRef.current = nextSession;
    setSession(nextSession);
    showHitFeedback(nextSession);
  }, [rhythmSfx, showHitFeedback]);

  const pressPointerLane = useCallback((event: PointerEvent<HTMLDivElement>, lane: RhythmLane) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pressLane(lane);
  }, [pressLane]);

  const releasePointerLane = useCallback((event: PointerEvent<HTMLDivElement>, lane: RhythmLane) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    releaseLane(lane);
  }, [releaseLane]);

  useEffect(() => {
    let frameId = 0;
    let lastFrame = performance.now();

    function tick(now: number) {
      stepByMs(Math.min(80, now - lastFrame));
      lastFrame = now;
      if (!finishedRef.current) frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [stepByMs]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'F8') {
        event.preventDefault();
        setDebugMode((current) => (current === 'panel' ? null : 'panel'));
        return;
      }

      if (event.key === 'F9') {
        event.preventDefault();
        setDebugMode((current) => (current === 'window' ? null : 'window'));
        return;
      }

      if (event.repeat) return;

      const lane = keyToLane(event.key);
      if (!lane) return;

      event.preventDefault();
      pressLane(lane);
    }

    function handleKeyUp(event: KeyboardEvent) {
      const lane = keyToLane(event.key);
      if (!lane) return;

      event.preventDefault();
      releaseLane(lane);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pressLane, releaseLane]);

  useEffect(() => {
    window.render_game_to_text = () => {
      const currentSession = sessionRef.current;
      const currentSummary = getRhythmSummary(currentSession, resonanceEffects);
      const currentVisibleNotes = getVisibleRhythmNotes(currentSession);

      return JSON.stringify({
        screen: 'rhythm',
        coordinateSystem: 'Nuty spadają w dół do linii trafienia. Długie nuty: yPercent to głowa/start/kolizja, visualTopPercent to ogon/end nad głową.',
        activeRun: {
          track: activeRun.track.title,
          difficulty: activeRun.difficulty,
          mode: activeRun.mode,
        },
        dayCycle,
        bpm: currentSession.beatmap.bpm,
        phase: phaseRef.current,
        countdownMs: Math.round(countdownRef.current),
        elapsedMs: Math.round(currentSession.elapsedMs),
        durationMs: currentSession.beatmap.durationMs,
        audioDurationMs,
        sourceStartMs: currentSession.beatmap.sourceStartMs ?? 0,
        sourceEndMs: currentSession.beatmap.sourceEndMs ?? currentSession.beatmap.durationMs,
        beatmapDurationMs: currentSession.beatmap.durationMs,
        beatmapSource: currentSession.beatmap.source ?? 'generated',
        combo: currentSession.combo,
        comboMultiplier: currentSummary.comboMultiplier,
        lastJudgement: currentSession.lastJudgement,
        score: currentSummary,
        neuraPresence,
        nextNotes: currentVisibleNotes.slice(0, 12).map((note) => ({
          lane: note.lane,
          kind: getRhythmNoteKind(note),
          timeToHitMs: note.timeToHitMs,
          durationMs: note.durationMs ?? 0,
                    endTimeToHitMs: note.endTimeToHitMs,
          yPercent: Math.round(note.yPercent),
          visualTopPercent: Math.round(note.visualTopPercent),
          durationPercent: note.durationPercent,
        })),
      });
    };
    window.advanceTime = stepByMs;

    return () => {
      window.advanceTime = () => undefined;
    };
  }, [activeRun, audioDurationMs, neuraPresence, resonanceEffects, stepByMs]);

  const debugPayload = {
    audioDurationMs,
    sourceStartMs: beatmap.sourceStartMs ?? 0,
    sourceEndMs: beatmap.sourceEndMs ?? beatmap.durationMs,
    beatmapDurationMs: beatmap.durationMs,
    beatmapSource: beatmap.source ?? 'generated',
    notes: beatmap.notes.length,
  };

  return (
    <main className="stage-screen">
      <div className="stage-header">
        <button onClick={onExit}>{buttonLabels.backToDesktop}</button>
        <strong className="masked-title">{displayTitle}</strong>
        <span>{placeholderLabels.level}: {activeRun.difficulty}</span>
        <span>{beatmap.bpm} BPM</span>
        <span>{placeholderLabels.density}: {densityConfig.densityMultiplier}</span>
      </div>

      {debugMode === 'panel' && <RhythmDebugPanel payload={debugPayload} compact />}
      {debugMode === 'window' && <RhythmDebugPanel payload={debugPayload} />}

      {instrumentalAudioSource && (
        <audio
          ref={audioRef}
          className="stage-audio"
          src={instrumentalAudioSource}
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration;
            if (Number.isFinite(duration) && duration > 0) {
              setAudioDurationMs(Math.round(duration * 1000));
              setPhase((current) => (current === 'loading' ? 'countdown' : current));
            }
          }}
          onEnded={() => syncToElapsed(sessionRef.current.beatmap.durationMs)}
          preload="auto"
        />
      )}

      <section className="vocal-map" aria-label={placeholderLabels.vocalMapLabel}>
        <div className="vocal-waveform">
          {vocalPeaks.map((peak, index) => (
            <span
              key={`${peak}-${index}`}
              style={{ height: `${Math.max(8, peak * 100)}%` }}
            />
          ))}
        </div>
      </section>

      <section className="rhythm-hud" aria-label="Stan próby rytmicznej">
        <RhythmStat label={placeholderLabels.timeLeft} value={`${remainingSeconds}s`} />
        <RhythmStat label={placeholderLabels.combo} value={String(session.combo)} />
        <RhythmStat label={placeholderLabels.accuracy} value={`${summary.accuracy}%`} />
        <RhythmStat label={placeholderLabels.comboMultiplier} value={`x${summary.comboMultiplier}`} />
      </section>

      <p className={`judgement ${session.lastJudgement ?? ''}`}>{judgementLabel(session.lastJudgement)}</p>
      {phase !== 'playing' && (
        <div className="countdown-overlay" aria-live="polite">
          {phase === 'loading' ? placeholderLabels.loadingAudio : Math.ceil(countdownMs / 1000)}
        </div>
      )}

      <section
        className="lanes"
        aria-label={placeholderLabels.rhythmLanesLabel}
        style={{ '--hit-line': `${RHYTHM_HIT_LINE_PERCENT}%` } as CSSProperties}
      >
        {RHYTHM_LANES.map((lane) => {
          const laneHitFeedback = hitFeedbacks.find((feedback) => feedback.lane === lane);
          const laneNotes = visibleNotes.filter((note) => note.lane === lane);
          const closestNoteId = laneNotes
            .reduce<{ id: string; distance: number } | null>((closest, note) => {
              const distance = Math.abs(note.yPercent - RHYTHM_HIT_LINE_PERCENT);
              if (!closest || distance < closest.distance) return { id: note.id, distance };
              return closest;
            }, null)
            ?.id;
          return (
          <div
            className={[
              'lane',
              session.lastLane === lane ? 'active-lane' : '',
            ].filter(Boolean).join(' ')}
            key={lane}
            onPointerDown={(event) => pressPointerLane(event, lane)}
            onPointerUp={(event) => releasePointerLane(event, lane)}
            onPointerCancel={(event) => releasePointerLane(event, lane)}
            role="button"
            tabIndex={0}
          >
            {laneNotes.map((note) => {
                const kind = getRhythmNoteKind(note);
                const isLong = kind === 'hold';
                return (
                  <span
                    className={[
                      'note',
                      isLong ? kind : '',
                      laneHitFeedback && laneHitFeedback.judgement !== 'miss' && note.id === closestNoteId
                        ? `hit-note hit-note-${laneHitFeedback.judgement}`
                        : '',
                      note.startedAtMs !== undefined && !note.judged ? 'active-note' : '',
                      note.judgement === 'miss' ? 'missed-note' : '',
                    ].filter(Boolean).join(' ')}
                    key={note.id}
                    style={{
                      top: `${isLong ? note.visualTopPercent : note.yPercent}%`,
                      opacity: note.opacity,
                      ...(isLong ? { '--note-height': `${note.durationPercent}%` } : {}),
                      ...(kind === 'hold' ? { '--hold-progress-height': `${Math.round(note.holdProgress * 100)}%` } : {}),
                    } as CSSProperties}
                  >
                    {kind === 'hold' && (
                      <span className="hold-progress">
                        {note.presses ?? 0}
                      </span>
                    )}
                  </span>
                );
              })}
            {hitFeedbacks
              .filter((feedback) => feedback.lane === lane)
              .map((feedback) => (
                <span className="hit-fx-stack" key={feedback.id}>
                  <span className={`hit-feedback ${feedback.judgement}`}>
                    {feedback.label}
                  </span>
                </span>
              ))}
            <span className="hit-line" />
            <kbd>{lane}</kbd>
          </div>
          );
        })}
      </section>

      <section className="rhythm-counters" aria-label="Liczniki trafień">
        <span>{placeholderLabels.perfect}: {summary.perfectHits}</span>
        <span>{placeholderLabels.great}: {summary.greatHits}</span>
        <span>{placeholderLabels.good}: {summary.goodHits}</span>
        <span>{placeholderLabels.miss}: {summary.misses}</span>
        <span>{placeholderLabels.emptyPresses}: {summary.emptyPresses}</span>
        <span>{placeholderLabels.notes}: {summary.totalNotes}</span>
      </section>

      <button className="primary-action" onClick={() => completeRun(sessionRef.current)}>
        {buttonLabels.finishTrial}
      </button>
      <PersistentOverlays
        comment={neuraComment}
        presenceState={neuraPresence}
        onPresenceEvent={onNeuraPresenceEvent}
        webcamEvent="rhythm"
        musicBpm={beatmap.bpm}
        dragEnabled={overlayDragEnabled}
        webcamPosition={overlayPositions.webcam}
        onWebcamMove={(position) => onOverlayMove('webcam', position)}
        storySceneActive={storySceneActive}
      />
    </main>
  );
}


function RhythmStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RhythmDebugPanel({
  payload,
  compact = false,
}: {
  payload: {
    audioDurationMs: number;
    sourceStartMs: number;
    sourceEndMs: number;
    beatmapDurationMs: number;
    beatmapSource: string;
    notes: number;
  };
  compact?: boolean;
}) {
  return (
    <aside className={compact ? 'rhythm-debug compact' : 'rhythm-debug'} aria-label="Pomiary rytmu">
      <strong>Pomiary rytmu</strong>
      <span>audio: {formatDebugTime(payload.audioDurationMs)}</span>
      <span>start: {formatDebugTime(payload.sourceStartMs)}</span>
      <span>koniec: {formatDebugTime(payload.sourceEndMs)}</span>
      <span>poziom: {formatDebugTime(payload.beatmapDurationMs)}</span>
      <span>źródło: {payload.beatmapSource}</span>
      <span>sygnały: {payload.notes}</span>
      <em>F8 panel / F9 okno</em>
    </aside>
  );
}

function formatDebugTime(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function keyToLane(key: string): RhythmLane | null {
  const upperKey = key.toUpperCase();
  return RHYTHM_LANES.includes(upperKey as RhythmLane) ? (upperKey as RhythmLane) : null;
}

function judgementLabel(judgement: RhythmJudgement | null) {
  if (judgement === 'perfect') return 'Czysto';
  if (judgement === 'great') return 'Pewnie';
  if (judgement === 'good') return 'Złapane';
  if (judgement === 'too_fast') return 'Za wcześnie';
  if (judgement === 'too_late') return 'Za późno';
  if (judgement === 'miss') return 'Rozjazd';
  if (judgement === 'empty') return 'Klik';
  return 'Złap rytm';
}

function ResultsScreen({
  result,
  displayTitle,
  rhythmHint,
  stats,
  dayCycle,
  runMode,
  remixComparison,
  alreadyPublished,
  canPublish: canPublishResult,
  neuraComment,
  neuraPresence,
  overlayDragEnabled,
  overlayPositions,
  onOverlayMove,
  onNeuraPresenceEvent,
  onSave,
  onSendToPawel,
  onPublish,
  onDiscard,
  onOverwrite,
  onBack,
  storySceneActive,
}: {
  result: PerformanceResult;
  displayTitle: string;
  rhythmHint: string;
  stats: GameState['stats'];
  dayCycle: GameState['dayCycle'];
  runMode: ActiveRun['mode'];
  remixComparison: RemixComparison | null;
  alreadyPublished: boolean;
  canPublish: boolean;
  neuraComment: NeuraVoiceLine;
  neuraPresence: ReturnType<typeof createNeuraPresenceState>;
  overlayDragEnabled: boolean;
  overlayPositions: Record<OverlayId, Point>;
  onOverlayMove: (overlayId: OverlayId, position: Point) => void;
  onNeuraPresenceEvent: (eventId: NeuraPresenceEventId) => void;
  onSave: () => void;
  onSendToPawel: () => void;
  onPublish: () => void;
  onDiscard: () => void;
  onOverwrite: () => void;
  onBack: () => void;
  storySceneActive: boolean;
}) {
  const actionPreview = (action: DayDecision) => getActionPreview({ stats, dayCycle }, action, result.grade, true);
  const previews = [
    ['szuflada', actionPreview('saveDraft')],
    ['Paweł', actionPreview('sendToPawel')],
    ['publikacja', actionPreview('publish')],
    ['odrzucenie', actionPreview('discard')],
  ] as const;

  return (
    <main className="results-screen">
      <section className="results-panel">
        <span>{placeholderLabels.resultTitle}</span>
        <h1 className="masked-title">{displayTitle}</h1>
        <div className="score-grid">
          <strong>{result.accuracy}%</strong>
          <strong>{result.grade}</strong>
          <span>{placeholderLabels.accuracy}</span>
          <span>{placeholderLabels.grade}</span>
        </div>
        <div className="score-details">
          <span>{placeholderLabels.perfect}: {result.perfectHits}</span>
          <span>{placeholderLabels.great}: {result.greatHits}</span>
          <span>{placeholderLabels.good}: {result.goodHits}</span>
          <span>{placeholderLabels.miss}: {result.misses}</span>
          <span>{placeholderLabels.emptyPresses}: {result.emptyPresses}</span>
          <span>{placeholderLabels.maxCombo}: {result.maxCombo}</span>
          <span>{placeholderLabels.comboMultiplier}: x{result.comboMultiplier}</span>
          <span>{placeholderLabels.qualityProgress}: {result.qualityProgress}</span>
          <span>{placeholderLabels.notes}: {result.totalNotes}</span>
        </div>
        <p className="result-neura-hint">Neura: {rhythmHint === 'zimny silnik'
          ? 'Silnik jeszcze śpi. Nie każ mu udawać transmisji.'
          : rhythmHint === 'przegrzanie'
            ? 'To nie był brak pomysłu. To był silnik, który pracował bez przerwy.'
            : rhythmHint === 'szum publiczności'
              ? 'Czat wszedł do środka rytmu. Słyszałam go między wejściami.'
              : rhythmHint === 'stabilny silnik'
                ? 'Cybart.exe trzymał tempo. To rzadki, użyteczny rodzaj ciszy.'
                : 'Kanał był czysty. Tym razem decyzja należała do ciebie.'}</p>
        <div className="result-stat-previews" aria-label="Przewidywane zmiany statystyk">
          <strong>Przewidywany ślad decyzji</strong>
          {previews.map(([label, preview]) => (
            <span key={label}>
              {label}: {formatStatDelta(preview.delta)}{preview.blockedReason ? ` / ${preview.blockedReason}` : ''}
            </span>
          ))}
        </div>
        {runMode === 'remix' && remixComparison && (
          <RemixComparisonPanel comparison={remixComparison} />
        )}
        <div className="result-actions">
          {runMode === 'create' ? (
            <>
              <button onClick={onSave}>{buttonLabels.saveDraft}</button>
              <button onClick={onSendToPawel}>{buttonLabels.sendToPawel}</button>
              <button className="result-primary" onClick={onPublish} disabled={alreadyPublished || !canPublishResult}>
                {alreadyPublished ? placeholderLabels.publishedLocked : canPublishResult ? buttonLabels.publish : 'Presja blokuje publikację'}
              </button>
              <button className="result-secondary" onClick={onDiscard}>{buttonLabels.discardDraft}</button>
            </>
          ) : (
            <>
              <button className="result-primary" onClick={onOverwrite}>{buttonLabels.overwriteDraft}</button>
              <button className="result-secondary" onClick={onDiscard}>{buttonLabels.discardDraft}</button>
            </>
          )}
          <button className="result-secondary" onClick={onBack}>{buttonLabels.backWithoutSave}</button>
        </div>
      </section>
      <PersistentOverlays
        comment={neuraComment}
        presenceState={neuraPresence}
        onPresenceEvent={onNeuraPresenceEvent}
        webcamEvent={runMode === 'create' && result.grade !== 'F' ? 'published' : 'review'}
        dragEnabled={overlayDragEnabled}
        webcamPosition={overlayPositions.webcam}
        onWebcamMove={(position) => onOverlayMove('webcam', position)}
        storySceneActive={storySceneActive}
      />
    </main>
  );
}

function RemixComparisonPanel({ comparison }: { comparison: RemixComparison }) {
  const signedDelta = comparison.accuracyDelta > 0 ? `+${comparison.accuracyDelta}` : String(comparison.accuracyDelta);

  return (
    <section className={`remix-comparison ${comparison.verdict}`} aria-label={placeholderLabels.remixComparison}>
      <strong>{comparisonLabels[comparison.verdict]}</strong>
      <div>
        <span>{placeholderLabels.currentDraft}: {comparison.previousAccuracy}% / {comparison.previousGrade}</span>
        <span>{placeholderLabels.newTake}: {comparison.nextAccuracy}% / {comparison.nextGrade}</span>
        <span>{placeholderLabels.accuracyDelta}: {signedDelta} pp</span>
      </div>
    </section>
  );
}

function PlayerWindow({
  published,
  track,
}: {
  published: PublishedTrack;
  track: Track | null;
}) {
  return (
    <div className="player-panel">
      <h2>{published.trackTitle}</h2>
      <p>{placeholderLabels.level}: {published.difficulty}</p>
      <p>{placeholderLabels.grade}: {published.grade} / {published.accuracy}%</p>
      <p>{placeholderLabels.qualityProgress}: {published.qualityProgress}</p>
      <p>{placeholderLabels.quality}: {published.quality}</p>
      {track ? (
        <audio className="player-audio" src={track.audio.merged} controls preload="metadata" />
      ) : (
        <p className="missing-audio">{placeholderLabels.missingPublishedAudio}</p>
      )}
    </div>
  );
}

function buildVocalPeaks(audioBuffer: AudioBuffer, bins = 64) {
  const channel = audioBuffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channel.length / bins));

  return Array.from({ length: bins }, (_, bin) => {
    let peak = 0;
    const start = bin * blockSize;
    const end = Math.min(channel.length, start + blockSize);

    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(channel[index]));
    }

    return Math.max(0.08, Math.min(1, peak * 1.8));
  });
}

function createFallbackPeaks(bpm: number, bins = 64) {
  return Array.from({ length: bins }, (_, index) => {
    const pulse = Math.sin((index / bins) * Math.PI * 8 + bpm / 18);
    const accent = index % 8 === 0 ? 0.34 : 0;
    return Math.max(0.12, Math.min(1, 0.32 + pulse * 0.22 + accent));
  });
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function formatStatDelta(delta: Partial<GameState['stats']>) {
  const entries = [
    ['W', delta.performance ?? 0],
    ['C', delta.cybart ?? 0],
    ['P', delta.chatPressure ?? 0],
  ].filter(([, value]) => value !== 0);
  return entries.length > 0
    ? entries.map(([label, value]) => `${label} ${formatSigned(Number(value))}`).join(' / ')
    : 'bez zmiany';
}

function statBandLabel(value: number) {
  return {
    low: 'niski',
    rising: 'rozruch',
    stable: 'stabilny',
    tense: 'napięcie',
    critical: 'krytyczny',
  }[getStatBand(value)];
}

function StatsPanel({ stats, dayCycle }: { stats: GameState['stats']; dayCycle: GameState['dayCycle'] }) {
  const activeCommitments = dayCycle.commitments.filter((commitment) => commitment.status === 'active');
  const phaseLabel = {
    communication: 'komunikacja',
    work: 'praca',
    result: 'raport z próby',
    daySummary: 'podsumowanie dnia',
    complete: 'sesja domknięta',
  }[dayCycle.phase];

  return (
    <section className="stats-panel-content">
      <strong>Dzień {dayCycle.currentDay}/{dayCycle.totalDays}</strong>
      <small>faza: {phaseLabel}</small>
      <Stat label={statLabels.performance} value={stats.performance} />
      <Stat label={statLabels.cybart} value={stats.cybart} />
      <Stat label={statLabels.chatPressure} value={stats.chatPressure} />
      <small>strefy: stabilna 40–69 / krytyczna 90+</small>
      <small>
        zobowiązania: {activeCommitments.length > 0
          ? activeCommitments.map((commitment) => `dzień ${commitment.dueDay}`).join(', ')
          : 'brak'}
      </small>
    </section>
  );
}

function EventCutsceneStage({
  echo,
  resonance,
  ending,
  stats,
  mainStoryComplete,
  onClose,
}: {
  echo: GameState['echo'];
  resonance: GameState['resonance'];
  ending: GameState['ending'];
  stats: GameState['stats'];
  mainStoryComplete: boolean;
  onClose: () => void;
}) {
  const latestMessages = echo.messages.slice(0, 3);
  const phrase = mainStoryComplete
    ? 'Ostatni plik wrócił jako echo. Pulpit nie prosi już o publikację, tylko pamięta trasę.'
    : echo.lastPhrase ?? 'Puste miejsce po decyzji wraca jako szum.';
  const mainLabel = mainStoryComplete ? 'Występ domknięty' : 'Neura powtarza decyzję';
  const choiceLabel = mainStoryComplete ? 'Co zostaje po Występie' : 'Decyzja podświetlona przez echo';
  const channelLabel = getEventCutsceneChannelLabel(echo.activeCutsceneId);
  const choiceButtons = mainStoryComplete
    ? ['Odsłuchaj ślady', 'Zostaw pulpit', 'Zamknij zakłócenie']
    : ['Publikuj dalej', 'Schowaj do szuflady', 'Wyślij Pawłowi'];
  const resonanceLabel = {
    silent: 'cisza',
    low: 'niski',
    medium: 'średni',
    high: 'wysoki',
    overload: 'przeciążenie',
  }[resonance.level];
  const bondLabel = {
    distant: 'dystans',
    curious: 'ciekawość',
    attuned: 'dostrojenie',
    merged: 'zlanie',
  }[resonance.bondWithNeura];

  const stageClassName = mainStoryComplete
    ? 'event-cutscene-stage event-cutscene-final'
    : 'event-cutscene-stage';

  return (
    <section className={stageClassName} aria-label="EVENTS">
      <div className="event-cutscene-glitch" />
      <div className="event-cutscene-desktop">
        <header className="event-cutscene-topbar">
          <strong>EVENTS</strong>
          <span>{channelLabel}</span>
          <button type="button" onClick={onClose}>Zamknij zakłócenie</button>
        </header>

        <div className="event-cutscene-icons" aria-hidden="true">
          <span>MSG</span>
          <span>CRT</span>
          <span>NEU</span>
        </div>

        <article className="event-cutscene-window event-cutscene-window-main">
          <strong>{mainLabel}</strong>
          <p className="event-cutscene-phrase">{phrase}</p>
          <div className="event-cutscene-thread">
            {latestMessages.length > 0 ? latestMessages.map((message) => (
              <span key={message.id}>
                #{message.count} {message.phrase}
              </span>
            )) : (
              <span>#0 Brak zapamiętanych decyzji.</span>
            )}
          </div>
        </article>

        <article className="event-cutscene-window event-cutscene-window-choice">
          <strong>{choiceLabel}</strong>
          {choiceButtons.map((label, index) => (
            <button
              className={index === 0 ? 'event-decision highlighted' : 'event-decision'}
              key={label}
              onClick={mainStoryComplete && label === 'Zamknij zakłócenie' ? onClose : undefined}
              type="button"
            >
              {label}
            </button>
          ))}
        </article>

        <article className="event-cutscene-window event-cutscene-window-neura">
          <strong>Neura</strong>
          <span>echo: {echo.echoCount}</span>
          <span>rezonans: {resonanceLabel} / {resonance.score}</span>
          <span>więź: {bondLabel}</span>
          <span>zakończenie: {ending.label}</span>
        </article>

        <article className="event-cutscene-window event-cutscene-window-stats">
          <strong>Impuls końcowy</strong>
          <span>{statLabels.performance}: {stats.performance}</span>
          <span>{statLabels.chatPressure}: {stats.chatPressure}</span>
          <span>{statLabels.cybart}: {stats.cybart}</span>
          <span>trasa: {ending.label}</span>
        </article>
      </div>
    </section>
  );
}

function getEventCutsceneChannelLabel(activeCutsceneId: string | null) {
  if (activeCutsceneId === 'events.echo.after-publish') return 'publikacja';
  if (!activeCutsceneId) return 'kanał spoczynku';
  return 'kanał echa';
}

function UstnikiWindow({ gameState }: { gameState: GameState }) {
  const challenges = getUstnikiChallenges(gameState);

  return (
    <div className="window-list ustniki-ledger">
      <strong>{placeholderLabels.ustnikiWindowStatus}</strong>
      <p>
        To nie są poboczne achievementy. To zapis tego, jak Cybek uczy się występować
        bez oddawania całego steru Neurze.
      </p>
      {challenges.map((challenge) => (
        <article className="ustnik-challenge" key={challenge.id} data-complete={challenge.isComplete}>
          <div>
            <strong>{challenge.title}</strong>
            <span>{challenge.description}</span>
          </div>
          <meter min="0" max={challenge.target} value={challenge.value} />
          <em>{challenge.valueLabel}</em>
        </article>
      ))}
    </div>
  );
}

type UstnikChallenge = {
  id: string;
  title: string;
  description: string;
  value: number;
  target: number;
  valueLabel: string;
  isComplete: boolean;
};

function getUstnikiChallenges(gameState: GameState): UstnikChallenge[] {
  const sentToPawelCount = gameState.drafts.filter((draft) => draft.status === 'sentToPawel').length;
  const publishedCount = gameState.publishedTracks.length;
  const bestPublishedAccuracy = Math.max(0, ...gameState.publishedTracks.map((track) => track.accuracy));
  const stablePressure = Math.max(0, 40 - gameState.stats.chatPressure);

  return [
    {
      id: 'first-buffer',
      title: 'Bufor przed tłumem',
      description: 'Wyślij szkic Pawłowi, zanim grupa dostanie oficjalny plik.',
      value: Math.min(1, sentToPawelCount),
      target: 1,
      valueLabel: sentToPawelCount > 0 ? 'Paweł ma szkic' : 'czeka prywatny bufor',
      isComplete: sentToPawelCount > 0,
    },
    {
      id: 'first-publication',
      title: 'Pierwszy ślad publiczny',
      description: 'Opublikuj numer na czacie głównym i pozwól reakcji wrócić do pulpitu.',
      value: Math.min(1, publishedCount),
      target: 1,
      valueLabel: publishedCount > 0 ? 'czat dostał plik' : 'brak publicznego Występu',
      isComplete: publishedCount > 0,
    },
    {
      id: 'clean-take',
      title: 'Wersja bez rozpadu',
      description: 'Dowiezienie jednego numeru na co najmniej 80% dokładności.',
      value: Math.min(80, bestPublishedAccuracy),
      target: 80,
      valueLabel: `${bestPublishedAccuracy}% najlepszej publikacji`,
      isComplete: bestPublishedAccuracy >= 80,
    },
    {
      id: 'low-pressure',
      title: 'Nie karm presji',
      description: 'Utrzymaj Presję Czatu poniżej 40 mimo postępu Występu.',
      value: stablePressure,
      target: 40,
      valueLabel: gameState.stats.chatPressure < 40 ? 'presja pod kontrolą' : `presja ${gameState.stats.chatPressure}/100`,
      isComplete: gameState.stats.chatPressure < 40,
    },
  ];
}

function TitleHubWindow({ onReboot }: { onReboot: () => void }) {
  return (
    <div className="window-list">
      <strong>{windowLabels.titleHub}</strong>
      <p>{placeholderLabels.titleHubHint}</p>
      <button className="result-primary" onClick={onReboot}>{placeholderLabels.titleScreenStart}</button>
    </div>
  );
}

function HiddenWindowShell({ title }: { title: string }) {
  return (
    <div className="window-list">
      <strong>{title}</strong>
      <p>{placeholderLabels.hiddenWindowHint}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <meter min="0" max="100" value={value} />
      <strong>{value} <em>{statBandLabel(value)}</em></strong>
    </div>
  );
}

function CybekWebcamWindow({
  eventName = 'idle',
  musicBpm,
  position,
  onMove,
  dragEnabled,
}: {
  eventName?: CybekWebcamEvent;
  musicBpm?: number;
  position: Point;
  onMove: (position: Point) => void;
  dragEnabled: boolean;
}) {
  return (
    <DraggableOverlay
      className="webcam-window"
      position={position}
      onMove={onMove}
      dragEnabled={dragEnabled}
      ariaLabel={appLabels.webcam}
    >
      <CybekWebcam eventName={eventName} musicBpm={musicBpm} />
    </DraggableOverlay>
  );
}

function getDefaultWebcamPosition(): Point {
  if (typeof window === 'undefined') return { x: 880, y: 86 };
  const webcamWidth = window.innerWidth <= 1100 ? Math.min(326, window.innerWidth - 36) : 392;
  const webcamOriginY = 160;

  return {
    x: Math.max(18, window.innerWidth - webcamWidth - 26),
    y: Math.max(18, Math.round((window.innerHeight / 2) - webcamOriginY)),
  };
}

function NeuraDebugPanel({
  presenceState,
  activeGlitchCount,
  onSetOverride,
  onToggleLowFx,
}: {
  presenceState: ReturnType<typeof createNeuraPresenceState>;
  activeGlitchCount: number;
  onSetOverride: (level: OperationalPowerLevel | null) => void;
  onToggleLowFx: () => void;
}) {
  const levels: OperationalPowerLevel[] = [0, 1, 2, 3, 4];

  return (
    <>
      <div>
        <strong>Panel Neury</strong>
        <button onClick={() => onSetOverride(null)}>Auto</button>
      </div>
      <span>poziom: {presenceState.powerLevel} / {presenceState.narrativeTag}</span>
      <span>glitch: {formatPresenceValue(presenceState.glitchIntensity)}</span>
      <span>ambient: {formatPresenceValue(presenceState.ambientDepth)}</span>
      <span>avatar: {formatPresenceValue(presenceState.avatarInstability)}</span>
      <span>UI: {formatPresenceValue(presenceState.uiAutonomy)}</span>
      <span>aktywne glitche: {activeGlitchCount}</span>
      <span>ostatni impuls: {presenceState.lastEventId}</span>
      <div className="neura-debug-levels">
        {levels.map((level) => (
          <button
            key={level}
            className={presenceState.debugOverride === level ? 'active' : ''}
            onClick={() => onSetOverride(level)}
          >
            {level}
          </button>
        ))}
      </div>
      <button onClick={onToggleLowFx}>
        Low FX: {presenceState.lowFxMode ? 'wł.' : 'wył.'}
      </button>
      <div className="neura-debug-log">
        {presenceState.eventLog.map((event, index) => (
          <span key={`${event.id}-${event.at}-${index}`}>{event.id}</span>
        ))}
      </div>
      <em>F10 ukrywa panel</em>
    </>
  );
}

function formatPresenceValue(value: number) {
  return `${Math.round(value * 100)}%`;
}

function PersistentOverlays({
  comment,
  presenceState,
  onPresenceEvent,
  storyVoiceLineId,
  webcamEvent = 'idle',
  musicBpm,
  dragEnabled,
  webcamPosition,
  onWebcamMove,
  storySceneActive = false,
}: {
  comment: NeuraVoiceLine;
  presenceState: ReturnType<typeof createNeuraPresenceState>;
  onPresenceEvent: (eventId: NeuraPresenceEventId) => void;
  storyVoiceLineId?: string | null;
  webcamEvent?: CybekWebcamEvent;
  musicBpm?: number;
  dragEnabled: boolean;
  webcamPosition: Point;
  onWebcamMove: (position: Point) => void;
  storySceneActive?: boolean;
}) {
  return (
    <>
      <CybekWebcamWindow
        eventName={webcamEvent}
        musicBpm={musicBpm}
        position={webcamPosition}
        onMove={onWebcamMove}
        dragEnabled={dragEnabled}
      />
      <NeuraPet
        comment={comment}
        presenceState={presenceState}
        onPresenceEvent={onPresenceEvent}
        storyVoiceLineId={storyVoiceLineId}
        voicePaused={storySceneActive}
      />
    </>
  );
}

function readStoredNeuraLowFxMode() {
  try {
    return window.localStorage.getItem(NEURA_LOW_FX_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    openHiddenWindow?: (windowId: HiddenWindowId) => void;
    webkitAudioContext?: typeof AudioContext;
  }
}
