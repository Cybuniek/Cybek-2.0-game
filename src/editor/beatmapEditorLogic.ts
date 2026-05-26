import type { Difficulty, RhythmBeatmap, RhythmLane, RhythmMarker, RhythmNote, RhythmNoteKind, Track } from '../types';
import { getRhythmNoteDurationMs, getRhythmNoteEndMs, getRhythmNoteKind, MIN_LONG_NOTE_DURATION_MS, RHYTHM_LANES } from '../rhythm.ts';

export const EDITOR_HOLD_THRESHOLD_MS = 260;
export const EDITOR_HOLD_CHAIN_MS = 220;
export const EDITOR_VIEW_WINDOW_MS = 12000;
export const EDITOR_HIT_LINE_PERCENT = 82;
export const EDITOR_HISTORY_LIMIT = 50;
export const EDITOR_EXTREME_OFFSET_MS = 250;

export type SnapDivision = 'off' | '1/4' | '1/8' | '1/16' | '1/32';

export type ManualBeatmapCatalog = {
  schemaVersion?: number;
  tracks?: Record<string, Partial<Record<Difficulty, RhythmBeatmap>>>;
};

export type EditorMode = 'edit' | 'test';

export type EditorValidation = {
  errors: string[];
  warnings: string[];
};

export type EditorSnapshot = {
  beatmap: RhythmBeatmap;
  selectedNoteIds: Set<string>;
};

export type EditorHistoryResult = EditorSnapshot & {
  history: EditorHistory;
};

export type EditorHistory = {
  push: (beatmap: RhythmBeatmap, selectedNoteIds: Set<string>) => EditorHistory;
  undo: (currentBeatmap: RhythmBeatmap, currentSelectedNoteIds: Set<string>) => EditorHistoryResult | null;
  redo: (currentBeatmap: RhythmBeatmap, currentSelectedNoteIds: Set<string>) => EditorHistoryResult | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export type EditorClipboardEntry = {
  sourceId: string;
  lane: RhythmLane;
  relativeTimeMs: number;
  kind?: RhythmNoteKind;
  durationMs?: number;
  requiredPresses?: number;
};

export type EditorClipboard = {
  entries: EditorClipboardEntry[];
};

export type PasteResult = {
  beatmap: RhythmBeatmap;
  selectedNoteIds: Set<string>;
};

export type BeatGridLine = {
  timeMs: number;
  beatIndex: number;
  isBar: boolean;
};

export type KeyPressDraft = {
  lane: RhythmLane;
  startedAtMs: number;
  timeMs: number;
};

export type ActiveRecordedPress = {
  noteId: string;
  lane: RhythmLane;
  timeMs: number;
  kind?: 'tap' | 'hold';
};

export type ActiveRecordedPresses = Partial<Record<RhythmLane, ActiveRecordedPress>>;

export type RecordedKeyDown = {
  lane: RhythmLane;
  timeMs: number;
  seed?: number;
  kind?: 'tap' | 'hold';
};

export type RecordedKeyResult = {
  beatmap: RhythmBeatmap;
  activePresses: ActiveRecordedPresses;
  selectedNoteId: string | null;
  holdDraft: HoldDraft | null;
};

export type HoldDraft = {
  noteId: string;
  lane: RhythmLane;
  firstPressMs: number;
  lastPressMs: number;
  presses: number;
};

const SNAP_FRACTIONS: Record<Exclude<SnapDivision, 'off'>, number> = {
  '1/4': 1,
  '1/8': 2,
  '1/16': 4,
  '1/32': 8,
};

export function cloneBeatmapForEditing(beatmap: RhythmBeatmap): RhythmBeatmap {
  return {
    ...beatmap,
    source: 'manual',
    notes: beatmap.notes.map((note) => ({ ...note })),
    markers: beatmap.markers?.map((marker) => ({ ...marker })),
  };
}

export function snapTimeMs(timeMs: number, bpm: number, division: SnapDivision): number {
  if (division === 'off') return Math.round(timeMs);
  const beatMs = 60000 / Math.max(1, bpm);
  const stepMs = beatMs / SNAP_FRACTIONS[division];
  return Math.max(0, Math.round(Math.round(timeMs / stepMs) * stepMs));
}

export function getSnapStepMs(bpm: number, division: SnapDivision): number {
  if (division === 'off') return 0;
  const beatMs = 60000 / Math.max(1, bpm);
  return Math.max(1, Math.round(beatMs / SNAP_FRACTIONS[division]));
}

export function createEditorHistory(beatmap: RhythmBeatmap, selectedNoteIds: Set<string> = new Set()): EditorHistory {
  return makeEditorHistory(snapshotOf(beatmap, selectedNoteIds), [], []);
}

function makeEditorHistory(current: EditorSnapshot, past: EditorSnapshot[], future: EditorSnapshot[]): EditorHistory {
  return {
    push(beatmap, selectedNoteIds) {
      const nextPast = [...past, current].slice(-EDITOR_HISTORY_LIMIT);
      return makeEditorHistory(snapshotOf(beatmap, selectedNoteIds), nextPast, []);
    },
    undo(_currentBeatmap, _currentSelectedNoteIds) {
      if (past.length === 0) return null;
      const previous = past[past.length - 1];
      return {
        ...snapshotOf(previous.beatmap, previous.selectedNoteIds),
        history: makeEditorHistory(previous, past.slice(0, -1), [current, ...future]),
      };
    },
    redo(_currentBeatmap, _currentSelectedNoteIds) {
      if (future.length === 0) return null;
      const next = future[0];
      return {
        ...snapshotOf(next.beatmap, next.selectedNoteIds),
        history: makeEditorHistory(next, [...past, current].slice(-EDITOR_HISTORY_LIMIT), future.slice(1)),
      };
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}

function snapshotOf(beatmap: RhythmBeatmap, selectedNoteIds: Set<string>): EditorSnapshot {
  return {
    beatmap: cloneBeatmapForEditing(beatmap),
    selectedNoteIds: new Set(selectedNoteIds),
  };
}

export function viewportStartForElapsed(elapsedMs: number, durationMs: number) {
  return clamp(elapsedMs, 0, durationMs);
}

export function editorViewWindowMs(gameplayTravelMs: number, zoom: number) {
  return Math.max(300, Math.round(gameplayTravelMs / Math.max(0.25, zoom)));
}

export function timeToYPercent(timeMs: number, elapsedMs: number, viewWindowMs = EDITOR_VIEW_WINDOW_MS) {
  const timeToHitMs = timeMs - elapsedMs;
  return EDITOR_HIT_LINE_PERCENT - (timeToHitMs / viewWindowMs) * EDITOR_HIT_LINE_PERCENT;
}

export function yPercentToTime(yPercent: number, elapsedMs: number, durationMs: number, viewWindowMs = EDITOR_VIEW_WINDOW_MS) {
  const timeToHitMs = ((EDITOR_HIT_LINE_PERCENT - yPercent) / EDITOR_HIT_LINE_PERCENT) * viewWindowMs;
  return clamp(Math.round(elapsedMs + timeToHitMs), 0, durationMs);
}

export function noteDurationPercent(note: RhythmNote, viewWindowMs = EDITOR_VIEW_WINDOW_MS) {
  return (getRhythmNoteDurationMs(note) / viewWindowMs) * EDITOR_HIT_LINE_PERCENT;
}

export function editorNoteHeightPercent(note: RhythmNote, viewWindowMs = EDITOR_VIEW_WINDOW_MS) {
  return Math.max(5, noteDurationPercent(note, viewWindowMs));
}

export function noteVisualTopPercent(note: RhythmNote, elapsedMs: number, viewWindowMs = EDITOR_VIEW_WINDOW_MS) {
  const headPercent = timeToYPercent(note.timeMs, elapsedMs, viewWindowMs);
  const kind = getRhythmNoteKind(note);
  return kind === 'hold'
    ? headPercent - editorNoteHeightPercent(note, viewWindowMs)
    : headPercent;
}

export function noteLaneIndex(lane: RhythmLane) {
  return RHYTHM_LANES.indexOf(lane);
}

export function laneFromXPercent(xPercent: number): RhythmLane {
  const index = clamp(Math.floor((xPercent / 100) * RHYTHM_LANES.length), 0, RHYTHM_LANES.length - 1);
  return RHYTHM_LANES[index];
}

export function createEditorNote(lane: RhythmLane, timeMs: number, kind: RhythmNoteKind = 'tap', seed = Date.now()): RhythmNote {
  const id = `edit-${lane}-${timeMs}-${seed.toString(36)}`;
  if (kind === 'tap') return { id, lane, timeMs };

  return {
    id,
    lane,
    timeMs,
    kind,
    durationMs: 520,
  };
}

export function copySelectedNotes(beatmap: RhythmBeatmap, selectedNoteIds: Set<string>): EditorClipboard | null {
  const selectedNotes = beatmap.notes.filter((note) => selectedNoteIds.has(note.id)).sort(compareNotes);
  if (selectedNotes.length === 0) return null;
  const firstTimeMs = selectedNotes[0].timeMs;
  return {
    entries: selectedNotes.map((note) => ({
      sourceId: note.id,
      lane: note.lane,
      relativeTimeMs: note.timeMs - firstTimeMs,
      kind: getRhythmNoteKind(note),
      durationMs: note.durationMs,
      requiredPresses: note.requiredPresses,
    })),
  };
}

export function pasteClipboardAtTime(
  beatmap: RhythmBeatmap,
  clipboard: EditorClipboard | null,
  playheadMs: number,
  bpm: number,
  snapDivision: SnapDivision,
  seed = Date.now(),
): PasteResult {
  if (!clipboard || clipboard.entries.length === 0) return { beatmap, selectedNoteIds: new Set() };

  const selectedNoteIds = new Set<string>();
  const pastedNotes = clipboard.entries.map((entry, index): RhythmNote => {
    const id = `paste-${entry.sourceId}-${seed.toString(36)}-${index}`;
    const durationMs = entry.kind === 'hold'
      ? Math.max(MIN_LONG_NOTE_DURATION_MS, Math.round(entry.durationMs ?? MIN_LONG_NOTE_DURATION_MS))
      : undefined;
    const maxStartMs = Math.max(0, beatmap.durationMs - (durationMs ?? 0));
    const timeMs = clamp(snapTimeMs(playheadMs + entry.relativeTimeMs, bpm, snapDivision), 0, maxStartMs);
    selectedNoteIds.add(id);
    if (entry.kind === 'hold') {
      return {
        id,
        lane: entry.lane,
        timeMs,
        kind: 'hold',
        durationMs,
        requiredPresses: entry.requiredPresses,
      };
    }
    return { id, lane: entry.lane, timeMs };
  });

  return {
    beatmap: {
      ...beatmap,
      notes: [...beatmap.notes, ...pastedNotes].sort(compareNotes),
    },
    selectedNoteIds,
  };
}

export function nudgeSelectedNotes(beatmap: RhythmBeatmap, selectedNoteIds: Set<string>, deltaMs: number): RhythmBeatmap {
  if (selectedNoteIds.size === 0 || deltaMs === 0) return beatmap;
  return {
    ...beatmap,
    notes: beatmap.notes.map((note) => {
      if (!selectedNoteIds.has(note.id)) return note;
      const maxStartMs = Math.max(0, beatmap.durationMs - getRhythmNoteDurationMs(note));
      return {
        ...note,
        timeMs: clamp(Math.round(note.timeMs + deltaMs), 0, maxStartMs),
      };
    }).sort(compareNotes),
  };
}

export function upsertMarker(beatmap: RhythmBeatmap, marker: RhythmMarker): RhythmBeatmap {
  return {
    ...beatmap,
    markers: [marker, ...(beatmap.markers ?? []).filter((item) => item.id !== marker.id)].sort(compareMarkers),
  };
}

export function updateMarker(beatmap: RhythmBeatmap, markerId: string, update: (marker: RhythmMarker) => RhythmMarker): RhythmBeatmap {
  return {
    ...beatmap,
    markers: (beatmap.markers ?? []).map((marker) => (marker.id === markerId ? update({ ...marker }) : marker)).sort(compareMarkers),
  };
}

export function deleteMarker(beatmap: RhythmBeatmap, markerId: string): RhythmBeatmap {
  return {
    ...beatmap,
    markers: (beatmap.markers ?? []).filter((marker) => marker.id !== markerId),
  };
}

export function getNextMetronomeBeatMs(previousElapsedMs: number, elapsedMs: number, bpm: number): number | null {
  if (elapsedMs < 0) return null;
  const beatMs = 60000 / Math.max(1, bpm);
  const previousIndex = previousElapsedMs < 0 ? -1 : Math.floor(previousElapsedMs / beatMs);
  const currentIndex = Math.floor(elapsedMs / beatMs);
  if (currentIndex <= previousIndex) return null;
  return Math.round(currentIndex * beatMs);
}

export function getVisibleBeatGridLines(elapsedMs: number, viewWindowMs: number, bpm: number): BeatGridLine[] {
  const safeBpm = Math.max(1, bpm);
  const beatMs = 60000 / safeBpm;
  const startBeat = Math.max(0, Math.floor(elapsedMs / beatMs));
  const endMs = elapsedMs + Math.max(1, viewWindowMs);
  const lines: BeatGridLine[] = [];

  for (let beatIndex = startBeat; beatIndex * beatMs <= endMs + 1; beatIndex += 1) {
    lines.push({
      timeMs: Math.round(beatIndex * beatMs),
      beatIndex,
      isBar: beatIndex % 4 === 0,
    });
  }

  return lines;
}

export function getEditorWheelSeekDeltaMs(deltaY: number, zoom: number, fine = false): number {
  if (deltaY === 0) return 0;
  const baseStepMs = 180 / Math.max(0.5, zoom);
  const stepMs = fine ? baseStepMs / 4 : baseStepMs;
  return Math.round(Math.sign(deltaY) * stepMs);
}

export function upsertNote(beatmap: RhythmBeatmap, note: RhythmNote): RhythmBeatmap {
  const notes = [note, ...beatmap.notes.filter((item) => item.id !== note.id)].sort(compareNotes);
  return { ...beatmap, notes };
}

export function updateNote(beatmap: RhythmBeatmap, noteId: string, update: (note: RhythmNote) => RhythmNote): RhythmBeatmap {
  return {
    ...beatmap,
    notes: beatmap.notes.map((note) => (note.id === noteId ? update({ ...note }) : note)).sort(compareNotes),
  };
}

export function deleteNote(beatmap: RhythmBeatmap, noteId: string): RhythmBeatmap {
  return { ...beatmap, notes: beatmap.notes.filter((note) => note.id !== noteId) };
}

export function applyRecordedPress(
  beatmap: RhythmBeatmap,
  draft: KeyPressDraft,
  releasedAtMs: number,
  holdDraft: HoldDraft | null,
): { beatmap: RhythmBeatmap; selectedNoteId: string; holdDraft: HoldDraft | null } {
  const heldMs = releasedAtMs - draft.startedAtMs;
  if (heldMs >= EDITOR_HOLD_THRESHOLD_MS) {
    const holdNote = createEditorNote(draft.lane, draft.timeMs, 'hold', releasedAtMs);
    holdNote.durationMs = Math.max(MIN_LONG_NOTE_DURATION_MS, Math.round(heldMs));
    return { beatmap: upsertNote(beatmap, holdNote), selectedNoteId: holdNote.id, holdDraft: null };
  }

  if (holdDraft && holdDraft.lane === draft.lane && draft.timeMs - holdDraft.lastPressMs <= EDITOR_HOLD_CHAIN_MS) {
    const presses = holdDraft.presses + 1;
    const durationMs = Math.max(MIN_LONG_NOTE_DURATION_MS, draft.timeMs - holdDraft.firstPressMs + EDITOR_HOLD_CHAIN_MS);
    const nextBeatmap = updateNote(beatmap, holdDraft.noteId, (note) => ({
      ...note,
      kind: 'hold',
      durationMs,
      requiredPresses: presses,
    }));
    return {
      beatmap: nextBeatmap,
      selectedNoteId: holdDraft.noteId,
      holdDraft: { ...holdDraft, lastPressMs: draft.timeMs, presses },
    };
  }

  const tapNote = createEditorNote(draft.lane, draft.timeMs, 'tap', releasedAtMs);
  return {
    beatmap: upsertNote(beatmap, tapNote),
    selectedNoteId: tapNote.id,
    holdDraft: {
      noteId: tapNote.id,
      lane: draft.lane,
      firstPressMs: draft.timeMs,
      lastPressMs: draft.timeMs,
      presses: 1,
    },
  };
}

export function applyRecordedKeyDown(
  beatmap: RhythmBeatmap,
  activePresses: ActiveRecordedPresses | null,
  holdDraft: HoldDraft | null,
  press: RecordedKeyDown,
): RecordedKeyResult {
  const nextActivePresses: ActiveRecordedPresses = { ...(activePresses ?? {}) };
  if (nextActivePresses[press.lane]) {
    return { beatmap, activePresses: nextActivePresses, selectedNoteId: nextActivePresses[press.lane]?.noteId ?? null, holdDraft };
  }

  if (press.kind === 'hold' && holdDraft && holdDraft.lane === press.lane && press.timeMs - holdDraft.lastPressMs <= EDITOR_HOLD_CHAIN_MS) {
    const presses = holdDraft.presses + 1;
    const durationMs = Math.max(MIN_LONG_NOTE_DURATION_MS, press.timeMs - holdDraft.firstPressMs + EDITOR_HOLD_CHAIN_MS);
    const nextBeatmap = updateNote(beatmap, holdDraft.noteId, (note) => ({
      ...note,
      kind: 'hold',
      durationMs,
      requiredPresses: presses,
    }));
    nextActivePresses[press.lane] = { noteId: holdDraft.noteId, lane: press.lane, timeMs: press.timeMs, kind: 'hold' };
    const nextHoldDraft = { ...holdDraft, lastPressMs: press.timeMs, presses };
    return { beatmap: nextBeatmap, activePresses: nextActivePresses, selectedNoteId: holdDraft.noteId, holdDraft: nextHoldDraft };
  }

  const tapNote = createEditorNote(press.lane, press.timeMs, 'tap', press.seed ?? Date.now());
  nextActivePresses[press.lane] = { noteId: tapNote.id, lane: press.lane, timeMs: press.timeMs, kind: press.kind ?? 'tap' };
  return {
    beatmap: upsertNote(beatmap, tapNote),
    activePresses: nextActivePresses,
    selectedNoteId: tapNote.id,
    holdDraft: null,
  };
}

export function promoteActiveRecordedHolds(
  beatmap: RhythmBeatmap,
  activePresses: ActiveRecordedPresses | null,
  elapsedMs: number,
): RhythmBeatmap {
  let nextBeatmap = beatmap;

  Object.values(activePresses ?? {}).forEach((press) => {
    if (!press || press.kind === 'hold') return;
    const heldMs = elapsedMs - press.timeMs;
    if (heldMs < EDITOR_HOLD_THRESHOLD_MS) return;
    nextBeatmap = updateNote(nextBeatmap, press.noteId, (note) => ({
      ...note,
      kind: 'hold',
      durationMs: Math.max(MIN_LONG_NOTE_DURATION_MS, Math.round(heldMs)),
      requiredPresses: undefined,
    }));
  });

  return nextBeatmap;
}

export function applyRecordedKeyUp(
  beatmap: RhythmBeatmap,
  activePresses: ActiveRecordedPresses | null,
  holdDraft: HoldDraft | null,
  lane: RhythmLane,
  releasedAtMs: number,
): RecordedKeyResult {
  const nextActivePresses: ActiveRecordedPresses = { ...(activePresses ?? {}) };
  const press = nextActivePresses[lane];
  if (!press) return { beatmap, activePresses: nextActivePresses, selectedNoteId: null, holdDraft };

  delete nextActivePresses[lane];
  const heldMs = releasedAtMs - press.timeMs;
  if (press.kind !== 'hold' && heldMs >= EDITOR_HOLD_THRESHOLD_MS) {
    const nextBeatmap = updateNote(beatmap, press.noteId, (note) => ({
      ...note,
      kind: 'hold',
      durationMs: Math.max(MIN_LONG_NOTE_DURATION_MS, Math.round(heldMs)),
      requiredPresses: undefined,
    }));
    return { beatmap: nextBeatmap, activePresses: nextActivePresses, selectedNoteId: press.noteId, holdDraft: null };
  }

  const nextHoldDraft: HoldDraft | null = press.kind === 'hold'
    ? holdDraft?.noteId === press.noteId
    ? { ...holdDraft, lastPressMs: press.timeMs }
    : {
        noteId: press.noteId,
        lane,
        firstPressMs: press.timeMs,
        lastPressMs: press.timeMs,
        presses: getRhythmNoteKind(beatmap.notes.find((note) => note.id === press.noteId) ?? { kind: undefined }) === 'hold'
          ? Math.max(2, beatmap.notes.find((note) => note.id === press.noteId)?.requiredPresses ?? 2)
          : 1,
      }
    : null;

  return { beatmap, activePresses: nextActivePresses, selectedNoteId: press.noteId, holdDraft: nextHoldDraft };
}

export function validateEditorBeatmap(beatmap: RhythmBeatmap): EditorValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ordered = [...beatmap.notes].sort(compareNotes);
  const sourceStartMs = beatmap.sourceStartMs ?? 0;
  const sourceEndMs = beatmap.sourceEndMs ?? beatmap.durationMs;

  if (!Number.isFinite(beatmap.durationMs) || beatmap.durationMs <= 0) {
    errors.push('Czas poziomu musi być dodatni.');
  }

  if (!Number.isFinite(beatmap.bpm) || beatmap.bpm <= 0) {
    errors.push('BPM mapy musi być dodatni.');
  }

  if (sourceEndMs <= sourceStartMs) {
    errors.push('Zakres audio ma koniec przed początkiem.');
  }

  if (sourceStartMs < 0) {
    errors.push('Zakres audio zaczyna się przed początkiem pliku.');
  }

  for (const note of ordered) {
    const kind = getRhythmNoteKind(note);
    if (!RHYTHM_LANES.includes(note.lane)) errors.push(`${note.id}: niepoprawny tor ${note.lane}.`);
    if (!Number.isFinite(note.timeMs) || note.timeMs < 0 || note.timeMs > beatmap.durationMs) errors.push(`${note.id}: nuta poza czasem poziomu.`);
    if (kind === 'hold' && getRhythmNoteEndMs(note) > beatmap.durationMs) {
      errors.push(`${note.id}: ${kind} kończy się poza czasem poziomu.`);
    }
    if (kind === 'hold' && getRhythmNoteDurationMs(note) < MIN_LONG_NOTE_DURATION_MS) {
      errors.push(`${note.id}: ${kind} jest za krótki.`);
    }
    if (kind === 'hold' && note.requiredPresses !== undefined && note.requiredPresses < 2) {
      errors.push(`${note.id}: hold potrzebuje celu co najmniej 2 uderzeń.`);
    }
  }

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.lane !== current.lane) continue;
    if (previous.timeMs === current.timeMs) {
      warnings.push(`${current.lane}: duplikat nuty w ${current.timeMs} ms (${previous.id} / ${current.id}).`);
      continue;
    }
    if (getRhythmNoteEndMs(previous) + 90 > current.timeMs) {
      warnings.push(`${current.lane}: kolizja ${previous.id} -> ${current.id}.`);
    }
  }

  if (Math.abs(beatmap.inputOffsetMs ?? 0) > EDITOR_EXTREME_OFFSET_MS) {
    warnings.push(`Offset wejścia ${beatmap.inputOffsetMs} ms jest bardzo duży; sprawdź kalibrację.`);
  }

  for (const marker of beatmap.markers ?? []) {
    if (!Number.isFinite(marker.timeMs) || marker.timeMs < 0 || marker.timeMs > beatmap.durationMs) {
      warnings.push(`Marker "${marker.label || marker.id}" jest poza czasem poziomu.`);
    }
    if (!marker.label.trim()) {
      warnings.push(`Marker ${marker.id} nie ma etykiety.`);
    }
  }

  return { errors, warnings };
}

export function serializeManualBeatmapCatalog(
  baseCatalog: ManualBeatmapCatalog,
  track: Track,
  difficulty: Difficulty,
  beatmap: RhythmBeatmap,
) {
  const nextCatalog: ManualBeatmapCatalog = {
    schemaVersion: 2,
    tracks: {
      ...(baseCatalog.tracks ?? {}),
      [track.id]: {
        ...(baseCatalog.tracks?.[track.id] ?? {}),
        [difficulty]: {
          ...beatmap,
          trackId: track.id,
          bpm: Math.max(1, Math.round(beatmap.bpm || track.bpm)),
          notes: beatmap.notes.map((note) => ({ ...note })).sort(compareNotes),
        },
      },
    },
  };

  return JSON.stringify(nextCatalog, null, 2);
}

export function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function compareNotes(left: RhythmNote, right: RhythmNote) {
  return left.timeMs - right.timeMs || noteLaneIndex(left.lane) - noteLaneIndex(right.lane) || left.id.localeCompare(right.id);
}

function compareMarkers(left: RhythmMarker, right: RhythmMarker) {
  return left.timeMs - right.timeMs || left.id.localeCompare(right.id);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
