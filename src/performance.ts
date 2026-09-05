import { addStats, applyStatsDelta, getActionPreview, getDecisionDelta, type DayDecision } from './dayCycle.ts';
import type { GameState, PerformanceIntent, PerformanceTrace, QualityTier, Stats } from './types';

export const intentLabels: Record<PerformanceIntent, string> = { close: 'Blisko', live: 'Na żywo' };
export const intentDescriptions: Record<PerformanceIntent, string> = {
  close: 'Zostawiam miejsce na oddech. Ktoś ma mnie usłyszeć.',
  live: 'Wychodzę do ludzi. Mogą zobaczyć potknięcie i powrót.',
};

export function getIntentDelta(state: Pick<GameState, 'settledIntentTrackIds'>, trackId: string, intent?: PerformanceIntent): Stats {
  if (!intent || state.settledIntentTrackIds?.includes(trackId)) return { performance: 0, cybart: 0, chatPressure: 0 };
  return intent === 'close' ? { performance: 0, cybart: 0, chatPressure: -2 } : { performance: 2, cybart: 0, chatPressure: 2 };
}

export function performanceComment(trace?: PerformanceTrace): string {
  if (!trace) return 'To nagranie pochodzi z wcześniejszych prób. Nie mam zapisanego przebiegu.';
  const comeback = trace.phrases.find((phrase) => phrase.complete && phrase.comeback);
  if (comeback) return `W frazie ${comeback.index + 1} wróciłeś w rytm. Potknięcie nie zabrało ci reszty występu.`;
  const best = trace.phrases.filter((phrase) => phrase.complete && phrase.totalNotes > 0).sort((a, b) => b.accuracy - a.accuracy)[0];
  if (best && best.accuracy >= 80) return `Fraza ${best.index + 1} trzymała puls. ${trace.intent === 'live' ? 'Ten moment niósł występ.' : 'Tam było miejsce, żeby cię usłyszeć.'}`;
  return trace.intent === 'live' ? 'Wyszedłeś do ludzi. Ta próba też ma swoje miejsce.' : 'Zostawiłeś po sobie nagranie. Możemy do niego wrócić.';
}

// Intencja jest rozliczana razem z decyzją, przed ograniczeniem statystyk do 0–100.
export function applyPerformanceDecision(state: GameState, action: DayDecision, grade: QualityTier, includeWork: boolean, trackId: string, trace?: PerformanceTrace): GameState {
  const shared = action === 'sendToPawel' || action === 'publish';
  const intentDelta = shared ? getIntentDelta(state, trackId, trace?.intent) : {};
  let next = { ...state, stats: applyStatsDelta(state.stats, addStats(getDecisionDelta(action, grade, includeWork), intentDelta)) };
  if (!shared || !trace?.intent) return next;
  next = {
    ...next,
    settledIntentTrackIds: [...new Set([...(state.settledIntentTrackIds ?? []), trackId])],
    pendingPerformanceReaction: {
      trackId, day: state.dayCycle.currentDay + 1, channel: action === 'sendToPawel' ? 'pawel' : 'group',
      text: `${intentLabels[trace.intent]}: ${performanceComment(trace)}`,
    },
  };
  return next;
}

export function deliverPerformanceReaction(state: GameState): GameState {
  const reaction = state.pendingPerformanceReaction;
  if (!reaction || (state.dayCycle.currentDay < reaction.day && state.dayCycle.phase !== 'complete')) return state;
  const key = reaction.channel === 'pawel' ? 'pawelMessages' : 'groupMessages';
  return { ...state, pendingPerformanceReaction: null, [key]: [...state[key], {
    author: reaction.channel === 'pawel' ? 'Paweł' : 'Anon', text: reaction.text, day: state.dayCycle.currentDay,
  }] };
}

export function performanceDecisionPreview(state: Pick<GameState, 'stats' | 'dayCycle' | 'settledIntentTrackIds'>, action: DayDecision, grade: QualityTier, includeWork: boolean, trackId: string, intent?: PerformanceIntent) {
  const preview = getActionPreview(state, action, grade, includeWork);
  const extra = action === 'publish' || action === 'sendToPawel' ? getIntentDelta(state, trackId, intent) : {};
  const resultingStats = applyStatsDelta(state.stats, addStats(preview.delta, extra));
  const delta = Object.fromEntries(Object.keys(resultingStats).map((key) => [key, resultingStats[key as keyof Stats] - state.stats[key as keyof Stats]])) as Stats;
  return { ...preview, delta, resultingStats };
}
