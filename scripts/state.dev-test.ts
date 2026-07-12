import { defaultState, getPublishedQuality, migrateSavedState } from '../src/storage.ts';
import type { GameState } from '../src/types.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const invalidState = migrateSavedState(null);
assertEqual(invalidState.saveVersion, defaultState.saveVersion, 'invalid saved payload falls back to default state');
assertEqual(invalidState.drafts.length, 0, 'invalid saved payload does not create drafts');

const legacyState = migrateSavedState({
  stats: {
    performance: 12,
    cybart: 18,
    chatPressure: 24,
  },
  drawer: [
    {
      id: 'legacy-draft-id',
      trackId: 'wystep-czekamy-czekamy',
      trackTitle: 'Występ Czekamy Czekamy',
      difficulty: 'Łatwy',
      accuracy: 73,
      grade: 'A',
      createdAt: '2026-05-01T10:00:00.000Z',
      status: 'drawer',
    },
  ],
  publishedTracks: [
    {
      id: 'legacy-published-id',
      trackId: 'wenezuelski-wystep-mashup',
      trackTitle: 'Wenezuelski Występ (Mashup)',
      difficulty: 'Normalny',
      accuracy: 66,
      grade: 'nieznany',
      qualityProgress: 66,
      publishedAt: '2026-05-01T11:00:00.000Z',
    },
  ],
} as unknown) as GameState;

assertEqual(legacyState.saveVersion, 1, 'migration keeps current save version');
assertEqual(legacyState.drafts.length, 1, 'legacy drawer item migrates into drafts');
assertEqual(legacyState.drafts[0].status, 'inDrawer', 'legacy drawer status becomes inDrawer');
assertEqual(legacyState.drafts[0].bestGrade, 'A', 'legacy draft grade is preserved when valid');
assertEqual(legacyState.drafts[0].qualityProgress, 73, 'legacy draft gets estimated quality progress');
assert(legacyState.createdTrackIds.includes('wystep-czekamy-czekamy'), 'createdTrackIds includes migrated draft track');
assert(legacyState.createdTrackIds.includes('wenezuelski-wystep-mashup'), 'createdTrackIds includes migrated published track');
assert(legacyState.publishedTrackIds.includes('wenezuelski-wystep-mashup'), 'publishedTrackIds is rebuilt from published tracks');
assertEqual(legacyState.titleRevealByTrackId['wenezuelski-wystep-mashup'], 1, 'published track titles are fully revealed');
assertEqual(legacyState.publishedTracks[0].grade, 'C', 'invalid published tier falls back to C');
assertEqual(legacyState.publishedTracks[0].quality, getPublishedQuality('C'), 'published quality follows normalized tier');
assertEqual(legacyState.echo.echoCount, 0, 'legacy state receives default echo count');
assertEqual(legacyState.echo.activeCutsceneId, null, 'legacy state receives no active cutscene');
assertEqual(legacyState.resonance.level, 'silent', 'legacy state receives default resonance level');
assertEqual(legacyState.resonance.bondWithNeura, 'distant', 'legacy state receives default Neura bond');
assertEqual(legacyState.ending.route, 'quietArchive', 'legacy state receives default ending route');

const explicitPublishedIds = migrateSavedState({
  publishedTrackIds: ['vlog-wildforest-rave-anho27'],
  publishedTracks: [],
} as unknown);

assertEqual(
  explicitPublishedIds.titleRevealByTrackId['vlog-wildforest-rave-anho27'],
  1,
  'explicit published ids fully reveal titles even without published track records',
);

const restoredEchoState = migrateSavedState({
  echo: {
    echoCount: 3,
    messages: [{ id: 'echo-1', source: 'decision', phrase: 'Publikuj dalej', effect: 'glitch', count: 3, createdAt: '2026-05-26T10:00:00.000Z' }],
    lastPhrase: 'Publikuj dalej',
    lastEffect: 'glitch',
    activeCutsceneId: 'events.echo.after-publish',
  },
  resonance: {
    level: 'high',
    score: 91,
    lastAccuracy: 88,
    bondWithNeura: 'attuned',
    effects: { bloom: 0.35, glitchIntensity: 0.28, uiHighlight: 0.42, timerScale: 0.84, comboBonus: 0.12 },
  },
  ending: {
    route: 'neuraBond',
    label: 'Więź z Neurą',
    influence: { performance: 40, chatPressure: 12, cybart: 30, echo: 70, resonance: 91, bond: 85 },
    updatedAt: '2026-05-26T10:02:00.000Z',
  },
} as unknown);

assertEqual(restoredEchoState.echo.echoCount, 3, 'echo migration preserves echo count');
assertEqual(restoredEchoState.echo.lastPhrase, 'Publikuj dalej', 'echo migration preserves last phrase');
assertEqual(restoredEchoState.resonance.level, 'high', 'resonance migration preserves level');
assertEqual(restoredEchoState.resonance.effects.comboBonus, 0.12, 'resonance migration preserves combo bonus');
assertEqual(restoredEchoState.ending.route, 'neuraBond', 'ending migration preserves route');
