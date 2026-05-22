import { defaultState } from '../src/storage.ts';
import { neuraVoiceLinesV2 } from '../src/data/dialogue/neuraVoiceLines.ts';
import type { DialogueContext, GameState, NeuraPresenceEventId, NeuraVoiceDirectorState } from '../src/data/dialogue/dialogueTypes.ts';
import {
  createDefaultNeuraVoiceDirectorState,
  createPresenceStateFromGameState,
  createVoiceQueueItemsFromEvent,
  getNextNeuraVoiceLine,
  markVoiceLinePlayed,
} from '../src/neura/NeuraVoiceDirector.ts';
import { loadNeuraVoiceDirectorState, saveNeuraVoiceDirectorState } from '../src/neura/neuraVoiceDirectorStorage.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function createContext(
  gameState: GameState,
  eventId: NeuraPresenceEventId | null = null,
  now = 1_000_000,
): DialogueContext {
  return {
    gameState,
    presence: createPresenceStateFromGameState(gameState, { lastPresenceEventId: eventId }),
    now,
  };
}

function withPublishedCount(gameState: GameState, count: number): GameState {
  const publishedTracks = Array.from({ length: count }, (_, index) => ({
    id: `pub-${index}`,
    trackId: `track-${index}`,
    trackTitle: `Track ${index}`,
    difficulty: 'Łatwy' as const,
    accuracy: 80,
    grade: 'B' as const,
    qualityProgress: 70,
    quality: 'lepsza wersja' as const,
    publishedAt: new Date().toISOString(),
  }));
  return {
    ...gameState,
    publishedTracks,
    publishedTrackIds: publishedTracks.map((item) => item.trackId),
  };
}

function withStats(gameState: GameState, performance: number, cybart: number, chatPressure: number): GameState {
  return {
    ...gameState,
    stats: { performance, cybart, chatPressure },
  };
}

// 1) critical wygrywa z ambient
{
  let state = createDefaultNeuraVoiceDirectorState();
  const gameState = withPublishedCount(withStats(defaultState, 60, 60, 45), 2);
  const context = createContext(gameState, 'story.finalSceneUnlocked');
  state = createVoiceQueueItemsFromEvent(state, { eventId: 'story.finalSceneUnlocked', context }).state;
  const next = getNextNeuraVoiceLine(state, context);
  assertEqual(next.line?.priority, 'critical', 'critical ma pierwszeństwo nad ambient');
}

// 2) checkpointy w kolejności priorytetów
{
  let state = createDefaultNeuraVoiceDirectorState();
  const gameState = withPublishedCount(withStats(defaultState, 60, 60, 45), 2);
  const context = createContext(gameState, 'story.finalSceneUnlocked');
  state = createVoiceQueueItemsFromEvent(state, { eventId: 'story.finalSceneUnlocked', context }).state;

  const first = getNextNeuraVoiceLine(state, context).line;
  assertEqual(first?.id, 'final-001-window', 'pierwsza linia finalna to critical');
  state = markVoiceLinePlayed(state, { lineId: first!.id, playedAt: context.now });

  const second = getNextNeuraVoiceLine(state, { ...context, now: context.now + 20_000 }).line;
  assertEqual(second?.id, 'final-002-incident', 'druga linia finalna to main');
  state = markVoiceLinePlayed(state, { lineId: second!.id, playedAt: context.now + 20_000 });

  const third = getNextNeuraVoiceLine(state, { ...context, now: context.now + 40_000 }).line;
  assertEqual(third?.id, 'final-003-quiet', 'trzecia linia finalna to milestone');
}

// 3) requiredOnce nie gra drugi raz
{
  let state = createDefaultNeuraVoiceDirectorState();
  const gameState = withPublishedCount(withStats(defaultState, 60, 60, 45), 2);
  const context = createContext(gameState, 'story.finalSceneUnlocked');
  state = createVoiceQueueItemsFromEvent(state, { eventId: 'story.finalSceneUnlocked', context }).state;

  state = markVoiceLinePlayed(state, { lineId: 'final-001-window', playedAt: context.now });
  const next = getNextNeuraVoiceLine(state, { ...context, now: context.now + 10_000 }).line;
  assert(next?.id !== 'final-001-window', 'requiredOnce nie powinien wrócić po odtworzeniu');
}

// 4) ambient blokowany przez cooldown
{
  let state = createDefaultNeuraVoiceDirectorState();
  const gameState = withStats(defaultState, 20, 20, 20);
  const context = createContext(gameState, null);
  const ambient = neuraVoiceLinesV2.find((line) => line.id === 'prologue-001-widget');
  assert(!!ambient, 'linia ambient istnieje');
  state = markVoiceLinePlayed(state, { lineId: ambient.id, playedAt: context.now });
  const next = getNextNeuraVoiceLine(state, { ...context, now: context.now + 1_000 });
  assertEqual(next.line, null, 'ambient nie gra przed upływem cooldownu');
}

// 5) minOperationalPowerLevel: 2 blokuje na poziomie 1
{
  const weakGame = withStats(defaultState, 10, 10, 10);
  const context = createContext(weakGame, 'track.published');
  let state = createDefaultNeuraVoiceDirectorState();
  state = createVoiceQueueItemsFromEvent(state, { eventId: 'track.published', context }).state;
  const next = getNextNeuraVoiceLine(state, context).line;
  assert(next?.id !== 'late-001-publish', 'linia z minOperationalPowerLevel 2 nie może wejść na poziomie 1');
}

// 6) błędny localStorage -> fallback default
{
  const store = new Map<string, string>();
  const localStorageStub = {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
  (globalThis as { window: { localStorage: typeof localStorageStub } }).window = { localStorage: localStorageStub };

  saveNeuraVoiceDirectorState(createDefaultNeuraVoiceDirectorState(), 'test.neura.state');
  localStorageStub.setItem('test.neura.state', '{bad-json');
  const loaded = loadNeuraVoiceDirectorState('test.neura.state');
  assertEqual(loaded.version, 1, 'fallback po błędnym JSON daje stan domyślny');
  assertEqual(loaded.queue.length, 0, 'fallback po błędnym JSON czyści kolejkę');
}

// 7) event tylko kolejkuje linię, nie odtwarza audio
{
  let state: NeuraVoiceDirectorState = createDefaultNeuraVoiceDirectorState();
  const gameState = withPublishedCount(withStats(defaultState, 60, 60, 45), 2);
  const context = createContext(gameState, 'story.finalSceneUnlocked');
  const queued = createVoiceQueueItemsFromEvent(state, { eventId: 'story.finalSceneUnlocked', context });
  state = queued.state;
  assert(state.queue.length > 0, 'event powinien dodać wpisy do kolejki');
  const wasPlayed = state.history.byLineId['final-001-window']?.playCount ?? 0;
  assertEqual(wasPlayed, 0, 'event nie odtwarza linii bezpośrednio');
}
