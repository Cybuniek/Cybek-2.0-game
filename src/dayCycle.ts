import type {
  Commitment,
  CommunicationAction,
  DayCycleState,
  DayPhase,
  DaySummary,
  DraftTrack,
  GameState,
  QualityTier,
  RhythmStatModifier,
  StatBand,
  Stats,
} from './types';

export const TOTAL_DAYS = 14;
export const INITIAL_EXPECTED_CADENCE_DAYS = 4;
export const MIN_EXPECTED_CADENCE_DAYS = 2;
export const MAX_EXPECTED_CADENCE_DAYS = 7;

const WORK_DELTA: Stats = { performance: 0, cybart: 8, chatPressure: 1 };
const COMMUNICATION_DELTAS: Record<CommunicationAction, Stats> = {
  silence: { performance: 0, cybart: 0, chatPressure: 0 },
  status: { performance: 0, cybart: 0, chatPressure: -6 },
  teaser: { performance: 3, cybart: -1, chatPressure: -10 },
  promise: { performance: 5, cybart: -1, chatPressure: -14 },
  break: { performance: -1, cybart: -4, chatPressure: -5 },
  live: { performance: 7, cybart: -5, chatPressure: -12 },
};

const DECISION_DELTAS: Record<'saveDraft' | 'sendToPawel' | 'discard', Stats> = {
  saveDraft: { performance: 0, cybart: 2, chatPressure: 2 },
  sendToPawel: { performance: 1, cybart: 1, chatPressure: 5 },
  discard: { performance: -2, cybart: -5, chatPressure: -3 },
};

const PUBLICATION_DELTAS: Record<'low' | 'mid' | 'high', Stats> = {
  low: { performance: 3, cybart: 4, chatPressure: -2 },
  mid: { performance: 8, cybart: 4, chatPressure: -8 },
  high: { performance: 12, cybart: 4, chatPressure: -12 },
};

export type DayDecision = 'saveDraft' | 'sendToPawel' | 'publish' | 'discard' | 'rest';

export type DayActionPreview = {
  action: DayDecision | CommunicationAction;
  delta: Stats;
  resultingStats: Stats;
  blockedReason: string | null;
  warnings: string[];
};

export type FinishDayOptions = {
  publishedTrackId?: string;
  publishedQuality?: QualityTier;
};

export const defaultDayCycle: DayCycleState = {
  currentDay: 1,
  totalDays: TOTAL_DAYS,
  phase: 'communication',
  communicationUsed: false,
  lastPublicationDay: null,
  expectedCadenceDays: INITIAL_EXPECTED_CADENCE_DAYS,
  publicationDays: [],
  commitments: [],
  rejectedCount: 0,
  lastDaySummary: null,
};

export function clampStat(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function applyStatsDelta(stats: Stats, delta: Partial<Stats>): Stats {
  return {
    performance: clampStat(stats.performance + (delta.performance ?? 0)),
    cybart: clampStat(stats.cybart + (delta.cybart ?? 0)),
    chatPressure: clampStat(stats.chatPressure + (delta.chatPressure ?? 0)),
  };
}

export function addStats(left: Stats, right: Partial<Stats>): Stats {
  return {
    performance: left.performance + (right.performance ?? 0),
    cybart: left.cybart + (right.cybart ?? 0),
    chatPressure: left.chatPressure + (right.chatPressure ?? 0),
  };
}

export function getStatBand(value: number): StatBand {
  if (value < 20) return 'low';
  if (value < 40) return 'rising';
  if (value < 70) return 'stable';
  if (value < 90) return 'tense';
  return 'critical';
}

export function getStatBands(stats: Stats) {
  return {
    performance: getStatBand(stats.performance),
    cybart: getStatBand(stats.cybart),
    chatPressure: getStatBand(stats.chatPressure),
  };
}

export function getCommunicationDelta(action: CommunicationAction): Stats {
  return { ...COMMUNICATION_DELTAS[action] };
}

export function getPublicationTier(tier: QualityTier): 'low' | 'mid' | 'high' {
  if (tier === 'A' || tier === 'S') return 'high';
  if (tier === 'B' || tier === 'C') return 'mid';
  return 'low';
}

export function getDecisionDelta(action: DayDecision, grade: QualityTier = 'C', includeWork = true): Stats {
  if (action === 'rest') return { performance: 0, cybart: -12, chatPressure: -2 };

  const decision = action === 'publish'
    ? PUBLICATION_DELTAS[getPublicationTier(grade)]
    : DECISION_DELTAS[action];
  const result = includeWork ? addStats(WORK_DELTA, decision) : { ...decision };
  return result;
}

export function getActionPreview(
  state: Pick<GameState, 'stats' | 'dayCycle'>,
  action: DayDecision | CommunicationAction,
  grade: QualityTier = 'C',
  includeWork = true,
): DayActionPreview {
  const delta = isCommunicationAction(action)
    ? getCommunicationDelta(action)
    : getDecisionDelta(action, grade, includeWork);
  const resultingStats = applyStatsDelta(state.stats, delta);
  let blockedReason: string | null = null;

  if (action === 'publish' && state.stats.chatPressure >= 90) {
    blockedReason = 'Presja Czatu jest krytyczna. Najpierw rozładuj ją komunikatem.';
  }
  if ((action === 'saveDraft' || action === 'sendToPawel' || action === 'discard' || action === 'rest') && state.dayCycle.phase === 'complete') {
    blockedReason = 'Ta rozgrywka jest już domknięta.';
  }

  const warnings: string[] = [];
  if (resultingStats.cybart >= 90) warnings.push('Cybart.exe zbliża się do przegrzania.');
  if (resultingStats.chatPressure >= 90) warnings.push('Presja Czatu osiąga poziom krytyczny.');
  if (resultingStats.performance < 20) warnings.push('Występ jest słabo widoczny dla odbiorców.');

  return { action, delta, resultingStats, blockedReason, warnings };
}

export function canStartWork(stats: Stats) {
  return stats.cybart < 90;
}

export function canPublish(stats: Stats) {
  return stats.chatPressure < 90;
}

export function beginWork(state: GameState): GameState {
  if (!canStartWork(state.stats) || state.dayCycle.phase !== 'work') return state;
  return { ...state, dayCycle: { ...state.dayCycle, phase: 'result' } };
}

export function cancelWork(state: GameState): GameState {
  if (state.dayCycle.phase !== 'result') return state;
  return { ...state, dayCycle: { ...state.dayCycle, phase: 'work' } };
}

export function applyCommunicationAction(
  state: GameState,
  action: CommunicationAction,
  trackId?: string,
): GameState {
  if (state.dayCycle.phase !== 'communication' || state.dayCycle.communicationUsed) return state;
  const delta = getCommunicationDelta(action);
  const commitments = action === 'promise' && trackId
    ? [
        ...state.dayCycle.commitments,
        {
          id: `promise-${state.dayCycle.currentDay}-${trackId}`,
          kind: 'publication' as const,
          createdDay: state.dayCycle.currentDay,
          dueDay: state.dayCycle.currentDay + 2,
          trackId,
          status: 'active' as const,
        },
      ]
    : state.dayCycle.commitments;

  return {
    ...state,
    stats: applyStatsDelta(state.stats, delta),
    dayCycle: {
      ...state.dayCycle,
      phase: 'work',
      communicationUsed: true,
      commitments,
    },
  };
}

export function getDraftAge(currentDay: number, draft: Pick<DraftTrack, 'createdDay'>) {
  return Math.max(0, currentDay - (draft.createdDay ?? 1));
}

export function getRhythmStatModifier(stats: Stats): RhythmStatModifier {
  const cybartBand = getStatBand(stats.cybart);
  const pressureBand = getStatBand(stats.chatPressure);
  let comboBonus = cybartBand === 'stable' ? 0.05 : 0;
  let timingPenaltyMs = 0;

  if (cybartBand === 'low' || cybartBand === 'tense') timingPenaltyMs += 5;
  if (pressureBand === 'tense') timingPenaltyMs += 15;
  if (cybartBand === 'critical') timingPenaltyMs += 10;
  if (pressureBand === 'critical') timingPenaltyMs += 25;
  if (cybartBand === 'rising') comboBonus = 0.02;

  const neuraHint = pressureBand === 'tense' || pressureBand === 'critical'
    ? 'szum publiczności'
    : cybartBand === 'tense' || cybartBand === 'critical'
      ? 'przegrzanie'
      : cybartBand === 'low'
        ? 'zimny silnik'
        : cybartBand === 'stable'
          ? 'stabilny silnik'
          : 'czysty kanał';

  return { cybartBand, pressureBand, comboBonus, timingPenaltyMs, neuraHint };
}

export function finishDay(state: GameState, options: FinishDayOptions = {}): GameState {
  const day = state.dayCycle.currentDay;
  const previousStats = state.stats;
  const publishedToday = options.publishedTrackId !== undefined;
  const previousPublicationDay = state.dayCycle.lastPublicationDay;
  const expectedCadence = state.dayCycle.expectedCadenceDays;
  let stats = state.stats;
  let commitments = state.dayCycle.commitments;
  let missedCommitments = 0;
  let nextLastPublicationDay = previousPublicationDay;
  let nextExpectedCadence = expectedCadence;
  let publicationDays = state.dayCycle.publicationDays;
  const expiredDraftCount = state.drafts.filter((draft) => getDraftAge(day, draft) >= 5).length;

  commitments = commitments.map((commitment) => {
    if (commitment.status !== 'active') return commitment;
    if (options.publishedTrackId === commitment.trackId && day <= commitment.dueDay) {
      return { ...commitment, status: 'fulfilled' };
    }
    if (day >= commitment.dueDay) {
      missedCommitments += 1;
      return { ...commitment, status: 'missed' };
    }
    return commitment;
  });

  if (missedCommitments > 0) {
    stats = applyStatsDelta(stats, {
      performance: -2 * missedCommitments,
      chatPressure: 12 * missedCommitments,
    });
  }

  if (publishedToday) {
    const interval = previousPublicationDay === null ? day : Math.max(1, day - previousPublicationDay);
    const boundedInterval = clamp(interval, MIN_EXPECTED_CADENCE_DAYS, MAX_EXPECTED_CADENCE_DAYS);
    nextExpectedCadence = clamp(Math.round((expectedCadence * 3 + boundedInterval) / 4), MIN_EXPECTED_CADENCE_DAYS, MAX_EXPECTED_CADENCE_DAYS);
    nextLastPublicationDay = day;
    publicationDays = [...publicationDays, day];

    if (previousPublicationDay !== null && interval < expectedCadence) {
      stats = applyStatsDelta(stats, { chatPressure: 5 });
    } else if (previousPublicationDay !== null && interval >= expectedCadence) {
      stats = applyStatsDelta(stats, { chatPressure: -3 });
    }

    if (
      options.publishedQuality !== undefined
      && getPublicationTier(options.publishedQuality) === 'low'
      && previousPublicationDay !== null
      && interval >= expectedCadence + 2
    ) {
      stats = applyStatsDelta(stats, { chatPressure: 8 });
    }
  } else {
    const daysSincePublication = day - (previousPublicationDay ?? 0);
    const silenceDelta = Math.min(6, Math.max(0, 1 + daysSincePublication - expectedCadence));
    const visibilityDelta = daysSincePublication > expectedCadence + 2 ? -1 : 0;
    stats = applyStatsDelta(stats, {
      performance: visibilityDelta,
      chatPressure: silenceDelta + expiredDraftCount,
    });
  }

  const summary: DaySummary = {
    day,
    published: publishedToday,
    pressureDelta: stats.chatPressure - previousStats.chatPressure,
    performanceDelta: stats.performance - previousStats.performance,
    cybartDelta: stats.cybart - previousStats.cybart,
    missedCommitments,
    expiredDraftCount,
  };
  return {
    ...state,
    stats,
    dayCycle: {
      ...state.dayCycle,
      currentDay: day,
      phase: 'daySummary',
      communicationUsed: false,
      lastPublicationDay: nextLastPublicationDay,
      expectedCadenceDays: nextExpectedCadence,
      publicationDays,
      commitments,
      lastDaySummary: summary,
    },
  };
}

export function advanceDaySummary(state: GameState): GameState {
  if (state.dayCycle.phase !== 'daySummary') return state;
  const completed = state.dayCycle.currentDay >= state.dayCycle.totalDays;
  return {
    ...state,
    dayCycle: {
      ...state.dayCycle,
      currentDay: completed ? state.dayCycle.currentDay : state.dayCycle.currentDay + 1,
      phase: completed ? 'complete' : 'communication',
      communicationUsed: false,
    },
  };
}

function isCommunicationAction(action: DayDecision | CommunicationAction): action is CommunicationAction {
  return ['silence', 'status', 'teaser', 'promise', 'break', 'live'].includes(action);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function isDayPhase(value: unknown): value is DayPhase {
  return ['communication', 'work', 'result', 'daySummary', 'complete'].includes(String(value));
}

export function normalizeCommitments(value: unknown): Commitment[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Commitment => {
    if (!item || typeof item !== 'object') return false;
    const commitment = item as Partial<Commitment>;
    return commitment.kind === 'publication'
      && typeof commitment.id === 'string'
      && typeof commitment.trackId === 'string'
      && typeof commitment.createdDay === 'number'
      && typeof commitment.dueDay === 'number'
      && ['active', 'fulfilled', 'missed'].includes(String(commitment.status));
  });
}
