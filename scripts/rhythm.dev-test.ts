import {
  buildRhythmBeatmap,
  createRhythmSession,
  finishRhythmSession,
  getRhythmSummary,
  hitRhythmLane,
  RHYTHM_LANES,
  stepRhythmSession,
} from '../src/rhythm.ts';
import type { RhythmBeatmap, Track } from '../src/types.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const testTrack: Track = {
  id: 'dev-track',
  title: 'Dev Track',
  artist: 'Test',
  bpm: 90,
  mood: 'test',
  beatmapSeed: 12345,
  difficulties: ['Łatwy', 'Normalny', 'Cybart'],
};

const firstMap = buildRhythmBeatmap(testTrack, 'Normalny');
const secondMap = buildRhythmBeatmap(testTrack, 'Normalny');

assertEqual(firstMap.durationMs, 60000, 'beatmap lasts one minute');
assert(firstMap.notes.length > 40, 'normal difficulty generates enough notes');
assertEqual(JSON.stringify(firstMap.notes.slice(0, 20)), JSON.stringify(secondMap.notes.slice(0, 20)), 'beatmap is deterministic');
assert(firstMap.notes.every((note) => RHYTHM_LANES.includes(note.lane)), 'all generated notes use playable lanes');

const handMadeMap: RhythmBeatmap = {
  trackId: 'manual',
  bpm: 120,
  durationMs: 4000,
  notes: [
    { id: 'n-1', lane: 'S', timeMs: 1000 },
    { id: 'n-2', lane: 'D', timeMs: 2000 },
    { id: 'n-3', lane: 'J', timeMs: 3000 },
  ],
};

let session = createRhythmSession(handMadeMap, 'Łatwy');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'S');
assertEqual(session.perfectHits, 1, 'hit within 60 ms is perfect');
assertEqual(session.combo, 1, 'perfect hit increments combo');

session = stepRhythmSession(session, 1068);
session = hitRhythmLane(session, 'D');
assertEqual(session.goodHits, 1, 'hit within 130 ms is good');
assertEqual(session.combo, 2, 'good hit keeps combo');

session = stepRhythmSession(session, 1103);
assertEqual(session.misses, 1, 'note missed after 170 ms');
assertEqual(session.combo, 0, 'miss resets combo');

session = finishRhythmSession(session);
const summary = getRhythmSummary(session);
assertEqual(summary.accuracy, 55, 'accuracy uses perfect and good weights');
assertEqual(summary.grade, 'C', 'grade keeps existing thresholds');
assertEqual(summary.maxCombo, 2, 'summary reports max combo');
assertEqual(summary.totalNotes, 3, 'summary reports total notes');
