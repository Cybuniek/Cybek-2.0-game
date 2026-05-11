import {
  buildRhythmBeatmap,
  createRhythmSession,
  finishRhythmSession,
  estimateRhythmDurationMs,
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
  bpm: 122,
  mood: 'test',
  beatmapSeed: 12345,
  difficulties: ['Łatwy', 'Normalny', 'Cybart'],
  audio: {
    instrumental: '/dev/instrumental.wav',
    vocals: '/dev/vocals.wav',
    merged: '/dev/merged.wav',
  },
};

const firstMap = buildRhythmBeatmap(testTrack, 'Normalny');
const secondMap = buildRhythmBeatmap(testTrack, 'Normalny');

assertEqual(firstMap.durationMs, estimateRhythmDurationMs(testTrack), 'beatmap duration follows track/audio metadata fallback');
assert(firstMap.notes.length > 40, 'normal difficulty generates enough notes');
assertEqual(JSON.stringify(firstMap.notes.slice(0, 20)), JSON.stringify(secondMap.notes.slice(0, 20)), 'beatmap is deterministic');
assert(firstMap.notes.every((note) => RHYTHM_LANES.includes(note.lane)), 'all generated notes use playable lanes');
assertEqual(RHYTHM_LANES.join('/'), 'S/D/K/L', 'playable lanes use S/D/K/L');

const handMadeMap: RhythmBeatmap = {
  trackId: 'manual',
  bpm: 120,
  durationMs: 4000,
  notes: [
    { id: 'n-1', lane: 'S', timeMs: 1000 },
    { id: 'n-2', lane: 'D', timeMs: 2000 },
    { id: 'n-3', lane: 'K', timeMs: 3000 },
  ],
};

let session = createRhythmSession(handMadeMap, 'Łatwy');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'S');
assertEqual(session.perfectHits, 1, 'hit within 60 ms is perfect');
assertEqual(session.combo, 1, 'perfect hit increments combo');

session = stepRhythmSession(session, 1110);
session = hitRhythmLane(session, 'D');
assertEqual(session.goodHits, 1, 'hit within 130 ms is good');
assertEqual(session.combo, 2, 'good hit keeps combo');

session = stepRhythmSession(session, 1061);
assertEqual(session.misses, 1, 'note missed after 170 ms');
assertEqual(session.combo, 0, 'miss resets combo');

session = hitRhythmLane(session, 'L');
assertEqual(session.emptyPresses, 1, 'empty press is counted');

session = finishRhythmSession(session);
const summary = getRhythmSummary(session);
assertEqual(summary.accuracy, 55, 'accuracy uses perfect and good weights');
assertEqual(summary.grade, 'E', 'grade uses cumulative F-S quality tier thresholds');
assertEqual(summary.comboMultiplier, 1.33, 'summary rewards max combo with a multiplier');
assertEqual(summary.maxCombo, 2, 'summary reports max combo');
assertEqual(summary.totalNotes, 3, 'summary reports total notes');
