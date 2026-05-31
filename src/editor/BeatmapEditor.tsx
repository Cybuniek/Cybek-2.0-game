import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
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
  copySelectedNotes,
  createEditorHistory,
  createEditorNote,
  deleteMarker,
  deleteNote,
  downloadJson,
  EDITOR_HIT_LINE_PERCENT,
  editorNoteHeightPercent,
  editorViewWindowMs,
  getEditorWheelSeekDeltaMs,
  getNextMetronomeBeatMs,
  getSnapStepMs,
  getVisibleBeatGridLines,
  laneFromXPercent,
  nudgeSelectedNotes,
  noteVisualTopPercent,
  pasteClipboardAtTime,
  promoteActiveRecordedHolds,
  serializeManualBeatmapCatalog,
  snapTimeMs,
  timeToYPercent,
  updateMarker,
  updateNote,
  upsertMarker,
  upsertNote,
  validateEditorBeatmap,
  viewportStartForElapsed,
  yPercentToTime,
  type ActiveRecordedPresses,
  type EditorClipboard,
  type EditorHistory,
  type EditorMode,
  type ManualBeatmapCatalog,
  type HoldDraft,
  type SnapDivision,
} from './beatmapEditorLogic';
import { KEYBIND_GROUPS } from './beatmapEditorKeybinds';

type DragState = {
  noteId: string;
  pointerId: number;
  mode: 'move' | 'resize';
  changed: boolean;
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
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set(beatmap.notes[0]?.id ? [beatmap.notes[0].id] : []));
  const [zoom, setZoom] = useState(1);
  const [snapDivision, setSnapDivision] = useState<SnapDivision>('off');
  const [clipboard, setClipboard] = useState<EditorClipboard | null>(null);
  const [history, setHistory] = useState<EditorHistory>(() => createEditorHistory(beatmap, new Set(beatmap.notes[0]?.id ? [beatmap.notes[0].id] : [])));
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [metronomeVolume, setMetronomeVolume] = useState(0.35);
  const [masterVolume, setMasterVolume] = useState(0.85);
  const [instrumentalVolume, setInstrumentalVolume] = useState(0.9);
  const [vocalVolume, setVocalVolume] = useState(0.75);
  const [exportMessage, setExportMessage] = useState('Eksport gotowy.');
  const [importMessage, setImportMessage] = useState('Import gotowy.');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [backupEntries, setBackupEntries] = useState<BackupEntry[]>(() => listBackupEntries());
  const [selectedBackupKey, setSelectedBackupKey] = useState('');
  const [session, setSession] = useState<RhythmSession>(() => createRhythmSession(beatmap, difficulty));
  const editorTravelMs = session.travelMs;
  const editorWindowMs = editorViewWindowMs(editorTravelMs, zoom);
  const instrumentalAudioRef = useRef<HTMLAudioElement | null>(null);
  const vocalAudioRef = useRef<HTMLAudioElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pressedKeysRef = useRef<ActiveRecordedPresses>({});
  const holdDraftRef = useRef<HoldDraft | null>(null);
  const selectedNoteIdsRef = useRef(selectedNoteIds);
  const metronomeContextRef = useRef<AudioContext | null>(null);
  const lastMetronomeElapsedRef = useRef(-1);
  const fallbackClockRef = useRef(0);
  const elapsedRef = useRef(elapsedMs);
  const beatmapRef = useRef(beatmap);
  const modeRef = useRef(mode);
  const isPlayingRef = useRef(isPlaying);

  const validation = useMemo(() => validateEditorBeatmap(beatmap), [beatmap]);
  const selectedNoteId = useMemo(() => selectedNoteIds.values().next().value ?? null, [selectedNoteIds]);
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
  const visibleMarkers = (beatmap.markers ?? []).filter((marker) => {
    const percent = timeToYPercent(marker.timeMs, elapsedMs, editorWindowMs);
    return percent >= -8 && percent <= 104;
  });
  const visibleBeatGridLines = useMemo(
    () => getVisibleBeatGridLines(viewportStartMs, editorWindowMs, beatmap.bpm),
    [beatmap.bpm, editorWindowMs, viewportStartMs],
  );

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    selectedNoteIdsRef.current = selectedNoteIds;
  }, [selectedNoteIds]);

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
    const selection = initialSelectionFor(editable);
    resetEditorAudio(editable.sourceStartMs ?? 0);
    setBeatmap(editable);
    beatmapRef.current = editable;
    setHasUnsavedChanges(false);
    replaceSelection(selection);
    setHistory(createEditorHistory(editable, selection));
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
      const audio = getPrimaryEditorAudio(instrumentalAudioRef.current, vocalAudioRef.current);
      const nextElapsed = audio && !audio.paused
        ? Math.max(0, audio.currentTime * 1000 - sourceStartMs)
        : Math.min(beatmapRef.current.durationMs, fallbackClockRef.current + delta);
      fallbackClockRef.current = nextElapsed;
      if (metronomeEnabled && audio && !audio.paused) {
        const beatMs = getNextMetronomeBeatMs(lastMetronomeElapsedRef.current, nextElapsed, beatmapRef.current.bpm);
        if (beatMs !== null) playMetronomeClick(metronomeContextRef, metronomeVolume);
        lastMetronomeElapsedRef.current = nextElapsed;
      }
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
        pauseEditorAudio(instrumentalAudioRef.current, vocalAudioRef.current);
        setIsPlaying(false);
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [isPlaying, metronomeEnabled, metronomeVolume, sourceEndMs, sourceStartMs]);

  useEffect(() => {
    updateEditorAudioVolumes(instrumentalAudioRef.current, vocalAudioRef.current, masterVolume, instrumentalVolume, vocalVolume);
  }, [instrumentalVolume, masterVolume, vocalVolume]);

  useEffect(() => () => {
    void metronomeContextRef.current?.close();
  }, []);

  function togglePlayback() {
    if (isPlaying) {
      pauseEditorAudio(instrumentalAudioRef.current, vocalAudioRef.current);
      setIsPlaying(false);
      return;
    }

    fallbackClockRef.current = elapsedRef.current;
    lastMetronomeElapsedRef.current = -1;
    syncEditorAudioTime(instrumentalAudioRef.current, vocalAudioRef.current, sourceStartMs + elapsedRef.current);
    updateEditorAudioVolumes(instrumentalAudioRef.current, vocalAudioRef.current, masterVolume, instrumentalVolume, vocalVolume);
    playEditorAudio(instrumentalAudioRef.current, vocalAudioRef.current);
    setIsPlaying(true);
  }

  function resetTestMode() {
    resetEditorAudio(sourceStartMs);
    setIsPlaying(false);
    setElapsedMs(0);
    fallbackClockRef.current = 0;
    lastMetronomeElapsedRef.current = -1;
    pressedKeysRef.current = {};
    holdDraftRef.current = null;
    setSession(createRhythmSession(beatmapRef.current, difficulty));
  }

  function seekEditorTo(timeMs: number) {
    const nextElapsed = Math.max(0, Math.min(beatmapRef.current.durationMs, Math.round(timeMs)));
    pauseEditorAudio(instrumentalAudioRef.current, vocalAudioRef.current);
    resetEditorAudio((beatmapRef.current.sourceStartMs ?? 0) + nextElapsed);
    setIsPlaying(false);
    setElapsedMs(nextElapsed);
    fallbackClockRef.current = nextElapsed;
    lastMetronomeElapsedRef.current = -1;
    setSession(createRhythmSession(beatmapRef.current, difficulty));
  }

  function replaceSelection(nextSelection: Set<string>) {
    const selection = new Set(nextSelection);
    selectedNoteIdsRef.current = selection;
    setSelectedNoteIds(selection);
  }

  function applyHistorySnapshot(result: { beatmap: RhythmBeatmap; selectedNoteIds: Set<string>; history: EditorHistory }) {
    beatmapRef.current = result.beatmap;
    setBeatmap(result.beatmap);
    replaceSelection(result.selectedNoteIds);
    setHistory(result.history);
    setHasUnsavedChanges(true);
  }

  function undoEdit() {
    const result = history.undo(beatmapRef.current, selectedNoteIdsRef.current);
    if (result) applyHistorySnapshot(result);
  }

  function redoEdit() {
    const result = history.redo(beatmapRef.current, selectedNoteIdsRef.current);
    if (result) applyHistorySnapshot(result);
  }

  function commitBeatmapEdit(
    update: (current: RhythmBeatmap) => RhythmBeatmap,
    options: { selectedNoteIds?: Set<string>; trackHistory?: boolean } = {},
  ) {
    const nextBeatmap = update(beatmapRef.current);
    beatmapRef.current = nextBeatmap;
    setBeatmap(nextBeatmap);
    setHasUnsavedChanges(true);
    const nextSelection = options.selectedNoteIds ?? selectedNoteIdsRef.current;
    replaceSelection(nextSelection);
    if (options.trackHistory !== false) {
      setHistory((currentHistory) => currentHistory.push(nextBeatmap, nextSelection));
    }
  }

  function createNoteAtPointer(event: ReactPointerEvent<HTMLDivElement>, kind: 'tap' | 'hold'  = 'tap') {
    const point = pointerToLaneTime(event);
    if (!point) return;
    const note = createEditorNote(point.lane, point.timeMs, kind);
    commitBeatmapEdit((current) => upsertNote(current, note), { selectedNoteIds: new Set([note.id]) });
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
      timeMs: snapTimeMs(yPercentToTime(yPercent, viewportStartMs, beatmapRef.current.durationMs, editorWindowMs), beatmapRef.current.bpm, snapDivision),
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
      const nextSelection = new Set(selectedNoteIdsRef.current);
      nextSelection.delete(noteId);
      commitBeatmapEdit((current) => deleteNote(current, noteId), { selectedNoteIds: nextSelection });
      releasePointer(event);
      return;
    }

    if (event.button !== 0 || mode !== 'edit') return;
    if (event.shiftKey) {
      const nextSelection = new Set(selectedNoteIdsRef.current);
      if (nextSelection.has(noteId)) nextSelection.delete(noteId);
      else nextSelection.add(noteId);
      replaceSelection(nextSelection);
      return;
    }

    if (!selectedNoteIdsRef.current.has(noteId)) replaceSelection(new Set([noteId]));
    dragRef.current = { noteId, pointerId: event.pointerId, mode: 'move', changed: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLSpanElement>, noteId: string) {
    event.stopPropagation();
    event.preventDefault();
    if (mode !== 'edit') return;
    replaceSelection(new Set([noteId]));
    dragRef.current = { noteId, pointerId: event.pointerId, mode: 'resize', changed: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const point = pointerToLaneTime(event);
    if (!point) return;

    commitBeatmapEdit((current) => updateNote(current, drag.noteId, (note) => {
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
    }), { trackHistory: false });
    drag.changed = true;
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLElement>) {
    releasePointer(event);
  }

  function releasePointer(event: ReactPointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragRef.current?.pointerId === event.pointerId) {
      if (dragRef.current.changed) {
        setHistory((currentHistory) => currentHistory.push(beatmapRef.current, selectedNoteIdsRef.current));
      }
      dragRef.current = null;
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (isFormTarget(event.target)) return;

    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoEdit();
        else undoEdit();
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        redoEdit();
        return;
      }
      if (key === 'c') {
        event.preventDefault();
        const nextClipboard = copySelectedNotes(beatmapRef.current, selectedNoteIdsRef.current);
        setClipboard(nextClipboard);
        setExportMessage(nextClipboard ? `Skopiowano nuty: ${nextClipboard.entries.length}.` : 'Nie ma nut do skopiowania.');
        return;
      }
      if (key === 'v') {
        event.preventDefault();
        if (modeRef.current !== 'edit' || !clipboard) return;
        const result = pasteClipboardAtTime(beatmapRef.current, clipboard, Math.round(elapsedRef.current), beatmapRef.current.bpm, snapDivision, performance.now());
        commitBeatmapEdit(() => result.beatmap, { selectedNoteIds: result.selectedNoteIds });
        return;
      }
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNoteIdsRef.current.size > 0) {
      event.preventDefault();
      const idsToDelete = new Set(selectedNoteIdsRef.current);
      commitBeatmapEdit(
        (current) => ({ ...current, notes: current.notes.filter((note) => !idsToDelete.has(note.id)) }),
        { selectedNoteIds: new Set() },
      );
      return;
    }

    if ((event.key === ',' || event.key === '.') && selectedNoteIdsRef.current.size > 0) {
      event.preventDefault();
      const direction = event.key === ',' ? -1 : 1;
      const stepMs = getSnapStepMs(beatmapRef.current.bpm, snapDivision) || 50;
      commitBeatmapEdit((current) => nudgeSelectedNotes(current, selectedNoteIdsRef.current, direction * stepMs));
      return;
    }

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
    const result = applyRecordedKeyDown(beatmapRef.current, pressedKeysRef.current, holdDraftRef.current, {
      lane,
      timeMs: snapTimeMs(Math.round(elapsedRef.current), beatmapRef.current.bpm, snapDivision),
      seed: performance.now(),
      kind: event.shiftKey ? 'hold' : 'tap',
    });
    pressedKeysRef.current = result.activePresses;
    holdDraftRef.current = result.holdDraft;
    if (result.selectedNoteId) replaceSelection(new Set([result.selectedNoteId]));
    beatmapRef.current = result.beatmap;
    setHasUnsavedChanges(true);
    setBeatmap(result.beatmap);
    setHistory((currentHistory) => currentHistory.push(result.beatmap, selectedNoteIdsRef.current));
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
      holdDraftRef.current,
      lane,
      Math.round(elapsedRef.current),
    );
    pressedKeysRef.current = result.activePresses;
    holdDraftRef.current = result.holdDraft;
    if (result.selectedNoteId) replaceSelection(new Set([result.selectedNoteId]));
    beatmapRef.current = result.beatmap;
    setHasUnsavedChanges(true);
    setBeatmap(result.beatmap);
    setHistory((currentHistory) => currentHistory.push(result.beatmap, selectedNoteIdsRef.current));
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
    const selection = initialSelectionFor(editable);
    resetEditorAudio(editable.sourceStartMs ?? 0);
    beatmapRef.current = editable;
    setBeatmap(editable);
    setHasUnsavedChanges(false);
    replaceSelection(selection);
    setHistory(createEditorHistory(editable, selection));
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
    commitBeatmapEdit((current) => updateNote(current, selectedNoteId, update));
  }

  function applyBeatmapEdit(update: (current: RhythmBeatmap) => RhythmBeatmap) {
    commitBeatmapEdit(update);
  }

  function blockUnsavedChanges(action: string) {
    if (!hasUnsavedChanges) return false;
    setImportMessage(`Najpierw użyj "Eksport + backup" albo "Porzuć zmiany", żeby ${action}.`);
    return true;
  }

  function discardChanges() {
    const editable = cloneBeatmapForEditing(resolvedBeatmap);
    const selection = initialSelectionFor(editable);
    resetEditorAudio(editable.sourceStartMs ?? 0);
    beatmapRef.current = editable;
    setBeatmap(editable);
    replaceSelection(selection);
    setHistory(createEditorHistory(editable, selection));
    setElapsedMs(0);
    fallbackClockRef.current = 0;
    setIsPlaying(false);
    setSession(createRhythmSession(editable, difficulty));
    pressedKeysRef.current = {};
    holdDraftRef.current = null;
    setHasUnsavedChanges(false);
    setImportMessage('Porzucono niezapisane zmiany dla bieżącej mapy.');
  }

  function requestExit() {
    if (blockUnsavedChanges('wrócić do pulpitu')) return;
    onExit();
  }

  function resetEditorAudio(sourceStartMs = 0) {
    pauseEditorAudio(instrumentalAudioRef.current, vocalAudioRef.current);
    syncEditorAudioTime(instrumentalAudioRef.current, vocalAudioRef.current, sourceStartMs);
  }

  function handleStageWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (isPlayingRef.current) return;
    event.preventDefault();
    const deltaMs = getEditorWheelSeekDeltaMs(event.deltaY, zoom, event.shiftKey);
    seekEditorTo(elapsedRef.current + deltaMs);
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
        ref={instrumentalAudioRef}
        src={selectedTrack.audio.instrumental}
        preload="auto"
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) setAudioDurationMs(Math.round(duration * 1000));
        }}
      />
      <audio
        ref={vocalAudioRef}
        src={selectedTrack.audio.vocals}
        preload="auto"
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) setAudioDurationMs((current) => Math.max(current, Math.round(duration * 1000)));
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
        <div className="editor-button-row">
          <button disabled={!history.canUndo()} onClick={undoEdit}>Cofnij</button>
          <button disabled={!history.canRedo()} onClick={redoEdit}>Ponów</button>
        </div>
        <label>
          Czas
          <input
            type="range"
            min="0"
            max={beatmap.durationMs}
            value={elapsedMs}
            onChange={(event) => {
              seekEditorTo(Number(event.target.value));
            }}
          />
        </label>
        <span>{formatTime(elapsedMs)} / {formatTime(beatmap.durationMs)}</span>
        <label>
          Zoom
          <input min="0.75" max="1.8" step="0.05" type="range" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
        <div className="editor-options">
          <label>
            BPM mapy
            <input
              type="number"
              min="1"
              step="1"
              value={beatmap.bpm}
              onChange={(event) => commitBeatmapEdit((current) => ({
                ...current,
                bpm: Math.max(1, Math.round(Number(event.target.value) || current.bpm || selectedTrack.bpm)),
              }))}
            />
          </label>
          <label>
            Snap
            <select value={snapDivision} onChange={(event) => setSnapDivision(event.target.value as SnapDivision)}>
              <option value="off">off</option>
              <option value="1/4">1/4</option>
              <option value="1/8">1/8</option>
              <option value="1/16">1/16</option>
              <option value="1/32">1/32</option>
            </select>
          </label>
          <label>
            Offset wejścia ms
            <input
              type="number"
              step="1"
              value={beatmap.inputOffsetMs ?? 0}
              onChange={(event) => commitBeatmapEdit((current) => ({ ...current, inputOffsetMs: Math.round(Number(event.target.value) || 0) }))}
            />
          </label>
          <label className="editor-checkbox">
            <input
              type="checkbox"
              checked={metronomeEnabled}
              onChange={(event) => {
                setMetronomeEnabled(event.currentTarget.checked);
                lastMetronomeElapsedRef.current = -1;
              }}
            />
            Metronom
          </label>
          <label>
            Głośność całości
            <input
              min="0"
              max="1"
              step="0.05"
              type="range"
              value={masterVolume}
              onChange={(event) => setMasterVolume(Number(event.target.value))}
            />
          </label>
          <label>
            Instrumental
            <input
              min="0"
              max="1"
              step="0.05"
              type="range"
              value={instrumentalVolume}
              onChange={(event) => setInstrumentalVolume(Number(event.target.value))}
            />
          </label>
          <label>
            Vocal
            <input
              min="0"
              max="1"
              step="0.05"
              type="range"
              value={vocalVolume}
              onChange={(event) => setVocalVolume(Number(event.target.value))}
            />
          </label>
          <label>
            Głośność metronomu
            <input
              min="0"
              max="1"
              step="0.05"
              type="range"
              value={metronomeVolume}
              onChange={(event) => setMetronomeVolume(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="editor-stats">
          <span>Źródło: {catalogSource}</span>
          <span>Nuty: {beatmap.notes.length}</span>
          <span>Zaznaczone: {selectedNoteIds.size}</span>
          <span>Schowek: {clipboard?.entries.length ?? 0}</span>
          <span className={hasUnsavedChanges ? 'dirty-status active' : 'dirty-status'}>
            Niezapisane zmiany: {hasUnsavedChanges ? 'tak' : 'nie'}
          </span>
          <span>Widok: {formatTime(viewportStartMs)}-{formatTime(viewportEndMs)}</span>
          <span>Okno gry: {formatTime(editorWindowMs)} przy zoom x{zoom.toFixed(2)}</span>
          <span>Audio: {formatTime(audioDurationMs)}</span>
          <span>Zakres: {formatTime(sourceStartMs)}-{formatTime(sourceEndMs)}</span>
          <span>BPM mapy: {beatmap.bpm}</span>
          <span>Offset wejścia: {beatmap.inputOffsetMs ?? 0} ms</span>
          <span>Perfect: {summary.perfectHits}</span>
          <span>Great: {summary.greatHits}</span>
          <span>Good: {summary.goodHits}</span>
          <span>Miss: {summary.misses}</span>
        </div>
        <div className="editor-file-tools">
          <div className="editor-button-row">
            <button onClick={() => {
              const nextClipboard = copySelectedNotes(beatmapRef.current, selectedNoteIdsRef.current);
              setClipboard(nextClipboard);
              setExportMessage(nextClipboard ? `Skopiowano nuty: ${nextClipboard.entries.length}.` : 'Nie ma nut do skopiowania.');
            }}>Kopiuj nuty</button>
            <button disabled={!clipboard} onClick={() => {
              const result = pasteClipboardAtTime(beatmapRef.current, clipboard, Math.round(elapsedRef.current), beatmapRef.current.bpm, snapDivision, performance.now());
              commitBeatmapEdit(() => result.beatmap, { selectedNoteIds: result.selectedNoteIds });
            }}>Wklej przy czasie</button>
          </div>
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
          <span>{beatmap.bpm} BPM</span>
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
          onWheel={handleStageWheel}
          onContextMenu={(event) => event.preventDefault()}
        >
          {RHYTHM_LANES.map((lane) => (
            <div className="lane editor-lane" data-lane={lane} key={lane}>
              {visibleBeatGridLines.map((line) => (
                <span
                  key={`${lane}-grid-${line.beatIndex}`}
                  className={line.isBar ? 'editor-beat-grid-line bar' : 'editor-beat-grid-line'}
                  style={{ top: `${timeToYPercent(line.timeMs, viewportStartMs, editorWindowMs)}%` }}
                />
              ))}
              {visibleMarkers.map((marker) => (
                <button
                  key={`${lane}-${marker.id}`}
                  className="editor-marker-line"
                  style={{ top: `${timeToYPercent(marker.timeMs, viewportStartMs, editorWindowMs)}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    seekEditorTo(marker.timeMs);
                  }}
                  type="button"
                >
                  {lane === RHYTHM_LANES[0] && <span>{marker.label || 'marker'}</span>}
                </button>
              ))}
              {visibleNotes
                .filter((note) => note.lane === lane)
                .map((note) => {
                  const kind = getRhythmNoteKind(note);
                  const isLong = kind === 'hold';
                  const headPercent = timeToYPercent(note.timeMs, viewportStartMs, editorWindowMs);
                  const heightPercent = isLong ? editorNoteHeightPercent(note, editorWindowMs) : 0;
                  return (
                    <button
                      key={note.id}
                      className={[
                        'note',
                        'editor-note',
                        isLong ? kind : '',
                        selectedNoteIds.has(note.id) ? 'selected' : '',
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
                      {kind === 'hold' && note.requiredPresses !== undefined && <span>{note.requiredPresses}</span>}
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
          <span>Shift+S/D/K/L: nagrywaj hold z pulsem</span>
          <span>Spacja: play/pauza</span>
        </div>
      </section>

      <aside className="editor-panel right">
        <strong>Inspektor nuty</strong>
        {!selectedNote && <p>Zaznacz nutę w podglądzie. Shift+klik dodaje nuty do zaznaczenia.</p>}
        {selectedNote && (
          <>
            <label>
              Typ
              <select value={getRhythmNoteKind(selectedNote)} onChange={(event) => updateSelectedNote((note) => ({
                ...note,
                kind: event.target.value === 'tap' ? undefined : event.target.value as RhythmNote['kind'],
                durationMs: event.target.value === 'tap' ? undefined : note.durationMs ?? 520,
                requiredPresses: event.target.value === 'tap' ? undefined : note.requiredPresses,
              }))}>
                <option value="tap">tap</option>
                <option value="hold">hold</option>
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
            <button onClick={() => {
              const nextSelection = new Set(selectedNoteIdsRef.current);
              nextSelection.delete(selectedNote.id);
              commitBeatmapEdit((current) => deleteNote(current, selectedNote.id), { selectedNoteIds: nextSelection });
            }}>Usuń nutę</button>
          </>
        )}
        <div className="editor-marker-panel">
          <strong>Markery</strong>
          <button onClick={() => {
            const markerTimeMs = snapTimeMs(Math.round(elapsedRef.current), beatmapRef.current.bpm, snapDivision);
            const marker = {
              id: `marker-${markerTimeMs}-${Date.now().toString(36)}`,
              timeMs: markerTimeMs,
              label: `Marker ${formatTime(markerTimeMs)}`,
              note: '',
            };
            commitBeatmapEdit((current) => upsertMarker(current, marker));
          }}>Dodaj marker przy czasie</button>
          {(beatmap.markers ?? []).length === 0 && <p>Brak markerów.</p>}
          {(beatmap.markers ?? []).map((marker) => (
            <div className="editor-marker-row" key={marker.id}>
              <button onClick={() => seekEditorTo(marker.timeMs)}>{formatTime(marker.timeMs)}</button>
              <input
                aria-label="Etykieta markera"
                value={marker.label}
                onChange={(event) => commitBeatmapEdit((current) => updateMarker(current, marker.id, (item) => ({ ...item, label: event.target.value })))}
              />
              <input
                aria-label="Notatka markera"
                value={marker.note ?? ''}
                onChange={(event) => commitBeatmapEdit((current) => updateMarker(current, marker.id, (item) => ({ ...item, note: event.target.value })))}
              />
              <button onClick={() => commitBeatmapEdit((current) => deleteMarker(current, marker.id))}>Usuń</button>
            </div>
          ))}
        </div>
        <div className="editor-keybinds">
          <strong>Skróty</strong>
          {KEYBIND_GROUPS.map((group) => (
            <div key={group.title}>
              <span>{group.title}</span>
              {group.items.map((item) => (
                <p key={`${group.title}-${item.keys.join('+')}`}>
                  <kbd>{item.keys.join(' + ')}</kbd> {item.action}
                </p>
              ))}
            </div>
          ))}
        </div>
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
    || target instanceof HTMLSelectElement;
}

function initialSelectionFor(beatmap: RhythmBeatmap) {
  return new Set(beatmap.notes[0]?.id ? [beatmap.notes[0].id] : []);
}

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function playMetronomeClick(contextRef: { current: AudioContext | null }, volume: number) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = contextRef.current ?? new AudioContextCtor();
  contextRef.current = context;
  if (context.state === 'suspended') void context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.type = 'square';
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)) * 0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.05);
}

function getPrimaryEditorAudio(instrumental: HTMLAudioElement | null, vocal: HTMLAudioElement | null) {
  return instrumental ?? vocal;
}

function syncEditorAudioTime(instrumental: HTMLAudioElement | null, vocal: HTMLAudioElement | null, absoluteTimeMs: number) {
  const seconds = Math.max(0, absoluteTimeMs / 1000);
  [instrumental, vocal].forEach((audio) => {
    if (!audio) return;
    if (Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(seconds, Math.max(0, audio.duration - 0.01));
      return;
    }
    audio.currentTime = seconds;
  });
}

function updateEditorAudioVolumes(
  instrumental: HTMLAudioElement | null,
  vocal: HTMLAudioElement | null,
  masterVolume: number,
  instrumentalVolume: number,
  vocalVolume: number,
) {
  if (instrumental) instrumental.volume = clampVolume(masterVolume * instrumentalVolume);
  if (vocal) vocal.volume = clampVolume(masterVolume * vocalVolume);
}

function playEditorAudio(instrumental: HTMLAudioElement | null, vocal: HTMLAudioElement | null) {
  [instrumental, vocal].forEach((audio) => {
    audio?.play().catch(() => undefined);
  });
}

function pauseEditorAudio(instrumental: HTMLAudioElement | null, vocal: HTMLAudioElement | null) {
  [instrumental, vocal].forEach((audio) => audio?.pause());
}

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
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
