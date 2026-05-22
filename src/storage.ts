import { initialGroupMessages, initialPawelMessages } from './data/messages.ts';
import { tracks } from './data/tracks.ts';
import { tierFromQualityProgress } from './rhythm.ts';
import type { ChatMessage, Difficulty, DraftTrack, GameState, PerformanceResult, PublishedTrack, QualityTier, RhythmSummary, Stats } from './types';

const STORAGE_KEY = 'ustnik-2-state';

const initialStats: Stats = {
  performance: 8,
  cybart: 12,
  chatPressure: 18,
};

type RhythmResultCounters = Pick<PerformanceResult, 'perfectHits' | 'greatHits' | 'goodHits' | 'misses' | 'emptyPresses' | 'maxCombo' | 'totalNotes'>;
type LegacyPerformanceResult = Omit<PerformanceResult, 'status' | keyof RhythmResultCounters | 'qualityProgress' | 'comboMultiplier'> & Partial<RhythmResultCounters> & {
  status: PerformanceResult['status'] | 'drawer';
  qualityProgress?: number;
  comboMultiplier?: number;
};
type SavedDraft = LegacyPerformanceResult | DraftTrack;
const INITIAL_TITLE_REVEAL = 0.05;
const CORRUPTED_CHARACTERS = ['#', '%', '&', '?', '@', 'X', '+', '=', '*', '~'];

export const defaultState: GameState = {
  saveVersion: 1,
  stats: initialStats,
  createdTrackIds: [],
  titleRevealByTrackId: {},
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
    return migrateSavedState(JSON.parse(raw));
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

export function maskTrackTitle(title: string, reveal = INITIAL_TITLE_REVEAL, seed = title, corruptionTick = 0) {
  const normalizedReveal = Math.max(INITIAL_TITLE_REVEAL, Math.min(1, reveal));
  const revealableIndexes = Array.from(title)
    .map((character, index) => (/[\p{L}\p{N}]/u.test(character) ? index : -1))
    .filter((index) => index >= 0);
  const visibleCount = Math.max(1, Math.ceil(revealableIndexes.length * normalizedReveal));
  const visibleIndexes = new Set(
    [...revealableIndexes]
      .sort((left, right) => stableRandom(`${seed}:visible:${left}`) - stableRandom(`${seed}:visible:${right}`))
      .slice(0, visibleCount),
  );

  return Array.from(title)
    .map((character, index) => {
      if (!/[\p{L}\p{N}]/u.test(character)) return character;
      return visibleIndexes.has(index) ? character : corruptedCharacter(seed, index, corruptionTick);
    })
    .join('');
}

export function getTitleReveal(
  titleRevealByTrackId: GameState['titleRevealByTrackId'],
  trackId: string,
  isPublished = false,
) {
  if (isPublished) return 1;
  return titleRevealByTrackId[trackId] ?? INITIAL_TITLE_REVEAL;
}

export function revealTitleByAccuracy(
  titleRevealByTrackId: GameState['titleRevealByTrackId'],
  trackId: string,
  accuracy: number,
) {
  const current = getTitleReveal(titleRevealByTrackId, trackId);
  return {
    ...titleRevealByTrackId,
    [trackId]: Math.min(1, current + accuracy / 420),
  };
}

export function revealTitleFully(
  titleRevealByTrackId: GameState['titleRevealByTrackId'],
  trackId: string,
) {
  return {
    ...titleRevealByTrackId,
    [trackId]: 1,
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
    qualityProgress: result.qualityProgress,
    status,
    updatedAt: new Date().toISOString(),
  };
}

export function improveDraftWithResult(draft: DraftTrack, result: PerformanceResult): DraftTrack {
  const qualityProgress = draft.qualityProgress + result.qualityProgress;

  return {
    ...draft,
    difficulty: result.difficulty,
    bestAccuracy: Math.max(draft.bestAccuracy, result.accuracy),
    bestGrade: tierFromQualityProgress(qualityProgress),
    qualityProgress,
    status: 'inDrawer',
    updatedAt: new Date().toISOString(),
  };
}

export function getNextDifficulty(trackId: string, difficulty: Difficulty): Difficulty | null {
  const track = tracks.find((item) => item.id === trackId);
  if (!track) return null;

  const currentIndex = track.difficulties.indexOf(difficulty);
  if (currentIndex === -1) return null;

  return track.difficulties[currentIndex + 1] ?? null;
}

export function getPublishedQuality(tier: QualityTier): PublishedTrack['quality'] {
  if (tier === 'S' || tier === 'A') return 'cudenko';
  if (tier === 'B' || tier === 'C') return 'lepsza wersja';
  return 'slaba wersja';
}

export function createPublishedTrack(draft: DraftTrack): PublishedTrack {
  return {
    id: draft.trackId,
    trackId: draft.trackId,
    trackTitle: draft.trackTitle,
    difficulty: draft.difficulty,
    accuracy: draft.bestAccuracy,
    grade: draft.bestGrade,
    qualityProgress: draft.qualityProgress,
    quality: getPublishedQuality(draft.bestGrade),
    publishedAt: new Date().toISOString(),
  };
}

export function migrateSavedState(saved: unknown): GameState {
  if (!saved || typeof saved !== 'object') return defaultState;
  return migrateState(saved as Partial<Omit<GameState, 'drafts' | 'publishedTracks'>> & {
    drafts?: SavedDraft[];
    drawer?: LegacyPerformanceResult[];
    publishedTracks?: PublishedTrack[];
  });
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
          bestGrade: normalizeTier(item.bestGrade),
          qualityProgress: item.qualityProgress ?? estimateLegacyProgress(item.bestAccuracy),
        };
      }

      return createDraftFromResult(
        {
          ...item,
          status: item.status === 'sentToPawel' ? 'sentToPawel' : 'inDrawer',
          grade: normalizeTier(item.grade),
          qualityProgress: item.qualityProgress ?? estimateLegacyProgress(item.accuracy),
          comboMultiplier: item.comboMultiplier ?? 1,
          perfectHits: item.perfectHits ?? 0,
          greatHits: item.greatHits ?? 0,
          goodHits: item.goodHits ?? 0,
          misses: item.misses ?? 0,
          emptyPresses: item.emptyPresses ?? 0,
          maxCombo: item.maxCombo ?? 0,
          totalNotes: item.totalNotes ?? 0,
        },
        item.status === 'sentToPawel' ? 'sentToPawel' : 'inDrawer',
      );
    });

  const publishedTracks = (saved.publishedTracks ?? []).map((item) => {
    const grade = normalizeTier(item.grade);
    return {
      ...item,
      grade,
      qualityProgress: item.qualityProgress ?? estimateLegacyProgress(item.accuracy),
      quality: item.quality ?? getPublishedQuality(grade),
    };
  });
  const publishedTrackIds = saved.publishedTrackIds ?? publishedTracks.map((item) => item.trackId);
  const titleRevealByTrackId = {
    ...(saved.titleRevealByTrackId ?? {}),
    ...Object.fromEntries(publishedTrackIds.map((trackId) => [trackId, 1])),
  };
  const createdTrackIds = Array.from(
    new Set([...(saved.createdTrackIds ?? []), ...drafts.map((item) => item.trackId), ...publishedTrackIds]),
  );

  return {
    ...defaultState,
    ...saved,
    saveVersion: 1,
    createdTrackIds,
    titleRevealByTrackId,
    drafts,
    publishedTracks,
    publishedTrackIds,
  };
}

function corruptedCharacter(seed: string, index: number, corruptionTick: number) {
  const characterIndex = Math.floor(stableRandom(`${seed}:mask:${index}:${corruptionTick}`) * CORRUPTED_CHARACTERS.length);
  return CORRUPTED_CHARACTERS[characterIndex] ?? '#';
}

function stableRandom(source: string) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function estimateLegacyProgress(accuracy: number) {
  return Math.round(Math.max(0, Math.min(100, accuracy)));
}

function normalizeTier(value: string): QualityTier {
  if (['F', 'E', 'D', 'C', 'B', 'A', 'S'].includes(value)) return value as QualityTier;
  return 'C';
}
