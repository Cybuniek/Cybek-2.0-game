import { useEffect, useMemo, useRef, useState } from 'react';
import { neuraComments } from './data/messages';
import { chatAuthors, groupPublishMessage, pawelDraftMessage } from './data/chatReactions';
import { tracks } from './data/tracks';
import {
  addMessage,
  applyStatDelta,
  createDraftFromResult,
  createPublishedTrack,
  createResult,
  defaultState,
  getNextDifficulty,
  getStatDelta,
  loadState,
  saveState,
} from './storage';
import {
  addresses,
  appLabels,
  buttonLabels,
  iconLabels,
  iconSymbols,
  messengerTabs,
  placeholderLabels,
  statLabels,
  statusLabels,
  windowLabels,
} from './data/uiLabels';
import type { Difficulty, DraftTrack, GameState, PerformanceResult, PublishedTrack, Track } from './types';

type WindowId = 'messenger' | 'create' | 'me' | 'player' | null;
type Screen = 'desktop' | 'rhythm' | 'results';
type Point = { x: number; y: number };

type ActiveRun = {
  track: Track;
  difficulty: Difficulty;
  mode: 'create' | 'remix';
  draftId?: string;
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => loadState());
  const [activeWindow, setActiveWindow] = useState<WindowId>('messenger');
  const [screen, setScreen] = useState<Screen>('desktop');
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [result, setResult] = useState<PerformanceResult | null>(null);
  const [messengerTab, setMessengerTab] = useState<'pawel' | 'group'>('pawel');
  const [neuraIndex, setNeuraIndex] = useState(0);
  const [selectedPublishedId, setSelectedPublishedId] = useState<string | null>(null);
  const [playerIsPlaying, setPlayerIsPlaying] = useState(false);
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
    }, 5500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
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

  function finishRun() {
    if (!activeRun) return;
    setResult(createResult(activeRun.track.id, activeRun.track.title, activeRun.difficulty));
    setScreen('results');
  }

  function saveInitialDraft(status: DraftTrack['status']) {
    if (!result) return;
    const draft = createDraftFromResult(result, status);

    setGameState((state) => ({
      ...state,
      createdTrackIds: addUnique(state.createdTrackIds, result.trackId),
      drafts: upsertDraft(state.drafts, draft),
      pawelMessages:
        status === 'sentToPawel'
          ? addMessage(
              state.pawelMessages,
              chatAuthors.cybek,
              pawelDraftMessage(result),
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
      drafts: upsertDraft(state.drafts, {
        ...current,
        difficulty: result.difficulty,
        bestAccuracy: result.accuracy,
        bestGrade: result.grade,
        status: 'inDrawer',
        updatedAt: new Date().toISOString(),
      }),
      stats: applyStatDelta(state.stats, getStatDelta(result, 'saveDraft')),
    }));
    returnToDesktop('me');
  }

  function sendDraftToPawel(draft: DraftTrack) {
    const resultLike = resultFromDraft(draft);
    setGameState((state) => ({
      ...state,
      drafts: upsertDraft(state.drafts, { ...draft, status: 'sentToPawel', updatedAt: new Date().toISOString() }),
      pawelMessages: addMessage(
        state.pawelMessages,
        chatAuthors.cybek,
        pawelDraftMessage(draft),
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
    setGameState((state) => ({
      ...state,
      createdTrackIds: addUnique(state.createdTrackIds, draft.trackId),
      drafts: state.drafts.filter((item) => item.trackId !== draft.trackId),
      publishedTracks: upsertPublished(state.publishedTracks, published),
      publishedTrackIds: addUnique(state.publishedTrackIds, draft.trackId),
      groupMessages: addMessage(
        state.groupMessages,
        chatAuthors.cybek,
        groupPublishMessage(published),
      ),
      stats: applyStatDelta(state.stats, getStatDelta(resultFromDraft(draft), 'publish')),
    }));
    returnToDesktop('messenger');
    setMessengerTab('group');
  }

  function openPlayer(published: PublishedTrack) {
    setSelectedPublishedId(published.id);
    setPlayerIsPlaying(false);
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
    setPlayerIsPlaying(false);
  }

  if (screen === 'rhythm' && activeRun) {
    return (
      <RhythmScreen
        activeRun={activeRun}
        neuraComment={neuraComments[neuraIndex]}
        onFinish={finishRun}
        onExit={() => returnToDesktop(activeRun.mode === 'create' ? 'create' : 'me')}
      />
    );
  }

  if (screen === 'results' && result && activeRun) {
    return (
      <ResultsScreen
        result={result}
        runMode={activeRun.mode}
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
          <CreateWindow tracks={availableCreateTracks} onCreate={startCreate} />
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
          <MeWindow drafts={gameState.drafts} onRemix={startRemix} onSendToPawel={sendDraftToPawel} onPublish={publishDraft} />
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
            isPlaying={playerIsPlaying}
            onPlay={() => setPlayerIsPlaying(true)}
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
    createdAt: draft.updatedAt,
    status: draft.status,
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
  children: React.ReactNode;
  position: Point;
  onMove: (position: Point) => void;
  onClose: () => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; origin: Point } | null>(null);

  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).tagName === 'BUTTON') return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: React.PointerEvent<HTMLDivElement>) {
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

function CreateWindow({ tracks: createTracks, onCreate }: { tracks: Track[]; onCreate: (track: Track) => void }) {
  if (createTracks.length === 0) return <p className="empty">{placeholderLabels.noCreateTracks}</p>;

  return (
    <div className="track-list">
      {createTracks.map((track) => (
        <article className="track-row" key={track.id}>
          <div>
            <strong>{track.title}</strong>
            <span>{track.artist} / {track.bpm} BPM / {track.mood}</span>
            <em>{placeholderLabels.level}: {track.difficulties[0]}</em>
          </div>
          <button onClick={() => onCreate(track)}>{buttonLabels.createFirstVersion}</button>
        </article>
      ))}
    </div>
  );
}

function MeWindow({
  drafts,
  onRemix,
  onSendToPawel,
  onPublish,
}: {
  drafts: DraftTrack[];
  onRemix: (draft: DraftTrack) => void;
  onSendToPawel: (draft: DraftTrack) => void;
  onPublish: (draft: DraftTrack) => void;
}) {
  if (drafts.length === 0) return <p className="empty">{placeholderLabels.noDrafts}</p>;

  return (
    <div className="track-list">
      {drafts.map((draft) => {
        const nextDifficulty = getNextDifficulty(draft.trackId, draft.difficulty);
        return (
          <article className="track-row" key={draft.id}>
            <div>
              <strong>{draft.trackTitle}</strong>
              <span>{draft.difficulty} / {draft.bestAccuracy}% / {placeholderLabels.grade} {draft.bestGrade}</span>
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
              <button onClick={() => onPublish(draft)}>{buttonLabels.publish}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function RhythmScreen({
  activeRun,
  neuraComment,
  onFinish,
  onExit,
}: {
  activeRun: ActiveRun;
  neuraComment: string;
  onFinish: () => void;
  onExit: () => void;
}) {
  return (
    <main className="stage-screen">
      <div className="stage-header">
        <button onClick={onExit}>{buttonLabels.backToDesktop}</button>
        <strong>{activeRun.track.title}</strong>
        <span>{placeholderLabels.level}: {activeRun.difficulty}</span>
      </div>
      <section className="lanes" aria-label={placeholderLabels.rhythmLanesLabel}>
        {['S', 'D', 'J', 'K'].map((key) => (
          <div className="lane" key={key}>
            <span className="note ghost" />
            <kbd>{key}</kbd>
          </div>
        ))}
      </section>
      <button className="primary-action" onClick={onFinish}>
        {buttonLabels.finishTrial}
      </button>
      <PersistentOverlays comment={neuraComment} />
    </main>
  );
}

function ResultsScreen({
  result,
  runMode,
  alreadyPublished,
  neuraComment,
  onSave,
  onSendToPawel,
  onPublish,
  onOverwrite,
  onBack,
}: {
  result: PerformanceResult;
  runMode: ActiveRun['mode'];
  alreadyPublished: boolean;
  neuraComment: string;
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
        <h1>{result.trackTitle}</h1>
        <div className="score-grid">
          <strong>{result.accuracy}%</strong>
          <strong>{result.grade}</strong>
          <span>{placeholderLabels.accuracy}</span>
          <span>{placeholderLabels.grade}</span>
        </div>
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

function PlayerWindow({
  published,
  isPlaying,
  onPlay,
}: {
  published: PublishedTrack;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  return (
    <div className="player-panel">
      <h2>{published.trackTitle}</h2>
      <p>{placeholderLabels.level}: {published.difficulty}</p>
      <p>{placeholderLabels.grade}: {published.grade} / {published.accuracy}%</p>
      <p>{placeholderLabels.quality}: {published.quality}</p>
      <div className="listen-placeholder">
        <span>{isPlaying ? statusLabels.playing : statusLabels.stopped}</span>
        <small>{placeholderLabels.listenPlaceholder}</small>
      </div>
      <button onClick={onPlay}>{buttonLabels.play}</button>
    </div>
  );
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

function NeuraPet({ comment }: { comment: string }) {
  return (
    <aside className="neura">
      <div className="neura-body">
        <span className="eye" />
        <span className="eye" />
        <span className="mouth" />
      </div>
      <p>{comment}</p>
    </aside>
  );
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

function PersistentOverlays({ comment }: { comment: string }) {
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
  }
}
