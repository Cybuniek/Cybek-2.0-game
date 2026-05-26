import { calculateEndingRoute } from '../src/ending.ts';
import {
  applyResonanceEffects,
  calculateResonance,
  getResonanceEffects,
  updateResonanceState,
} from '../src/resonance.ts';
import { defaultState, incrementEchoCount } from '../src/storage.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

assertEqual(calculateResonance(34, 0), 'silent', 'low accuracy without echoes stays silent');
assertEqual(calculateResonance(72, 1), 'medium', 'solid accuracy with one echo reaches medium resonance');
assertEqual(calculateResonance(91, 4), 'high', 'high accuracy with several echoes reaches high resonance');
assertEqual(calculateResonance(98, 8), 'overload', 'excellent accuracy with many echoes overloads resonance');

const echoedState = Array.from({ length: 5 }).reduce(
  (state, _, index) => incrementEchoCount(state, {
    source: 'decision',
    phrase: `echo-${index}`,
    trackId: 'wystep-czekamy-czekamy',
    effect: 'glitch',
  }),
  defaultState,
);
const resonantState = updateResonanceState(echoedState, 91);
assertEqual(resonantState.resonance.level, 'high', 'updateResonanceState stores the calculated resonance level');
assert(resonantState.resonance.score > echoedState.resonance.score, 'updateResonanceState raises resonance score from accuracy and echo count');
assertEqual(resonantState.resonance.bondWithNeura, 'attuned', 'high resonance creates an attuned bond with Neura');

const effects = getResonanceEffects(resonantState.resonance);
assert(effects.bloom > 0, 'high resonance enables bloom');
assert(effects.glitchIntensity > defaultState.resonance.effects.glitchIntensity, 'high resonance increases glitch intensity');

const applied = applyResonanceEffects(resonantState);
assert(applied.stats.cybart >= resonantState.stats.cybart, 'resonance effects never reduce Cybart pressure');
assert(['neuraBond', 'publicSpiral', 'quietArchive', 'offlineBreak'].includes(calculateEndingRoute(applied)), 'resonance-fed state maps to a known ending route');
