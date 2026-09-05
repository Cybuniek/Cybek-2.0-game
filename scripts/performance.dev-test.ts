import assert from 'node:assert/strict';
import { buildRhythmBeatmap, createRhythmSession, getRhythmPhrases, getRhythmLiveAccuracy, getRhythmNoteEndMs, hitRhythmLane, readRhythmClock, syncRhythmSessionToElapsed } from '../src/rhythm.ts';
import { applyPerformanceDecision, deliverPerformanceReaction, performanceDecisionPreview } from '../src/performance.ts';
import { advanceDaySummary, finishDay } from '../src/dayCycle.ts';
import { createDraftFromResult, createPublishedTrack, createResult, defaultState, improveDraftWithResult, migrateSavedState } from '../src/storage.ts';
import { tracks } from '../src/data/tracks.ts';
import type { PerformanceTrace, RhythmBeatmap } from '../src/types';

const map: RhythmBeatmap = { trackId: 'phrases', bpm: 120, startOffsetMs: 1000, durationMs: 26000, notes: [
  { id: 'bad', lane: 'S', timeMs: 1000 },
  { id: 'return', lane: 'D', timeMs: 9000 },
  { id: 'cross', lane: 'K', timeMs: 16500, kind: 'hold', durationMs: 1200 },
  { id: 'boundary', lane: 'L', timeMs: 17000 },
] };
let session = createRhythmSession(map, 'Normalny');
assert.equal(session.travelMs, 1400);
assert.equal(getRhythmLiveAccuracy(session), null);
assert.equal(getRhythmLiveAccuracy({ ...session, perfectHits: 9, misses: 1 }), 90);
assert.equal(createRhythmSession(map, 'Cybart').travelMs, 1400);
assert.equal(createRhythmSession(map, 'Łatwy', undefined, 'calm').travelMs, 1750);
session = syncRhythmSessionToElapsed(session, 9000);
session = hitRhythmLane(session, 'D');
session = syncRhythmSessionToElapsed(session, 16500);
session = hitRhythmLane(session, 'K');
session = syncRhythmSessionToElapsed(session, 17000);
assert.equal(getRhythmPhrases(session)[1].complete, false, 'Fraza czeka na przytrzymanie przechodzące przez granicę');
session = hitRhythmLane(session, 'L');
session = syncRhythmSessionToElapsed(session, 17700);
const phrases = getRhythmPhrases(session);
assert.equal(phrases[0].accuracy, 0);
assert.equal(phrases[1].accuracy, 100);
assert.equal(phrases[1].totalNotes, 2);
assert.equal(phrases[1].comeback, true);
assert.equal(phrases[2].index, 2);
assert.equal(getRhythmPhrases(createRhythmSession({ ...map, notes: [] }, 'Normalny')).length, 0);
assert.equal(getRhythmPhrases(createRhythmSession({ ...map, notes: [map.notes[0], { ...map.notes[1], timeMs: 25000 }] }, 'Normalny')).length, 2, 'Puste frazy nie otrzymują oceny');

// Zegar odtwarzacza koryguje wejście między klatkami i uwzględnia początek wycinka.
const inputMap = { ...map, inputOffsetMs: 35, sourceStartMs: 2000, notes: [map.notes[0]] };
let input = createRhythmSession(inputMap, 'Normalny');
input = syncRhythmSessionToElapsed(input, 900);
input = syncRhythmSessionToElapsed(input, readRhythmClock(2.965, 2000, 900));
assert.equal(hitRhythmLane(input, 'S').perfectHits, 1);
assert.equal(readRhythmClock(null, 2000, 965), 965);
assert.equal(readRhythmClock(1, 2000, 0), 0);

for (const difficulty of ['Łatwy', 'Normalny', 'Cybart'] as const) {
  for (let seed = 0; seed < 12; seed += 1) {
    const track = { ...tracks[0], beatmapSeed: seed };
    const generated = buildRhythmBeatmap(track, difficulty);
    assert.deepEqual(generated, buildRhythmBeatmap(track, difficulty));
    for (const lane of ['S', 'D', 'K', 'L']) {
      const notes = generated.notes.filter((note) => note.lane === lane);
      for (let i = 1; i < notes.length; i += 1) assert.ok(notes[i].timeMs >= getRhythmNoteEndMs(notes[i - 1]) + 260);
    }
    assert.ok(generated.notes.every((note) => getRhythmNoteEndMs(note) <= generated.durationMs));
  }
}

const trace: PerformanceTrace = { intent: 'live', phrases, accuracy: 75 };
const base = structuredClone(defaultState);
base.dayCycle.phase = 'result';
const without = applyPerformanceDecision(base, 'saveDraft', 'F', true, 'song', trace);
assert.deepEqual(without.settledIntentTrackIds, []);
const sent = applyPerformanceDecision(base, 'sendToPawel', 'F', true, 'song', trace);
const expectedPreview = performanceDecisionPreview(base, 'sendToPawel', 'F', true, 'song', 'live');
assert.deepEqual(sent.stats, expectedPreview.resultingStats);
assert.equal(sent.stats.performance, base.stats.performance + 3);
assert.equal(sent.stats.chatPressure, base.stats.chatPressure + 8);
assert.deepEqual(sent.settledIntentTrackIds, ['song']);
assert.match(sent.pendingPerformanceReaction!.text, /wróciłeś/);
const close = applyPerformanceDecision(base, 'sendToPawel', 'F', true, 'close-song', { ...trace, intent: 'close' });
assert.equal(close.stats.chatPressure, base.stats.chatPressure + 4);
assert.equal(deliverPerformanceReaction(sent), sent, 'Reakcja czeka na kolejny dzień');
const nextDay = deliverPerformanceReaction(advanceDaySummary(finishDay(sent)));
assert.equal(nextDay.pendingPerformanceReaction, null);
assert.match(nextDay.pawelMessages.at(-1)!.text, /wróciłeś/);
assert.equal(deliverPerformanceReaction(nextDay), nextDay, 'Odebranej reakcji nie dostarcza się ponownie');
const published = applyPerformanceDecision(nextDay, 'publish', 'F', false, 'song', trace);
assert.equal(published.stats.performance - nextDay.stats.performance, 3, 'Publikacja bez drugiej premii intencji');
assert.equal(published.pendingPerformanceReaction!.channel, 'group', 'Nowy odbiorca odpowie bez drugiej premii');
assert.deepEqual(published.settledIntentTrackIds, ['song']);
const lastDaySent = applyPerformanceDecision({ ...base, dayCycle: { ...base.dayCycle, currentDay: 14 } }, 'sendToPawel', 'F', true, 'last-song', trace);
assert.equal(lastDaySent.pendingPerformanceReaction!.day, 15);
const final = deliverPerformanceReaction(advanceDaySummary(finishDay(lastDaySent)));
assert.equal(final.dayCycle.phase, 'complete');
assert.equal(final.pendingPerformanceReaction, null);
assert.match(final.pawelMessages.at(-1)!.text, /wróciłeś/);
const roundtrip = migrateSavedState(JSON.parse(JSON.stringify(sent)));
assert.deepEqual(roundtrip.settledIntentTrackIds, ['song']);
assert.deepEqual(roundtrip.pendingPerformanceReaction, sent.pendingPerformanceReaction);
const old = migrateSavedState({ saveVersion: 2 });
assert.deepEqual(old.settledIntentTrackIds, []);
assert.equal(old.pendingPerformanceReaction, null);

const result = createResult(tracks[0].id, tracks[0].title, 'Łatwy', {
  intent: 'live', phrases, accuracy: 90, grade: 'D', qualityProgress: 95, comboMultiplier: 1,
  perfectHits: 9, greatHits: 0, goodHits: 0, misses: 1, emptyPresses: 0, maxCombo: 9, totalNotes: 10,
});
const draft = createDraftFromResult(result, 'inDrawer');
const improved = improveDraftWithResult(draft, { ...result, intent: 'close', accuracy: 40, phrases: [] });
assert.equal(improved.bestAccuracy, 90);
assert.equal(improved.lastPerformance!.accuracy, 40);
assert.equal(improved.lastPerformance!.intent, 'close');
assert.deepEqual(createPublishedTrack(improved).lastPerformance, improved.lastPerformance);
console.log('performance.dev-test: OK — frazy, zegar, generowanie, intencje i ciągłość');
