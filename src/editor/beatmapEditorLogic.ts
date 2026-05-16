import type { Difficulty, RhythmBeatmap, RhythmLane, RhythmNote, RhythmNoteKind, Track } from '../types';
import { getRhythmNoteDurationMs, getRhythmNoteEndMs, getRhythmNoteKind, MIN_LONG_NOTE_DURATION_MS, RHYTHM_LANES } from '../rhythm.ts';

export const EDITOR_HOLD_THRESHOLD_MS = 260;
export const EDITOR_SMASH_CHAIN_MS = 220;
export const EDITOR_VIEW_WINDOW_MS = 12000;
export const EDITOR_HIT_LINE_PERCENT = 82;

export type ManualBeatmapCatalog = {
  schemaVersion?: number;
  tracks?: Record<string, Partial<Record<Difficulty, RhythmBeatmap>>>;
};

export type EditorMode = 'edit' | 'test';

export type EditorValidation = {
  errors: string[];
  warnings: string[];
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
  kind?: 'tap' | 'smash';
};

export type ActiveRecordedPresses = Partial<Record<RhythmLane, ActiveRecordedPress>>;

export type RecordedKeyDown = {
  lane: RhythmLane;
  timeMs: number;
  seed?: number;
  kind?: 'tap' | 'smash';
};

export type RecordedKeyResult = {
  beatmap: RhythmBeatmap;
  activePresses: ActiveRecordedPresses;
  selectedNoteId: string | null;
  smashDraft: SmashDraft | null;
};

export type SmashDraft = {
  noteId: string;
  lane: RhythmLane;
  firstPressMs: number;
  lastPressMs: number;
  presses: number;
};

export function cloneBeatmapForEditing(beatmap: RhythmBeatmap): RhythmBeatmap {
  return {
    ...beatmap,
    source: 'manual',
    notes: beatmap.notes.map((note) => ({ ...note })),
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
  return kind === 'hold' || kind === 'smash'
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
    durationMs: kind === 'hold' ? 520 : 620,
    requiredPresses: kind === 'smash' ? 3 : undefined,
  };
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
  smashDraft: SmashDraft | null,
): { beatmap: RhythmBeatmap; selectedNoteId: string; smashDraft: SmashDraft | null } {
  const heldMs = releasedAtMs - draft.startedAtMs;
  if (heldMs >= EDITOR_HOLD_THRESHOLD_MS) {
    const holdNote = createEditorNote(draft.lane, draft.timeMs, 'hold', releasedAtMs);
    holdNote.durationMs = Math.max(MIN_LONG_NOTE_DURATION_MS, Math.round(heldMs));
    return { beatmap: upsertNote(beatmap, holdNote), selectedNoteId: holdNote.id, smashDraft: null };
  }

  if (smashDraft && smashDraft.lane === draft.lane && draft.timeMs - smashDraft.lastPressMs <= EDITOR_SMASH_CHAIN_MS) {
    const presses = smashDraft.presses + 1;
    const durationMs = Math.max(MIN_LONG_NOTE_DURATION_MS, draft.timeMs - smashDraft.firstPressMs + EDITOR_SMASH_CHAIN_MS);
    const nextBeatmap = updateNote(beatmap, smashDraft.noteId, (note) => ({
      ...note,
      kind: 'smash',
      durationMs,
      requiredPresses: presses,
    }));
    return {
      beatmap: nextBeatmap,
      selectedNoteId: smashDraft.noteId,
      smashDraft: { ...smashDraft, lastPressMs: draft.timeMs, presses },
    };
  }

  const tapNote = createEditorNote(draft.lane, draft.timeMs, 'tap', releasedAtMs);
  return {
    beatmap: upsertNote(beatmap, tapNote),
    selectedNoteId: tapNote.id,
    smashDraft: {
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
  smashDraft: SmashDraft | null,
  press: RecordedKeyDown,
): RecordedKeyResult {
  const nextActivePresses: ActiveRecordedPresses = { ...(activePresses ?? {}) };
  if (nextActivePresses[press.lane]) {
    return { beatmap, activePresses: nextActivePresses, selectedNoteId: nextActivePresses[press.lane]?.noteId ?? null, smashDraft };
  }

  if (press.kind === 'smash' && smashDraft && smashDraft.lane === press.lane && press.timeMs - smashDraft.lastPressMs <= EDITOR_SMASH_CHAIN_MS) {
    const presses = smashDraft.presses + 1;
    const durationMs = Math.max(MIN_LONG_NOTE_DURATION_MS, press.timeMs - smashDraft.firstPressMs + EDITOR_SMASH_CHAIN_MS);
    const nextBeatmap = updateNote(beatmap, smashDraft.noteId, (note) => ({
      ...note,
      kind: 'smash',
      durationMs,
      requiredPresses: presses,
    }));
    nextActivePresses[press.lane] = { noteId: smashDraft.noteId, lane: press.lane, timeMs: press.timeMs, kind: 'smash' };
    const nextSmashDraft = { ...smashDraft, lastPressMs: press.timeMs, presses };
    return { beatmap: nextBeatmap, activePresses: nextActivePresses, selectedNoteId: smashDraft.noteId, smashDraft: nextSmashDraft };
  }

  const tapNote = createEditorNote(press.lane, press.timeMs, 'tap', press.seed ?? Date.now());
  nextActivePresses[press.lane] = { noteId: tapNote.id, lane: press.lane, timeMs: press.timeMs, kind: press.kind ?? 'tap' };
  return {
    beatmap: upsertNote(beatmap, tapNote),
    activePresses: nextActivePresses,
    selectedNoteId: tapNote.id,
    smashDraft: null,
  };
}

export function promoteActiveRecordedHolds(
  beatmap: RhythmBeatmap,
  activePresses: ActiveRecordedPresses | null,
  elapsedMs: number,
): RhythmBeatmap {
  let nextBeatmap = beatmap;

  Object.values(activePresses ?? {}).forEach((press) => {
    if (!press || press.kind === 'smash') return;
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
  smashDraft: SmashDraft | null,
  lane: RhythmLane,
  releasedAtMs: number,
): RecordedKeyResult {
  const nextActivePresses: ActiveRecordedPresses = { ...(activePresses ?? {}) };
  const press = nextActivePresses[lane];
  if (!press) return { beatmap, activePresses: nextActivePresses, selectedNoteId: null, smashDraft };

  delete nextActivePresses[lane];
  const heldMs = releasedAtMs - press.timeMs;
  if (press.kind !== 'smash' && heldMs >= EDITOR_HOLD_THRESHOLD_MS) {
    const nextBeatmap = updateNote(beatmap, press.noteId, (note) => ({
      ...note,
      kind: 'hold',
      durationMs: Math.max(MIN_LONG_NOTE_DURATION_MS, Math.round(heldMs)),
      requiredPresses: undefined,
    }));
    return { beatmap: nextBeatmap, activePresses: nextActivePresses, selectedNoteId: press.noteId, smashDraft: null };
  }

  const nextSmashDraft: SmashDraft | null = press.kind === 'smash'
    ? smashDraft?.noteId === press.noteId
    ? { ...smashDraft, lastPressMs: press.timeMs }
    : {
        noteId: press.noteId,
        lane,
        firstPressMs: press.timeMs,
        lastPressMs: press.timeMs,
        presses: getRhythmNoteKind(beatmap.notes.find((note) => note.id === press.noteId) ?? { kind: undefined }) === 'smash'
          ? Math.max(2, beatmap.notes.find((note) => note.id === press.noteId)?.requiredPresses ?? 2)
          : 1,
      }
    : null;

  return { beatmap, activePresses: nextActivePresses, selectedNoteId: press.noteId, smashDraft: nextSmashDraft };
}

export function validateEditorBeatmap(beatmap: RhythmBeatmap): EditorValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ordered = [...beatmap.notes].sort(compareNotes);

  if ((beatmap.sourceEndMs ?? beatmap.durationMs) <= (beatmap.sourceStartMs ?? 0)) {
    errors.push('Zakres audio ma koniec przed początkiem.');
  }

  for (const note of ordered) {
    const kind = getRhythmNoteKind(note);
    if (!RHYTHM_LANES.includes(note.lane)) errors.push(`${note.id}: niepoprawny tor ${note.lane}.`);
    if (note.timeMs < 0 || note.timeMs > beatmap.durationMs) errors.push(`${note.id}: nuta poza czasem poziomu.`);
    if ((kind === 'hold' || kind === 'smash') && getRhythmNoteEndMs(note) > beatmap.durationMs) {
      errors.push(`${note.id}: ${kind} kończy się poza czasem poziomu.`);
    }
    if ((kind === 'hold' || kind === 'smash') && getRhythmNoteDurationMs(note) < MIN_LONG_NOTE_DURATION_MS) {
      errors.push(`${note.id}: ${kind} jest za krótki.`);
    }
    if (kind === 'smash' && (note.requiredPresses ?? 0) < 2) {
      errors.push(`${note.id}: smash potrzebuje celu co najmniej 2 uderzeń.`);
    }
  }

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.lane !== current.lane) continue;
    if (getRhythmNoteEndMs(previous) + 90 > current.timeMs) {
      warnings.push(`${current.lane}: kolizja ${previous.id} -> ${current.id}.`);
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
          bpm: track.bpm,
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
