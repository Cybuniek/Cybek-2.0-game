import { tracks } from '../data/tracks.ts';
import { triggerEchoAfterPublish, upsertDraft, upsertPublished } from '../gameFlow.ts';
import {
  advanceDaySummary,
  applyCommunicationAction,
  applyStatsDelta,
  finishDay,
  getActionPreview,
  getDecisionDelta,
  type DayDecision,
} from '../dayCycle.ts';
import { updateEndingState } from '../ending.ts';
import { applyResonanceEffects, updateResonanceState } from '../resonance.ts';
import { createPublishedTrack, defaultState } from '../storage.ts';
import type { DayPhase, DraftTrack, GameState, OperationalPowerLevel, QualityTier, Stats } from '../types.ts';

export type DevStatId = keyof Stats | 'echo' | 'resonance';
export type DevPresetId = 'newGame' | 'highPressure' | 'badPerformance' | 'maxCybart' | 'neuraMin' | 'neuraMax';

export type StateDiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
};

export type DevOperationResult = {
  label: string;
  success: boolean;
  warnings: string[];
  stateDiff: StateDiffEntry[];
  events: string[];
  error: string | null;
};

export type DevOperation = DevOperationResult & {
  nextState: GameState;
};

export type DevPreset = {
  id: DevPresetId;
  label: string;
  description: string;
};

export const DEV_PRESETS: readonly DevPreset[] = [
  { id: 'newGame', label: 'Nowa gra', description: 'Czysty stan startowy.' },
  { id: 'highPressure', label: 'Wysoka presja', description: 'Czat jest o krok od krytycznego progu.' },
  { id: 'badPerformance', label: 'Katastrofalny performance', description: 'Niska widoczność i słaby występ.' },
  { id: 'maxCybart', label: 'Maksymalny Cybart', description: 'Cybart.exe pracuje na granicy przegrzania.' },
  { id: 'neuraMin', label: 'Neura minimalna', description: 'Neura pozostaje cicha i odległa.' },
  { id: 'neuraMax', label: 'Neura maksymalna', description: 'Echo i rezonans ustawione pod pełną obecność Neury.' },
];

export function setDevDay(state: GameState, day: number): DevOperation {
  const boundedDay = Math.max(1, Math.min(state.dayCycle.totalDays, Math.round(day)));
  return completeOperation(state, {
    label: `Ustaw dzień ${boundedDay}`,
    nextState: {
      ...state,
      dayCycle: {
        ...state.dayCycle,
        currentDay: boundedDay,
        phase: boundedDay === state.dayCycle.totalDays && state.dayCycle.phase === 'complete'
          ? 'complete'
          : state.dayCycle.phase,
      },
    },
    events: ['dev.day.set'],
    warnings: boundedDay !== day ? ['Dzień został ograniczony do zakresu 1–14.'] : [],
  });
}

export function setDevPhase(state: GameState, phase: DayPhase): DevOperation {
  return completeOperation(state, {
    label: `Przejdź do fazy ${phase}`,
    nextState: {
      ...state,
      dayCycle: {
        ...state.dayCycle,
        phase,
        communicationUsed: phase === 'communication' ? false : state.dayCycle.communicationUsed,
      },
    },
    events: ['dev.phase.set'],
  });
}

export function skipDevPhase(state: GameState): DevOperation {
  const phase = state.dayCycle.phase;
  if (phase === 'complete') return failedOperation(state, 'Pomiń fazę', 'Rozgrywka jest już domknięta.');
  if (phase === 'communication') {
    const next = applyCommunicationAction(state, 'silence');
    return completeOperation(state, { label: 'Pomiń komunikację', nextState: next, events: ['communication.silence'] });
  }
  if (phase === 'work' || phase === 'result') return resolveDevDay(state, 'Pomiń bieżącą fazę');
  return completeOperation(state, {
    label: 'Pomiń podsumowanie',
    nextState: advanceDaySummary(state),
    events: ['day.summary.advanced'],
  });
}

export function resolveDevDay(state: GameState, label = 'Rozlicz dzień'): DevOperation {
  if (state.dayCycle.phase === 'complete') return failedOperation(state, label, 'Rozgrywka jest już domknięta.');
  const readyState = state.dayCycle.phase === 'communication'
    ? applyCommunicationAction(state, 'silence')
    : state;
  const nextState = readyState.dayCycle.phase === 'daySummary'
    ? readyState
    : finishDay(readyState);
  return completeOperation(state, {
    label,
    nextState,
    events: ['day.resolved'],
  });
}

export function advanceDevFullDay(state: GameState): DevOperation {
  const resolved = resolveDevDay(state, 'Automatyczne przejście dnia');
  if (!resolved.success) return resolved;
  const nextState = resolved.nextState.dayCycle.phase === 'daySummary'
    ? advanceDaySummary(resolved.nextState)
    : resolved.nextState;
  return completeOperation(state, {
    label: 'Automatyczne przejście dnia',
    nextState,
    events: [...resolved.events, 'day.summary.advanced'],
    warnings: resolved.warnings,
  });
}

export function finalizeDevGame(state: GameState): DevOperation {
  return completeOperation(state, {
    label: 'Przelicz zakończenie gry',
    nextState: updateEndingState(state),
    events: ['game.finalized'],
  });
}

export function setDevStat(
  state: GameState,
  stat: DevStatId,
  value: number,
  disableClamp: boolean,
): DevOperation {
  const roundedValue = Math.round(value);
  let nextState: GameState;
  if (stat === 'echo') {
    nextState = {
      ...state,
      echo: { ...state.echo, echoCount: Math.max(0, roundedValue) },
    };
  } else if (stat === 'resonance') {
    nextState = {
      ...state,
      resonance: { ...state.resonance, score: Math.max(0, roundedValue) },
    };
  } else if (disableClamp) {
    nextState = { ...state, stats: { ...state.stats, [stat]: roundedValue } };
  } else {
    nextState = {
      ...state,
      stats: applyStatsDelta(state.stats, { [stat]: roundedValue - state.stats[stat] }),
    };
  }
  return completeOperation(state, {
    label: `Ustaw ${stat}: ${roundedValue}`,
    nextState: updateEndingState(nextState),
    events: ['dev.stat.set'],
    warnings: disableClamp && (roundedValue < 0 || roundedValue > 100)
      ? ['Clamp 0–100 jest wyłączony: stan może być celowo niepoprawny.']
      : [],
  });
}

export function applyDevPreset(state: GameState, presetId: DevPresetId): DevOperation {
  const preset = DEV_PRESETS.find((item) => item.id === presetId);
  if (!preset) return failedOperation(state, 'Preset', 'Nie znaleziono wybranego presetu.');

  let nextState = cloneDefaultState();
  if (presetId === 'highPressure') {
    nextState = { ...nextState, stats: { performance: 42, cybart: 58, chatPressure: 88 } };
  } else if (presetId === 'badPerformance') {
    nextState = { ...nextState, stats: { performance: 12, cybart: 24, chatPressure: 28 } };
  } else if (presetId === 'maxCybart') {
    nextState = { ...nextState, stats: { performance: 46, cybart: 99, chatPressure: 54 } };
  } else if (presetId === 'neuraMin') {
    nextState = {
      ...nextState,
      echo: { ...nextState.echo, echoCount: 0 },
      resonance: { ...nextState.resonance, score: 0, bondWithNeura: 'distant', level: 'silent' },
    };
  } else if (presetId === 'neuraMax') {
    nextState = {
      ...nextState,
      stats: { performance: 76, cybart: 68, chatPressure: 52 },
      echo: { ...nextState.echo, echoCount: 6 },
      resonance: { ...nextState.resonance, score: 96, bondWithNeura: 'merged', level: 'overload' },
    };
  }

  return completeOperation(state, {
    label: `Preset: ${preset.label}`,
    nextState: updateEndingState(nextState),
    events: ['dev.preset.applied'],
  });
}

export function resetDevState(state: GameState): DevOperation {
  return completeOperation(state, {
    label: 'Reset stanu gry',
    nextState: cloneDefaultState(),
    events: ['dev.reset'],
  });
}

export function runDevAction(state: GameState, action: DayDecision): DevOperation {
  if (action === 'rest') {
    if (state.dayCycle.phase !== 'work') return failedOperation(state, 'Odpocznij', 'Akcja wymaga fazy pracy.');
    const nextState = finishDay({
      ...state,
      stats: applyStatsDelta(state.stats, getDecisionDelta('rest')),
    });
    return completeOperation(state, { label: 'Odpocznij', nextState, events: ['day.rest'] });
  }

  if (action === 'saveDraft') return saveManualDraft(state, false);
  if (action === 'sendToPawel') return saveManualDraft(state, true);
  if (action === 'discard') return discardManualDraft(state);
  return publishManualDraft(state);
}

export function getDevActionPreview(state: GameState, action: DayDecision) {
  return getActionPreview(state, action, 'B', action !== 'publish');
}

function saveManualDraft(state: GameState, sendToPawel: boolean): DevOperation {
  if (state.dayCycle.phase !== 'work') return failedOperation(state, sendToPawel ? 'Wyślij Pawciowi' : 'Zapisz draft', 'Akcja wymaga fazy pracy.');
  const track = tracks.find((item) => !state.publishedTrackIds.includes(item.id)) ?? tracks[0];
  if (!track) return failedOperation(state, 'Zapisz draft', 'Brakuje utworu do utworzenia draftu.');

  const action: DayDecision = sendToPawel ? 'sendToPawel' : 'saveDraft';
  const existing = state.drafts.find((draft) => draft.trackId === track.id);
  const draft: DraftTrack = existing
    ? { ...existing, status: sendToPawel ? 'sentToPawel' : existing.status, updatedAt: new Date().toISOString() }
    : {
        id: `dev-draft-${state.dayCycle.currentDay}-${track.id}`,
        trackId: track.id,
        trackTitle: track.title,
        difficulty: track.difficulties[0],
        bestAccuracy: 78,
        bestGrade: 'B',
        qualityProgress: 72,
        status: sendToPawel ? 'sentToPawel' : 'inDrawer',
        updatedAt: new Date().toISOString(),
        createdDay: state.dayCycle.currentDay,
        lastWorkedDay: state.dayCycle.currentDay,
        attemptCount: 1,
      };
  const nextState = finishDay({
    ...state,
    createdTrackIds: state.createdTrackIds.includes(track.id) ? state.createdTrackIds : [...state.createdTrackIds, track.id],
    drafts: upsertDraft(state.drafts, draft),
    stats: applyStatsDelta(state.stats, getDecisionDelta(action, 'B', true)),
  });
  return completeOperation(state, {
    label: sendToPawel ? 'Wyślij Pawciowi' : 'Zapisz draft',
    nextState,
    events: sendToPawel ? ['draft.saved', 'draft.sentToPawel'] : ['draft.saved'],
    warnings: sendToPawel && !existing ? ['Draft został zapisany automatycznie przed wysłaniem.'] : [],
  });
}

function discardManualDraft(state: GameState): DevOperation {
  if (state.dayCycle.phase !== 'work') return failedOperation(state, 'Odrzuć draft', 'Akcja wymaga fazy pracy.');
  const draft = state.drafts[0];
  if (!draft) return failedOperation(state, 'Odrzuć draft', 'Brakuje draftu do odrzucenia.');
  const nextState = finishDay({
    ...state,
    drafts: state.drafts.filter((item) => item.id !== draft.id),
    stats: applyStatsDelta(state.stats, getDecisionDelta('discard', draft.bestGrade, false)),
    dayCycle: { ...state.dayCycle, rejectedCount: state.dayCycle.rejectedCount + 1 },
  });
  return completeOperation(state, { label: 'Odrzuć draft', nextState, events: ['draft.rejected'] });
}

function publishManualDraft(state: GameState): DevOperation {
  if (state.dayCycle.phase !== 'work') return failedOperation(state, 'Opublikuj', 'Akcja wymaga fazy pracy.');
  const draft = state.drafts[0];
  if (!draft) return failedOperation(state, 'Opublikuj', 'Brakuje draftu do publikacji.');
  const published = createPublishedTrack(draft, state.dayCycle.currentDay, state.dayCycle.lastPublicationDay);
  let nextState = finishDay({
    ...state,
    drafts: state.drafts.filter((item) => item.trackId !== draft.trackId),
    publishedTracks: upsertPublished(state.publishedTracks, published),
    publishedTrackIds: state.publishedTrackIds.includes(draft.trackId)
      ? state.publishedTrackIds
      : [...state.publishedTrackIds, draft.trackId],
    stats: applyStatsDelta(state.stats, getDecisionDelta('publish', draft.bestGrade, false)),
  }, { publishedTrackId: draft.trackId, publishedQuality: draft.bestGrade });
  nextState = triggerEchoAfterPublish(nextState, published);
  nextState = applyResonanceEffects(updateResonanceState(nextState, draft.bestAccuracy));
  nextState = updateEndingState(nextState);
  return completeOperation(state, { label: 'Opublikuj draft', nextState, events: ['track.published', 'echo.created'] });
}

function completeOperation(
  previousState: GameState,
  input: Pick<DevOperationResult, 'label' | 'events'> & Partial<Pick<DevOperationResult, 'warnings'>> & { nextState: GameState },
): DevOperation {
  return {
    label: input.label,
    success: true,
    warnings: input.warnings ?? [],
    stateDiff: diffState(previousState, input.nextState),
    events: input.events,
    error: null,
    nextState: input.nextState,
  };
}

function failedOperation(state: GameState, label: string, error: string): DevOperation {
  return { label, success: false, warnings: [], stateDiff: [], events: [], error, nextState: state };
}

function cloneDefaultState(): GameState {
  return structuredClone(defaultState);
}

function diffState(before: unknown, after: unknown, path = '', entries: StateDiffEntry[] = []): StateDiffEntry[] {
  if (Object.is(before, after)) return entries;
  if (isPrimitive(before) || isPrimitive(after)) {
    entries.push({ path: path || 'state', before, after });
    return entries;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeJson = JSON.stringify(before);
    const afterJson = JSON.stringify(after);
    if (beforeJson !== afterJson) entries.push({ path, before, after });
    return entries;
  }
  const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)]);
  for (const key of keys) {
    diffState(
      (before as Record<string, unknown>)[key],
      (after as Record<string, unknown>)[key],
      path ? `${path}.${key}` : key,
      entries,
    );
  }
  return entries;
}

function isPrimitive(value: unknown) {
  return value === null || typeof value !== 'object';
}

export function toOperationalPowerLevel(value: number): OperationalPowerLevel {
  return Math.max(0, Math.min(4, Math.round(value))) as OperationalPowerLevel;
}

export const DEV_GRADES: readonly QualityTier[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
