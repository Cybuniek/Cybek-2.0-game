import { calculateEndingRoute, getEndingProfile, updateEndingState } from '../src/ending.ts';
import { defaultState } from '../src/storage.ts';
import type { GameState } from '../src/types.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const quietRoute = calculateEndingRoute(defaultState);
assertEqual(quietRoute, 'quietArchive', 'fresh prototype state points to quiet archive ending');

const bondedState: GameState = {
  ...defaultState,
  stats: { performance: 72, cybart: 66, chatPressure: 42 },
  echo: {
    echoCount: 7,
    messages: [],
    lastPhrase: 'Opublikuj na czacie głównym',
    lastEffect: 'cutscene',
    activeCutsceneId: 'events.echo.after-publish',
  },
  resonance: {
    level: 'overload',
    score: 128,
    lastAccuracy: 96,
    bondWithNeura: 'merged',
    effects: {
      bloom: 0.72,
      glitchIntensity: 0.86,
      uiHighlight: 0.7,
      timerScale: 0.55,
      comboBonus: 0.18,
    },
  },
};
assertEqual(calculateEndingRoute(bondedState), 'neuraBond', 'strong echo and merged resonance unlock Neura bond ending');

const spiralState: GameState = {
  ...bondedState,
  stats: { performance: 46, cybart: 88, chatPressure: 94 },
  resonance: { ...bondedState.resonance, bondWithNeura: 'distant', level: 'high' },
};
assertEqual(calculateEndingRoute(spiralState), 'publicSpiral', 'high chat pressure without bond routes to public spiral ending');

const offlineState: GameState = {
  ...defaultState,
  stats: { performance: 16, cybart: 18, chatPressure: 21 },
};
assertEqual(calculateEndingRoute(offlineState), 'offlineBreak', 'low pressure and low performance route to offline break ending');

const updated = updateEndingState(bondedState);
assertEqual(updated.ending.route, 'neuraBond', 'updateEndingState stores calculated ending route');
assert(updated.ending.influence.echo > updated.ending.influence.chatPressure, 'Neura bond ending is primarily echo-driven');

const profile = getEndingProfile('publicSpiral');
assertEqual(profile.route, 'publicSpiral', 'ending profile exposes selected route');
assert(profile.label.length > 0, 'ending profile has a UI label');
