import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { neuraComments } from './data/messages';
import type { NeuraVoiceLine } from './data/neuraVoiceLines';
import { chatAuthors, groupPublishMessages, pawelDraftMessage } from './data/chatReactions';
import { tracks } from './data/tracks';
import { useSoundscape } from './audio/useSoundscape';
import { useRhythmSfx } from './audio/useRhythmSfx';
import { CybekWebcam, type CybekWebcamEvent } from './cybekWebcam';
import { BeatmapEditor } from './editor/BeatmapEditor';
import { NeuraPet } from './neura/NeuraPet';
import { NeuraTutorialGuide } from './neura/NeuraTutorialGuide';
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
import type { NeuraTutorialStep } from './neura/tutorialGuide';
import type { NeuraPresenceEventId as DialoguePresenceEventId } from './data/dialogue/dialogueTypes';
import {
  addUnique,
  createRemixComparison,
  resultFromDraft,
  triggerEchoAfterPublish,
  upsertDraft,
  upsertPublished,
  type RemixComparison,
} from './gameFlow';
import { updateEndingState } from './ending';
import { applyResonanceEffects, updateResonanceState } from './resonance';
import {
  applyStatDelta,
  createDraftFromResult,
  createPublishedTrack,
  createResult,
  defaultState,
  getNextDifficulty,
  getStatDelta,
  getTitleReveal,
  improveDraftWithResult,
  loadState,
  maskTrackTitle,
  revealTitleByAccuracy,
  revealTitleFully,
  saveState,
} from './storage';
import { addMessage } from './storage';
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
  DraftTrack,
  GameState,
  NeuraPresenceEventId,
  NeuraPresenceEventLogEntry,
  OperationalPowerLevel,
  PerformanceResult,
  PublishedTrack,
  ResonanceVisualEffects,
  RhythmLane,
  RhythmSummary,
  Track,
} from './types';

type WindowId = 'messenger' | 'create' | 'me' | 'player' | 'event' | 'ustniki' | 'titleHub' | null;
type HiddenWindowId = 'lab' | 'archive' | 'broadcast';
type Screen = 'title' | 'boot' | 'desktop' | 'rhythm' | 'results' | 'editor';
type Point = { x: number; y: number };
type HitFeedback = {
  id: number;
  lane: RhythmLane;
  label: string;
  judgement: 'perfect' | 'great' | 'good' | 'miss';
};
type OverlayId =
  | 'webcam'
  | 'tutorial'
  | 'stats'
  | 'todo'
  | 'identity'
  | 'neuraDebug'
  | 'neuraEcho';

const BOOT_DURATION_MS = 4500;
const BOOT_SKIP_AFTER_MS = 1000;
const NEURA_COMMENT_INTERVAL_MS = 27500;
const NEURA_STORY_BEAT_INTERVAL_MS = 41000;
const NEURA_LOW_FX_STORAGE_KEY = 'ustnik.neura.lowFxMode';
const ENABLE_HIDDEN_WINDOWS = false;
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
type ActiveRun = {
  track: Track;
  difficulty: Difficulty;
  mode: 'create' | 'remix';
  draftId?: string;
};

type RhythmPhase = 'loading' | 'countdown' | 'playing';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => loadState());
  const shouldStartInEditor = window.location.hash === '#editor';
  const [activeWindow, setActiveWindow] = useState<WindowId>('messenger');
  const initialScreenRef = useRef<Screen>(shouldStartInEditor ? 'editor' : 'desktop');
  const [screen, setScreen] = useState<Screen>(shouldStartInEditor ? 'editor' : 'title');
  const [activeHiddenWindow, setActiveHiddenWindow] = useState<HiddenWindowId | null>(null);
  const [bootElapsedMs, setBootElapsedMs] = useState(0);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [result, setResult] = useState<PerformanceResult | null>(null);
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
  const [isDebugOverlayDragEnabled, setIsDebugOverlayDragEnabled] = useState(false);
  const [isTodoVisible, setIsTodoVisible] = useState(true);
  const [isTutorialDismissed, setIsTutorialDismissed] = useState(false);
  const [environmentEcho, setEnvironmentEcho] = useState<{ id: number; text: string } | null>(null);
  const [storyVoiceLineId, setStoryVoiceLineId] = useState<string | null>(null);
  const [lastDialogueEventId, setLastDialogueEventId] = useState<DialoguePresenceEventId | null>(null);
  const [neuraVoiceDirectorState, setNeuraVoiceDirectorState] = useState(() => loadNeuraVoiceDirectorState());
  const [neuraVoiceDirectorDebug, setNeuraVoiceDirectorDebug] = useState('');
  const neuraVoiceDirectorStateRef = useRef(neuraVoiceDirectorState);
  const neuraPresence = useMemo(
    () => createNeuraPresenceState(gameState, {
      lastEventId: lastNeuraEventId,
      debugOverride: neuraDebugOverride,
      lowFxMode: neuraLowFxMode,
      eventLog: neuraEventLog,
    }),
    [gameState, lastNeuraEventId, neuraDebugOverride, neuraEventLog, neuraLowFxMode],
  );
  // Tutorial wyłączony globalnie: panel i wskazówki nie są renderowane.
  const neuraTutorialStep: NeuraTutorialStep | null = null;
  const soundscape = useSoundscape(neuraPresence);
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
    tutorial: { x: 1020, y: 246 },
    stats: { x: 1000, y: 280 },
    todo: { x: 1000, y: 458 },
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
  useEffect(() => {
    neuraVoiceDirectorStateRef.current = neuraVoiceDirectorState;
  }, [neuraVoiceDirectorState]);

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

  const focusNeuraTutorialTarget = useCallback((step: NeuraTutorialStep) => {
    if (step.targetWindow) setActiveWindow(step.targetWindow);
    if (step.targetMessengerTab) setMessengerTab(step.targetMessengerTab);
  }, []);

  const completeBoot = useCallback(() => {
    setBootElapsedMs(BOOT_DURATION_MS);
    setScreen((current) => (current === 'boot' ? initialScreenRef.current : current));
  }, []);

  const advanceBoot = useCallback((ms: number) => {
    setBootElapsedMs((current) => {
      const next = Math.min(BOOT_DURATION_MS, current + Math.max(0, ms));
      if (next >= BOOT_DURATION_MS) window.setTimeout(completeBoot, 0);
      return next;
    });
  }, [completeBoot]);

  useEffect(() => {
    if (screen !== 'boot') return;

    const id = window.setInterval(() => advanceBoot(150), 150);
    return () => window.clearInterval(id);
  }, [advanceBoot, screen]);

  useEffect(() => {
    if (screen !== 'boot') return;

    function skipBoot() {
      if (bootElapsedMs >= BOOT_SKIP_AFTER_MS) completeBoot();
    }

    window.addEventListener('pointerdown', skipBoot);
    window.addEventListener('keydown', skipBoot);
    return () => {
      window.removeEventListener('pointerdown', skipBoot);
      window.removeEventListener('keydown', skipBoot);
    };
  }, [bootElapsedMs, completeBoot, screen]);

  useEffect(() => {
    function handleDebugKey(event: KeyboardEvent) {
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

  const startBootFromTitle = useCallback(() => {
    setBootElapsedMs(0);
    setScreen('boot');
  }, []);

  useEffect(() => {
    setIsTutorialDismissed(false);
  }, [neuraTutorialStep]);

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
          canSkip: bootElapsedMs >= BOOT_SKIP_AFTER_MS,
          nextScreen: initialScreenRef.current,
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
        drafts: gameState.drafts.map((draft) => ({
          track: draft.trackTitle,
          difficulty: draft.difficulty,
          status: draft.status,
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
        neuraTutorial: null,
      });
    window.advanceTime = () => undefined;
  }, [
    activeRun,
    activeWindow,
    advanceBoot,
    bootElapsedMs,
    gameState,
    lastDialogueEventId,
    neuraPresence,
    neuraTutorialStep,
    neuraVoiceDirectorDebug,
    neuraVoiceDirectorState.queue,
    neuraVoiceDirectorState.unlockedPackIds,
    result,
    screen,
    soundscape.activeGlitchCount,
    soundscape.isMuted,
    soundscape.isUnlocked,
    storyVoiceLineId,
  ]);

  const runStoryAction = useCallback((eventId: DialoguePresenceEventId, nextGameState: GameState) => {
    const now = Date.now();
    const context = {
      gameState: nextGameState,
      presence: createPresenceStateFromGameState(nextGameState, {
        activeWindow,
        screen,
        lastPresenceEventId: eventId,
      }),
      now,
    };
    const queued = createVoiceQueueItemsFromEvent(neuraVoiceDirectorStateRef.current, { eventId, context, now });
    const next = getNextNeuraVoiceLine(queued.state, context);
    let nextDirectorState = next.state;

    if (next.line) {
      nextDirectorState = markVoiceLinePlayed(nextDirectorState, { lineId: next.line.id, playedAt: now });
      setStoryVoiceLineId(next.line.audio.id);
      if (next.line.effects?.triggerGlitch) soundscape.triggerGlitch({ reason: 'story', intensity: next.line.glitchIntensity });
    }

    setLastDialogueEventId(eventId);
    setNeuraVoiceDirectorDebug(renderNeuraVoiceDirectorDebug(nextDirectorState, context, next.rejections));
    neuraVoiceDirectorStateRef.current = nextDirectorState;
    setNeuraVoiceDirectorState(nextDirectorState);
  }, [activeWindow, screen, soundscape]);

  const runAmbientStoryBeat = useCallback((nextGameState: GameState) => {
    const now = Date.now();
    const context = {
      gameState: nextGameState,
      presence: createPresenceStateFromGameState(nextGameState, {
        activeWindow,
        screen,
        lastPresenceEventId: lastDialogueEventId,
      }),
      now,
    };
    const next = getNextNeuraVoiceLine(neuraVoiceDirectorStateRef.current, context);
    let nextDirectorState = next.state;

    if (next.line) {
      nextDirectorState = markVoiceLinePlayed(nextDirectorState, { lineId: next.line.id, playedAt: now });
      setStoryVoiceLineId(next.line.audio.id);
      if (next.line.effects?.triggerGlitch) soundscape.triggerGlitch({ reason: 'story', intensity: next.line.glitchIntensity });
    }

    setNeuraVoiceDirectorDebug(renderNeuraVoiceDirectorDebug(nextDirectorState, context, next.rejections));
    neuraVoiceDirectorStateRef.current = nextDirectorState;
    setNeuraVoiceDirectorState(nextDirectorState);
  }, [activeWindow, lastDialogueEventId, screen, soundscape]);

  useEffect(() => {
    runStoryAction('session.start', gameState);
    // Start sesji ma wejść tylko raz po montażu aplikacji.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (screen !== 'desktop') return;
      runAmbientStoryBeat(gameState);
    }, NEURA_STORY_BEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [gameState, runAmbientStoryBeat, screen]);

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

  function startCreate(track: Track) {
    startRun(track, track.difficulties[0], 'create');
  }

  function startRemix(draft: DraftTrack) {
    const track = tracks.find((item) => item.id === draft.trackId);
    const nextDifficulty = getNextDifficulty(draft.trackId, draft.difficulty);
    if (track && nextDifficulty) startRun(track, nextDifficulty, 'remix', draft.id);
  }

  function startRun(track: Track, difficulty: Difficulty, mode: ActiveRun['mode'], draftId?: string) {
    recordNeuraPresenceEvent('rhythmStarted');
    setActiveRun({ track, difficulty, mode, draftId });
    setResult(null);
    setScreen('rhythm');
  }

  function finishRun(summary: RhythmSummary) {
    if (!activeRun) return;
    recordNeuraPresenceEvent('rhythmFinished');
    setResult(createResult(activeRun.track.id, activeRun.track.title, activeRun.difficulty, summary));
    setScreen('results');
  }

  function saveInitialDraft(status: DraftTrack['status']) {
    if (!result) return;
    const draft = createDraftFromResult(result, status);
    const nextState = {
      ...gameState,
      createdTrackIds: addUnique(gameState.createdTrackIds, result.trackId),
      titleRevealByTrackId: revealTitleByAccuracy(gameState.titleRevealByTrackId, result.trackId, result.accuracy),
      drafts: upsertDraft(gameState.drafts, draft),
      pawelMessages:
        status === 'sentToPawel'
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
          : gameState.pawelMessages,
      stats: applyStatDelta(gameState.stats, getStatDelta(result, status === 'sentToPawel' ? 'sendToPawel' : 'saveDraft')),
    };

    setGameState(nextState);
    runStoryAction(status === 'sentToPawel' ? 'draft.sentToPawel' : 'draft.saved', nextState);

    returnToDesktop(status === 'sentToPawel' ? 'messenger' : 'me');
    recordNeuraPresenceEvent(status === 'sentToPawel' ? 'sentToPawel' : 'draftSaved');
    if (status === 'sentToPawel') setMessengerTab('pawel');
  }

  function overwriteDraft() {
    if (!result || !activeRun?.draftId) return;
    const current = gameState.drafts.find((draft) => draft.id === activeRun.draftId);
    if (!current) return;
    const nextState = {
      ...gameState,
      drafts: upsertDraft(gameState.drafts, improveDraftWithResult(current, result)),
      titleRevealByTrackId: revealTitleByAccuracy(gameState.titleRevealByTrackId, result.trackId, result.accuracy),
      stats: applyStatDelta(gameState.stats, getStatDelta(result, 'saveDraft')),
    };

    setGameState(nextState);
    runStoryAction('draft.saved', nextState);
    recordNeuraPresenceEvent('draftSaved');
    returnToDesktop('me');
  }

  function sendDraftToPawel(draft: DraftTrack) {
    const resultLike = resultFromDraft(draft);
    const nextState = {
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
      stats: applyStatDelta(gameState.stats, getStatDelta(resultLike, 'sendToPawel')),
    };
    setGameState(nextState);
    runStoryAction('draft.sentToPawel', nextState);
    recordNeuraPresenceEvent('sentToPawel');
    setActiveWindow('messenger');
    setMessengerTab('pawel');
  }

  function publishInitialResult() {
    if (!result || gameState.publishedTrackIds.includes(result.trackId)) return;
    publishDraft(createDraftFromResult(result, 'inDrawer'));
  }

  function publishDraft(draft: DraftTrack) {
    if (gameState.publishedTrackIds.includes(draft.trackId)) return;

    const published = createPublishedTrack(draft);
    const resultLike = resultFromDraft(draft);
    let nextState: GameState = {
      ...gameState,
      createdTrackIds: addUnique(gameState.createdTrackIds, draft.trackId),
      titleRevealByTrackId: revealTitleFully(gameState.titleRevealByTrackId, draft.trackId),
      drafts: gameState.drafts.filter((item) => item.trackId !== draft.trackId),
      publishedTracks: upsertPublished(gameState.publishedTracks, published),
      publishedTrackIds: addUnique(gameState.publishedTrackIds, draft.trackId),
      groupMessages: [...gameState.groupMessages, ...groupPublishMessages(published)],
      stats: applyStatDelta(gameState.stats, getStatDelta(resultLike, 'publish')),
    };
    nextState = triggerEchoAfterPublish(nextState, published);
    nextState = updateResonanceState(nextState, draft.bestAccuracy);
    nextState = applyResonanceEffects(nextState);
    nextState = updateEndingState(nextState);

    setGameState(nextState);
    runStoryAction('track.published', nextState);
    if (nextState.stats.chatPressure >= 35) runStoryAction('neura.glitchSpike', nextState);
    showEnvironmentalEcho(nextState.echo.lastPhrase ? `Echo: ${nextState.echo.lastPhrase}` : 'Echo publikacji wraca przez EVENTS');
    recordNeuraPresenceEvent('published');
    returnToDesktop('messenger');
    setMessengerTab('group');
  }

  function openPlayer(published: PublishedTrack) {
    setSelectedPublishedId(published.id);
    setActiveWindow('player');
  }

  function returnToDesktop(windowId: WindowId = activeWindow) {
    setScreen('desktop');
    setActiveRun(null);
    setResult(null);
    setActiveWindow(windowId);
  }

  function resetPrototype() {
    setGameState(defaultState);
    const resetDirectorState = createDefaultNeuraVoiceDirectorState();
    neuraVoiceDirectorStateRef.current = resetDirectorState;
    setNeuraVoiceDirectorState(resetDirectorState);
    setStoryVoiceLineId(null);
    setLastDialogueEventId(null);
    setNeuraVoiceDirectorDebug('');
    setActiveWindow('messenger');
    setActiveHiddenWindow(null);
    setBootElapsedMs(0);
    initialScreenRef.current = 'desktop';
    setScreen('title');
    setActiveRun(null);
    setResult(null);
    setSelectedPublishedId(null);
    setNeuraDebugOverride(null);
    setLastNeuraEventId('boot');
    setNeuraEventLog([{ id: 'boot', at: new Date().toISOString() }]);
  }

  if (screen === 'rhythm' && activeRun) {
    return (
      <RhythmScreen
        activeRun={activeRun}
        displayTitle={getDisplayTitle(activeRun.track.id, activeRun.track.title)}
        neuraComment={neuraComments[neuraIndex]}
        neuraPresence={neuraPresence}
        resonanceEffects={gameState.resonance.effects}
        tutorialStep={neuraTutorialStep}
        overlayDragEnabled={isDebugOverlayDragEnabled}
        overlayPositions={overlayPositions}
        onOverlayMove={(overlayId, position) => setOverlayPositions((state) => ({ ...state, [overlayId]: position }))}
        tutorialDismissed={isTutorialDismissed}
        onDismissTutorial={() => setIsTutorialDismissed(true)}
        onNeuraPresenceEvent={recordNeuraPresenceEvent}
        onFinish={finishRun}
        onExit={() => returnToDesktop(activeRun.mode === 'create' ? 'create' : 'me')}
      />
    );
  }

  if (screen === 'title') {
    return <TitleScreen onStart={startBootFromTitle} />;
  }

  if (screen === 'boot') {
    return <BootScreen elapsedMs={bootElapsedMs} onSkip={completeBoot} />;
  }

  if (screen === 'editor') {
    return <BeatmapEditor onExit={() => {
      window.history.replaceState(null, '', window.location.pathname);
      setScreen('desktop');
    }} />;
  }

  if (screen === 'results' && result && activeRun) {
    return (
      <ResultsScreen
        result={result}
        displayTitle={getDisplayTitle(result.trackId, result.trackTitle)}
        runMode={activeRun.mode}
        remixComparison={activeRemixDraft ? createRemixComparison(activeRemixDraft, result) : null}
        alreadyPublished={gameState.publishedTrackIds.includes(result.trackId)}
        neuraComment={neuraComments[neuraIndex]}
        neuraPresence={neuraPresence}
        tutorialStep={neuraTutorialStep}
        overlayDragEnabled={isDebugOverlayDragEnabled}
        overlayPositions={overlayPositions}
        onOverlayMove={(overlayId, position) => setOverlayPositions((state) => ({ ...state, [overlayId]: position }))}
        tutorialDismissed={isTutorialDismissed}
        onDismissTutorial={() => setIsTutorialDismissed(true)}
        onNeuraPresenceEvent={recordNeuraPresenceEvent}
        onSave={() => saveInitialDraft('inDrawer')}
        onSendToPawel={() => saveInitialDraft('sentToPawel')}
        onPublish={publishInitialResult}
        onOverwrite={overwriteDraft}
        onBack={() => returnToDesktop(activeRun.mode === 'create' ? 'create' : 'me')}
      />
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
          setScreen('editor');
        }}>Beatmap Editor</button>
        <button
          className={`audio-toggle ${soundscape.isMuted ? 'muted' : ''} ${soundscape.isUnlocked ? '' : 'waiting'}`}
          onClick={soundscape.toggleMuted}
          type="button"
        >
          Dźwięk: {soundscape.isMuted ? 'wył.' : 'wł.'}
        </button>
        <button onClick={resetPrototype}>{buttonLabels.resetSave}</button>
      </header>

      <section className="icons" aria-label="Ikony pulpitu">
        <DesktopIcon label={iconLabels.messenger} symbol={iconSymbols.messenger} onClick={() => setActiveWindow('messenger')} />
        <DesktopIcon label={iconLabels.create} symbol={iconSymbols.create} onClick={() => setActiveWindow('create')} />
        <DesktopIcon label={iconLabels.me} symbol={iconSymbols.me} onClick={() => setActiveWindow('me')} />
        <DesktopIcon label={iconLabels.ustniki} symbol={iconSymbols.ustniki} onClick={() => setActiveWindow('ustniki')} />
        <DesktopIcon label={iconLabels.titleHub} symbol={iconSymbols.titleHub} onClick={() => setActiveWindow('titleHub')} />
        <DesktopIcon label={iconLabels.todo} symbol={iconSymbols.todo} onClick={() => setIsTodoVisible((current) => !current)} muted />
        {gameState.publishedTracks.map((published) => (
          <DesktopIcon
            key={published.id}
            label={`${iconLabels.publishedFilePrefix}: ${published.trackTitle}`}
            symbol={iconSymbols.publishedFile}
            onClick={() => openPlayer(published)}
          />
        ))}
      </section>

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
        <StatsPanel stats={gameState.stats} />
      </DraggableOverlay>
      <PersistentOverlays
        comment={neuraComments[neuraIndex]}
        presenceState={neuraPresence}
        onPresenceEvent={recordNeuraPresenceEvent}
        storyVoiceLineId={storyVoiceLineId}
        tutorialStep={neuraTutorialStep}
        onTutorialTarget={focusNeuraTutorialTarget}
        webcamEvent="idle"
        dragEnabled={isDebugOverlayDragEnabled}
        webcamPosition={overlayPositions.webcam}
        onWebcamMove={(position) => setOverlayPositions((state) => ({ ...state, webcam: position }))}
        tutorialPosition={overlayPositions.tutorial}
        onTutorialMove={(position) => setOverlayPositions((state) => ({ ...state, tutorial: position }))}
        tutorialDismissed={isTutorialDismissed}
        onTutorialDismiss={() => setIsTutorialDismissed(true)}
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

      {isTodoVisible && (
        <DraggableOverlay
          className="todo-widget"
          position={overlayPositions.todo}
          onMove={(position) => setOverlayPositions((state) => ({ ...state, todo: position }))}
          dragEnabled={isDebugOverlayDragEnabled}
        >
          <strong>{placeholderLabels.todoTitle}</strong>
          {placeholderLabels.todoItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </DraggableOverlay>
      )}

      <section className="core-loop-strip" aria-label="Core loop">
        <strong>Core loop:</strong>
        <span>twórz utwór</span>
        <i aria-hidden="true" />
        <span>test rytmiczny</span>
        <i aria-hidden="true" />
        <span>decyzja</span>
        <i aria-hidden="true" />
        <span>szuflada / publikacja / nieudany song</span>
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
            titleRevealByTrackId={gameState.titleRevealByTrackId}
            publishedTrackIds={gameState.publishedTrackIds}
            corruptionTick={corruptionTick}
            onRemix={startRemix}
            onSendToPawel={sendDraftToPawel}
            onPublish={publishDraft}
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
          <UstnikiWindow />
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
            setScreen('title');
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

function BootScreen({ elapsedMs, onSkip }: { elapsedMs: number; onSkip: () => void }) {
  const progress = getBootProgress(elapsedMs);
  const visibleSteps = getVisibleBootSteps(progress);
  const visibleLogs = getVisibleBootLogs(progress);
  const canSkip = elapsedMs >= BOOT_SKIP_AFTER_MS;

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
  label,
  symbol,
  muted = false,
  onClick,
}: {
  label: string;
  symbol: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`desktop-icon ${muted ? 'muted' : ''}`} onClick={onClick}>
      <span>{symbol}</span>
      {label}
    </button>
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
          <p><span>&gt; [SYS]</span> build: placeholder-window-pass</p>
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
}: {
  tab: 'pawel' | 'group';
  onTabChange: (tab: 'pawel' | 'group') => void;
  pawelMessages: GameState['pawelMessages'];
  groupMessages: GameState['groupMessages'];
}) {
  const messages = tab === 'pawel' ? pawelMessages : groupMessages;

  return (
    <>
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
}: {
  tracks: Track[];
  titleRevealByTrackId: GameState['titleRevealByTrackId'];
  publishedTrackIds: string[];
  corruptionTick: number;
  onCreate: (track: Track) => void;
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
            <button onClick={() => onCreate(track)}>{buttonLabels.createFirstVersion}</button>
          </article>
        );
      })}
    </div>
  );
}

function MeWindow({
  drafts,
  titleRevealByTrackId,
  publishedTrackIds,
  corruptionTick,
  onRemix,
  onSendToPawel,
  onPublish,
}: {
  drafts: DraftTrack[];
  titleRevealByTrackId: GameState['titleRevealByTrackId'];
  publishedTrackIds: string[];
  corruptionTick: number;
  onRemix: (draft: DraftTrack) => void;
  onSendToPawel: (draft: DraftTrack) => void;
  onPublish: (draft: DraftTrack) => void;
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
              <span>{draft.difficulty} / {draft.bestAccuracy}% / {placeholderLabels.grade} {draft.bestGrade} / {draft.qualityProgress} pkt</span>
              <em>Status: {statusLabels[draft.status]}</em>
              {!nextDifficulty && <em>{statusLabels.noRemix}</em>}
            </div>
            <div className="difficulty-row">
              <button disabled={!nextDifficulty} onClick={() => onRemix(draft)}>
                {nextDifficulty ? `${buttonLabels.remix}: ${nextDifficulty}` : buttonLabels.remix}
              </button>
              {draft.status === 'inDrawer' && (
                <button onClick={() => onSendToPawel(draft)}>{buttonLabels.sendToPawel}</button>
              )}
              <button disabled={publishedTrackIds.includes(draft.trackId)} onClick={() => onPublish(draft)}>
                {publishedTrackIds.includes(draft.trackId) ? placeholderLabels.publishedLocked : buttonLabels.publish}
              </button>
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
  tutorialStep,
  overlayDragEnabled,
  overlayPositions,
  onOverlayMove,
  tutorialDismissed,
  onDismissTutorial,
  onNeuraPresenceEvent,
  onFinish,
  onExit,
}: {
  activeRun: ActiveRun;
  displayTitle: string;
  neuraComment: NeuraVoiceLine;
  neuraPresence: ReturnType<typeof createNeuraPresenceState>;
  resonanceEffects: ResonanceVisualEffects;
  tutorialStep: NeuraTutorialStep | null;
  overlayDragEnabled: boolean;
  overlayPositions: Record<OverlayId, Point>;
  onOverlayMove: (overlayId: OverlayId, position: Point) => void;
  tutorialDismissed: boolean;
  onDismissTutorial: () => void;
  onNeuraPresenceEvent: (eventId: NeuraPresenceEventId) => void;
  onFinish: (summary: RhythmSummary) => void;
  onExit: () => void;
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
  const [session, setSession] = useState<RhythmSession>(() => createRhythmSession(beatmap, activeRun.difficulty));
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
    const nextSession = createRhythmSession(beatmap, activeRun.difficulty);
    sessionRef.current = nextSession;
    finishedRef.current = false;
    setSession(nextSession);
    setVocalPeaks(createFallbackPeaks(beatmap.bpm));
    setHitFeedbacks([]);
    heldLanesRef.current.clear();
    rhythmSfx.stopAllHolds();
    gameClockFallbackMsRef.current = 0;
  }, [activeRun.difficulty, beatmap, rhythmSfx]);

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
      label: activeHold && judgement === 'good' ? 'Hold' : judgementLabel(judgement),
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
        neuraTutorial: tutorialStep
          ? {
              id: tutorialStep.id,
              title: tutorialStep.title,
              order: tutorialStep.order,
              total: tutorialStep.total,
            }
          : null,
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
  }, [activeRun, audioDurationMs, neuraPresence, resonanceEffects, stepByMs, tutorialStep]);

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
        <button onClick={() => setDebugMode((current) => (current === 'window' ? null : 'window'))}>Rhythm debug</button>
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
        tutorialStep={tutorialStep}
        webcamEvent="rhythm"
        musicBpm={beatmap.bpm}
        dragEnabled={overlayDragEnabled}
        webcamPosition={overlayPositions.webcam}
        onWebcamMove={(position) => onOverlayMove('webcam', position)}
        tutorialPosition={overlayPositions.tutorial}
        onTutorialMove={(position) => onOverlayMove('tutorial', position)}
        tutorialDismissed={tutorialDismissed}
        onTutorialDismiss={onDismissTutorial}
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
    <aside className={compact ? 'rhythm-debug compact' : 'rhythm-debug'} aria-label="Rhythm debug">
      <strong>Rhythm debug</strong>
      <span>audio: {formatDebugTime(payload.audioDurationMs)}</span>
      <span>start: {formatDebugTime(payload.sourceStartMs)}</span>
      <span>koniec: {formatDebugTime(payload.sourceEndMs)}</span>
      <span>poziom: {formatDebugTime(payload.beatmapDurationMs)}</span>
      <span>mapa: {payload.beatmapSource}</span>
      <span>nuty: {payload.notes}</span>
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
  if (judgement === 'perfect') return 'Perfect';
  if (judgement === 'great') return 'Great';
  if (judgement === 'good') return 'Good';
  if (judgement === 'too_fast') return 'Too fast';
  if (judgement === 'too_late') return 'Too late';
  if (judgement === 'miss') return 'Miss';
  if (judgement === 'empty') return 'Klik';
  return 'Złap rytm';
}

function ResultsScreen({
  result,
  displayTitle,
  runMode,
  remixComparison,
  alreadyPublished,
  neuraComment,
  neuraPresence,
  tutorialStep,
  overlayDragEnabled,
  overlayPositions,
  onOverlayMove,
  tutorialDismissed,
  onDismissTutorial,
  onNeuraPresenceEvent,
  onSave,
  onSendToPawel,
  onPublish,
  onOverwrite,
  onBack,
}: {
  result: PerformanceResult;
  displayTitle: string;
  runMode: ActiveRun['mode'];
  remixComparison: RemixComparison | null;
  alreadyPublished: boolean;
  neuraComment: NeuraVoiceLine;
  neuraPresence: ReturnType<typeof createNeuraPresenceState>;
  tutorialStep: NeuraTutorialStep | null;
  overlayDragEnabled: boolean;
  overlayPositions: Record<OverlayId, Point>;
  onOverlayMove: (overlayId: OverlayId, position: Point) => void;
  tutorialDismissed: boolean;
  onDismissTutorial: () => void;
  onNeuraPresenceEvent: (eventId: NeuraPresenceEventId) => void;
  onSave: () => void;
  onSendToPawel: () => void;
  onPublish: () => void;
  onOverwrite: () => void;
  onBack: () => void;
}) {
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
        {runMode === 'remix' && remixComparison && (
          <RemixComparisonPanel comparison={remixComparison} />
        )}
        <div className="result-actions">
          {runMode === 'create' ? (
            <>
              <button onClick={onSave}>{buttonLabels.saveDraft}</button>
              <button onClick={onSendToPawel}>{buttonLabels.sendToPawel}</button>
              <button className="result-primary" onClick={onPublish} disabled={alreadyPublished}>
                {alreadyPublished ? placeholderLabels.publishedLocked : buttonLabels.publish}
              </button>
            </>
          ) : (
            <button className="result-primary" onClick={onOverwrite}>{buttonLabels.overwriteDraft}</button>
          )}
          <button className="result-secondary" onClick={onBack}>{buttonLabels.backWithoutSave}</button>
        </div>
      </section>
      <PersistentOverlays
        comment={neuraComment}
        presenceState={neuraPresence}
        onPresenceEvent={onNeuraPresenceEvent}
        tutorialStep={tutorialStep}
        webcamEvent={runMode === 'create' && result.grade !== 'F' ? 'published' : 'review'}
        dragEnabled={overlayDragEnabled}
        webcamPosition={overlayPositions.webcam}
        onWebcamMove={(position) => onOverlayMove('webcam', position)}
        tutorialPosition={overlayPositions.tutorial}
        onTutorialMove={(position) => onOverlayMove('tutorial', position)}
        tutorialDismissed={tutorialDismissed}
        onTutorialDismiss={onDismissTutorial}
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

function StatsPanel({ stats }: { stats: GameState['stats'] }) {
  return (
    <>
      <Stat label={statLabels.performance} value={stats.performance} />
      <Stat label={statLabels.cybart} value={stats.cybart} />
      <Stat label={statLabels.chatPressure} value={stats.chatPressure} />
    </>
  );
}

function EventCutsceneStage({
  echo,
  resonance,
  ending,
  stats,
  onClose,
}: {
  echo: GameState['echo'];
  resonance: GameState['resonance'];
  ending: GameState['ending'];
  stats: GameState['stats'];
  onClose: () => void;
}) {
  const latestMessages = echo.messages.slice(0, 3);
  const phrase = echo.lastPhrase ?? 'Puste miejsce po decyzji wraca jako szum.';
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

  return (
    <section className="event-cutscene-stage" aria-label="EVENTS">
      <div className="event-cutscene-glitch" />
      <div className="event-cutscene-desktop">
        <header className="event-cutscene-topbar">
          <strong>EVENTS</strong>
          <span>{echo.activeCutsceneId ?? 'events.idle'}</span>
          <button type="button" onClick={onClose}>Zamknij zakłócenie</button>
        </header>

        <div className="event-cutscene-icons" aria-hidden="true">
          <span>MSG</span>
          <span>CRT</span>
          <span>NEU</span>
        </div>

        <article className="event-cutscene-window event-cutscene-window-main">
          <strong>Neura powtarza decyzję</strong>
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
          <strong>Decyzja podświetlona przez echo</strong>
          <button className="event-decision highlighted" type="button">Publikuj dalej</button>
          <button className="event-decision" type="button">Schowaj do szuflady</button>
          <button className="event-decision" type="button">Wyślij Pawciowi</button>
        </article>

        <article className="event-cutscene-window event-cutscene-window-neura">
          <strong>Neura</strong>
          <span>echo: {echo.echoCount}</span>
          <span>rezonans: {resonanceLabel} / {resonance.score}</span>
          <span>więź: {bondLabel}</span>
          <span>ending: {ending.label}</span>
        </article>

        <article className="event-cutscene-window event-cutscene-window-stats">
          <strong>Impuls końcowy</strong>
          <span>performance {stats.performance}</span>
          <span>chat {stats.chatPressure}</span>
          <span>cybart {stats.cybart}</span>
          <span>trasa {ending.route}</span>
        </article>
      </div>
    </section>
  );
}

function UstnikiWindow() {
  return (
    <div className="window-list">
      <strong>{placeholderLabels.ustnikiWindowStatus}</strong>
      {placeholderLabels.ustnikiChallenges.map((challenge) => (
        <p key={challenge}>{challenge} / wkrótce</p>
      ))}
    </div>
  );
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
      <strong>{value}</strong>
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
        <strong>Neura debug</strong>
        <button onClick={() => onSetOverride(null)}>Auto</button>
      </div>
      <span>poziom: {presenceState.powerLevel} / {presenceState.narrativeTag}</span>
      <span>glitch: {formatPresenceValue(presenceState.glitchIntensity)}</span>
      <span>ambient: {formatPresenceValue(presenceState.ambientDepth)}</span>
      <span>avatar: {formatPresenceValue(presenceState.avatarInstability)}</span>
      <span>UI: {formatPresenceValue(presenceState.uiAutonomy)}</span>
      <span>aktywne glitche: {activeGlitchCount}</span>
      <span>ostatni event: {presenceState.lastEventId}</span>
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
  tutorialStep,
  onTutorialTarget,
  webcamEvent = 'idle',
  musicBpm,
  dragEnabled,
  webcamPosition,
  onWebcamMove,
  tutorialPosition,
  onTutorialMove,
  tutorialDismissed,
  onTutorialDismiss,
}: {
  comment: NeuraVoiceLine;
  presenceState: ReturnType<typeof createNeuraPresenceState>;
  onPresenceEvent: (eventId: NeuraPresenceEventId) => void;
  storyVoiceLineId?: string | null;
  tutorialStep?: NeuraTutorialStep | null;
  onTutorialTarget?: (step: NeuraTutorialStep) => void;
  webcamEvent?: CybekWebcamEvent;
  musicBpm?: number;
  dragEnabled: boolean;
  webcamPosition: Point;
  onWebcamMove: (position: Point) => void;
  tutorialPosition: Point;
  onTutorialMove: (position: Point) => void;
  tutorialDismissed: boolean;
  onTutorialDismiss: () => void;
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
      <NeuraTutorialGuide
        step={tutorialDismissed ? null : (tutorialStep ?? null)}
        onOpenTarget={onTutorialTarget}
        dragEnabled={dragEnabled}
        position={tutorialPosition}
        onMove={onTutorialMove}
        onClose={onTutorialDismiss}
      />
      <NeuraPet
        comment={comment}
        presenceState={presenceState}
        onPresenceEvent={onPresenceEvent}
        storyVoiceLineId={storyVoiceLineId}
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
