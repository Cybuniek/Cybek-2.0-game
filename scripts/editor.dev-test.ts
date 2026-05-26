import {
  createEditorHistory,
  copySelectedNotes,
  deleteMarker,
  getEditorWheelSeekDeltaMs,
  getNextMetronomeBeatMs,
  getVisibleBeatGridLines,
  nudgeSelectedNotes,
  pasteClipboardAtTime,
  serializeManualBeatmapCatalog,
  snapTimeMs,
  updateMarker,
  upsertMarker,
  validateEditorBeatmap,
} from '../src/editor/beatmapEditorLogic.ts';
import {
  createRhythmSession,
  hitRhythmLane,
} from '../src/rhythm.ts';
import type { RhythmBeatmap } from '../src/types.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const baseMap: RhythmBeatmap = {
  trackId: 'editor-dev',
  bpm: 120,
  durationMs: 4000,
  notes: [
    { id: 'a', lane: 'S', timeMs: 1000 },
    { id: 'b', lane: 'D', timeMs: 1250, kind: 'hold', durationMs: 500 },
    { id: 'c', lane: 'K', timeMs: 3000 },
  ],
};

assertEqual(snapTimeMs(740, 120, '1/4'), 500, 'quarter snap uses the song BPM');
assertEqual(snapTimeMs(740, 120, '1/8'), 750, 'eighth snap uses half-beat steps');
assertEqual(snapTimeMs(189, 120, '1/16'), 250, 'sixteenth snap rounds to the nearest grid line');
assertEqual(snapTimeMs(94, 120, '1/32'), 125, 'thirty-second snap supports fractional millisecond grid sizes');
assertEqual(snapTimeMs(777, 120, 'off'), 777, 'off snap leaves time unchanged');

let history = createEditorHistory(baseMap, new Set(['a']));
const editedMap: RhythmBeatmap = {
  ...baseMap,
  notes: baseMap.notes.map((note) => (note.id === 'a' ? { ...note, timeMs: 1500 } : note)),
};
history = history.push(editedMap, new Set(['a', 'b']));
let undone = history.undo(editedMap, new Set(['a', 'b']));
assert(undone, 'undo returns a snapshot after a pushed edit');
assertEqual(undone.beatmap.notes.find((note) => note.id === 'a')?.timeMs, 1000, 'undo restores beatmap data');
assert(undone.selectedNoteIds.has('a') && !undone.selectedNoteIds.has('b'), 'undo restores selection');
let redone = undone.history.redo(undone.beatmap, undone.selectedNoteIds);
assert(redone, 'redo returns the edited snapshot');
assertEqual(redone.beatmap.notes.find((note) => note.id === 'a')?.timeMs, 1500, 'redo restores edited beatmap data');

const clipboard = copySelectedNotes(baseMap, new Set(['a', 'b']));
assert(clipboard, 'copySelectedNotes returns clipboard data for selected notes');
const pasted = pasteClipboardAtTime(baseMap, clipboard, 3200, 120, '1/8', 7);
assertEqual(pasted.beatmap.notes.length, 5, 'paste adds selected notes');
assertEqual(pasted.beatmap.notes.filter((note) => pasted.selectedNoteIds.has(note.id)).length, 2, 'paste selects new notes');
const pastedTimes = pasted.beatmap.notes
  .filter((note) => pasted.selectedNoteIds.has(note.id))
  .map((note) => note.timeMs)
  .sort((left, right) => left - right);
assertEqual(pastedTimes.join(','), '3250,3500', 'paste keeps relative spacing and snaps to the current grid');

const nudged = nudgeSelectedNotes(baseMap, new Set(['a', 'b']), -1600);
assertEqual(nudged.notes.find((note) => note.id === 'a')?.timeMs, 0, 'nudge clamps tap starts to zero');
assertEqual(nudged.notes.find((note) => note.id === 'b')?.timeMs, 0, 'nudge clamps hold starts to zero');
const nudgedToEnd = nudgeSelectedNotes(baseMap, new Set(['b']), 2600);
assertEqual(nudgedToEnd.notes.find((note) => note.id === 'b')?.timeMs, 3500, 'nudge clamps hold end to map duration');

let markerMap = upsertMarker(baseMap, { id: 'm-1', timeMs: 1500, label: 'Refren', note: 'wejście' });
assertEqual(markerMap.markers?.[0]?.label, 'Refren', 'upsertMarker adds a timeline marker');
markerMap = updateMarker(markerMap, 'm-1', (marker) => ({ ...marker, label: 'Zwrotka' }));
assertEqual(markerMap.markers?.[0]?.label, 'Zwrotka', 'updateMarker edits existing marker');
markerMap = deleteMarker(markerMap, 'm-1');
assertEqual(markerMap.markers?.length ?? 0, 0, 'deleteMarker removes marker');

const validationMap: RhythmBeatmap = {
  ...baseMap,
  inputOffsetMs: 251,
  markers: [{ id: 'late-marker', timeMs: 5000, label: 'poza mapą' }],
  notes: [
    { id: 'dup-1', lane: 'S', timeMs: 1000 },
    { id: 'dup-2', lane: 'S', timeMs: 1000 },
    { id: 'bad-hold', lane: 'D', timeMs: 3900, kind: 'hold', durationMs: 500 },
  ],
};
const validation = validateEditorBeatmap(validationMap);
assert(validation.errors.some((error) => error.includes('kończy się poza czasem poziomu')), 'validation blocks holds ending outside the map');
assert(validation.warnings.some((warning) => warning.includes('duplikat')), 'validation warns about duplicate lane/time notes');
assert(validation.warnings.some((warning) => warning.includes('Offset wejścia')), 'validation warns about extreme input offset');
assert(validation.warnings.some((warning) => warning.includes('Marker')), 'validation warns about markers outside the map');

let session = createRhythmSession({
  trackId: 'offset-dev',
  bpm: 120,
  durationMs: 2000,
  inputOffsetMs: 50,
  notes: [{ id: 'offset-note', lane: 'S', timeMs: 1000 }],
}, 'Łatwy');
session = { ...session, elapsedMs: 950 };
session = hitRhythmLane(session, 'S');
assertEqual(session.perfectHits, 1, 'positive input offset makes a slightly early input land on the note');

assertEqual(getNextMetronomeBeatMs(-1, 0, 120), 0, 'metronome starts on the first beat at playback start');
assertEqual(getNextMetronomeBeatMs(120, 499, 120), null, 'metronome stays silent before the next beat');
assertEqual(getNextMetronomeBeatMs(120, 501, 120), 500, 'metronome triggers when playback crosses a beat');

const gridLines = getVisibleBeatGridLines(1000, 1000, 120);
assertEqual(gridLines.map((line) => line.timeMs).join(','), '1000,1500,2000', 'BPM grid follows the visible time window');
assertEqual(gridLines.find((line) => line.timeMs === 2000)?.isBar, true, 'BPM grid marks whole bars every four beats');

assertEqual(getEditorWheelSeekDeltaMs(100, 1, false), 180, 'wheel seek uses a readable paused editor step');
assertEqual(getEditorWheelSeekDeltaMs(100, 1, true), 45, 'shift wheel seek supports finer navigation');
assertEqual(getEditorWheelSeekDeltaMs(-100, 1, false), -180, 'wheel seek preserves scroll direction');

const serializedCatalog = JSON.parse(serializeManualBeatmapCatalog(
  { schemaVersion: 2, tracks: {} },
  {
    id: 'editor-dev',
    order: 1,
    title: 'Editor Dev',
    artist: 'Test',
    bpm: 120,
    durationMs: 4000,
    mood: 'test',
    beatmapSeed: 1,
    difficulties: ['Łatwy'],
    audio: { instrumental: '/i.ogg', vocals: '/v.ogg', merged: '/m.ogg' },
  },
  'Łatwy',
  { ...baseMap, bpm: 137 },
)) as { tracks: { 'editor-dev': { 'Łatwy': RhythmBeatmap } } };
assertEqual(serializedCatalog.tracks['editor-dev']['Łatwy'].bpm, 137, 'export keeps manually edited BPM per map');
