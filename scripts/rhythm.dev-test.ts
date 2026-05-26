import {
  buildRhythmBeatmap,
  createRhythmSession,
  EMPTY_PRESS_GRACE_COUNT,
  finishRhythmSession,
  estimateRhythmDurationMs,
  getVisibleRhythmNotes,
  getRhythmNoteKind,
  getRhythmSummary,
  HIT_NOTE_FADE_MS,
  holdRhythmLane,
  hitRhythmLane,
  releaseRhythmLane,
  resolveRhythmBeatmap,
  RHYTHM_LANES,
  stepRhythmSession,
  syncRhythmSessionToElapsed,
} from '../src/rhythm.ts';
import manualBeatmaps from '../src/data/manualBeatmaps.json' with { type: 'json' };
import { tracks } from '../src/data/tracks.ts';
import {
  applyRecordedKeyDown,
  applyRecordedKeyUp,
  editorViewWindowMs,
  promoteActiveRecordedHolds,
  timeToYPercent,
} from '../src/editor/beatmapEditorLogic.ts';
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
const easyTravelMs = createRhythmSession({ trackId: 'travel-probe', bpm: 120, durationMs: 1, notes: [] }, 'Łatwy').travelMs;
const visualProbeTimeMs = Math.max(300, Math.round(easyTravelMs * 0.6));

assertEqual(firstMap.durationMs, estimateRhythmDurationMs(testTrack), 'beatmap duration follows track/audio metadata fallback');
assert(firstMap.notes.length > 40, 'normal difficulty generates enough notes');
assertEqual(JSON.stringify(firstMap.notes.slice(0, 20)), JSON.stringify(secondMap.notes.slice(0, 20)), 'beatmap is deterministic');
assert(firstMap.notes.every((note) => RHYTHM_LANES.includes(note.lane)), 'all generated notes use playable lanes');
assertEqual(RHYTHM_LANES.join('/'), 'S/D/K/L', 'playable lanes use S/D/K/L');
assertEqual(editorViewWindowMs(easyTravelMs, 1), easyTravelMs, 'editor zoom 1 uses gameplay travel window');
assertEqual(editorViewWindowMs(easyTravelMs, 1.75), Math.round(easyTravelMs / 1.75), 'editor zoom in narrows the visible time window instead of stretching CSS');
assertClose(
  timeToYPercent(visualProbeTimeMs, 0, editorViewWindowMs(easyTravelMs, 1)),
  getVisibleRhythmNotes(createRhythmSession({ trackId: 'visual', bpm: 122, durationMs: 3000, notes: [{ id: 'v-1', lane: 'S', timeMs: visualProbeTimeMs }] }, 'Łatwy'))[0].yPercent,
  0.02,
  'editor maps note distance like gameplay at zoom 1',
);

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

const emptySyncMap: RhythmBeatmap = {
  trackId: 'sync-empty',
  bpm: 120,
  durationMs: 3000,
  notes: [],
};

let syncedSession = createRhythmSession(emptySyncMap, 'Łatwy');
syncedSession = syncRhythmSessionToElapsed(syncedSession, 1600);
syncedSession = syncRhythmSessionToElapsed(syncedSession, 900);
assertEqual(syncedSession.elapsedMs, 1600, 'syncRhythmSessionToElapsed never rewinds the session clock');

const autoFinishMap: RhythmBeatmap = {
  trackId: 'auto-finish',
  bpm: 120,
  durationMs: 1200,
  notes: [
    { id: 'auto-finish-1', lane: 'S', timeMs: 500 },
    { id: 'auto-finish-2', lane: 'D', timeMs: 1100 },
  ],
};

let autoFinishSession = createRhythmSession(autoFinishMap, 'Łatwy');
autoFinishSession = syncRhythmSessionToElapsed(autoFinishSession, 9999);
assertEqual(autoFinishSession.elapsedMs, autoFinishMap.durationMs, 'syncRhythmSessionToElapsed clamps elapsed time to map duration');
assertEqual(autoFinishSession.isFinished, true, 'syncRhythmSessionToElapsed finishes the session after map duration');
assertEqual(autoFinishSession.misses, 2, 'syncRhythmSessionToElapsed scores unresolved notes as misses on finish');

const emptyPressGraceMap: RhythmBeatmap = {
  trackId: 'empty-press-grace',
  bpm: 120,
  durationMs: 3000,
  notes: [
    { id: 'empty-grace-1', lane: 'S', timeMs: 1000 },
    { id: 'empty-grace-2', lane: 'D', timeMs: 1200 },
  ],
};

let emptyPressGraceSession = createRhythmSession(emptyPressGraceMap, 'Łatwy');
emptyPressGraceSession = syncRhythmSessionToElapsed(emptyPressGraceSession, 1000);
emptyPressGraceSession = hitRhythmLane(emptyPressGraceSession, 'S');
emptyPressGraceSession = syncRhythmSessionToElapsed(emptyPressGraceSession, 1200);
emptyPressGraceSession = hitRhythmLane(emptyPressGraceSession, 'D');
assertEqual(emptyPressGraceSession.combo, 2, 'setup combo is built before empty press grace test');
for (let press = 1; press <= EMPTY_PRESS_GRACE_COUNT; press += 1) {
  emptyPressGraceSession = hitRhythmLane(emptyPressGraceSession, 'L');
  assertEqual(emptyPressGraceSession.combo, 2, `empty press ${press} stays inside combo grace`);
}
emptyPressGraceSession = hitRhythmLane(emptyPressGraceSession, 'L');
assertEqual(emptyPressGraceSession.combo, 0, 'empty presses reset combo after grace count is exceeded');
assertEqual(emptyPressGraceSession.emptyPresses, EMPTY_PRESS_GRACE_COUNT + 1, 'empty press streak records every empty input');

let session = createRhythmSession(handMadeMap, 'Łatwy');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'S');
assertEqual(session.perfectHits, 1, 'hit within 60 ms is perfect');
assertEqual(session.combo, 1, 'perfect hit increments combo');

session = stepRhythmSession(session, 1110);
session = hitRhythmLane(session, 'D');
assertEqual(session.goodHits, 1, 'hit within 130 ms is good');
assertEqual(session.combo, 2, 'good hit keeps combo');

session = stepRhythmSession(session, 1096);
assertEqual(session.misses, 1, 'note missed after extended late grace window');
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

const fadeTapMap: RhythmBeatmap = {
  trackId: 'fade-tap',
  bpm: 120,
  durationMs: 2200,
  notes: [{ id: 'fade-tap-1', lane: 'S', timeMs: 1000 }],
};


const emptyEditMap: RhythmBeatmap = {
  trackId: 'editor-record',
  bpm: 120,
  durationMs: 4000,
  notes: [],
};

let recordState = applyRecordedKeyDown(emptyEditMap, null, null, { lane: 'S', timeMs: 1000, seed: 1 });
assertEqual(recordState.beatmap.notes.length, 1, 'editor tap is created immediately on key down');
assertEqual(getRhythmNoteKind(recordState.beatmap.notes[0]), 'tap', 'single key down starts as visible tap');
recordState = applyRecordedKeyUp(recordState.beatmap, recordState.activePresses, recordState.holdDraft, 'S', 1090);
assertEqual(recordState.beatmap.notes.length, 1, 'quick key up keeps one tap instead of duplicating or delaying it');
assertEqual(getRhythmNoteKind(recordState.beatmap.notes[0]), 'tap', 'quick key up keeps the note as tap');

recordState = applyRecordedKeyDown(emptyEditMap, null, null, { lane: 'D', timeMs: 1200, seed: 2 });
recordState = { ...recordState, beatmap: promoteActiveRecordedHolds(recordState.beatmap, recordState.activePresses, 1500) };
assertEqual(getRhythmNoteKind(recordState.beatmap.notes[0]), 'hold', 'held key becomes a visible hold before key up');
assertEqual(recordState.beatmap.notes[0].durationMs, 300, 'live hold preview grows from key down to current song time');
recordState = applyRecordedKeyUp(recordState.beatmap, recordState.activePresses, recordState.holdDraft, 'D', 1700);
assertEqual(getRhythmNoteKind(recordState.beatmap.notes[0]), 'hold', 'held key upgrades the visible tap to hold on release');
assertEqual(recordState.beatmap.notes[0].durationMs, 500, 'hold duration is based on key down/up song time');

recordState = applyRecordedKeyDown(emptyEditMap, null, null, { lane: 'K', timeMs: 2000, seed: 3 });
recordState = applyRecordedKeyUp(recordState.beatmap, recordState.activePresses, recordState.holdDraft, 'K', 2050);
recordState = applyRecordedKeyDown(recordState.beatmap, recordState.activePresses, recordState.holdDraft, { lane: 'K', timeMs: 2140, seed: 4 });
assertEqual(recordState.beatmap.notes.length, 2, 'rapid tap tap creates two separate taps by default');
assert(recordState.beatmap.notes.every((note) => getRhythmNoteKind(note) === 'tap'), 'default rapid taps are not guessed into hold pulse');

recordState = applyRecordedKeyDown(emptyEditMap, null, null, { lane: 'L', timeMs: 2200, seed: 5, kind: 'hold' });
recordState = applyRecordedKeyUp(recordState.beatmap, recordState.activePresses, recordState.holdDraft, 'L', 2250);
recordState = applyRecordedKeyDown(recordState.beatmap, recordState.activePresses, recordState.holdDraft, { lane: 'L', timeMs: 2340, seed: 6, kind: 'hold' });
assertEqual(getRhythmNoteKind(recordState.beatmap.notes[0]), 'hold', 'explicit hold recording upgrades the visible note deterministically');
assertEqual(recordState.beatmap.notes[0].requiredPresses, 2, 'explicit hold press count is updated immediately');

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
session = stepRhythmSession(session, 300);
const holdAfterHit = getVisibleRhythmNotes(session)[0];
session = stepRhythmSession(session, 400);
const holdNearEnd = getVisibleRhythmNotes(session)[0];
const expectedHoldTravelDelta = ((holdNearEnd.timeToHitMs - holdAfterHit.timeToHitMs) / -session.travelMs) * 82;
assertClose(
  holdNearEnd.yPercent - holdAfterHit.yPercent,
  expectedHoldTravelDelta,
  0.02,
  'long note keeps linear speed after the head crosses the hit line',
);
assert(holdNearEnd.yPercent > 104, 'long note head can move below the lane instead of being clamped and visually braking');

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

session = createRhythmSession(fadeTapMap, 'Łatwy');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'S');
const fadeStart = getVisibleRhythmNotes(session).find((note) => note.id === 'fade-tap-1');
assert(Boolean(fadeStart), 'hit tap is still visible right after judgement');
session = stepRhythmSession(session, Math.floor(HIT_NOTE_FADE_MS / 2));
const fadeMid = getVisibleRhythmNotes(session).find((note) => note.id === 'fade-tap-1');
assert(Boolean(fadeMid), 'hit tap remains visible during fade window');
assert((fadeMid?.opacity ?? 0) < (fadeStart?.opacity ?? 1), 'hit tap opacity decreases during fade-out');
session = stepRhythmSession(session, HIT_NOTE_FADE_MS);
const fadeEnd = getVisibleRhythmNotes(session).find((note) => note.id === 'fade-tap-1');
assertEqual(Boolean(fadeEnd), false, 'hit tap disappears after fade window');


const chainedHoldMap: RhythmBeatmap = {
  trackId: 'manual',
  bpm: 120,
  durationMs: 3000,
  notes: [
    { id: 'hold-chain-1', lane: 'D', timeMs: 1000, kind: 'hold', durationMs: 800, requiredPresses: 4 },
  ],
};

session = createRhythmSession(chainedHoldMap, 'Normalny');
session = stepRhythmSession(session, 500);
const visibleChainedHold = getVisibleRhythmNotes(session)[0];
assert(visibleChainedHold.visualTopPercent < visibleChainedHold.yPercent, 'hold pulse segment is rendered above the gameplay head');
assertClose(
  visibleChainedHold.visualTopPercent + visibleChainedHold.durationPercent,
  visibleChainedHold.yPercent,
  0.02,
  'hold pulse gameplay head stays anchored at the collision point',
);

session = createRhythmSession(chainedHoldMap, 'Normalny');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'D');
assertEqual(session.notes[0].presses, 1, 'hold pulse counts the start tap immediately');
session = stepRhythmSession(session, 180);
session = hitRhythmLane(session, 'D');
assertEqual(session.notes[0].presses, 2, 'hold pulse counts live taps during the note');
session = stepRhythmSession(session, 180);
session = hitRhythmLane(session, 'D');
session = stepRhythmSession(session, 220);
session = hitRhythmLane(session, 'D');
session = stepRhythmSession(session, 220);
assertEqual(session.perfectHits, 1, 'hold pulse passes when no gap is too long');

session = createRhythmSession(chainedHoldMap, 'Normalny');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'D');
session = stepRhythmSession(session, 240);
assertEqual(session.misses, 1, 'hold pulse fails when the gap between taps is too long');

const lowPressHoldMap: RhythmBeatmap = {
  trackId: 'manual',
  bpm: 120,
  durationMs: 3000,
  notes: [
    { id: 'hold-low-press', lane: 'K', timeMs: 1000, kind: 'hold', durationMs: 500, requiredPresses: 4 },
  ],
};

session = createRhythmSession(lowPressHoldMap, 'Normalny');
session = stepRhythmSession(session, 1000);
session = hitRhythmLane(session, 'K');
session = stepRhythmSession(session, 180);
session = hitRhythmLane(session, 'K');
session = stepRhythmSession(session, 160);
session = hitRhythmLane(session, 'K');
session = stepRhythmSession(session, 160);
assertEqual(session.misses, 0, 'hold below requiredPresses does not miss without a long gap');
assertEqual(session.greatHits, 1, 'hold below requiredPresses downgrades quality without becoming a miss');

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
assertEqual(resolvedManual.bpm, 999, 'manual beatmap keeps its edited BPM');
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

const manualCatalog = manualBeatmaps as {
  schemaVersion?: number;
  tracks?: Record<string, Partial<Record<Difficulty, RhythmBeatmap>>>;
};
assertEqual(manualCatalog.schemaVersion, 2, 'real manual beatmap catalog uses schemaVersion 2');

for (const [trackId, mapsByDifficulty] of Object.entries(manualCatalog.tracks ?? {})) {
  const track = tracks.find((item) => item.id === trackId);
  assert(track, `manual beatmap references existing track: ${trackId}`);

  for (const [difficulty, manualMap] of Object.entries(mapsByDifficulty) as Array<[Difficulty, RhythmBeatmap]>) {
    assert(track.difficulties.includes(difficulty), `${trackId}/${difficulty} references an available difficulty`);
    const audioDurationMs = track.durationMs ?? estimateRhythmDurationMs(track);
    const resolved = resolveRhythmBeatmap(track, difficulty, audioDurationMs, manualCatalog);
    assertEqual(resolved.source, 'manual', `${trackId}/${difficulty} resolves to the manual map`);
    assertEqual(resolved.trackId, track.id, `${trackId}/${difficulty} keeps the track id`);
    assert(resolved.notes.length === manualMap.notes.length, `${trackId}/${difficulty} keeps all manual notes`);
    assert((resolved.sourceStartMs ?? 0) >= 0, `${trackId}/${difficulty} starts inside the audio file`);
    assert((resolved.sourceEndMs ?? resolved.durationMs) <= audioDurationMs + 620, `${trackId}/${difficulty} ends inside the audio file tolerance`);
    assert(resolved.durationMs > 0, `${trackId}/${difficulty} has positive duration`);
    assert(resolved.notes.every((note) => note.timeMs >= 0 && note.timeMs <= resolved.durationMs), `${trackId}/${difficulty} has notes inside the playable range`);
  }
}
