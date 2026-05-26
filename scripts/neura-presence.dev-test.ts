import { createNeuraPresenceState, appendNeuraPresenceEvent, calculatePresenceScore } from '../src/neura/NeuraPresenceManager.ts';
import { defaultState } from '../src/storage.ts';
import type { GameState, NeuraPresenceEventLogEntry } from '../src/types.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const bootPresence = createNeuraPresenceState(defaultState);
assertEqual(bootPresence.powerLevel, 0, 'fresh save starts as masked desktop companion');
assertEqual(bootPresence.narrativeTag, 'maskotka', 'level 0 uses the mascot narrative tag');
assert(bootPresence.glitchIntensity < 0.1, 'fresh save keeps background glitches rare');

const busyState: GameState = {
  ...defaultState,
  stats: {
    performance: 48,
    cybart: 72,
    chatPressure: 84,
  },
  titleRevealByTrackId: {
    'wystep-czekamy-czekamy': 1,
    'wenezuelski-wystep-mashup': 1,
  },
  drafts: [
    {
      id: 'draft-1',
      trackId: 'vlog-wildforest-rave-anho27',
      trackTitle: 'Vlog Wildforest Rave - ANHO27',
      difficulty: 'Normalny',
      bestAccuracy: 76,
      bestGrade: 'B',
      qualityProgress: 96,
      status: 'sentToPawel',
      updatedAt: '2026-05-21T18:00:00.000Z',
    },
  ],
  publishedTracks: [
    {
      id: 'published-1',
      trackId: 'wystep-czekamy-czekamy',
      trackTitle: 'Występ Czekamy Czekamy',
      difficulty: 'Normalny',
      accuracy: 81,
      grade: 'A',
      qualityProgress: 132,
      quality: 'cudenko',
      publishedAt: '2026-05-21T18:05:00.000Z',
    },
    {
      id: 'published-2',
      trackId: 'wenezuelski-wystep-mashup',
      trackTitle: 'Wenezuelski Występ (Mashup)',
      difficulty: 'Cybart',
      accuracy: 72,
      grade: 'B',
      qualityProgress: 118,
      quality: 'lepsza wersja',
      publishedAt: '2026-05-21T18:10:00.000Z',
    },
  ],
  publishedTrackIds: ['wystep-czekamy-czekamy', 'wenezuelski-wystep-mashup'],
  createdTrackIds: ['wystep-czekamy-czekamy', 'wenezuelski-wystep-mashup', 'vlog-wildforest-rave-anho27'],
};

const busyPresence = createNeuraPresenceState(busyState, { lastEventId: 'published' });
assert(busyPresence.powerLevel >= 3, 'published high-pressure state escalates Neura into operator territory');
assert(busyPresence.glitchIntensity > bootPresence.glitchIntensity, 'glitch intensity rises with operational power');
assert(busyPresence.uiAutonomy > bootPresence.uiAutonomy, 'UI autonomy rises with operational power');

const lowFxPresence = createNeuraPresenceState(busyState, { lastEventId: 'published', lowFxMode: true });
assertEqual(lowFxPresence.powerLevel, busyPresence.powerLevel, 'low FX mode does not change narrative power');
assert(lowFxPresence.avatarInstability < busyPresence.avatarInstability, 'low FX mode reduces avatar motion');
assert(lowFxPresence.uiAutonomy < busyPresence.uiAutonomy, 'low FX mode reduces environmental UI events');

const debugPresence = createNeuraPresenceState(defaultState, { debugOverride: 4, lastEventId: 'debugSetPower' });
assertEqual(debugPresence.powerLevel, 4, 'debug override can force final-scene power');
assertEqual(debugPresence.debugOverride, 4, 'debug override is exposed in presence state');

let log: NeuraPresenceEventLogEntry[] = [];
for (const id of ['boot', 'draftSaved', 'sentToPawel', 'published', 'manualReaction', 'idlePulse', 'rhythmStarted', 'rhythmFinished', 'debugSetPower'] as const) {
  log = appendNeuraPresenceEvent(log, id, `2026-05-21T18:00:0${log.length}.000Z`);
}
assertEqual(log.length, 8, 'event log keeps the latest 8 events');
assertEqual(log[0].id, 'draftSaved', 'event log drops the oldest event first');

assert(calculatePresenceScore(busyState, 'published') > calculatePresenceScore(defaultState), 'presence score follows game progress, not wall clock time');

const echoPresence = createNeuraPresenceState({
  ...defaultState,
  echo: {
    echoCount: 5,
    messages: [],
    lastPhrase: 'Opublikuj na czacie głównym',
    lastEffect: 'glitch',
    activeCutsceneId: 'events.echo.after-publish',
  },
  resonance: {
    level: 'high',
    score: 104,
    lastAccuracy: 91,
    bondWithNeura: 'attuned',
    effects: {
      bloom: 0.55,
      glitchIntensity: 0.68,
      uiHighlight: 0.52,
      timerScale: 0.7,
      comboBonus: 0.12,
    },
  },
}, { lastEventId: 'published' });
assert(echoPresence.uiAutonomy > bootPresence.uiAutonomy, 'echo and resonance raise environmental UI autonomy');
assert(echoPresence.glitchIntensity > bootPresence.glitchIntensity, 'echo and resonance raise Neura glitch intensity');
