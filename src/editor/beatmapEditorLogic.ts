import type { Difficulty, RhythmBeatmap, RhythmLane, RhythmNote, RhythmNoteKind, Track } from '../types';
import { getRhythmNoteDurationMs, getRhythmNoteEndMs, getRhythmNoteKind, MIN_LONG_NOTE_DURATION_MS, RHYTHM_LANES } from '../rhythm';

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

export function timeToYPercent(timeMs: number, elapsedMs: number) {
  const timeToHitMs = timeMs - elapsedMs;
  return EDITOR_HIT_LINE_PERCENT - (timeToHitMs / EDITOR_VIEW_WINDOW_MS) * EDITOR_HIT_LINE_PERCENT;
}

export function yPercentToTime(yPercent: number, elapsedMs: number, durationMs: number) {
  const timeToHitMs = ((EDITOR_HIT_LINE_PERCENT - yPercent) / EDITOR_HIT_LINE_PERCENT) * EDITOR_VIEW_WINDOW_MS;
  return clamp(Math.round(elapsedMs + timeToHitMs), 0, durationMs);
}

export function noteDurationPercent(note: RhythmNote) {
  return (getRhythmNoteDurationMs(note) / EDITOR_VIEW_WINDOW_MS) * EDITOR_HIT_LINE_PERCENT;
}

export function editorNoteHeightPercent(note: RhythmNote) {
  return Math.max(5, noteDurationPercent(note));
}

export function noteVisualTopPercent(note: RhythmNote, elapsedMs: number) {
  const headPercent = timeToYPercent(note.timeMs, elapsedMs);
  const kind = getRhythmNoteKind(note);
  return kind === 'hold' || kind === 'smash'
    ? headPercent - editorNoteHeightPercent(note)
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
