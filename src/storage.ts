import { initialGroupMessages, initialPawelMessages } from './data/messages';
import { tracks } from './data/tracks';
import type { ChatMessage, Difficulty, DraftTrack, GameState, PerformanceResult, PublishedTrack, RhythmSummary, Stats } from './types';

const STORAGE_KEY = 'ustnik-2-state';

const initialStats: Stats = {
  performance: 8,
  cybart: 12,
  chatPressure: 18,
};

type RhythmResultCounters = Pick<PerformanceResult, 'perfectHits' | 'goodHits' | 'misses' | 'maxCombo' | 'totalNotes'>;
type LegacyPerformanceResult = Omit<PerformanceResult, 'status' | keyof RhythmResultCounters> & Partial<RhythmResultCounters> & {
  status: PerformanceResult['status'] | 'drawer';
};
type SavedDraft = LegacyPerformanceResult | DraftTrack;

export const defaultState: GameState = {
  saveVersion: 1,
  stats: initialStats,
  createdTrackIds: [],
  drafts: [],
  publishedTracks: [],
  publishedTrackIds: [],
  pawelMessages: initialPawelMessages,
  groupMessages: initialGroupMessages,
};

export function loadState(): GameState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState;

  try {
    return migrateState(JSON.parse(raw));
  } catch {
    return defaultState;
  }
}

export function saveState(state: GameState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clampStat(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function addMessage(messages: ChatMessage[], author: string, text: string) {
  return [...messages, { author, text }];
}

export function getStatDelta(
  result: PerformanceResult,
  action: 'saveDraft' | 'sendToPawel' | 'publish',
): Partial<Stats> {
  const difficultyBonus = result.difficulty === 'Cybart' ? 1.5 : result.difficulty === 'Normalny' ? 1.2 : 1;
  const accuracyFactor = result.accuracy / 100;

  if (action === 'saveDraft') {
    return { chatPressure: Math.max(1, Math.round((1 + (1 - accuracyFactor) * 2) * difficultyBonus)) };
  }

  if (action === 'sendToPawel') {
    return { chatPressure: Math.max(2, Math.round((5 - accuracyFactor * 2) * difficultyBonus)) };
  }

  return {
    performance: Math.round((5 + accuracyFactor * 8) * difficultyBonus),
    cybart: Math.round((3 + accuracyFactor * 7) * difficultyBonus),
    chatPressure: Math.round((8 + (1 - accuracyFactor) * 8) * difficultyBonus),
  };
}

export function applyStatDelta(stats: Stats, delta: Partial<Stats>): Stats {
  return {
    performance: clampStat(stats.performance + (delta.performance ?? 0)),
    cybart: clampStat(stats.cybart + (delta.cybart ?? 0)),
    chatPressure: clampStat(stats.chatPressure + (delta.chatPressure ?? 0)),
  };
}

export function createResult(
  trackId: string,
  trackTitle: string,
  difficulty: PerformanceResult['difficulty'],
  summary: RhythmSummary,
): PerformanceResult {
  return {
    id: crypto.randomUUID(),
    trackId,
    trackTitle,
    difficulty,
    ...summary,
    createdAt: new Date().toISOString(),
    status: 'inDrawer',
  };
}

export function createDraftFromResult(result: PerformanceResult, status: DraftTrack['status']): DraftTrack {
  return {
    id: result.trackId,
    trackId: result.trackId,
    trackTitle: result.trackTitle,
    difficulty: result.difficulty,
    bestAccuracy: result.accuracy,
    bestGrade: result.grade,
    status,
    updatedAt: new Date().toISOString(),
  };
}

export function getNextDifficulty(trackId: string, difficulty: Difficulty): Difficulty | null {
  const track = tracks.find((item) => item.id === trackId);
  if (!track) return null;

  const currentIndex = track.difficulties.indexOf(difficulty);
  return track.difficulties[currentIndex + 1] ?? null;
}

export function getPublishedQuality(trackId: string, difficulty: Difficulty): PublishedTrack['quality'] {
  const track = tracks.find((item) => item.id === trackId);
  const index = track?.difficulties.indexOf(difficulty) ?? 0;
  const lastIndex = Math.max(0, (track?.difficulties.length ?? 1) - 1);

  if (index <= 0) return 'slaba wersja';
  if (index >= lastIndex) return 'cudenko';
  return 'lepsza wersja';
}

export function createPublishedTrack(draft: DraftTrack): PublishedTrack {
  return {
    id: draft.trackId,
    trackId: draft.trackId,
    trackTitle: draft.trackTitle,
    difficulty: draft.difficulty,
    accuracy: draft.bestAccuracy,
    grade: draft.bestGrade,
    quality: getPublishedQuality(draft.trackId, draft.difficulty),
    publishedAt: new Date().toISOString(),
  };
}

function migrateState(
  saved: Partial<Omit<GameState, 'drafts' | 'publishedTracks'>> & {
    drafts?: SavedDraft[];
    drawer?: LegacyPerformanceResult[];
    publishedTracks?: PublishedTrack[];
  },
): GameState {
  const legacyDrafts = saved.drafts ?? saved.drawer ?? [];
  const drafts: DraftTrack[] = legacyDrafts
    .filter((item) => item.status !== 'published')
    .map((item) => {
      if ('bestAccuracy' in item) {
        return {
          ...item,
          status: item.status === 'sentToPawel' ? 'sentToPawel' : 'inDrawer',
        };
      }

      return createDraftFromResult(
        {
          ...item,
          status: item.status === 'sentToPawel' ? 'sentToPawel' : 'inDrawer',
          perfectHits: item.perfectHits ?? 0,
          goodHits: item.goodHits ?? 0,
          misses: item.misses ?? 0,
          maxCombo: item.maxCombo ?? 0,
          totalNotes: item.totalNotes ?? 0,
        },
        item.status === 'sentToPawel' ? 'sentToPawel' : 'inDrawer',
      );
    });

  const publishedTracks = saved.publishedTracks ?? [];
  const publishedTrackIds = saved.publishedTrackIds ?? publishedTracks.map((item) => item.trackId);
  const createdTrackIds = Array.from(
    new Set([...(saved.createdTrackIds ?? []), ...drafts.map((item) => item.trackId), ...publishedTrackIds]),
  );

  return {
    ...defaultState,
    ...saved,
    saveVersion: 1,
    createdTrackIds,
    drafts,
    publishedTracks,
    publishedTrackIds,
  };
}
