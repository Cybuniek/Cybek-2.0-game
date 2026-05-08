import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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
  getTitleReveal,
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

type RhythmNote = {
  id: string;
  lane: number;
  delay: number;
  duration: number;
  opacity: number;
  kind: 'tap' | 'hold' | 'smash';
  lengthBeats?: number;
};

type RhythmLink = {
  id: string;
  fromLane: number;
  toLane: number;
  delay: number;
  duration: number;
  opacity: number;
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
  const selectedPublishedTrack = selectedPublished
    ? tracks.find((track) => track.id === selectedPublished.trackId) ?? null
    : null;

  function getDisplayTitle(trackId: string, title: string) {
    const isPublished = gameState.publishedTrackIds.includes(trackId);
    return maskTrackTitle(title, getTitleReveal(gameState.titleRevealByTrackId, trackId, isPublished));
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
      titleRevealByTrackId: revealTitleByAccuracy(state.titleRevealByTrackId, result.trackId, result.accuracy),
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
      titleRevealByTrackId: revealTitleFully(state.titleRevealByTrackId, draft.trackId),
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

  if (screen === 'results' && result && activeRun) {
    return (
      <ResultsScreen
        result={result}
        displayTitle={getDisplayTitle(result.trackId, result.trackTitle)}
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
          <CreateWindow
            tracks={availableCreateTracks}
            titleRevealByTrackId={gameState.titleRevealByTrackId}
            publishedTrackIds={gameState.publishedTrackIds}
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

function CreateWindow({
  tracks: createTracks,
  titleRevealByTrackId,
  publishedTrackIds,
  onCreate,
}: {
  tracks: Track[];
  titleRevealByTrackId: GameState['titleRevealByTrackId'];
  publishedTrackIds: string[];
  onCreate: (track: Track) => void;
}) {
  if (createTracks.length === 0) return <p className="empty">{placeholderLabels.noCreateTracks}</p>;

  return (
    <div className="track-list">
      {createTracks.map((track) => {
        const displayTitle = maskTrackTitle(
          track.title,
          getTitleReveal(titleRevealByTrackId, track.id, publishedTrackIds.includes(track.id)),
        );
        return (
          <article className="track-row" key={track.id}>
            <div>
              <strong>{displayTitle}</strong>
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
  onRemix,
  onSendToPawel,
  onPublish,
}: {
  drafts: DraftTrack[];
  titleRevealByTrackId: GameState['titleRevealByTrackId'];
  publishedTrackIds: string[];
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
        );
        return (
          <article className="track-row" key={draft.id}>
            <div>
              <strong>{displayTitle}</strong>
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
  displayTitle,
  neuraComment,
  onFinish,
  onExit,
}: {
  activeRun: ActiveRun;
  displayTitle: string;
  neuraComment: string;
  onFinish: () => void;
  onExit: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [vocalPeaks, setVocalPeaks] = useState<number[]>(() => createFallbackPeaks(activeRun.track.bpm));
  const notePattern = useMemo(
    () => buildNotePattern(vocalPeaks, activeRun.track.bpm),
    [activeRun.track.bpm, vocalPeaks],
  );

  useEffect(() => {
    let cancelled = false;
    const audioContext = new AudioContext();

    fetch(activeRun.track.audio.vocals)
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

    void audioRef.current?.play().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeRun.track.audio.vocals, activeRun.track.bpm]);

  return (
    <main className="stage-screen">
      <div className="stage-header">
        <button onClick={onExit}>{buttonLabels.backToDesktop}</button>
        <strong>{displayTitle}</strong>
        <span>{placeholderLabels.level}: {activeRun.difficulty}</span>
      </div>
      <audio
        ref={audioRef}
        className="stage-audio"
        src={activeRun.track.audio.instrumental}
        autoPlay
        controls
        preload="auto"
      />
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
      <section className="lanes" aria-label={placeholderLabels.rhythmLanesLabel}>
        {notePattern.links.map((link) => (
          <span
            className="note-link ghost"
            key={link.id}
            style={{
              left: `${(link.fromLane + 0.5) * 25}%`,
              width: `${(link.toLane - link.fromLane) * 25}%`,
              animationDelay: `${link.delay}s`,
              animationDuration: `${link.duration}s`,
              opacity: link.opacity,
            } as CSSProperties}
          />
        ))}
        {['S', 'D', 'J', 'K'].map((key, laneIndex) => (
          <div className="lane" key={key}>
            {notePattern.notes
              .filter((note) => note.lane === laneIndex)
              .map((note) => (
                <span
                  className={`note ${note.kind} ghost`}
                  key={note.id}
                  style={{
                    '--length-beats': note.lengthBeats ?? 1,
                    animationDelay: `${note.delay}s`,
                    animationDuration: `${note.duration}s`,
                    opacity: note.opacity,
                  } as CSSProperties}
                />
              ))}
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
  displayTitle,
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
  displayTitle: string;
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
        <h1>{displayTitle}</h1>
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

function buildNotePattern(peaks: number[], bpm: number): { notes: RhythmNote[]; links: RhythmLink[] } {
  const beatSeconds = 60 / bpm;
  const phraseBeats = 16;
  const phraseLanes = [0, 1, 2, 3, 3, 2, 1, 0, 1, 2, 3, 0, 0, 3, 2, 1];
  const peakGroupSize = Math.max(1, Math.floor(peaks.length / phraseBeats));
  const holdBeats = new Map([
    [4, 2],
    [12, 2],
  ]);
  const smashBeats = new Map([
    [8, 2],
  ]);
  const linkedBeats = new Map([
    [3, [0, 3]],
    [11, [1, 2]],
  ]);

  const notes: RhythmNote[] = Array.from({ length: phraseBeats }, (_, beatIndex) => {
    const groupStart = beatIndex * peakGroupSize;
    const group = peaks.slice(groupStart, groupStart + peakGroupSize);
    const peak = group.length ? Math.max(...group) : peaks[beatIndex % peaks.length] ?? 0.5;
    const isDownbeat = beatIndex % 4 === 0;
    const linkedLanes = linkedBeats.get(beatIndex);
    const lengthBeats = smashBeats.get(beatIndex) ?? holdBeats.get(beatIndex) ?? 1;
    const kind: RhythmNote['kind'] = smashBeats.has(beatIndex) ? 'smash' : holdBeats.has(beatIndex) ? 'hold' : 'tap';

    return {
      id: `beat-${beatIndex}`,
      lane: linkedLanes?.[0] ?? phraseLanes[beatIndex],
      delay: Number((beatIndex * beatSeconds).toFixed(2)),
      duration: Number(Math.max(1.15, beatSeconds * 3.2).toFixed(2)),
      opacity: Number(Math.max(isDownbeat ? 0.72 : 0.5, Math.min(0.92, peak * 0.88)).toFixed(2)),
      kind,
      lengthBeats,
    };
  });

  linkedBeats.forEach(([fromLane, toLane], beatIndex) => {
    const source = notes[beatIndex];
    const groupStart = beatIndex * peakGroupSize;
    const group = peaks.slice(groupStart, groupStart + peakGroupSize);
    const peak = group.length ? Math.max(...group) : 0.68;
    notes.push({
      ...source,
      id: `beat-${beatIndex}-linked`,
      lane: toLane,
      opacity: Number(Math.max(0.62, Math.min(0.92, peak * 0.9)).toFixed(2)),
    });
  });

  const links: RhythmLink[] = Array.from(linkedBeats, ([beatIndex, [fromLane, toLane]]) => ({
    id: `link-${beatIndex}`,
    fromLane: Math.min(fromLane, toLane),
    toLane: Math.max(fromLane, toLane),
    delay: Number((beatIndex * beatSeconds).toFixed(2)),
    duration: Number(Math.max(1.15, beatSeconds * 3.2).toFixed(2)),
    opacity: 0.7,
  }));

  return { notes, links };
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
