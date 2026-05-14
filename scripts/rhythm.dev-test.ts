import {
  buildRhythmBeatmap,
  createRhythmSession,
  finishRhythmSession,
  estimateRhythmDurationMs,
  getVisibleRhythmNotes,
  getRhythmNoteKind,
  getRhythmSummary,
  holdRhythmLane,
  hitRhythmLane,
  releaseRhythmLane,
  resolveRhythmBeatmap,
  RHYTHM_LANES,
  stepRhythmSession,
} from '../src/rhythm.ts';
import type { Difficulty, RhythmBeatmap, Track } from '../src/types.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertClose(actual: number, expected: number, tolerance: number, message: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
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

const holdMap: RhythmBeatmap = {
  trackId: 'manual',
  bpm: 120,
  durationMs: 3000,
  notes: [
    { id: 'hold-1', lane: 'S', timeMs: 1000, kind: 'hold', durationMs: 900 },
  ],
};

session = createRhythmSession(holdMap, 'Łatwy');
session = stepRhythmSession(session, 500);
const visibleHold = getVisibleRhythmNotes(session)[0];
assert(visibleHold.visualTopPercent < visibleHold.yPercent, 'long note tail is rendered above the gameplay head');
assertClose(
  visibleHold.visualTopPercent + visibleHold.durationPercent,
  visibleHold.yPercent,
  0.02,
  'long note gameplay head stays anchored at the collision point',
);

session = createRhythmSession(holdMap, 'Łatwy');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'S');
assertEqual(session.perfectHits, 0, 'hold note is scored when held to completion, not on start');
session = stepRhythmSession(session, 900);
assertEqual(session.perfectHits, 1, 'hold note held to the end keeps perfect start judgement');

session = createRhythmSession(holdMap, 'Łatwy');
session = stepRhythmSession(session, 830);
session = hitRhythmLane(session, 'S');
assertEqual(session.notes[0].startedAtMs, undefined, 'hold pressed too early is not armed immediately');
session = stepRhythmSession(session, 50);
session = holdRhythmLane(session, 'S');
assert(session.notes[0].startedAtMs !== undefined, 'held key arms hold when the note enters the hit window');
session = stepRhythmSession(session, 1020);
assertEqual(session.goodHits, 1, 'early-held hold can still complete after being armed in the valid window');

session = createRhythmSession(holdMap, 'Łatwy');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'S');
session = stepRhythmSession(session, 200);
session = releaseRhythmLane(session, 'S');
assertEqual(session.misses, 1, 'very early hold release is a miss');

const smashMap: RhythmBeatmap = {
  trackId: 'manual',
  bpm: 120,
  durationMs: 3000,
  notes: [
    { id: 'smash-1', lane: 'D', timeMs: 1000, kind: 'smash', durationMs: 800 },
  ],
};

session = createRhythmSession(smashMap, 'Normalny');
session = stepRhythmSession(session, 500);
const visibleSmash = getVisibleRhythmNotes(session)[0];
assert(visibleSmash.visualTopPercent < visibleSmash.yPercent, 'smash rapid segment is rendered above the gameplay head');
assertClose(
  visibleSmash.visualTopPercent + visibleSmash.durationPercent,
  visibleSmash.yPercent,
  0.02,
  'smash gameplay head stays anchored at the collision point',
);

session = createRhythmSession(smashMap, 'Normalny');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'D');
assertEqual(session.notes[0].presses, 1, 'smash note counts the start tap immediately');
session = stepRhythmSession(session, 180);
session = hitRhythmLane(session, 'D');
assertEqual(session.notes[0].presses, 2, 'smash note counts live taps during the note');
session = stepRhythmSession(session, 180);
session = hitRhythmLane(session, 'D');
session = stepRhythmSession(session, 220);
session = hitRhythmLane(session, 'D');
session = stepRhythmSession(session, 220);
assertEqual(session.perfectHits, 1, 'smash note passes regardless of tap count when no gap is too long');

session = createRhythmSession(smashMap, 'Normalny');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'D');
session = stepRhythmSession(session, 240);
assertEqual(session.misses, 1, 'smash note fails when the gap between taps is too long');

const lowPressSmashMap: RhythmBeatmap = {
  trackId: 'manual',
  bpm: 120,
  durationMs: 3000,
  notes: [
    { id: 'smash-low-press', lane: 'K', timeMs: 1000, kind: 'smash', durationMs: 500, requiredPresses: 4 },
  ],
};

session = createRhythmSession(lowPressSmashMap, 'Normalny');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'K');
session = stepRhythmSession(session, 180);
session = hitRhythmLane(session, 'K');
session = stepRhythmSession(session, 160);
session = hitRhythmLane(session, 'K');
session = stepRhythmSession(session, 160);
assertEqual(session.misses, 0, 'smash below requiredPresses does not miss without a long gap');
assertEqual(session.greatHits, 1, 'smash below requiredPresses downgrades quality without becoming a miss');

const validManualCatalog = {
  schemaVersion: 1,
  tracks: {
    'dev-track': {
      Normalny: {
        trackId: 'dev-track',
        bpm: 999,
        durationMs: 2500,
        notes: [
          { id: 'manual-note', lane: 'L', timeMs: 1200, kind: 'hold', durationMs: 600 },
        ],
      },
    } satisfies Partial<Record<Difficulty, RhythmBeatmap>>,
  },
};

const resolvedManual = resolveRhythmBeatmap(testTrack, 'Normalny', 4000, validManualCatalog);
assertEqual(resolvedManual.notes.length, 1, 'valid manual beatmap is preferred over generated fallback');
assertEqual(resolvedManual.bpm, testTrack.bpm, 'manual beatmap is normalized to current track bpm');
assertEqual(resolvedManual.durationMs, 4000, 'legacy manual duration does not shorten audio-backed runtime');
assertEqual(resolvedManual.sourceEndMs, 4000, 'legacy manual map is migrated to the full audio range');
assertEqual(getRhythmNoteKind(resolvedManual.notes[0]), 'hold', 'manual beatmap keeps long note kind');

const rangedManualCatalog = {
  schemaVersion: 2,
  tracks: {
    'dev-track': {
      Normalny: {
        trackId: 'dev-track',
        bpm: 122,
        sourceStartMs: 47213,
        sourceEndMs: 97578,
        durationMs: 50365,
        notes: [
          { id: 'range-note', lane: 'S', timeMs: 1000 },
        ],
      },
    } satisfies Partial<Record<Difficulty, RhythmBeatmap>>,
  },
};

const resolvedRange = resolveRhythmBeatmap(testTrack, 'Normalny', 98535, rangedManualCatalog);
assertEqual(resolvedRange.durationMs, 50365, 'v2 manual range duration is sourceEndMs - sourceStartMs');
assertEqual(resolvedRange.sourceStartMs, 47213, 'v2 manual range keeps the selected audio start');
assertEqual(resolvedRange.sourceEndMs, 97578, 'v2 manual range keeps the selected audio end');

const brokenRangeCatalog = {
  schemaVersion: 2,
  tracks: {
    'dev-track': {
      Normalny: {
        trackId: 'dev-track',
        bpm: 122,
        sourceStartMs: 6000,
        sourceEndMs: 5000,
        durationMs: 1000,
        notes: [
          { id: 'broken-range-note', lane: 'S', timeMs: 250 },
        ],
      },
    } satisfies Partial<Record<Difficulty, RhythmBeatmap>>,
  },
};

const brokenRangeFallback = resolveRhythmBeatmap(testTrack, 'Normalny', estimateRhythmDurationMs(testTrack), brokenRangeCatalog);
assert(brokenRangeFallback.notes.length > 40, 'invalid manual range falls back to generated map');

const invalidManualCatalog = {
  schemaVersion: 1,
  tracks: {
    'dev-track': {
      Normalny: {
        trackId: 'dev-track',
        bpm: 120,
        durationMs: 2500,
        notes: [
          { id: 'broken-note', lane: 'X', timeMs: 1200 },
        ],
      } as unknown as RhythmBeatmap,
    } satisfies Partial<Record<Difficulty, RhythmBeatmap>>,
  },
};

const resolvedFallback = resolveRhythmBeatmap(testTrack, 'Normalny', estimateRhythmDurationMs(testTrack), invalidManualCatalog);
assert(resolvedFallback.notes.length > 40, 'invalid manual beatmap falls back to generated map');
