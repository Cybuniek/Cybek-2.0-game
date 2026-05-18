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
  applyRecordedKeyDown,
  applyRecordedKeyUp,
  cloneBeatmapForEditing,
  createEditorNote,
  deleteNote,
  downloadJson,
  EDITOR_HIT_LINE_PERCENT,
  editorNoteHeightPercent,
  editorViewWindowMs,
  laneFromXPercent,
  noteVisualTopPercent,
  promoteActiveRecordedHolds,
  serializeManualBeatmapCatalog,
  timeToYPercent,
  updateNote,
  upsertNote,
  validateEditorBeatmap,
  viewportStartForElapsed,
  yPercentToTime,
  type ActiveRecordedPresses,
  type EditorMode,
  type ManualBeatmapCatalog,
  type SmashDraft,
} from './beatmapEditorLogic';

type DragState = {
  noteId: string;
  pointerId: number;
  mode: 'move' | 'resize';
};

type BackupEntry = {
  key: string;
  label: string;
};

type BeatmapEditorProps = {
  onExit: () => void;
};

const baseCatalog = manualBeatmaps as ManualBeatmapCatalog;
const backupPrefix = 'beatmap-editor-backup-';

export function BeatmapEditor({ onExit }: BeatmapEditorProps) {
  const [catalog, setCatalog] = useState<ManualBeatmapCatalog>(() => baseCatalog);
  const [catalogSource, setCatalogSource] = useState('src/data/manualBeatmaps.json');
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? '');
  const selectedTrack = tracks.find((track) => track.id === trackId) ?? tracks[0]!;
  const [difficulty, setDifficulty] = useState<Difficulty>(selectedTrack?.difficulties[0] ?? 'Łatwy');
  const [audioDurationMs, setAudioDurationMs] = useState(selectedTrack?.durationMs ?? 98535);
  const resolvedBeatmap = useMemo(
    () => resolveRhythmBeatmap(selectedTrack, difficulty, audioDurationMs, catalog),
    [audioDurationMs, catalog, difficulty, selectedTrack],
  );
  const [beatmap, setBeatmap] = useState<RhythmBeatmap>(() => cloneBeatmapForEditing(resolvedBeatmap));
  const [mode, setMode] = useState<EditorMode>('edit');
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(beatmap.notes[0]?.id ?? null);
  const [zoom, setZoom] = useState(1);
  const [exportMessage, setExportMessage] = useState('Eksport gotowy.');
  const [importMessage, setImportMessage] = useState('Import gotowy.');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [backupEntries, setBackupEntries] = useState<BackupEntry[]>(() => listBackupEntries());
  const [selectedBackupKey, setSelectedBackupKey] = useState('');
  const [session, setSession] = useState<RhythmSession>(() => createRhythmSession(beatmap, difficulty));
  const editorTravelMs = session.travelMs;
  const editorWindowMs = editorViewWindowMs(editorTravelMs, zoom);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pressedKeysRef = useRef<ActiveRecordedPresses>({});
  const smashDraftRef = useRef<SmashDraft | null>(null);
  const fallbackClockRef = useRef(0);
  const elapsedRef = useRef(elapsedMs);
  const beatmapRef = useRef(beatmap);
  const modeRef = useRef(mode);
  const isPlayingRef = useRef(isPlaying);

  const validation = useMemo(() => validateEditorBeatmap(beatmap), [beatmap]);
  const selectedNote = beatmap.notes.find((note) => note.id === selectedNoteId) ?? null;
  const viewportStartMs = viewportStartForElapsed(elapsedMs, beatmap.durationMs);
  const viewportEndMs = Math.min(beatmap.durationMs, elapsedMs + editorWindowMs);
  const visibleNotes = beatmap.notes.filter((note) => {
    const headPercent = timeToYPercent(note.timeMs, elapsedMs, editorWindowMs);
    const topPercent = noteVisualTopPercent(note, elapsedMs, editorWindowMs);
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
    resetEditorAudio(editable.sourceStartMs ?? 0);
    setBeatmap(editable);
    setHasUnsavedChanges(false);
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
      if (modeRef.current === 'edit' && pressedKeysRef.current && Object.keys(pressedKeysRef.current).length > 0) {
        const promotedBeatmap = promoteActiveRecordedHolds(beatmapRef.current, pressedKeysRef.current, Math.round(nextElapsed));
        if (promotedBeatmap !== beatmapRef.current) {
          beatmapRef.current = promotedBeatmap;
          setHasUnsavedChanges(true);
          setBeatmap(promotedBeatmap);
        }
      }
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
    resetEditorAudio(sourceStartMs);
    setIsPlaying(false);
    setElapsedMs(0);
    fallbackClockRef.current = 0;
    pressedKeysRef.current = {};
    smashDraftRef.current = null;
    setSession(createRhythmSession(beatmapRef.current, difficulty));
  }

  function createNoteAtPointer(event: ReactPointerEvent<HTMLDivElement>, kind: 'tap' | 'hold' | 'smash' = 'tap') {
    const point = pointerToLaneTime(event);
    if (!point) return;
    const note = createEditorNote(point.lane, point.timeMs, kind);
    applyBeatmapEdit((current) => upsertNote(current, note));
    setSelectedNoteId(note.id);
  }

  function pointerToLaneTime(event: ReactPointerEvent<HTMLElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const laneElement = (event.target as Element | null)?.closest('.editor-lane');
    const laneFromElement = laneElement?.getAttribute('data-lane') as RhythmLane | null;
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    return {
      lane: laneFromElement && RHYTHM_LANES.includes(laneFromElement) ? laneFromElement : laneFromXPercent(xPercent),
      timeMs: yPercentToTime(yPercent, viewportStartMs, beatmapRef.current.durationMs, editorWindowMs),
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
      applyBeatmapEdit((current) => deleteNote(current, noteId));
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

    applyBeatmapEdit((current) => updateNote(current, drag.noteId, (note) => {
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
    const result = applyRecordedKeyDown(beatmapRef.current, pressedKeysRef.current, smashDraftRef.current, {
      lane,
      timeMs: Math.round(elapsedRef.current),
      seed: performance.now(),
      kind: event.shiftKey ? 'smash' : 'tap',
    });
    pressedKeysRef.current = result.activePresses;
    smashDraftRef.current = result.smashDraft;
    if (result.selectedNoteId) setSelectedNoteId(result.selectedNoteId);
    beatmapRef.current = result.beatmap;
    setHasUnsavedChanges(true);
    setBeatmap(result.beatmap);
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

    const result = applyRecordedKeyUp(
      beatmapRef.current,
      pressedKeysRef.current,
      smashDraftRef.current,
      lane,
      Math.round(elapsedRef.current),
    );
    pressedKeysRef.current = result.activePresses;
    smashDraftRef.current = result.smashDraft;
    if (result.selectedNoteId) setSelectedNoteId(result.selectedNoteId);
    beatmapRef.current = result.beatmap;
    setHasUnsavedChanges(true);
    setBeatmap(result.beatmap);
  }

  function exportBeatmap() {
    const currentValidation = validateEditorBeatmap(beatmapRef.current);
    if (currentValidation.errors.length > 0) {
      setExportMessage(`Eksport zablokowany: ${currentValidation.errors[0]}`);
      return;
    }

    const json = serializeManualBeatmapCatalog(catalog, selectedTrack, difficulty, beatmapRef.current);
    const nextCatalog = parseManualBeatmapCatalog(json);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `${backupPrefix}${timestamp}`;
    localStorage.setItem(backupKey, json);
    setCatalog(nextCatalog);
    setCatalogSource(`ostatni eksport: ${selectedTrack.title} / ${difficulty}`);
    setHasUnsavedChanges(false);
    refreshBackupEntries(backupKey);
    downloadJson('manualBeatmaps.json', json);
    setExportMessage(`Pobrano manualBeatmaps.json i zapisano backup: ${backupKey}`);
  }

  function downloadCurrentCatalog() {
    const currentValidation = validateEditorBeatmap(beatmapRef.current);
    const json = currentValidation.errors.length === 0
      ? serializeManualBeatmapCatalog(catalog, selectedTrack, difficulty, beatmapRef.current)
      : JSON.stringify(catalog, null, 2);
    downloadJson('manualBeatmaps.json', json);
    setExportMessage(
      currentValidation.errors.length === 0
        ? 'Pobrano pełny manualBeatmaps.json z bieżącą mapą.'
        : `Pobrano katalog bez bieżących zmian: ${currentValidation.errors[0]}`,
    );
  }

  function refreshBackupEntries(preferredKey = selectedBackupKey) {
    const entries = listBackupEntries();
    setBackupEntries(entries);
    setSelectedBackupKey(entries.some((entry) => entry.key === preferredKey) ? preferredKey : entries[0]?.key ?? '');
  }

  function importCatalogFromText(json: string, source: string) {
    const nextCatalog = parseManualBeatmapCatalog(json);
    setCatalog(nextCatalog);
    setCatalogSource(source);
    const importedBeatmap = resolveRhythmBeatmap(selectedTrack, difficulty, audioDurationMs, nextCatalog);
    const editable = cloneBeatmapForEditing(importedBeatmap);
    resetEditorAudio(editable.sourceStartMs ?? 0);
    setBeatmap(editable);
    setHasUnsavedChanges(false);
    setSelectedNoteId(editable.notes[0]?.id ?? null);
    setElapsedMs(0);
    fallbackClockRef.current = 0;
    setIsPlaying(false);
    setSession(createRhythmSession(editable, difficulty));
  }

  function handleImportFile(file: File | null) {
    if (!file) return;
    file.text()
      .then((text) => {
        importCatalogFromText(text, `import: ${file.name}`);
        setImportMessage(`Wczytano ${file.name}. Sprawdź mapę i użyj eksportu, żeby zapisać nową wersję.`);
      })
      .catch(() => setImportMessage('Import nieudany: nie udało się odczytać pliku.'));
  }

  function restoreSelectedBackup() {
    if (!selectedBackupKey) {
      setImportMessage('Brak wybranego backupu.');
      return;
    }

    const json = localStorage.getItem(selectedBackupKey);
    if (!json) {
      refreshBackupEntries();
      setImportMessage('Backup nie istnieje już w localStorage.');
      return;
    }

    try {
      importCatalogFromText(json, `backup: ${selectedBackupKey}`);
      setImportMessage(`Przywrócono ${selectedBackupKey}. Eksport pobierze go jako manualBeatmaps.json.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? `Backup uszkodzony: ${error.message}` : 'Backup uszkodzony.');
    }
  }

  function updateSelectedNote(update: (note: RhythmNote) => RhythmNote) {
    if (!selectedNoteId) return;
    applyBeatmapEdit((current) => updateNote(current, selectedNoteId, update));
  }

  function applyBeatmapEdit(update: (current: RhythmBeatmap) => RhythmBeatmap) {
    setHasUnsavedChanges(true);
    setBeatmap(update);
  }

  function blockUnsavedChanges(action: string) {
    if (!hasUnsavedChanges) return false;
    setImportMessage(`Najpierw użyj "Eksport + backup" albo "Porzuć zmiany", żeby ${action}.`);
    return true;
  }

  function discardChanges() {
    const editable = cloneBeatmapForEditing(resolvedBeatmap);
    resetEditorAudio(editable.sourceStartMs ?? 0);
    beatmapRef.current = editable;
    setBeatmap(editable);
    setSelectedNoteId(editable.notes[0]?.id ?? null);
    setElapsedMs(0);
    fallbackClockRef.current = 0;
    setIsPlaying(false);
    setSession(createRhythmSession(editable, difficulty));
    pressedKeysRef.current = {};
    smashDraftRef.current = null;
    setHasUnsavedChanges(false);
    setImportMessage('Porzucono niezapisane zmiany dla bieżącej mapy.');
  }

  function requestExit() {
    if (blockUnsavedChanges('wrócić do pulpitu')) return;
    onExit();
  }

  function resetEditorAudio(sourceStartMs = 0) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = sourceStartMs / 1000;
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
        <button onClick={requestExit}>Pulpit</button>
        <strong>Beatmap Editor</strong>
        <label>
          Utwór
          <select value={trackId} onChange={(event) => {
            if (blockUnsavedChanges('zmienić utwór')) return;
            setTrackId(event.target.value);
          }}>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>{track.order}. {track.title}</option>
            ))}
          </select>
        </label>
        <label>
          Poziom
          <select value={difficulty} onChange={(event) => {
            if (blockUnsavedChanges('zmienić poziom')) return;
            setDifficulty(event.target.value as Difficulty);
          }}>
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
          <span>Źródło: {catalogSource}</span>
          <span>Nuty: {beatmap.notes.length}</span>
          <span className={hasUnsavedChanges ? 'dirty-status active' : 'dirty-status'}>
            Niezapisane zmiany: {hasUnsavedChanges ? 'tak' : 'nie'}
          </span>
          <span>Widok: {formatTime(viewportStartMs)}-{formatTime(viewportEndMs)}</span>
          <span>Okno gry: {formatTime(editorWindowMs)} przy zoom x{zoom.toFixed(2)}</span>
          <span>Audio: {formatTime(audioDurationMs)}</span>
          <span>Zakres: {formatTime(sourceStartMs)}-{formatTime(sourceEndMs)}</span>
          <span>Perfect: {summary.perfectHits}</span>
          <span>Great: {summary.greatHits}</span>
          <span>Good: {summary.goodHits}</span>
          <span>Miss: {summary.misses}</span>
        </div>
        <div className="editor-file-tools">
          <button onClick={() => {
            if (blockUnsavedChanges('zaimportować katalog')) return;
            importInputRef.current?.click();
          }}>Import manualBeatmaps.json</button>
          <input
            ref={importInputRef}
            accept="application/json,.json"
            className="editor-hidden-input"
            type="file"
            onChange={(event) => {
              if (!blockUnsavedChanges('zaimportować katalog')) handleImportFile(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
          <button onClick={downloadCurrentCatalog}>Pobierz pełny katalog</button>
          <button className="primary-action" onClick={exportBeatmap}>Eksport + backup</button>
          <label>
            Backup localStorage
            <select value={selectedBackupKey} onChange={(event) => setSelectedBackupKey(event.target.value)}>
              {backupEntries.length === 0 && <option value="">Brak backupów</option>}
              {backupEntries.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
            </select>
          </label>
          <div className="editor-button-row">
            <button onClick={() => refreshBackupEntries()}>Odśwież</button>
            <button disabled={!selectedBackupKey || hasUnsavedChanges} onClick={restoreSelectedBackup}>Przywróć</button>
          </div>
          <button disabled={!hasUnsavedChanges} onClick={discardChanges}>Porzuć zmiany</button>
        </div>
        <p className="export-message">{exportMessage}</p>
        <p className="export-message">{importMessage}</p>
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
          } as CSSProperties}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onContextMenu={(event) => event.preventDefault()}
        >
          {RHYTHM_LANES.map((lane) => (
            <div className="lane editor-lane" data-lane={lane} key={lane}>
              {visibleNotes
                .filter((note) => note.lane === lane)
                .map((note) => {
                  const kind = getRhythmNoteKind(note);
                  const isLong = kind === 'hold' || kind === 'smash';
                  const headPercent = timeToYPercent(note.timeMs, viewportStartMs, editorWindowMs);
                  const heightPercent = isLong ? editorNoteHeightPercent(note, editorWindowMs) : 0;
                  return (
                    <button
                      key={note.id}
                      className={[
                        'note',
                        'editor-note',
                        isLong ? kind : '',
                        selectedNoteId === note.id ? 'selected' : '',
                      ].filter(Boolean).join(' ')}
                      style={{
                        top: `${isLong ? headPercent - heightPercent : headPercent}%`,
                        ...(isLong ? { '--note-height': `${heightPercent}%` } : {}),
                      } as CSSProperties}
                      onPointerDown={(event) => handleNotePointerDown(event, note.id)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerEnd}
                      onPointerCancel={handlePointerEnd}
                      onContextMenu={(event) => event.preventDefault()}
                      type="button"
                    >
                      {kind === 'smash' && <span>{note.requiredPresses ?? 2}</span>}
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
              <span className="hit-line editor-hit-line" />
              <span className="lane-key">{lane}</span>
            </div>
          ))}
        </div>
        <div className="editor-help">
          <span>LPM: stwórz / przeciągnij</span>
          <span>PPM: usuń</span>
          <span>S D K L w Edit Mode: nagrywaj nuty podczas playbacku</span>
          <span>Shift+S/D/K/L: nagrywaj smash</span>
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
              applyBeatmapEdit((current) => deleteNote(current, selectedNote.id));
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

function parseManualBeatmapCatalog(json: string): ManualBeatmapCatalog {
  const parsed = JSON.parse(json) as ManualBeatmapCatalog;
  if (!parsed || typeof parsed !== 'object' || !parsed.tracks || typeof parsed.tracks !== 'object') {
    throw new Error('plik nie wygląda jak manualBeatmaps.json.');
  }

  return {
    schemaVersion: parsed.schemaVersion ?? 2,
    tracks: parsed.tracks,
  };
}

function listBackupEntries(): BackupEntry[] {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(backupPrefix))
    .sort((left, right) => right.localeCompare(left))
    .map((key) => ({
      key,
      label: key.replace(backupPrefix, '').replace('T', ' ').slice(0, 19),
    }));
}
