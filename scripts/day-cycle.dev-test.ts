import {
  applyCommunicationAction,
  applyStatsDelta,
  advanceDaySummary,
  canPublish,
  canStartWork,
  defaultDayCycle,
  finishDay,
  getActionPreview,
  getDecisionDelta,
  getDraftAge,
  getRhythmStatModifier,
  getStatBand,
} from '../src/dayCycle.ts';
import { defaultState } from '../src/storage.ts';
import type { GameState, Stats } from '../src/types.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function closeDay(state: GameState, publishedTrackId?: string, publishedQuality: GameState['publishedTracks'][number]['grade'] = 'C') {
  const dayAction = publishedTrackId
    ? getDecisionDelta('publish', publishedQuality, false)
    : { performance: 0, cybart: 0, chatPressure: 0 };
  const withAction = {
    ...state,
    stats: applyStatsDelta(state.stats, dayAction),
  };
  return advanceDaySummary(finishDay(withAction, { publishedTrackId, publishedQuality }));
}

assertEqual(defaultState.stats.performance, 8, 'default Występ stays at 8');
assertEqual(defaultState.stats.cybart, 12, 'default Cybart stays at 12');
assertEqual(defaultState.stats.chatPressure, 18, 'default pressure stays at 18');
assertEqual(defaultState.dayCycle.currentDay, 1, 'new saves start on day one');
assertEqual(defaultDayCycle.totalDays, 14, 'the cycle has fourteen days');
assertEqual(getStatBand(19), 'low', '19 is low');
assertEqual(getStatBand(40), 'stable', '40 is stable');
assertEqual(getStatBand(90), 'critical', '90 is critical');

const statusState = applyCommunicationAction(defaultState, 'status');
assertEqual(statusState.dayCycle.phase, 'work', 'a communication opens the work phase');
assertEqual(statusState.stats.chatPressure, 12, 'status lowers pressure by six');

const preview = getActionPreview(statusState, 'publish', 'A', true);
assertEqual(preview.delta.performance, 12, 'high-quality publication gives twelve Występ before daily effects');
assertEqual(preview.delta.cybart, 12, 'a publication includes work and publication Cybart gains');

const summaryState = finishDay(statusState);
assertEqual(summaryState.dayCycle.currentDay, 1, 'a closed day keeps its number during the summary');
assertEqual(summaryState.dayCycle.phase, 'daySummary', 'closing a day enters the summary phase');

const nextDay = closeDay(statusState);
assertEqual(nextDay.dayCycle.currentDay, 2, 'closing a normal day advances the calendar');
assertEqual(nextDay.dayCycle.phase, 'communication', 'the next day starts with communication');

let quietState = defaultState;
for (let index = 0; index < 10; index += 1) {
  quietState = closeDay(applyCommunicationAction(quietState, 'silence'));
}
assert(quietState.stats.chatPressure > defaultState.stats.chatPressure, 'long silence increases pressure');
assert(quietState.stats.performance < defaultState.stats.performance, 'long silence reduces visibility');

const firstPublication = closeDay(
  applyCommunicationAction(defaultState, 'status'),
  'track-a',
  'A',
);
assertEqual(firstPublication.dayCycle.lastPublicationDay, 1, 'publication records its day');
assert(firstPublication.dayCycle.expectedCadenceDays >= 2, 'cadence stays inside the lower bound');

const fastPublication = closeDay(
  applyCommunicationAction(firstPublication, 'status'),
  'track-b',
  'C',
);
assert(fastPublication.stats.chatPressure >= firstPublication.stats.chatPressure, 'too-fast publication creates audience fatigue');
assert(fastPublication.dayCycle.expectedCadenceDays <= firstPublication.dayCycle.expectedCadenceDays, 'regular fast publication teaches a faster cadence');

let promisedState = applyCommunicationAction(defaultState, 'promise', 'track-a');
const promisedPressureBeforeDeadline = promisedState.stats.chatPressure;
assertEqual(promisedState.dayCycle.commitments.length, 1, 'promise creates one commitment');
promisedState = closeDay(promisedState);
promisedState = closeDay(promisedState);
promisedState = closeDay(promisedState);
assertEqual(promisedState.dayCycle.lastDaySummary?.missedCommitments, 1, 'unfulfilled promise is marked at its deadline');
assert(promisedState.stats.chatPressure > promisedPressureBeforeDeadline, 'missed promise increases pressure');

assertEqual(getDraftAge(6, { createdDay: 1 }), 5, 'draft age is derived from the current day');
const agedDraftState = closeDay({
  ...defaultState,
  dayCycle: { ...defaultState.dayCycle, currentDay: 6 },
  drafts: [{
    id: 'aged-draft',
    trackId: 'track-a',
    trackTitle: 'Stary szkic',
    difficulty: 'Łatwy',
    bestAccuracy: 50,
    bestGrade: 'C',
    qualityProgress: 50,
    status: 'inDrawer',
    updatedAt: '2026-07-01T00:00:00.000Z',
    createdDay: 1,
    lastWorkedDay: 1,
    attemptCount: 1,
  }],
});
assert(agedDraftState.stats.chatPressure > defaultState.stats.chatPressure, 'old drafts add pressure while waiting in the drawer');
assert(!canStartWork({ performance: 40, cybart: 90, chatPressure: 40 }), 'critical Cybart blocks work');
assert(!canPublish({ performance: 40, cybart: 40, chatPressure: 90 }), 'critical pressure blocks publication');

const stableModifier = getRhythmStatModifier({ performance: 40, cybart: 50, chatPressure: 40 });
assertEqual(stableModifier.comboBonus, 0.05, 'stable Cybart adds a small combo bonus');
const pressureModifier = getRhythmStatModifier({ performance: 40, cybart: 50, chatPressure: 80 });
assertEqual(pressureModifier.timingPenaltyMs, 15, 'tense pressure narrows rhythm windows deterministically');
assertEqual(pressureModifier.neuraHint, 'szum publiczności', 'pressure modifier exposes a Neura hint');

const boundedStats: Stats = applyStatsDelta({ performance: 99, cybart: 99, chatPressure: 99 }, { performance: 20, cybart: -200, chatPressure: 20 });
assertEqual(boundedStats.performance, 100, 'stats clamp at 100');
assertEqual(boundedStats.cybart, 0, 'stats clamp at zero');
assertEqual(boundedStats.chatPressure, 100, 'pressure clamps at 100');

const finalSummaryState = finishDay({
  ...defaultState,
  dayCycle: { ...defaultState.dayCycle, currentDay: 14, phase: 'work' },
});
assertEqual(finalSummaryState.dayCycle.phase, 'daySummary', 'the fourteenth day stops on its summary');
assertEqual(advanceDaySummary(finalSummaryState).dayCycle.phase, 'complete', 'the final summary explicitly closes the session');
