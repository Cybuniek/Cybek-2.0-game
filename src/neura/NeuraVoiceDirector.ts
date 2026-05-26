import { neuraVoiceLinesV2 } from '../data/dialogue/neuraVoiceLines.ts';
import { neuraVoicePacks } from '../data/dialogue/neuraVoicePacks.ts';
import { neuraSystemEchoes } from '../data/dialogue/systemEchoes.ts';
import {
  dialoguePriorities,
  type DialogueConditions,
  type DialogueContext,
  type DialoguePriority,
  type NeuraPresenceEventId,
  type NeuraPresenceState,
  type NeuraVoiceDirectorState,
  type NeuraVoiceLine,
  type NeuraVoicePack,
  type NeuraVoiceQueueItem,
  type OperationalPowerLevel,
} from '../data/dialogue/dialogueTypes.ts';
import type { GameState } from '../types.ts';

const PRIORITY_WEIGHT: Record<DialoguePriority, number> = {
  critical: 0,
  main: 1,
  milestone: 2,
  lore: 3,
  side: 4,
  ambient: 5,
};

const MAIN_QUEUE_PRIORITIES: readonly DialoguePriority[] = ['critical', 'main', 'milestone', 'lore', 'side'];
const RECENT_HISTORY_LIMIT = 8;

export type DialogueRejectionReason = {
  lineId: string;
  reason: string;
};

export function createDefaultNeuraVoiceDirectorState(): NeuraVoiceDirectorState {
  return {
    version: 1,
    unlockedPackIds: ['tutorialPack'],
    queue: [],
    history: {
      byLineId: {},
      recentlyPlayedLineIds: [],
      markedEventIds: [],
    },
    lastAmbientPlayedAt: null,
  };
}

export function deriveOperationalPowerLevel(gameState: GameState): OperationalPowerLevel {
  const score = gameState.stats.performance + gameState.stats.cybart + gameState.publishedTracks.length * 12;
  if (score >= 140) return 3;
  if (score >= 90) return 2;
  if (score >= 45) return 1;
  return 0;
}

export function createPresenceStateFromGameState(
  gameState: GameState,
  partial?: Partial<Omit<NeuraPresenceState, 'operationalPowerLevel'>>,
): NeuraPresenceState {
  return {
    operationalPowerLevel: deriveOperationalPowerLevel(gameState),
    activeWindow: partial?.activeWindow ?? null,
    screen: partial?.screen ?? 'desktop',
    lastPresenceEventId: partial?.lastPresenceEventId ?? null,
  };
}

export function getAvailableDialogueLines(
  state: NeuraVoiceDirectorState,
  context: DialogueContext,
  options?: { triggerEventId?: NeuraPresenceEventId; includeAmbient?: boolean },
): { lines: NeuraVoiceLine[]; rejections: DialogueRejectionReason[] } {
  const rejections: DialogueRejectionReason[] = [];
  const unlocked = getUnlockedPacks(state, context);
  const includeAmbient = options?.includeAmbient ?? false;

  const lines = neuraVoiceLinesV2.filter((line) => {
    const pack = unlocked.find((item) => item.id === line.packId);
    if (!pack) {
      rejections.push({ lineId: line.id, reason: 'pack_locked' });
      return false;
    }

    if (!matchesTrigger(line, options?.triggerEventId, includeAmbient)) {
      rejections.push({ lineId: line.id, reason: 'trigger_mismatch' });
      return false;
    }

    const conditionsOk = matchesConditions(line.conditions, context, state);
    if (!conditionsOk) {
      rejections.push({ lineId: line.id, reason: neuraSystemEchoes.missingConditions });
      return false;
    }

    const historyEntry = state.history.byLineId[line.id];
    if (line.playbackMode === 'requiredOnce' && historyEntry?.playCount) {
      rejections.push({ lineId: line.id, reason: 'required_once_already_played' });
      return false;
    }
    if (line.playbackMode === 'onceWhenUnlocked' && historyEntry?.playCount) {
      rejections.push({ lineId: line.id, reason: 'once_when_unlocked_already_played' });
      return false;
    }
    if (historyEntry?.lastPlayedAt && context.now - historyEntry.lastPlayedAt < resolveCooldownMs(line, pack)) {
      rejections.push({ lineId: line.id, reason: neuraSystemEchoes.cooldownActive });
      return false;
    }
    if (state.history.recentlyPlayedLineIds.includes(line.id)) {
      rejections.push({ lineId: line.id, reason: neuraSystemEchoes.recentlyPlayed });
      return false;
    }
    if ((historyEntry?.sessionPlayCount ?? 0) >= (pack.maxPlaysPerSession ?? Number.MAX_SAFE_INTEGER)) {
      rejections.push({ lineId: line.id, reason: 'pack_session_limit_reached' });
      return false;
    }

    return true;
  });

  return { lines, rejections };
}

export function createVoiceQueueItemsFromEvent(
  state: NeuraVoiceDirectorState,
  params: {
    eventId: NeuraPresenceEventId;
    context: DialogueContext;
    now?: number;
  },
): { state: NeuraVoiceDirectorState; items: NeuraVoiceQueueItem[] } {
  const now = params.now ?? params.context.now;
  const withMarked = markEvent(state, params.eventId);
  const unlockedState = applyPackUnlocks(withMarked, params.context);
  const { lines } = getAvailableDialogueLines(unlockedState, params.context, { triggerEventId: params.eventId });

  const existingLineIds = new Set(unlockedState.queue.map((item) => item.lineId));
  const items = lines
    .filter((line) => line.priority !== 'ambient' && !existingLineIds.has(line.id))
    .map((line) => ({
      lineId: line.id,
      priority: line.priority,
      sourceEventId: params.eventId,
      queuedAt: now,
      expiresAt: line.priority === 'critical' || line.priority === 'main' ? undefined : now + 90_000,
    }));

  const queue = sortQueue([...unlockedState.queue, ...items], now);
  return { state: { ...unlockedState, queue }, items };
}

export function getNextNeuraVoiceLine(
  state: NeuraVoiceDirectorState,
  context: DialogueContext,
): { line: NeuraVoiceLine | null; state: NeuraVoiceDirectorState; rejections: DialogueRejectionReason[] } {
  const now = context.now;
  const queue = sortQueue(state.queue, now);
  const byId = new Map(neuraVoiceLinesV2.map((line) => [line.id, line]));

  for (const queueItem of queue) {
    const line = byId.get(queueItem.lineId);
    if (!line) continue;
    const { lines, rejections } = getAvailableDialogueLines({ ...state, queue }, context, {
      triggerEventId: queueItem.sourceEventId,
      includeAmbient: false,
    });
    if (lines.find((item) => item.id === line.id)) {
      return { line, state: { ...state, queue }, rejections };
    }
  }

  for (const priority of MAIN_QUEUE_PRIORITIES) {
    const { lines, rejections } = getAvailableDialogueLines(state, context, { includeAmbient: false });
    const match = lines.find((line) => line.priority === priority && line.playbackMode === 'requiredOnce');
    if (match) return { line: match, state: { ...state, queue }, rejections };
  }

  for (const priority of ['lore', 'side'] as const) {
    const { lines, rejections } = getAvailableDialogueLines(state, context, { includeAmbient: false });
    const match = lines.find((line) => line.priority === priority);
    if (match) return { line: match, state: { ...state, queue }, rejections };
  }

  const { lines: ambientCandidates, rejections } = getAvailableDialogueLines(state, context, { includeAmbient: true });
  if (queue.length > 0) {
    return {
      line: null,
      state: { ...state, queue },
      rejections: [...rejections, { lineId: 'ambient', reason: neuraSystemEchoes.queueBlockedAmbient }],
    };
  }
  const ambientCooldownMs = 15_000;
  if (state.lastAmbientPlayedAt && now - state.lastAmbientPlayedAt < ambientCooldownMs) {
    return {
      line: null,
      state: { ...state, queue },
      rejections: [...rejections, { lineId: 'ambient', reason: neuraSystemEchoes.cooldownActive }],
    };
  }
  const ambient = ambientCandidates.find((line) => line.priority === 'ambient');
  return { line: ambient ?? null, state: { ...state, queue }, rejections };
}

export function markVoiceLinePlayed(
  state: NeuraVoiceDirectorState,
  params: { lineId: string; playedAt: number },
): NeuraVoiceDirectorState {
  const current = state.history.byLineId[params.lineId] ?? {
    playCount: 0,
    lastPlayedAt: null,
    sessionPlayCount: 0,
  };

  const nextHistory = {
    ...state.history,
    byLineId: {
      ...state.history.byLineId,
      [params.lineId]: {
        ...current,
        playCount: current.playCount + 1,
        sessionPlayCount: current.sessionPlayCount + 1,
        lastPlayedAt: params.playedAt,
      },
    },
    recentlyPlayedLineIds: [params.lineId, ...state.history.recentlyPlayedLineIds.filter((id) => id !== params.lineId)].slice(0, RECENT_HISTORY_LIMIT),
  };

  const playedLine = neuraVoiceLinesV2.find((line) => line.id === params.lineId);
  const queue = state.queue.filter((item) => item.lineId !== params.lineId);

  return {
    ...state,
    queue,
    history: nextHistory,
    lastAmbientPlayedAt: playedLine?.priority === 'ambient' ? params.playedAt : state.lastAmbientPlayedAt,
  };
}

export function renderNeuraVoiceDirectorDebug(
  state: NeuraVoiceDirectorState,
  context: DialogueContext,
  rejections: DialogueRejectionReason[] = [],
): string {
  return JSON.stringify(
    {
      operationalPowerLevel: context.presence.operationalPowerLevel,
      unlockedPacks: state.unlockedPackIds,
      queue: state.queue.map((item) => ({
        lineId: item.lineId,
        priority: item.priority,
        sourceEventId: item.sourceEventId,
        queuedAt: item.queuedAt,
        expiresAt: item.expiresAt ?? null,
      })),
      recentlyPlayed: state.history.recentlyPlayedLineIds,
      cooldowns: Object.entries(state.history.byLineId).map(([lineId, item]) => ({
        lineId,
        lastPlayedAt: item.lastPlayedAt,
        playCount: item.playCount,
      })),
      rejectionReasons: rejections.slice(0, 6),
    },
    null,
    2,
  );
}

function getUnlockedPacks(state: NeuraVoiceDirectorState, context: DialogueContext): NeuraVoicePack[] {
  return neuraVoicePacks.filter((pack) => state.unlockedPackIds.includes(pack.id) || matchesConditions(pack.unlock, context, state));
}

function applyPackUnlocks(state: NeuraVoiceDirectorState, context: DialogueContext): NeuraVoiceDirectorState {
  const nextUnlocked = new Set(state.unlockedPackIds);
  for (const pack of neuraVoicePacks) {
    if (matchesConditions(pack.unlock, context, state)) nextUnlocked.add(pack.id);
  }
  return { ...state, unlockedPackIds: Array.from(nextUnlocked).sort((a, b) => packOrdering(a) - packOrdering(b)) };
}

function markEvent(state: NeuraVoiceDirectorState, eventId: NeuraPresenceEventId): NeuraVoiceDirectorState {
  if (state.history.markedEventIds.includes(eventId)) return state;
  return {
    ...state,
    history: {
      ...state.history,
      markedEventIds: [...state.history.markedEventIds, eventId],
    },
  };
}

function matchesTrigger(line: NeuraVoiceLine, triggerEventId: NeuraPresenceEventId | undefined, includeAmbient: boolean): boolean {
  if (line.trigger.type === 'ambient') return includeAmbient;
  if (line.trigger.type === 'event') return !!triggerEventId && line.trigger.eventIds.includes(triggerEventId);
  return line.trigger.type === 'debug';
}

function matchesConditions(conditions: DialogueConditions | undefined, context: DialogueContext, state: NeuraVoiceDirectorState): boolean {
  if (!conditions) return true;
  const { gameState, presence } = context;
  const sentToPawelCount = gameState.drafts.filter((draft) => draft.status === 'sentToPawel').length;

  if (conditions.minOperationalPowerLevel !== undefined && presence.operationalPowerLevel < conditions.minOperationalPowerLevel) return false;
  if (conditions.maxOperationalPowerLevel !== undefined && presence.operationalPowerLevel > conditions.maxOperationalPowerLevel) return false;
  if (conditions.requiredEventIds && !conditions.requiredEventIds.every((id) => state.history.markedEventIds.includes(id))) return false;
  if (conditions.blockedEventIds && conditions.blockedEventIds.some((id) => state.history.markedEventIds.includes(id))) return false;
  if (conditions.requiredPublishedCount !== undefined && gameState.publishedTracks.length < conditions.requiredPublishedCount) return false;
  if (conditions.requiredDraftCount !== undefined && gameState.drafts.length < conditions.requiredDraftCount) return false;
  if (conditions.requiredSentToPawelCount !== undefined && sentToPawelCount < conditions.requiredSentToPawelCount) return false;
  if (conditions.minChatPressure !== undefined && gameState.stats.chatPressure < conditions.minChatPressure) return false;
  if (conditions.minCybart !== undefined && gameState.stats.cybart < conditions.minCybart) return false;
  if (conditions.minPerformance !== undefined && gameState.stats.performance < conditions.minPerformance) return false;
  if (conditions.activeWindow !== undefined && presence.activeWindow !== conditions.activeWindow) return false;
  if (conditions.screen !== undefined && presence.screen !== conditions.screen) return false;
  if (conditions.lastPresenceEventId !== undefined && presence.lastPresenceEventId !== conditions.lastPresenceEventId) return false;
  if (conditions.hasPublishedTrackId && !gameState.publishedTrackIds.includes(conditions.hasPublishedTrackId)) return false;
  if (conditions.hasDraftTrackId && !gameState.drafts.some((draft) => draft.trackId === conditions.hasDraftTrackId)) return false;
  if (conditions.minEchoCount !== undefined && (gameState.echo?.echoCount ?? 0) < conditions.minEchoCount) return false;
  if (conditions.minResonanceLevel !== undefined && resonanceRank(gameState.resonance?.level ?? 'silent') < resonanceRank(conditions.minResonanceLevel)) return false;
  if (conditions.bondWithNeura !== undefined && gameState.resonance?.bondWithNeura !== conditions.bondWithNeura) return false;
  if (conditions.endingRoute !== undefined && gameState.ending?.route !== conditions.endingRoute) return false;

  return true;
}

function resonanceRank(level: string) {
  return ['silent', 'low', 'medium', 'high', 'overload'].indexOf(level);
}

function resolveCooldownMs(line: NeuraVoiceLine, pack: NeuraVoicePack): number {
  if (line.repeatPolicy === 'never') return Number.MAX_SAFE_INTEGER;
  if (line.repeatPolicy === 'loop') return pack.cooldownMs ?? 10_000;
  return pack.cooldownMs ?? 15_000;
}

function sortQueue(queue: NeuraVoiceQueueItem[], now: number): NeuraVoiceQueueItem[] {
  return queue
    .filter((item) => item.expiresAt === undefined || item.expiresAt > now)
    .sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || a.queuedAt - b.queuedAt);
}

function packOrdering(packId: string): number {
  return neuraVoicePacks.find((pack) => pack.id === packId)?.ordering ?? Number.MAX_SAFE_INTEGER;
}

export function comparePriority(a: DialoguePriority, b: DialoguePriority): number {
  return PRIORITY_WEIGHT[a] - PRIORITY_WEIGHT[b];
}

export function getPriorityOrder(): readonly DialoguePriority[] {
  return dialoguePriorities;
}
