import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { neuraComments } from './data/messages';
import { neuraVoiceAssets } from './data/neuraVoiceAssets';
import { neuraReactionVoiceLineIds, type NeuraVoiceLine, type NeuraVoiceLineId } from './data/neuraVoiceLines';
import { chatAuthors, groupPublishMessages, pawelDraftMessage } from './data/chatReactions';
import { tracks } from './data/tracks';
import { BeatmapEditor } from './editor/BeatmapEditor';
import {
  addMessage,
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
import type { Difficulty, DraftTrack, GameState, PerformanceResult, PublishedTrack, RhythmLane, RhythmSummary, Track } from './types';

type WindowId = 'messenger' | 'create' | 'me' | 'player' | null;
type Screen = 'desktop' | 'rhythm' | 'results' | 'editor';
type Point = { x: number; y: number };
type NeuraPetMood = 'idle' | 'waving' | 'jumping' | 'failed' | 'waiting' | 'running' | 'review';
type HitFeedback = {
  id: number;
  lane: RhythmLane;
  label: string;
  judgement: 'perfect' | 'great' | 'good' | 'miss';
};

type NeuraAnimation = {
  row: number;
  frames: number;
  duration: string;
  label: string;
};

const NEURA_SPRITESHEET_PATH = `${import.meta.env.BASE_URL}pets/neura/spritesheet.webp`;
const NEURA_COMMENT_INTERVAL_MS = 27500;
const NEURA_ANIMATIONS: Record<NeuraPetMood, NeuraAnimation> = {
  idle: { row: 0, frames: 6, duration: '1.1s', label: 'czuwanie' },
  running: { row: 7, frames: 6, duration: '0.82s', label: 'przeciąganie' },
  waving: { row: 3, frames: 4, duration: '0.84s', label: 'kontakt' },
  jumping: { row: 4, frames: 5, duration: '0.92s', label: 'impuls' },
  failed: { row: 5, frames: 8, duration: '1.28s', label: 'glitch' },
  waiting: { row: 6, frames: 6, duration: '1.16s', label: 'nasłuch' },
  review: { row: 8, frames: 6, duration: '1.22s', label: 'analiza' },
};
const NEURA_REACTION_SEQUENCE: NeuraPetMood[] = ['waving', 'review', 'failed'];

type ActiveRun = {
  track: Track;
  difficulty: Difficulty;
  mode: 'create' | 'remix';
  draftId?: string;
};

type RhythmPhase = 'loading' | 'countdown' | 'playing';

type RemixComparison = {
  previousAccuracy: number;
  previousGrade: string;
  nextAccuracy: number;
  nextGrade: string;
  accuracyDelta: number;
  verdict: 'better' | 'same' | 'worse';
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => loadState());
  const [activeWindow, setActiveWindow] = useState<WindowId>('messenger');
  const [screen, setScreen] = useState<Screen>(() => (window.location.hash === '#editor' ? 'editor' : 'desktop'));
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [result, setResult] = useState<PerformanceResult | null>(null);
  const [messengerTab, setMessengerTab] = useState<'pawel' | 'group'>('pawel');
  const [neuraIndex, setNeuraIndex] = useState(0);
  const [corruptionTick, setCorruptionTick] = useState(0);
  const [selectedPublishedId, setSelectedPublishedId] = useState<string | null>(null);
  const [windowPositions, setWindowPositions] = useState<Record<Exclude<WindowId, null>, Point>>({
    messenger: { x: 170, y: 92 },
    create: { x: 210, y: 116 },
    me: { x: 250, y: 140 },
    player: { x: 300, y: 180 },
  });

  useEffect(() => saveState(gameState), [gameState]);

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
      });
    window.advanceTime = () => undefined;
  }, [activeRun, activeWindow, gameState, result, screen]);

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
    setActiveRun({ track, difficulty, mode, draftId });
    setResult(null);
    setScreen('rhythm');
  }

  function finishRun(summary: RhythmSummary) {
    if (!activeRun) return;
    setResult(createResult(activeRun.track.id, activeRun.track.title, activeRun.difficulty, summary));
    setScreen('results');
  }

  function saveInitialDraft(status: DraftTrack['status']) {
    if (!result) return;
    const draft = createDraftFromResult(result, status);

    setGameState((state) => ({
      ...state,
      createdTrackIds: addUnique(state.createdTrackIds, result.trackId),
      titleRevealByTrackId: revealTitleByAccuracy(state.titleRevealByTrackId, result.trackId, result.accuracy),
      drafts: upsertDraft(state.drafts, draft),
      pawelMessages:
        status === 'sentToPawel'
          ? addMessage(
              state.pawelMessages,
              chatAuthors.cybek,
              pawelDraftMessage(
                result,
                maskTrackTitle(
                  result.trackTitle,
                  getTitleReveal(state.titleRevealByTrackId, result.trackId, state.publishedTrackIds.includes(result.trackId)),
                  result.trackId,
                  corruptionTick,
                ),
              ),
            )
          : state.pawelMessages,
      stats: applyStatDelta(state.stats, getStatDelta(result, status === 'sentToPawel' ? 'sendToPawel' : 'saveDraft')),
    }));

    returnToDesktop(status === 'sentToPawel' ? 'messenger' : 'me');
    if (status === 'sentToPawel') setMessengerTab('pawel');
  }

  function overwriteDraft() {
    if (!result || !activeRun?.draftId) return;
    const current = gameState.drafts.find((draft) => draft.id === activeRun.draftId);
    if (!current) return;

    setGameState((state) => ({
      ...state,
      drafts: upsertDraft(state.drafts, improveDraftWithResult(current, result)),
      titleRevealByTrackId: revealTitleByAccuracy(state.titleRevealByTrackId, result.trackId, result.accuracy),
      stats: applyStatDelta(state.stats, getStatDelta(result, 'saveDraft')),
    }));
    returnToDesktop('me');
  }

  function sendDraftToPawel(draft: DraftTrack) {
    const resultLike = resultFromDraft(draft);
    setGameState((state) => ({
      ...state,
      drafts: upsertDraft(state.drafts, { ...draft, status: 'sentToPawel', updatedAt: new Date().toISOString() }),
      titleRevealByTrackId: revealTitleByAccuracy(state.titleRevealByTrackId, draft.trackId, draft.bestAccuracy),
      pawelMessages: addMessage(
        state.pawelMessages,
        chatAuthors.cybek,
        pawelDraftMessage(
          draft,
          maskTrackTitle(
            draft.trackTitle,
            getTitleReveal(state.titleRevealByTrackId, draft.trackId, state.publishedTrackIds.includes(draft.trackId)),
            draft.trackId,
            corruptionTick,
          ),
        ),
      ),
      stats: applyStatDelta(state.stats, getStatDelta(resultLike, 'sendToPawel')),
    }));
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
    setGameState((state) => {
      if (state.publishedTrackIds.includes(draft.trackId)) return state;

      return {
        ...state,
        createdTrackIds: addUnique(state.createdTrackIds, draft.trackId),
        titleRevealByTrackId: revealTitleFully(state.titleRevealByTrackId, draft.trackId),
        drafts: state.drafts.filter((item) => item.trackId !== draft.trackId),
        publishedTracks: upsertPublished(state.publishedTracks, published),
        publishedTrackIds: addUnique(state.publishedTrackIds, draft.trackId),
        groupMessages: [...state.groupMessages, ...groupPublishMessages(published)],
        stats: applyStatDelta(state.stats, getStatDelta(resultFromDraft(draft), 'publish')),
      };
    });
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
    setActiveWindow('messenger');
    setScreen('desktop');
    setActiveRun(null);
    setResult(null);
    setSelectedPublishedId(null);
  }

  if (screen === 'rhythm' && activeRun) {
    return (
      <RhythmScreen
        activeRun={activeRun}
        displayTitle={getDisplayTitle(activeRun.track.id, activeRun.track.title)}
        neuraComment={neuraComments[neuraIndex]}
        onFinish={finishRun}
        onExit={() => returnToDesktop(activeRun.mode === 'create' ? 'create' : 'me')}
      />
    );
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
        onSave={() => saveInitialDraft('inDrawer')}
        onSendToPawel={() => saveInitialDraft('sentToPawel')}
        onPublish={publishInitialResult}
        onOverwrite={overwriteDraft}
        onBack={() => returnToDesktop(activeRun.mode === 'create' ? 'create' : 'me')}
      />
    );
  }

  return (
    <main className="desktop">
      <div className="scanlines" />
      <header className="topbar">
        <strong>{appLabels.desktopTitle}</strong>
        <span>{appLabels.prototypeTitle}</span>
        <button onClick={() => {
          window.history.replaceState(null, '', '#editor');
          setScreen('editor');
        }}>Beatmap Editor</button>
        <button onClick={resetPrototype}>{buttonLabels.resetSave}</button>
      </header>

      <section className="icons" aria-label="Ikony pulpitu">
        <DesktopIcon label={iconLabels.messenger} symbol={iconSymbols.messenger} onClick={() => setActiveWindow('messenger')} />
        <DesktopIcon label={iconLabels.create} symbol={iconSymbols.create} onClick={() => setActiveWindow('create')} />
        <DesktopIcon label={iconLabels.me} symbol={iconSymbols.me} onClick={() => setActiveWindow('me')} />
        <DesktopIcon label={iconLabels.todo} symbol={iconSymbols.todo} onClick={() => setActiveWindow(null)} muted />
        {gameState.publishedTracks.map((published) => (
          <DesktopIcon
            key={published.id}
            label={`${iconLabels.publishedFilePrefix}: ${published.trackTitle}`}
            symbol={iconSymbols.publishedFile}
            onClick={() => openPlayer(published)}
          />
        ))}
      </section>

      <StatsPanel stats={gameState.stats} />
      <PersistentOverlays comment={neuraComments[neuraIndex]} />

      <aside className="todo-widget">
        <strong>{placeholderLabels.todoTitle}</strong>
        {placeholderLabels.todoItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </aside>

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

      {activeWindow === 'player' && selectedPublished && selectedPublishedTrack && (
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
    </main>
  );
}

function addUnique(items: string[], item: string) {
  return items.includes(item) ? items : [...items, item];
}

function upsertDraft(drafts: DraftTrack[], draft: DraftTrack) {
  return [draft, ...drafts.filter((item) => item.id !== draft.id)];
}

function upsertPublished(publishedTracks: PublishedTrack[], published: PublishedTrack) {
  return [published, ...publishedTracks.filter((item) => item.id !== published.id)];
}

function resultFromDraft(draft: DraftTrack): PerformanceResult {
  return {
    id: draft.id,
    trackId: draft.trackId,
    trackTitle: draft.trackTitle,
    difficulty: draft.difficulty,
    accuracy: draft.bestAccuracy,
    grade: draft.bestGrade,
    qualityProgress: draft.qualityProgress,
    comboMultiplier: 1,
    perfectHits: 0,
    greatHits: 0,
    goodHits: 0,
    misses: 0,
    emptyPresses: 0,
    maxCombo: 0,
    totalNotes: 0,
    createdAt: draft.updatedAt,
    status: draft.status,
  };
}

function createRemixComparison(draft: DraftTrack, result: PerformanceResult): RemixComparison {
  const accuracyDelta = result.accuracy - draft.bestAccuracy;
  const verdict = accuracyDelta > 0 ? 'better' : accuracyDelta < 0 ? 'worse' : 'same';

  return {
    previousAccuracy: draft.bestAccuracy,
    previousGrade: draft.bestGrade,
    nextAccuracy: result.accuracy,
    nextGrade: result.grade,
    accuracyDelta,
    verdict,
  };
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

function Window({
  title,
  address,
  children,
  position,
  onMove,
  onClose,
}: {
  title: string;
  address?: string;
  children: ReactNode;
  position: Point;
  onMove: (position: Point) => void;
  onClose: () => void;
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
    const next = {
      x: Math.max(120, Math.min(window.innerWidth - 360, dragRef.current.origin.x + event.clientX - dragRef.current.startX)),
      y: Math.max(48, Math.min(window.innerHeight - 180, dragRef.current.origin.y + event.clientY - dragRef.current.startY)),
    };
    onMove(next);
  }

  function endDrag() {
    dragRef.current = null;
  }

  return (
    <section className="window" style={{ left: position.x, top: position.y }}>
      <div className="window-title" onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag}>
        <strong>{title}</strong>
        <button onClick={onClose}>{buttonLabels.close}</button>
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

function useArcadeSfx() {
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => () => {
    void contextRef.current?.close();
  }, []);

  return useCallback((kind: 'keyboard' | 'hit') => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = contextRef.current ?? new AudioContextCtor();
    contextRef.current = context;
    if (context.state === 'suspended') void context.resume();

    const now = context.currentTime;
    if (kind === 'hit') {
      playTone(context, now, 660, 0.055, 0.06, 'square');
      playTone(context, now + 0.055, 990, 0.06, 0.05, 'triangle');
      return;
    }

    for (let index = 0; index < 4; index += 1) {
      playTone(context, now + index * 0.018, 170 + index * 28, 0.014, 0.035, 'square');
    }
  }, []);
}

function playTone(
  context: AudioContext,
  startTime: number,
  frequency: number,
  duration: number,
  gainValue: number,
  type: OscillatorType,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.01);
}

function RhythmScreen({
  activeRun,
  displayTitle,
  neuraComment,
  onFinish,
  onExit,
}: {
  activeRun: ActiveRun;
  displayTitle: string;
  neuraComment: NeuraVoiceLine;
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
  const [vocalPeaks, setVocalPeaks] = useState<number[]>(() => createFallbackPeaks(activeRun.track.bpm));
  const [hitFeedbacks, setHitFeedbacks] = useState<HitFeedback[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(session);
  const heldLanesRef = useRef<Set<RhythmLane>>(new Set());
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const phaseRef = useRef<RhythmPhase>(phase);
  const countdownRef = useRef(countdownMs);
  const gameClockFallbackMsRef = useRef(0);
  const playSfx = useArcadeSfx();
  const visibleNotes = getVisibleRhythmNotes(session);
  const summary = getRhythmSummary(session);
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
    setVocalPeaks(createFallbackPeaks(activeRun.track.bpm));
    setHitFeedbacks([]);
    heldLanesRef.current.clear();
    gameClockFallbackMsRef.current = 0;
  }, [activeRun.difficulty, activeRun.track.bpm, beatmap]);

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
      setVocalPeaks(createFallbackPeaks(activeRun.track.bpm));
      return;
    }

    let cancelled = false;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      setVocalPeaks(createFallbackPeaks(activeRun.track.bpm));
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
        if (!cancelled) setVocalPeaks(createFallbackPeaks(activeRun.track.bpm));
      })
      .finally(() => {
        void audioContext.close();
      });

    return () => {
      cancelled = true;
    };
  }, [activeRun.track.bpm, vocalAudioSource]);

  const completeRun = useCallback((sessionToFinish: RhythmSession) => {
    if (finishedRef.current) return;

    const finalSession = finishRhythmSession(sessionToFinish);
    sessionRef.current = finalSession;
    finishedRef.current = true;
    setSession(finalSession);
    onFinishRef.current(getRhythmSummary(finalSession));
  }, []);

  const syncToElapsed = useCallback((elapsedMs: number) => {
    if (finishedRef.current) return;

    let nextSession = syncRhythmSessionToElapsed(sessionRef.current, elapsedMs);
    heldLanesRef.current.forEach((lane) => {
      nextSession = holdRhythmLane(nextSession, lane);
    });
    sessionRef.current = nextSession;
    setSession(nextSession);

    if (nextSession.isFinished) {
      window.setTimeout(() => completeRun(nextSession), 0);
    }
  }, [completeRun]);

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

    const activeSmash = nextSession.notes.some((note) =>
      note.lane === lane
      && !note.judged
      && note.startedAtMs !== undefined
      && getRhythmNoteKind(note) === 'smash'
    );
    const feedback: HitFeedback = {
      id: Date.now() + Math.random(),
      lane,
      label: activeSmash && judgement === 'good' ? 'Mash' : judgementLabel(judgement),
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
    const nextSession = hitRhythmLane(sessionRef.current, lane);
    sessionRef.current = nextSession;
    setSession(nextSession);
    playSfx('keyboard');
    showHitFeedback(nextSession);
    if (['perfect', 'great', 'good'].includes(nextSession.lastJudgement ?? '')) playSfx('hit');
  }, [playSfx, showHitFeedback]);

  const releaseLane = useCallback((lane: RhythmLane) => {
    if (finishedRef.current || phaseRef.current !== 'playing') return;

    heldLanesRef.current.delete(lane);
    const nextSession = releaseRhythmLane(sessionRef.current, lane);
    sessionRef.current = nextSession;
    setSession(nextSession);
    showHitFeedback(nextSession);
  }, [showHitFeedback]);

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
      const currentSummary = getRhythmSummary(currentSession);
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
        nextNotes: currentVisibleNotes.slice(0, 12).map((note) => ({
          lane: note.lane,
          kind: getRhythmNoteKind(note),
          timeToHitMs: note.timeToHitMs,
          durationMs: note.durationMs ?? 0,
          requiredPresses: note.requiredPresses ?? 0,
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
  }, [activeRun, audioDurationMs, stepByMs]);

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
        <span>{activeRun.track.bpm} BPM</span>
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
        {RHYTHM_LANES.map((lane) => (
          <div
            className={`lane ${session.lastLane === lane ? 'active-lane' : ''}`}
            key={lane}
            onPointerDown={(event) => pressPointerLane(event, lane)}
            onPointerUp={(event) => releasePointerLane(event, lane)}
            onPointerCancel={(event) => releasePointerLane(event, lane)}
            role="button"
            tabIndex={0}
          >
            {visibleNotes
              .filter((note) => note.lane === lane)
              .map((note) => {
                const kind = getRhythmNoteKind(note);
                const isLong = kind === 'hold' || kind === 'smash';
                return (
                  <span
                    className={[
                      'note',
                      isLong ? kind : '',
                      note.startedAtMs !== undefined && !note.judged ? 'active-note' : '',
                      note.judgement === 'miss' ? 'missed-note' : '',
                    ].filter(Boolean).join(' ')}
                    key={note.id}
                    style={{
                      top: `${isLong ? note.visualTopPercent : note.yPercent}%`,
                      opacity: note.opacity,
                      ...(isLong ? { '--note-height': `${note.durationPercent}%` } : {}),
                      ...(kind === 'smash' ? { '--smash-progress-height': `${Math.round(note.smashProgress * 100)}%` } : {}),
                    } as CSSProperties}
                  >
                    {kind === 'smash' && (
                      <span className="smash-progress">
                        {note.presses ?? 0}
                      </span>
                    )}
                  </span>
                );
              })}
            {hitFeedbacks
              .filter((feedback) => feedback.lane === lane)
              .map((feedback) => (
                <span className={`hit-feedback ${feedback.judgement}`} key={feedback.id}>
                  {feedback.label}
                </span>
              ))}
            <span className="hit-line" />
            <kbd>{lane}</kbd>
          </div>
        ))}
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
      <PersistentOverlays comment={neuraComment} />
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
              <button onClick={onPublish} disabled={alreadyPublished}>
                {alreadyPublished ? placeholderLabels.publishedLocked : buttonLabels.publish}
              </button>
            </>
          ) : (
            <button onClick={onOverwrite}>{buttonLabels.overwriteDraft}</button>
          )}
          <button onClick={onBack}>{buttonLabels.backWithoutSave}</button>
        </div>
      </section>
      <PersistentOverlays comment={neuraComment} />
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
  track: Track;
}) {
  return (
    <div className="player-panel">
      <h2>{published.trackTitle}</h2>
      <p>{placeholderLabels.level}: {published.difficulty}</p>
      <p>{placeholderLabels.grade}: {published.grade} / {published.accuracy}%</p>
      <p>{placeholderLabels.qualityProgress}: {published.qualityProgress}</p>
      <p>{placeholderLabels.quality}: {published.quality}</p>
      <audio className="player-audio" src={track.audio.merged} controls preload="metadata" />
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
    <aside className="stats-panel">
      <Stat label={statLabels.performance} value={stats.performance} />
      <Stat label={statLabels.cybart} value={stats.cybart} />
      <Stat label={statLabels.chatPressure} value={stats.chatPressure} />
    </aside>
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

function useNeuraVoice() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isUnlockedRef = useRef(false);
  const canPlayOpusRef = useRef<boolean | null>(null);
  const queuedLineIdRef = useRef<NeuraVoiceLineId | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  function canPlayOpus() {
    if (canPlayOpusRef.current !== null) return canPlayOpusRef.current;
    const audio = document.createElement('audio');
    canPlayOpusRef.current = audio.canPlayType('audio/ogg; codecs="opus"') !== '';
    return canPlayOpusRef.current;
  }

  const createAudio = useCallback((lineId: NeuraVoiceLineId) => {
    const sources = neuraVoiceAssets[lineId];
    if (!sources) return null;
    return new Audio(canPlayOpus() ? sources.primary : sources.fallback);
  }, []);

  const playQueuedLine = useCallback(() => {
    const queuedLineId = queuedLineIdRef.current;
    queuedLineIdRef.current = null;
    if (!queuedLineId) return;

    const audio = createAudio(queuedLineId);
    if (!audio) return;

    audioRef.current = audio;
    audio.addEventListener('ended', playQueuedLine, { once: true });
    audio.addEventListener('error', playQueuedLine, { once: true });
    audio.play().catch(() => {
      const sources = neuraVoiceAssets[queuedLineId];
      if (!sources || audio.src.endsWith(sources.fallback)) {
        playQueuedLine();
        return;
      }
      const fallbackAudio = new Audio(sources.fallback);
      audioRef.current = fallbackAudio;
      fallbackAudio.addEventListener('ended', playQueuedLine, { once: true });
      fallbackAudio.addEventListener('error', playQueuedLine, { once: true });
      fallbackAudio.play().catch(() => undefined);
    });
  }, [createAudio]);

  return useCallback((lineId: NeuraVoiceLineId, source: 'comment' | 'reaction') => {
    if (source === 'reaction') isUnlockedRef.current = true;
    if (!isUnlockedRef.current) return;

    const currentAudio = audioRef.current;
    if (currentAudio && !currentAudio.paused && !currentAudio.ended) {
      if (source === 'reaction') return;
      queuedLineIdRef.current = lineId;
      return;
    }

    queuedLineIdRef.current = lineId;
    playQueuedLine();
  }, [playQueuedLine]);
}

function NeuraPet({ comment }: { comment: NeuraVoiceLine }) {
  const [mood, setMood] = useState<NeuraPetMood>('idle');
  const [position, setPosition] = useState<Point>(() => getDefaultNeuraPosition());
  const dragRef = useRef<{ startX: number; startY: number; origin: Point; moved: boolean } | null>(null);
  const reactionIndexRef = useRef(0);
  const settleTimerRef = useRef<number | null>(null);
  const playNeuraVoice = useNeuraVoice();
  const animation = NEURA_ANIMATIONS[mood];

  useEffect(() => {
    function handleResize() {
      setPosition((current) => clampNeuraPosition(current));
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  useEffect(() => {
    playNeuraVoice(comment.id, 'comment');
  }, [comment.id, playNeuraVoice]);

  function settleMood(nextMood: NeuraPetMood, delayMs = 1500) {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    setMood(nextMood);
    settleTimerRef.current = window.setTimeout(() => {
      setMood('idle');
      settleTimerRef.current = null;
    }, delayMs);
  }

  function playReaction(nextMood: NeuraPetMood) {
    settleMood(nextMood);
    const reactionLineId = neuraReactionVoiceLineIds[nextMood as keyof typeof neuraReactionVoiceLineIds];
    if (reactionLineId) playNeuraVoice(reactionLineId, 'reaction');
  }

  function cycleReaction() {
    const nextMood = NEURA_REACTION_SEQUENCE[reactionIndexRef.current % NEURA_REACTION_SEQUENCE.length];
    reactionIndexRef.current += 1;
    playReaction(nextMood);
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>) {
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
      moved: false,
    };
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    setMood('running');
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) dragRef.current.moved = true;
    setPosition(clampNeuraPosition({ x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy }));
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;

    const wasMoved = dragRef.current.moved;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (wasMoved) {
      settleMood('jumping', 900);
      return;
    }
    cycleReaction();
  }

  const style = {
    '--neura-x': `${position.x}px`,
    '--neura-y': `${position.y}px`,
    '--neura-row': animation.row,
    '--neura-frames': animation.frames,
    '--neura-duration': animation.duration,
    '--neura-sprite': `url("${NEURA_SPRITESHEET_PATH}")`,
  } as CSSProperties;

  return (
    <aside className={`neura neura-${mood}`} style={style} aria-live="polite">
      <button
        className="neura-sprite-pad"
        type="button"
        onPointerDown={beginDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label="Neura: kliknij lub przeciągnij"
        title="Kliknij lub przeciągnij Neurę"
      >
        <span className="neura-sprite" aria-hidden="true" />
      </button>
      <div className="neura-panel">
        <div className="neura-status">
          <strong>Neura</strong>
          <span>{animation.label}</span>
        </div>
        <p>{comment.text}</p>
        <div className="neura-actions" aria-label="Reakcje Neury">
          <button type="button" onClick={() => playReaction('waving')}>Hej</button>
          <button type="button" onClick={() => playReaction('review')}>Analiza</button>
          <button type="button" onClick={() => playReaction('failed')}>Glitch</button>
        </div>
      </div>
    </aside>
  );
}

function getDefaultNeuraPosition(): Point {
  return clampNeuraPosition({ x: window.innerWidth - 344, y: window.innerHeight - 242 });
}

function clampNeuraPosition(position: Point): Point {
  const maxX = Math.max(24, window.innerWidth - 324);
  const maxY = Math.max(66, window.innerHeight - 214);

  return {
    x: Math.max(24, Math.min(maxX, position.x)),
    y: Math.max(66, Math.min(maxY, position.y)),
  };
}

function CybekWebcam() {
  return (
    <aside className="webcam">
      <div className="webcam-title">
        <strong>{appLabels.webcam}</strong>
        <span>{appLabels.live}</span>
      </div>
      <div className="webcam-feed">
        <div className="cybek-head">
          <span className="cybek-hair" />
          <span className="cybek-face" />
          <span className="cybek-mouth" />
        </div>
        <div className="mixer">
          <i />
          <i />
          <i />
        </div>
      </div>
    </aside>
  );
}

function PersistentOverlays({ comment }: { comment: NeuraVoiceLine }) {
  return (
    <>
      <CybekWebcam />
      <NeuraPet comment={comment} />
    </>
  );
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    webkitAudioContext?: typeof AudioContext;
  }
}
