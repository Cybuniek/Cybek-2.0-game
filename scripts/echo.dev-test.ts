import { triggerEchoAfterPublish } from '../src/gameFlow.ts';
import { defaultState, getEchoState, incrementEchoCount } from '../src/storage.ts';
import type { DraftTrack, PublishedTrack } from '../src/types.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const emptyEcho = getEchoState(defaultState);
assertEqual(emptyEcho.echoCount, 0, 'fresh save starts with no Neura echoes');
assertEqual(emptyEcho.messages.length, 0, 'fresh save has no echo messages');
assertEqual(emptyEcho.activeCutsceneId, null, 'fresh save has no active EVENTS cutscene');

const echoedState = incrementEchoCount(defaultState, {
  source: 'decision',
  phrase: 'Opublikuj na czacie głównym',
  trackId: 'wystep-czekamy-czekamy',
  effect: 'glitch',
});
const echoed = getEchoState(echoedState);
assertEqual(echoed.echoCount, 1, 'incrementEchoCount increases echo count');
assertEqual(echoed.messages[0].phrase, 'Opublikuj na czacie głównym', 'incrementEchoCount stores the echoed player phrase');
assertEqual(echoed.messages[0].effect, 'glitch', 'incrementEchoCount stores the visual echo effect');

const draft: DraftTrack = {
  id: 'wystep-czekamy-czekamy',
  trackId: 'wystep-czekamy-czekamy',
  trackTitle: 'Występ Czekamy Czekamy',
  difficulty: 'Normalny',
  bestAccuracy: 83,
  bestGrade: 'A',
  qualityProgress: 138,
  status: 'inDrawer',
  updatedAt: '2026-05-26T12:00:00.000Z',
};
const published: PublishedTrack = {
  id: draft.trackId,
  trackId: draft.trackId,
  trackTitle: draft.trackTitle,
  difficulty: draft.difficulty,
  accuracy: draft.bestAccuracy,
  grade: draft.bestGrade,
  qualityProgress: draft.qualityProgress,
  quality: 'cudenko',
  publishedAt: '2026-05-26T12:02:00.000Z',
};

const afterPublish = triggerEchoAfterPublish(defaultState, published);
const publishEcho = getEchoState(afterPublish);
assertEqual(publishEcho.echoCount, 1, 'publishing a track triggers one echo');
assert(publishEcho.messages[0].phrase.includes('Występ Czekamy Czekamy'), 'publish echo repeats the published decision context');
assertEqual(publishEcho.activeCutsceneId, 'events.echo.after-publish', 'publish echo arms the EVENTS cutscene stage');
