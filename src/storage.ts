import { initialGroupMessages, initialPawelMessages } from './data/messages.ts';
import { tracks } from './data/tracks.ts';
import { tierFromQualityProgress } from './rhythm.ts';
import type {
  ChatMessage,
  Difficulty,
  DraftTrack,
  EchoMessage,
  EchoState,
  EndingRoute,
  EndingState,
  GameState,
  NeuraEchoEffect,
  PerformanceResult,
  PublishedTrack,
  QualityTier,
  ResonanceLevel,
  ResonanceState,
  ResonanceVisualEffects,
  RhythmSummary,
  Stats,
} from './types';

const STORAGE_KEY = 'ustnik-2-state';

const initialStats: Stats = {
  performance: 8,
  cybart: 12,
  chatPressure: 18,
};

const defaultResonanceEffects: ResonanceVisualEffects = {
  bloom: 0,
  glitchIntensity: 0,
  uiHighlight: 0,
  timerScale: 1,
  comboBonus: 0,
};

const defaultEchoState: EchoState = {
  echoCount: 0,
  messages: [],
  lastPhrase: null,
  lastEffect: null,
  activeCutsceneId: null,
};

const defaultResonanceState: ResonanceState = {
  level: 'silent',
  score: 0,
  lastAccuracy: 0,
  bondWithNeura: 'distant',
  effects: defaultResonanceEffects,
};

const defaultEndingState: EndingState = {
  route: 'quietArchive',
  label: 'Ciche archiwum',
  influence: {
    performance: 0,
    chatPressure: 0,
    cybart: 0,
    echo: 0,
    resonance: 0,
    bond: 0,
  },
  updatedAt: null,
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
  echo: defaultEchoState,
  resonance: defaultResonanceState,
  ending: defaultEndingState,
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

export function getEchoState(state: Pick<GameState, 'echo'>): EchoState {
  return normalizeEchoState(state.echo);
}

type EchoMessageInput = Pick<EchoMessage, 'source' | 'phrase' | 'effect'> & Partial<Pick<
  EchoMessage,
  'id' | 'trackId' | 'decisionLabel' | 'count' | 'createdAt'
>>;

export function incrementEchoCount(state: GameState, message: EchoMessageInput): GameState {
  const echo = getEchoState(state);
  const count = echo.echoCount + 1;
  const nextMessage: EchoMessage = {
    id: message.id ?? createId('echo'),
    source: message.source,
    phrase: message.phrase,
    trackId: message.trackId,
    decisionLabel: message.decisionLabel,
    effect: message.effect,
    count,
    createdAt: message.createdAt ?? new Date().toISOString(),
  };

  return {
    ...state,
    echo: {
      echoCount: count,
      messages: [nextMessage, ...echo.messages].slice(0, 8),
      lastPhrase: nextMessage.phrase,
      lastEffect: nextMessage.effect,
      activeCutsceneId: nextMessage.effect === 'cutscene' ? 'events.echo.after-publish' : echo.activeCutsceneId,
    },
  };
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
    echo: normalizeEchoState(saved.echo),
    resonance: normalizeResonanceState(saved.resonance),
    ending: normalizeEndingState(saved.ending),
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

function normalizeEchoState(value: unknown): EchoState {
  if (!value || typeof value !== 'object') return defaultEchoState;
  const echo = value as Partial<EchoState>;
  const messages = Array.isArray(echo.messages)
    ? echo.messages
        .filter((message): message is EchoMessage => !!message && typeof message === 'object' && 'phrase' in message)
        .slice(0, 8)
    : [];

  return {
    echoCount: normalizeNumber(echo.echoCount, messages.length),
    messages,
    lastPhrase: typeof echo.lastPhrase === 'string' ? echo.lastPhrase : messages[0]?.phrase ?? null,
    lastEffect: normalizeEchoEffect(echo.lastEffect),
    activeCutsceneId: typeof echo.activeCutsceneId === 'string' ? echo.activeCutsceneId : null,
  };
}

function normalizeResonanceState(value: unknown): ResonanceState {
  if (!value || typeof value !== 'object') return defaultResonanceState;
  const resonance = value as Partial<ResonanceState>;
  return {
    level: normalizeResonanceLevel(resonance.level),
    score: normalizeNumber(resonance.score, 0),
    lastAccuracy: normalizeNumber(resonance.lastAccuracy, 0),
    bondWithNeura: ['distant', 'curious', 'attuned', 'merged'].includes(String(resonance.bondWithNeura))
      ? resonance.bondWithNeura as ResonanceState['bondWithNeura']
      : 'distant',
    effects: normalizeResonanceEffects(resonance.effects),
  };
}

function normalizeEndingState(value: unknown): EndingState {
  if (!value || typeof value !== 'object') return defaultEndingState;
  const ending = value as Partial<EndingState>;
  const route = normalizeEndingRoute(ending.route);
  return {
    ...defaultEndingState,
    ...ending,
    route,
    label: typeof ending.label === 'string' ? ending.label : defaultEndingState.label,
    influence: {
      ...defaultEndingState.influence,
      ...(ending.influence ?? {}),
    },
    updatedAt: typeof ending.updatedAt === 'string' ? ending.updatedAt : null,
  };
}

function normalizeResonanceEffects(value: unknown): ResonanceVisualEffects {
  if (!value || typeof value !== 'object') return defaultResonanceEffects;
  const effects = value as Partial<ResonanceVisualEffects>;
  return {
    bloom: normalizeNumber(effects.bloom, 0),
    glitchIntensity: normalizeNumber(effects.glitchIntensity, 0),
    uiHighlight: normalizeNumber(effects.uiHighlight, 0),
    timerScale: normalizeNumber(effects.timerScale, 1),
    comboBonus: normalizeNumber(effects.comboBonus, 0),
  };
}

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeEchoEffect(value: unknown): NeuraEchoEffect | null {
  return ['whisper', 'glitch', 'cutscene'].includes(String(value)) ? value as NeuraEchoEffect : null;
}

function normalizeResonanceLevel(value: unknown): ResonanceLevel {
  return ['silent', 'low', 'medium', 'high', 'overload'].includes(String(value)) ? value as ResonanceLevel : 'silent';
}

function normalizeEndingRoute(value: unknown): EndingRoute {
  return ['quietArchive', 'neuraBond', 'publicSpiral', 'offlineBreak'].includes(String(value))
    ? value as EndingRoute
    : 'quietArchive';
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}
