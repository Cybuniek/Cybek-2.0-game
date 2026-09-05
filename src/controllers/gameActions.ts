import { applyPerformanceDecision, deliverPerformanceReaction } from '../performance';
import type { StorySceneTrigger } from '../data/dialogue/storyScenes';
import type { NeuraPresenceEventId as DialoguePresenceEventId } from '../data/dialogue/dialogueTypes';
import { chatAuthors, communicationMessage, groupPublishMessages, pawelDraftMessage } from '../data/chatReactions';
import { tracks } from '../data/tracks';
import type { DevOperation } from '../dev/devMenuDomain';
import { updateEndingState } from '../ending';
import {
  addUnique,
  resultFromDraft,
  triggerEchoAfterPublish,
  upsertDraft,
  upsertPublished,
} from '../gameFlow';
import {
  applyCommunicationAction,
  applyStatsDelta,
  advanceDaySummary,
  beginWork,
  canPublish,
  canStartWork,
  cancelWork,
  finishDay,
  getDecisionDelta,
  type DayDecision,
} from '../dayCycle';
import { applyResonanceEffects, updateResonanceState } from '../resonance';
import {
  addMessage,
  createDraftFromResult,
  createPublishedTrack,
  getNextDifficulty,
  getTitleReveal,
  improveDraftWithResult,
  maskTrackTitle,
  revealTitleByAccuracy,
  revealTitleFully,
} from '../storage';
import type {
  CommunicationAction,
  Difficulty,
  DraftTrack,
  GameState,
  NeuraPresenceEventId,
  PerformanceResult,
  PerformanceIntent,
  PublishedTrack,
  Track,
} from '../types';
import type { ActiveRun } from './useSessionController';

export type GameWindowId = 'messenger' | 'create' | 'me' | 'player' | 'event' | 'ustniki' | 'titleHub' | null;

export type GameActionDependencies = {
  gameState: GameState;
  result: PerformanceResult | null;
  activeRun: ActiveRun | null;
  activeWindow: GameWindowId;
  corruptionTick: number;
  setGameState: (nextState: GameState) => void;
  setMessengerTab: (tab: 'pawel' | 'group') => void;
  setSelectedPublishedId: (id: string | null) => void;
  setActiveWindow: (windowId: GameWindowId) => void;
  startRun: (track: Track, difficulty: Difficulty, mode: ActiveRun['mode'], draftId?: string, intent?: PerformanceIntent) => void;
  clearSessionToDesktop: () => void;
  recordNeuraPresenceEvent: (eventId: NeuraPresenceEventId) => void;
  runStoryAction: (eventId: DialoguePresenceEventId, nextState: GameState) => void;
  queueStoryScene: (trigger: StorySceneTrigger) => void;
  showEnvironmentalEcho: (text: string) => void;
};

export type GameActions = {
  sendCommunication: (action: CommunicationAction, trackId?: string) => void;
  restForDay: () => void;
  continueAfterDaySummary: () => void;
  startCreate: (track: Track, intent?: PerformanceIntent) => void;
  startRemix: (draft: DraftTrack, intent?: PerformanceIntent) => void;
  saveInitialDraft: (status: DraftTrack['status']) => void;
  overwriteDraft: () => void;
  sendDraftToPawel: (draft: DraftTrack) => void;
  publishInitialResult: () => void;
  publishDraft: (draft: DraftTrack, includeWork?: boolean) => void;
  discardInitialResult: () => void;
  discardDraft: (draft: DraftTrack) => void;
  cancelPendingWork: (windowId: GameWindowId) => void;
  openPlayer: (published: PublishedTrack) => void;
  returnToDesktop: (windowId?: GameWindowId) => void;
  applyDevOperation: (operation: DevOperation) => void;
  triggerDevNeuraEvent: (eventId: NeuraPresenceEventId) => void;
};

export function createGameActions(dependencies: GameActionDependencies): GameActions {
  const {
    gameState,
    result,
    activeRun,
    activeWindow,
    corruptionTick,
    setGameState,
    setMessengerTab,
    setSelectedPublishedId,
    setActiveWindow,
    startRun,
    clearSessionToDesktop,
    recordNeuraPresenceEvent,
    runStoryAction,
    queueStoryScene,
    showEnvironmentalEcho,
  } = dependencies;

  function recordDayCycleEvents(previousState: GameState, nextState: GameState) {
    const previousCommitmentStatuses = new Map(
      previousState.dayCycle.commitments.map((commitment) => [commitment.id, commitment.status]),
    );
    const missedCommitment = nextState.dayCycle.commitments.some((commitment) => (
      commitment.status === 'missed' && previousCommitmentStatuses.get(commitment.id) !== 'missed'
    ));
    const fulfilledCommitment = nextState.dayCycle.commitments.some((commitment) => (
      commitment.status === 'fulfilled' && previousCommitmentStatuses.get(commitment.id) !== 'fulfilled'
    ));
    const advancedToNewDay = nextState.dayCycle.currentDay > previousState.dayCycle.currentDay
      && nextState.dayCycle.phase === 'communication';

    if (advancedToNewDay || nextState.dayCycle.phase === 'complete') {
      recordNeuraPresenceEvent('dayAdvanced');
    }
    if (nextState.dayCycle.rejectedCount > previousState.dayCycle.rejectedCount) {
      recordNeuraPresenceEvent('draftRejected');
    }
    if (missedCommitment) {
      recordNeuraPresenceEvent('promiseMissed');
    }

    if (missedCommitment) {
      runStoryAction('commitment.missed', nextState);
    } else if (nextState.dayCycle.rejectedCount > previousState.dayCycle.rejectedCount) {
      runStoryAction('draft.rejected', nextState);
    } else if (advancedToNewDay) {
      runStoryAction('day.advanced', nextState);
    }

    if (fulfilledCommitment) {
      showEnvironmentalEcho('Obietnica domknięta. Czat zapamięta termin lepiej niż ulgę.');
    }
  }

  function returnToDesktop(windowId: GameWindowId = activeWindow) {
    clearSessionToDesktop();
    setActiveWindow(windowId);
  }

  function commitDay(previousState: GameState, nextState: GameState, windowId: GameWindowId) {
    setGameState(nextState);
    recordDayCycleEvents(previousState, nextState);
    returnToDesktop(windowId);
  }

  function sendCommunication(action: CommunicationAction, trackId?: string) {
    if (gameState.dayCycle.phase !== 'communication') return;
    const nextDayState = applyCommunicationAction(gameState, action, trackId);
    if (nextDayState === gameState) return;

    const target = trackId
      ? gameState.drafts.find((draft) => draft.trackId === trackId)?.trackTitle
        ?? tracks.find((track) => track.id === trackId)?.title
      : undefined;
    const message = communicationMessage(action, gameState.dayCycle.currentDay, target);
    const nextState: GameState = {
      ...nextDayState,
      groupMessages: [...nextDayState.groupMessages, message],
    };
    setGameState(nextState);
    setMessengerTab('group');
    showEnvironmentalEcho(action === 'silence' ? 'Cisza też jest komunikatem.' : message.text);
  }

  function restForDay() {
    if (gameState.dayCycle.phase !== 'work') return;
    const withRest = {
      ...gameState,
      stats: applyStatsDelta(gameState.stats, getDecisionDelta('rest')),
    };
    const nextState = finishDay(withRest);
    commitDay(gameState, nextState, 'messenger');
  }

  function continueAfterDaySummary() {
    if (gameState.dayCycle.phase !== 'daySummary') return;
    const nextState = deliverPerformanceReaction(advanceDaySummary(gameState));
    setGameState(nextState);
    recordDayCycleEvents(gameState, nextState);
  }

  function startCreate(track: Track, intent: PerformanceIntent = 'close') {
    if (gameState.dayCycle.phase !== 'work' || !canStartWork(gameState.stats)) return;
    setGameState(beginWork(gameState));
    startRun(track, track.difficulties[0], 'create', undefined, intent);
  }

  function startRemix(draft: DraftTrack, intent: PerformanceIntent = 'close') {
    const track = tracks.find((item) => item.id === draft.trackId);
    const nextDifficulty = getNextDifficulty(draft.trackId, draft.difficulty) ?? draft.difficulty;
    if (gameState.dayCycle.phase !== 'work' || !canStartWork(gameState.stats)) return;
    if (track) {
      setGameState(beginWork(gameState));
      startRun(track, nextDifficulty, 'remix', draft.id, intent);
    }
  }

  function saveInitialDraft(status: DraftTrack['status']) {
    if (!result) return;
    const action: DayDecision = status === 'sentToPawel' ? 'sendToPawel' : 'saveDraft';
    const draft = createDraftFromResult(result, status, gameState.dayCycle.currentDay);
    const pawelMessages = status === 'sentToPawel'
      ? addMessage(
          gameState.pawelMessages,
          chatAuthors.cybek,
          pawelDraftMessage(
            result,
            maskTrackTitle(
              result.trackTitle,
              getTitleReveal(gameState.titleRevealByTrackId, result.trackId, gameState.publishedTrackIds.includes(result.trackId)),
              result.trackId,
              corruptionTick,
            ),
          ),
        )
      : gameState.pawelMessages;
    let nextState: GameState = {
      ...gameState,
      createdTrackIds: addUnique(gameState.createdTrackIds, result.trackId),
      titleRevealByTrackId: revealTitleByAccuracy(gameState.titleRevealByTrackId, result.trackId, result.accuracy),
      drafts: upsertDraft(gameState.drafts, draft),
      pawelMessages,
      stats: gameState.stats,
    };
    nextState = applyPerformanceDecision(nextState, action, result.grade, true, draft.trackId, draft.lastPerformance);
    nextState = finishDay(nextState);

    runStoryAction(status === 'sentToPawel' ? 'draft.sentToPawel' : 'draft.saved', nextState);
    if (status === 'sentToPawel') {
      queueStoryScene({ type: 'share', channel: 'pawel', trackId: draft.trackId });
    }

    commitDay(gameState, nextState, status === 'sentToPawel' ? 'messenger' : 'me');
    recordNeuraPresenceEvent(status === 'sentToPawel' ? 'sentToPawel' : 'draftSaved');
    if (status === 'sentToPawel') setMessengerTab('pawel');
  }

  function overwriteDraft() {
    if (!result || !activeRun?.draftId) return;
    const current = gameState.drafts.find((draft) => draft.id === activeRun.draftId);
    if (!current) return;
    let nextState: GameState = {
      ...gameState,
      drafts: upsertDraft(gameState.drafts, improveDraftWithResult(current, result, gameState.dayCycle.currentDay)),
      titleRevealByTrackId: revealTitleByAccuracy(gameState.titleRevealByTrackId, result.trackId, result.accuracy),
      stats: applyStatsDelta(gameState.stats, getDecisionDelta('saveDraft', result.grade, true)),
    };
    nextState = finishDay(nextState);

    runStoryAction('draft.saved', nextState);
    queueStoryScene({ type: 'remix.firstOverwritten', trackId: result.trackId });
    commitDay(gameState, nextState, 'me');
    recordNeuraPresenceEvent('draftSaved');
  }

  function sendDraftToPawel(draft: DraftTrack) {
    if (gameState.dayCycle.phase !== 'work') return;
    const resultLike = resultFromDraft(draft);
    let nextState: GameState = {
      ...gameState,
      drafts: upsertDraft(gameState.drafts, { ...draft, status: 'sentToPawel', updatedAt: new Date().toISOString() }),
      titleRevealByTrackId: revealTitleByAccuracy(gameState.titleRevealByTrackId, draft.trackId, draft.bestAccuracy),
      pawelMessages: addMessage(
        gameState.pawelMessages,
        chatAuthors.cybek,
        pawelDraftMessage(
          draft,
          maskTrackTitle(
            draft.trackTitle,
            getTitleReveal(gameState.titleRevealByTrackId, draft.trackId, gameState.publishedTrackIds.includes(draft.trackId)),
            draft.trackId,
            corruptionTick,
          ),
        ),
      ),
      stats: gameState.stats,
    };
    nextState = applyPerformanceDecision(nextState, 'sendToPawel', resultLike.grade, false, draft.trackId, draft.lastPerformance);
    nextState = finishDay(nextState);
    commitDay(gameState, nextState, 'messenger');
    runStoryAction('draft.sentToPawel', nextState);
    queueStoryScene({ type: 'share', channel: 'pawel', trackId: draft.trackId });
    recordNeuraPresenceEvent('sentToPawel');
    setMessengerTab('pawel');
  }

  function publishInitialResult() {
    if (!result || gameState.publishedTrackIds.includes(result.trackId)) return;
    publishDraft(createDraftFromResult(result, 'inDrawer', gameState.dayCycle.currentDay), true);
  }

  function publishDraft(draft: DraftTrack, includeWork = false) {
    if (gameState.publishedTrackIds.includes(draft.trackId) || !canPublish(gameState.stats)) return;

    const published = createPublishedTrack(
      draft,
      gameState.dayCycle.currentDay,
      gameState.dayCycle.lastPublicationDay,
    );
    let nextState: GameState = {
      ...gameState,
      createdTrackIds: addUnique(gameState.createdTrackIds, draft.trackId),
      titleRevealByTrackId: revealTitleFully(gameState.titleRevealByTrackId, draft.trackId),
      drafts: gameState.drafts.filter((item) => item.trackId !== draft.trackId),
      publishedTracks: upsertPublished(gameState.publishedTracks, published),
      publishedTrackIds: addUnique(gameState.publishedTrackIds, draft.trackId),
      groupMessages: [...gameState.groupMessages, ...groupPublishMessages(published)],
      stats: gameState.stats,
    };
    nextState = applyPerformanceDecision(nextState, 'publish', draft.bestGrade, includeWork, draft.trackId, draft.lastPerformance);
    nextState = finishDay(nextState, {
      publishedTrackId: draft.trackId,
      publishedQuality: draft.bestGrade,
    });
    nextState = triggerEchoAfterPublish(nextState, published);
    nextState = updateResonanceState(nextState, draft.bestAccuracy);
    nextState = applyResonanceEffects(nextState);
    nextState = updateEndingState(nextState);

    runStoryAction('track.published', nextState);
    queueStoryScene({ type: 'share', channel: 'chat', trackId: draft.trackId });
    if (gameState.publishedTrackIds.length < tracks.length && nextState.publishedTrackIds.length >= tracks.length) {
      queueStoryScene({ type: 'final.ready' });
      runStoryAction('story.finalSceneUnlocked', nextState);
    }
    if (nextState.stats.chatPressure >= 35) runStoryAction('neura.glitchSpike', nextState);
    showEnvironmentalEcho(nextState.echo.lastPhrase ? `Echo: ${nextState.echo.lastPhrase}` : 'Echo publikacji wraca przez EVENTS');
    commitDay(gameState, nextState, 'messenger');
    recordNeuraPresenceEvent('published');
    setMessengerTab('group');
  }

  function discardInitialResult() {
    if (!result) return;
    let nextState: GameState = {
      ...gameState,
      stats: applyStatsDelta(gameState.stats, getDecisionDelta('discard', result.grade, true)),
      dayCycle: {
        ...gameState.dayCycle,
        rejectedCount: gameState.dayCycle.rejectedCount + 1,
      },
    };
    nextState = finishDay(nextState);
    commitDay(gameState, nextState, 'messenger');
  }

  function discardDraft(draft: DraftTrack) {
    if (gameState.dayCycle.phase !== 'work') return;
    let nextState: GameState = {
      ...gameState,
      drafts: gameState.drafts.filter((item) => item.id !== draft.id),
      stats: applyStatsDelta(gameState.stats, getDecisionDelta('discard', draft.bestGrade, false)),
      dayCycle: {
        ...gameState.dayCycle,
        rejectedCount: gameState.dayCycle.rejectedCount + 1,
      },
    };
    nextState = finishDay(nextState);
    commitDay(gameState, nextState, 'me');
  }

  function cancelPendingWork(windowId: GameWindowId) {
    setGameState(cancelWork(gameState));
    returnToDesktop(windowId);
  }

  function openPlayer(published: PublishedTrack) {
    setSelectedPublishedId(published.id);
    setActiveWindow('player');
  }

  function applyDevOperation(operation: DevOperation) {
    if (!operation.success) return;
    const previousState = gameState;
    setGameState(operation.nextState);
    recordDayCycleEvents(previousState, operation.nextState);

    if (operation.events.includes('draft.saved')) {
      runStoryAction('draft.saved', operation.nextState);
      recordNeuraPresenceEvent('draftSaved');
    }
    if (operation.events.includes('draft.sentToPawel')) {
      runStoryAction('draft.sentToPawel', operation.nextState);
      recordNeuraPresenceEvent('sentToPawel');
    }
    if (operation.events.includes('draft.rejected')) {
      runStoryAction('draft.rejected', operation.nextState);
      recordNeuraPresenceEvent('draftRejected');
    }
    if (operation.events.includes('track.published')) {
      runStoryAction('track.published', operation.nextState);
      recordNeuraPresenceEvent('published');
    }
  }

  function triggerDevNeuraEvent(eventId: NeuraPresenceEventId) {
    recordNeuraPresenceEvent(eventId);
    runStoryAction(eventId as DialoguePresenceEventId, gameState);
  }

  return {
    sendCommunication,
    restForDay,
    continueAfterDaySummary,
    startCreate,
    startRemix,
    saveInitialDraft,
    overwriteDraft,
    sendDraftToPawel,
    publishInitialResult,
    publishDraft,
    discardInitialResult,
    discardDraft,
    cancelPendingWork,
    openPlayer,
    returnToDesktop,
    applyDevOperation,
    triggerDevNeuraEvent,
  };
}
