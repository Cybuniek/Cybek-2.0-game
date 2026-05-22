import { getNeuraPresencePreset, getOperationalPowerLevel } from '../data/neuraPresence.ts';
import type {
  GameState,
  NeuraPresenceEventId,
  NeuraPresenceEventLogEntry,
  NeuraPresenceState,
  OperationalPowerLevel,
} from '../types.ts';

const EVENT_SCORE_BONUS: Record<NeuraPresenceEventId, number> = {
  boot: 0,
  draftSaved: 3,
  sentToPawel: 7,
  published: 12,
  rhythmStarted: 2,
  rhythmFinished: 5,
  manualReaction: 4,
  idlePulse: 1,
  debugSetPower: 0,
};

type PresenceStateOptions = {
  lastEventId?: NeuraPresenceEventId;
  debugOverride?: OperationalPowerLevel | null;
  lowFxMode?: boolean;
  eventLog?: NeuraPresenceEventLogEntry[];
};

export function createNeuraPresenceState(
  gameState: GameState,
  options: PresenceStateOptions = {},
): NeuraPresenceState {
  const debugOverride = options.debugOverride ?? null;
  const lastEventId = options.lastEventId ?? 'boot';
  const computedPowerLevel = getOperationalPowerLevel(calculatePresenceScore(gameState, lastEventId));
  const powerLevel = debugOverride ?? computedPowerLevel;
  const preset = getNeuraPresencePreset(powerLevel);
  const lowFxMode = options.lowFxMode ?? false;
  const avatarMultiplier = lowFxMode ? 0.18 : 1;
  const uiMultiplier = lowFxMode ? 0.35 : 1;

  return {
    powerLevel,
    glitchIntensity: clamp01(preset.audio.glitchIntensity),
    ambientDepth: clamp01(preset.audio.ambientDepth),
    avatarInstability: clamp01(preset.avatar.instability * avatarMultiplier),
    uiAutonomy: clamp01(preset.ui.autonomy * uiMultiplier),
    lastEventId,
    debugOverride,
    lowFxMode,
    narrativeTag: preset.narrativeTag,
    eventLog: (options.eventLog ?? []).slice(-8),
  };
}

export function appendNeuraPresenceEvent(
  eventLog: readonly NeuraPresenceEventLogEntry[],
  id: NeuraPresenceEventId,
  at = new Date().toISOString(),
): NeuraPresenceEventLogEntry[] {
  return [...eventLog, { id, at }].slice(-8);
}

export function calculatePresenceScore(gameState: GameState, lastEventId: NeuraPresenceEventId = 'boot') {
  const publishedScore = gameState.publishedTracks.reduce((score, track) => {
    const tierBonus = track.grade === 'S' || track.grade === 'A'
      ? 8
      : track.grade === 'B' || track.grade === 'C'
        ? 5
        : 3;
    return score + 16 + tierBonus + Math.min(10, Math.round(track.qualityProgress / 18));
  }, 0);
  const draftScore = gameState.drafts.reduce((score, draft) => (
    score + (draft.status === 'sentToPawel' ? 8 : 4) + Math.min(6, Math.round(draft.qualityProgress / 28))
  ), 0);
  const pressureScore = Math.round(gameState.stats.chatPressure * 0.24);
  const cybartScore = Math.round(gameState.stats.cybart * 0.18);
  const performanceScore = Math.round(gameState.stats.performance * 0.08);
  const titleRevealScore = Math.min(10, Math.round(Object.values(gameState.titleRevealByTrackId).reduce(
    (sum, reveal) => sum + reveal,
    0,
  ) * 3));

  return clamp(
    publishedScore
      + draftScore
      + pressureScore
      + cybartScore
      + performanceScore
      + titleRevealScore
      + EVENT_SCORE_BONUS[lastEventId],
    0,
    120,
  );
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
