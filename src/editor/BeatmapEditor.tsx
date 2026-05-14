import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import manualBeatmaps from '../data/manualBeatmaps.json' with { type: 'json' };
import { tracks } from '../data/tracks';
import {
  createRhythmSession,
  getRhythmNoteKind,
  getRhythmSummary,
  hitRhythmLane,
  releaseRhythmLane,
  resolveRhythmBeatmap,
  RHYTHM_LANES,
  syncRhythmSessionToElapsed,
  type RhythmSession,
} from '../rhythm';
import type { Difficulty, RhythmBeatmap, RhythmLane, RhythmNote } from '../types';
import {
  applyRecordedPress,
  cloneBeatmapForEditing,
  createEditorNote,
  deleteNote,
  downloadJson,
  EDITOR_HIT_LINE_PERCENT,
  EDITOR_VIEW_WINDOW_MS,
  editorNoteHeightPercent,
  laneFromXPercent,
  noteLaneIndex,
  noteVisualTopPercent,
  serializeManualBeatmapCatalog,
  timeToYPercent,
  updateNote,
  upsertNote,
  validateEditorBeatmap,
  viewportStartForElapsed,
  yPercentToTime,
  type EditorMode,
  type KeyPressDraft,
  type ManualBeatmapCatalog,
  type SmashDraft,
} from './beatmapEditorLogic';

type DragState = {
  noteId: string;
  pointerId: number;
  mode: 'move' | 'resize';
};

type BeatmapEditorProps = {
  onExit: () => void;
};

const baseCatalog = manualBeatmaps as ManualBeatmapCatalog;

export function BeatmapEditor({ onExit }: BeatmapEditorProps) {
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? '');
  const selectedTrack = tracks.find((track) => track.id === trackId) ?? tracks[0]!;
  const [difficulty, setDifficulty] = useState<Difficulty>(selectedTrack?.difficulties[0] ?? 'Łatwy');
  const [audioDurationMs, setAudioDurationMs] = useState(selectedTrack?.durationMs ?? 98535);
  const resolvedBeatmap = useMemo(
    () => resolveRhythmBeatmap(selectedTrack, difficulty, audioDurationMs, baseCatalog),
    [audioDurationMs, difficulty, selectedTrack],
  );
  const [beatmap, setBeatmap] = useState<RhythmBeatmap>(() => cloneBeatmapForEditing(resolvedBeatmap));
  const [mode, setMode] = useState<EditorMode>('edit');
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(beatmap.notes[0]?.id ?? null);
  const [zoom, setZoom] = useState(1);
  const [exportMessage, setExportMessage] = useState('Eksport gotowy.');
  const [session, setSession] = useState<RhythmSession>(() => createRhythmSession(beatmap, difficulty));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pressedKeysRef = useRef<Map<RhythmLane, KeyPressDraft>>(new Map());
  const smashDraftRef = useRef<SmashDraft | null>(null);
  const fallbackClockRef = useRef(0);
  const elapsedRef = useRef(elapsedMs);
  const beatmapRef = useRef(beatmap);
  const modeRef = useRef(mode);
  const isPlayingRef = useRef(isPlaying);

  const validation = useMemo(() => validateEditorBeatmap(beatmap), [beatmap]);
  const selectedNote = beatmap.notes.find((note) => note.id === selectedNoteId) ?? null;
  const viewportStartMs = viewportStartForElapsed(elapsedMs, beatmap.durationMs);
  const viewportEndMs = Math.min(beatmap.durationMs, elapsedMs + EDITOR_VIEW_WINDOW_MS);
  const visibleNotes = beatmap.notes.filter((note) => {
    const headPercent = timeToYPercent(note.timeMs, elapsedMs);
    const topPercent = noteVisualTopPercent(note, elapsedMs);
    return topPercent <= 104 && headPercent >= -8;
  });
  const summary = getRhythmSummary(session);
  const sourceStartMs = beatmap.sourceStartMs ?? 0;
  const sourceEndMs = beatmap.sourceEndMs ?? beatmap.durationMs;

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    beatmapRef.current = beatmap;
  }, [beatmap]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const nextDifficulty = selectedTrack.difficulties.includes(difficulty) ? difficulty : selectedTrack.difficulties[0];
    if (nextDifficulty !== difficulty) setDifficulty(nextDifficulty);
    setAudioDurationMs(selectedTrack.durationMs ?? 98535);
  }, [difficulty, selectedTrack]);

  useEffect(() => {
    const editable = cloneBeatmapForEditing(resolvedBeatmap);
    setBeatmap(editable);
    setSelectedNoteId(editable.notes[0]?.id ?? null);
    setElapsedMs(0);
    fallbackClockRef.current = 0;
    setIsPlaying(false);
    const nextSession = createRhythmSession(editable, difficulty);
    setSession(nextSession);
  }, [difficulty, resolvedBeatmap]);

  useEffect(() => {
    if (mode !== 'test') return;
    setSession(createRhythmSession(beatmap, difficulty));
  }, [beatmap, difficulty, mode]);

  useEffect(() => {
    if (!isPlaying) return;

    let frameId = 0;
    let lastFrame = performance.now();

    function tick(now: number) {
      const delta = Math.min(80, now - lastFrame);
      lastFrame = now;
      const audio = audioRef.current;
      const nextElapsed = audio && !audio.paused
        ? Math.max(0, audio.currentTime * 1000 - sourceStartMs)
        : Math.min(beatmapRef.current.durationMs, fallbackClockRef.current + delta);
      fallbackClockRef.current = nextElapsed;
      setElapsedMs(Math.min(beatmapRef.current.durationMs, nextElapsed));

      if (modeRef.current === 'test') {
        setSession((current) => syncRhythmSessionToElapsed(current, Math.max(current.elapsedMs, nextElapsed)));
      }

      if (nextElapsed >= beatmapRef.current.durationMs || (audio && !audio.paused && audio.currentTime * 1000 >= sourceEndMs)) {
        audio?.pause();
        setIsPlaying(false);
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isPlaying, sourceEndMs, sourceStartMs]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (isPlaying) {
      audio?.pause();
      setIsPlaying(false);
      return;
    }

    fallbackClockRef.current = elapsedRef.current;
    if (audio) {
      audio.currentTime = (sourceStartMs + elapsedRef.current) / 1000;
      audio.play().catch(() => undefined);
    }
    setIsPlaying(true);
  }

  function resetTestMode() {
    audioRef.current?.pause();
    setIsPlaying(false);
    setElapsedMs(0);
    fallbackClockRef.current = 0;
    pressedKeysRef.current.clear();
    smashDraftRef.current = null;
    setSession(createRhythmSession(beatmapRef.current, difficulty));
  }

  function createNoteAtPointer(event: ReactPointerEvent<HTMLDivElement>, kind: 'tap' | 'hold' | 'smash' = 'tap') {
    const point = pointerToLaneTime(event);
    if (!point) return;
    const note = createEditorNote(point.lane, point.timeMs, kind);
    setBeatmap((current) => upsertNote(current, note));
    setSelectedNoteId(note.id);
  }

  function pointerToLaneTime(event: ReactPointerEvent<HTMLElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    return {
      lane: laneFromXPercent(xPercent),
      timeMs: yPercentToTime(yPercent, viewportStartMs, beatmapRef.current.durationMs),
    };
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button === 2) {
      event.preventDefault();
      releasePointer(event);
      return;
    }

    if (event.button !== 0 || mode !== 'edit') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    createNoteAtPointer(event);
  }

  function handleNotePointerDown(event: ReactPointerEvent<HTMLButtonElement>, noteId: string) {
    event.stopPropagation();
    event.preventDefault();

    if (event.button === 2) {
      setBeatmap((current) => deleteNote(current, noteId));
      if (selectedNoteId === noteId) setSelectedNoteId(null);
      releasePointer(event);
      return;
    }

    if (event.button !== 0 || mode !== 'edit') return;
    setSelectedNoteId(noteId);
    dragRef.current = { noteId, pointerId: event.pointerId, mode: 'move' };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLSpanElement>, noteId: string) {
    event.stopPropagation();
    event.preventDefault();
    if (mode !== 'edit') return;
    dragRef.current = { noteId, pointerId: event.pointerId, mode: 'resize' };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const point = pointerToLaneTime(event);
    if (!point) return;

    setBeatmap((current) => updateNote(current, drag.noteId, (note) => {
      if (drag.mode === 'resize') {
        return {
          ...note,
          durationMs: Math.max(240, point.timeMs - note.timeMs),
          kind: getRhythmNoteKind(note) === 'tap' ? 'hold' : getRhythmNoteKind(note),
        };
      }

      return {
        ...note,
        lane: point.lane,
        timeMs: point.timeMs,
      };
    }));
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLElement>) {
    releasePointer(event);
  }

  function releasePointer(event: ReactPointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (isFormTarget(event.target)) return;

    if (event.code === 'Space') {
      event.preventDefault();
      togglePlayback();
      return;
    }

    const lane = keyToLane(event.key);
    if (!lane || event.repeat) return;
    event.preventDefault();

    if (modeRef.current === 'test') {
      setSession((current) => hitRhythmLane(current, lane));
      return;
    }

    if (!isPlayingRef.current) return;
    pressedKeysRef.current.set(lane, {
      lane,
      startedAtMs: performance.now(),
      timeMs: Math.round(elapsedRef.current),
    });
  }

  function handleKeyUp(event: ReactKeyboardEvent<HTMLElement>) {
    if (isFormTarget(event.target)) return;

    const lane = keyToLane(event.key);
    if (!lane) return;
    event.preventDefault();

    if (modeRef.current === 'test') {
      setSession((current) => releaseRhythmLane(current, lane));
      return;
    }

    const draft = pressedKeysRef.current.get(lane);
    if (!draft) return;
    pressedKeysRef.current.delete(lane);
    const releasedAtMs = performance.now();
    setBeatmap((current) => {
      const result = applyRecordedPress(current, draft, releasedAtMs, smashDraftRef.current);
      smashDraftRef.current = result.smashDraft;
      setSelectedNoteId(result.selectedNoteId);
      return result.beatmap;
    });
  }

  function exportBeatmap() {
    const currentValidation = validateEditorBeatmap(beatmapRef.current);
    if (currentValidation.errors.length > 0) {
      setExportMessage(`Eksport zablokowany: ${currentValidation.errors[0]}`);
      return;
    }

    const json = serializeManualBeatmapCatalog(baseCatalog, selectedTrack, difficulty, beatmapRef.current);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    localStorage.setItem(`beatmap-editor-backup-${timestamp}`, json);
    downloadJson(`manualBeatmaps-${selectedTrack.id}-${difficulty}-${timestamp}.json`, json);
    setExportMessage(`Eksport pobrany. Backup: beatmap-editor-backup-${timestamp}`);
  }

  function updateSelectedNote(update: (note: RhythmNote) => RhythmNote) {
    if (!selectedNoteId) return;
    setBeatmap((current) => updateNote(current, selectedNoteId, update));
  }

  return (
    <main
      ref={rootRef}
      className="beatmap-editor"
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      tabIndex={-1}
    >
      <audio
        ref={audioRef}
        src={selectedTrack.audio.merged}
        preload="auto"
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) setAudioDurationMs(Math.round(duration * 1000));
        }}
      />

      <aside className="editor-panel left">
        <button onClick={onExit}>Pulpit</button>
        <strong>Beatmap Editor</strong>
        <label>
          Utwór
          <select value={trackId} onChange={(event) => setTrackId(event.target.value)}>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>{track.order}. {track.title}</option>
            ))}
          </select>
        </label>
        <label>
          Poziom
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
            {selectedTrack.difficulties.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <div className="mode-switch">
          <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Edit Mode</button>
          <button className={mode === 'test' ? 'active' : ''} onClick={() => setMode('test')}>Test Mode</button>
        </div>
        <button className="primary-action" onClick={togglePlayback}>{isPlaying ? 'Pauza' : 'Play'}</button>
        <button onClick={resetTestMode}>Reset czasu/testu</button>
        <label>
          Czas
          <input
            type="range"
            min="0"
            max={beatmap.durationMs}
            value={elapsedMs}
            onChange={(event) => {
              const nextElapsed = Number(event.target.value);
              audioRef.current?.pause();
              setIsPlaying(false);
              setElapsedMs(nextElapsed);
              fallbackClockRef.current = nextElapsed;
              setSession(createRhythmSession(beatmapRef.current, difficulty));
            }}
          />
        </label>
        <span>{formatTime(elapsedMs)} / {formatTime(beatmap.durationMs)}</span>
        <label>
          Zoom
          <input min="0.75" max="1.8" step="0.05" type="range" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
        <div className="editor-stats">
          <span>Nuty: {beatmap.notes.length}</span>
          <span>Widok: {formatTime(viewportStartMs)}-{formatTime(viewportEndMs)}</span>
          <span>Audio: {formatTime(audioDurationMs)}</span>
          <span>Zakres: {formatTime(sourceStartMs)}-{formatTime(sourceEndMs)}</span>
          <span>Perfect: {summary.perfectHits}</span>
          <span>Great: {summary.greatHits}</span>
          <span>Good: {summary.goodHits}</span>
          <span>Miss: {summary.misses}</span>
        </div>
        <button onClick={exportBeatmap}>Eksport JSON + backup</button>
        <p className="export-message">{exportMessage}</p>
        <div className={validation.errors.length ? 'validation error' : 'validation'}>
          <strong>Walidacja</strong>
          {[...validation.errors, ...validation.warnings].slice(0, 5).map((item) => <span key={item}>{item}</span>)}
          {validation.errors.length === 0 && validation.warnings.length === 0 && <span>Brak blokujących problemów.</span>}
        </div>
      </aside>

      <section className="editor-gameplay">
        <div className="editor-stage-title">
          <span>{selectedTrack.title}</span>
          <strong>{mode === 'edit' ? 'EDIT' : 'TEST'}</strong>
          <span>{selectedTrack.bpm} BPM</span>
        </div>
        <div
          ref={stageRef}
          className="beatmap-editor-lanes"
          style={{
            '--editor-hit-line': `${EDITOR_HIT_LINE_PERCENT}%`,
            '--editor-zoom': zoom,
          } as CSSProperties}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onContextMenu={(event) => event.preventDefault()}
        >
          {RHYTHM_LANES.map((lane) => (
            <div className="editor-lane" key={lane}>
              <span className="lane-key">{lane}</span>
            </div>
          ))}
          {visibleNotes.map((note) => {
            const kind = getRhythmNoteKind(note);
            const isLong = kind === 'hold' || kind === 'smash';
            const headPercent = timeToYPercent(note.timeMs, viewportStartMs);
            const heightPercent = isLong ? editorNoteHeightPercent(note) : 0;
            return (
              <button
                key={note.id}
                className={[
                  'editor-note',
                  kind,
                  selectedNoteId === note.id ? 'selected' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  left: `${(noteLaneIndex(note.lane) / RHYTHM_LANES.length) * 100 + 2}%`,
                  top: `${isLong ? headPercent - heightPercent : headPercent}%`,
                  width: `${100 / RHYTHM_LANES.length - 4}%`,
                  height: isLong ? `${heightPercent}%` : undefined,
                }}
                onPointerDown={(event) => handleNotePointerDown(event, note.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onContextMenu={(event) => event.preventDefault()}
                type="button"
              >
                <span>{kind === 'smash' ? `x${note.requiredPresses ?? 2}` : kind}</span>
                {isLong && (
                  <span
                    className="resize-handle"
                    onPointerDown={(event) => handleResizePointerDown(event, note.id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerEnd}
                    onPointerCancel={handlePointerEnd}
                  />
                )}
              </button>
            );
          })}
          <span className="editor-hit-line" />
          <span className="editor-playhead" style={{ top: `${EDITOR_HIT_LINE_PERCENT}%` }} />
        </div>
        <div className="editor-help">
          <span>LPM: stwórz / przeciągnij</span>
          <span>PPM: usuń</span>
          <span>S D K L w Edit Mode: nagrywaj nuty podczas playbacku</span>
          <span>Spacja: play/pauza</span>
        </div>
      </section>

      <aside className="editor-panel right">
        <strong>Inspektor nuty</strong>
        {!selectedNote && <p>Zaznacz nutę w podglądzie.</p>}
        {selectedNote && (
          <>
            <label>
              Typ
              <select value={getRhythmNoteKind(selectedNote)} onChange={(event) => updateSelectedNote((note) => ({
                ...note,
                kind: event.target.value === 'tap' ? undefined : event.target.value as RhythmNote['kind'],
                durationMs: event.target.value === 'tap' ? undefined : note.durationMs ?? 520,
                requiredPresses: event.target.value === 'smash' ? note.requiredPresses ?? 3 : undefined,
              }))}>
                <option value="tap">tap</option>
                <option value="hold">hold</option>
                <option value="smash">smash</option>
              </select>
            </label>
            <label>
              Tor
              <select value={selectedNote.lane} onChange={(event) => updateSelectedNote((note) => ({ ...note, lane: event.target.value as RhythmLane }))}>
                {RHYTHM_LANES.map((lane) => <option key={lane}>{lane}</option>)}
              </select>
            </label>
            <label>
              Start ms
              <input type="number" value={selectedNote.timeMs} onChange={(event) => updateSelectedNote((note) => ({ ...note, timeMs: Number(event.target.value) }))} />
            </label>
            <label>
              Długość ms
              <input
                type="number"
                disabled={getRhythmNoteKind(selectedNote) === 'tap'}
                value={selectedNote.durationMs ?? 0}
                onChange={(event) => updateSelectedNote((note) => ({ ...note, durationMs: Number(event.target.value) }))}
              />
            </label>
            <label>
              Smash hits
              <input
                type="number"
                disabled={getRhythmNoteKind(selectedNote) !== 'smash'}
                value={selectedNote.requiredPresses ?? 0}
                onChange={(event) => updateSelectedNote((note) => ({ ...note, requiredPresses: Number(event.target.value) }))}
              />
            </label>
            <button onClick={() => {
              setBeatmap((current) => deleteNote(current, selectedNote.id));
              setSelectedNoteId(null);
            }}>Usuń nutę</button>
          </>
        )}
      </aside>
    </main>
  );
}

function keyToLane(key: string): RhythmLane | null {
  const upperKey = key.toUpperCase();
  return RHYTHM_LANES.includes(upperKey as RhythmLane) ? (upperKey as RhythmLane) : null;
}

function isFormTarget(target: EventTarget) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLButtonElement;
}

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
