import type { Difficulty, QualityTier, RhythmBeatmap, RhythmLane, RhythmNote, RhythmSummary, Track } from './types';

export const RHYTHM_LANES: RhythmLane[] = ['S', 'D', 'K', 'L'];
export const FALLBACK_BEATS_PER_TRACK = 96;
export const PERFECT_WINDOW_MS = 45;
export const GREAT_WINDOW_MS = 85;
export const GOOD_WINDOW_MS = 130;
export const MISS_WINDOW_MS = 170;
export const MISS_FADE_MS = 620;
export const EMPTY_PRESS_GRACE_COUNT = 2;
export const EMPTY_PRESS_SPAM_WINDOW_MS = 1000;
export const RHYTHM_HIT_LINE_PERCENT = 82;

type DifficultyConfig = {
  densityMultiplier: number;
  doubleChance: number;
  travelMs: number;
  qualityMultiplier: number;
};

export const difficultyConfig: Record<Difficulty, DifficultyConfig> = {
  Łatwy: { densityMultiplier: 0.5, doubleChance: 0, travelMs: 1750, qualityMultiplier: 0.85 },
  Normalny: { densityMultiplier: 0.7, doubleChance: 0.06, travelMs: 1400, qualityMultiplier: 1 },
  Cybart: { densityMultiplier: 1, doubleChance: 0.14, travelMs: 1120, qualityMultiplier: 1.15 },
};

export type RhythmJudgement = 'perfect' | 'great' | 'good' | 'too_fast' | 'too_late' | 'miss' | 'empty';

export type RuntimeRhythmNote = RhythmNote & {
  judged: boolean;
  judgement?: Exclude<RhythmJudgement, 'empty'>;
};

export type VisibleRhythmNote = RuntimeRhythmNote & {
  timeToHitMs: number;
  yPercent: number;
  opacity: number;
};

export type RhythmSession = {
  beatmap: RhythmBeatmap;
  difficulty: Difficulty;
  elapsedMs: number;
  travelMs: number;
  notes: RuntimeRhythmNote[];
  perfectHits: number;
  greatHits: number;
  goodHits: number;
  misses: number;
  emptyPresses: number;
  emptyPressStreak: number;
  lastEmptyPressMs: number;
  combo: number;
  maxCombo: number;
  isFinished: boolean;
  lastJudgement: RhythmJudgement | null;
  lastLane: RhythmLane | null;
};

export function getRhythmDifficultyConfig(difficulty: Difficulty) {
  return difficultyConfig[difficulty];
}

export function estimateRhythmDurationMs(track: Pick<Track, 'bpm' | 'durationMs'>) {
  return track.durationMs ?? Math.round((FALLBACK_BEATS_PER_TRACK * 60000) / track.bpm);
}

export function buildRhythmBeatmap(
  track: Track,
  difficulty: Difficulty,
  durationMs = estimateRhythmDurationMs(track),
): RhythmBeatmap {
  const config = difficultyConfig[difficulty];
  const beatMs = 60000 / track.bpm;
  const random = createRandom(hashSeed(track.beatmapSeed, track.id, difficulty, track.bpm, durationMs));
  const notes: RhythmNote[] = [];
  const lastLaneTimes = new Map<RhythmLane, number>();
  const firstNoteMs = 1000;
  const lastNoteMs = Math.max(firstNoteMs, durationMs - 850);

  for (let timeMs = firstNoteMs, beatIndex = 0; timeMs <= lastNoteMs; timeMs += beatMs, beatIndex += 1) {
    const shouldPlace = random() < config.densityMultiplier || beatIndex % 8 === 0;
    if (!shouldPlace) continue;

    const lane = pickLane(random, lastLaneTimes, timeMs);
    notes.push(createNote(track.id, difficulty, beatIndex, lane, timeMs));
    lastLaneTimes.set(lane, timeMs);

    if (config.doubleChance > 0 && random() < config.doubleChance) {
      const secondLane = pickLane(random, lastLaneTimes, timeMs, lane);
      notes.push(createNote(track.id, difficulty, beatIndex, secondLane, timeMs + 8));
      lastLaneTimes.set(secondLane, timeMs);
    }
  }

  return {
    trackId: track.id,
    bpm: track.bpm,
    durationMs,
    notes: notes.sort((left, right) => left.timeMs - right.timeMs || left.lane.localeCompare(right.lane)),
  };
}

export function createRhythmSession(beatmap: RhythmBeatmap, difficulty: Difficulty): RhythmSession {
  return {
    beatmap,
    difficulty,
    elapsedMs: 0,
    travelMs: difficultyConfig[difficulty].travelMs,
    notes: beatmap.notes.map((note) => ({ ...note, judged: false })),
    perfectHits: 0,
    greatHits: 0,
    goodHits: 0,
    misses: 0,
    emptyPresses: 0,
    emptyPressStreak: 0,
    lastEmptyPressMs: -Infinity,
    combo: 0,
    maxCombo: 0,
    isFinished: false,
    lastJudgement: null,
    lastLane: null,
  };
}

export function stepRhythmSession(session: RhythmSession, deltaMs: number): RhythmSession {
  if (session.isFinished) return session;

  return syncRhythmSessionToElapsed(session, session.elapsedMs + Math.max(0, deltaMs));
}

export function syncRhythmSessionToElapsed(session: RhythmSession, elapsedMs: number): RhythmSession {
  if (session.isFinished) return session;

  const nextElapsedMs = Math.min(session.beatmap.durationMs, Math.max(session.elapsedMs, elapsedMs, 0));
  const stepped = markMissedNotes({ ...session, elapsedMs: nextElapsedMs });
  return nextElapsedMs >= session.beatmap.durationMs ? finishRhythmSession(stepped) : stepped;
}

export function hitRhythmLane(session: RhythmSession, lane: RhythmLane): RhythmSession {
  if (session.isFinished) return session;

  const candidateIndex = findBestCandidate(session, lane);
  if (candidateIndex === -1) {
    return recordEmptyPress(session, lane);
  }

  const note = session.notes[candidateIndex];
  const signedOffsetMs = session.elapsedMs - note.timeMs;
  const offsetMs = Math.abs(signedOffsetMs);
  const judgement = judgementFromOffset(signedOffsetMs);

  if (judgement === 'too_fast' || judgement === 'too_late') {
    return {
      ...session,
      combo: 0,
      lastJudgement: judgement,
      lastLane: lane,
    };
  }

  const nextCombo = session.combo + 1;
  const notes = session.notes.map((item, index) =>
    index === candidateIndex ? { ...item, judged: true, judgement } : item,
  );

  return {
    ...session,
    notes,
    perfectHits: session.perfectHits + (judgement === 'perfect' ? 1 : 0),
    greatHits: session.greatHits + (judgement === 'great' ? 1 : 0),
    goodHits: session.goodHits + (judgement === 'good' ? 1 : 0),
    emptyPressStreak: 0,
    combo: nextCombo,
    maxCombo: Math.max(session.maxCombo, nextCombo),
    lastJudgement: judgement,
    lastLane: lane,
  };
}

export function finishRhythmSession(session: RhythmSession): RhythmSession {
  const remainingMisses = session.notes.filter((note) => !note.judged).length;

  return {
    ...session,
    elapsedMs: session.beatmap.durationMs,
    notes: session.notes.map((note) => (note.judged ? note : { ...note, judged: true, judgement: 'miss' })),
    misses: session.misses + remainingMisses,
    combo: 0,
    isFinished: true,
    lastJudgement: remainingMisses > 0 ? 'miss' : session.lastJudgement,
  };
}

export function getRhythmSummary(session: RhythmSession): RhythmSummary {
  const totalNotes = session.notes.length;
  const rawAccuracy = totalNotes === 0
    ? 0
    : ((session.perfectHits + session.greatHits * 0.85 + session.goodHits * 0.65) / totalNotes) * 100;
  const comboRatio = totalNotes === 0 ? 0 : session.maxCombo / totalNotes;
  const comboMultiplier = roundTo(1 + Math.min(0.5, comboRatio * 0.5), 2);
  const difficultyMultiplier = difficultyConfig[session.difficulty].qualityMultiplier;
  const qualityProgress = Math.round(rawAccuracy * difficultyMultiplier * comboMultiplier);
  const accuracy = totalNotes === 0
    ? 0
    : Math.round(rawAccuracy);

  return {
    accuracy,
    grade: tierFromQualityProgress(qualityProgress),
    qualityProgress,
    comboMultiplier,
    perfectHits: session.perfectHits,
    greatHits: session.greatHits,
    goodHits: session.goodHits,
    misses: session.misses,
    emptyPresses: session.emptyPresses,
    maxCombo: session.maxCombo,
    totalNotes,
  };
}

export function getVisibleRhythmNotes(session: RhythmSession): VisibleRhythmNote[] {
  return session.notes
    .filter((note) => !note.judged || (note.judgement === 'miss' && session.elapsedMs - note.timeMs <= MISS_FADE_MS))
    .map((note) => {
      const timeToHitMs = note.timeMs - session.elapsedMs;
      const progress = 1 - timeToHitMs / session.travelMs;
      const lateMs = Math.max(0, session.elapsedMs - note.timeMs);
      const missProgress = note.judgement === 'miss' ? lateMs / MISS_FADE_MS : 0;
      return {
        ...note,
        timeToHitMs: Math.round(timeToHitMs),
        yPercent: clamp(progress * RHYTHM_HIT_LINE_PERCENT + missProgress * 20, 0, 104),
        opacity: note.judgement === 'miss' ? roundTo(1 - missProgress, 2) : 1,
      };
    })
    .filter((note) => note.timeToHitMs <= session.travelMs && note.timeToHitMs >= -MISS_FADE_MS)
    .sort((left, right) => left.timeMs - right.timeMs);
}

export function tierFromQualityProgress(progress: number): QualityTier {
  if (progress >= 540) return 'S';
  if (progress >= 400) return 'A';
  if (progress >= 280) return 'B';
  if (progress >= 160) return 'C';
  if (progress >= 90) return 'D';
  if (progress >= 30) return 'E';
  return 'F';
}

function markMissedNotes(session: RhythmSession): RhythmSession {
  let missed = 0;
  const notes = session.notes.map((note) => {
    if (note.judged || session.elapsedMs - note.timeMs <= MISS_WINDOW_MS) return note;
    missed += 1;
    return { ...note, judged: true, judgement: 'miss' as const };
  });

  if (missed === 0) return session;

  return {
    ...session,
    notes,
    misses: session.misses + missed,
    combo: 0,
    lastJudgement: 'miss',
  };
}

function findBestCandidate(session: RhythmSession, lane: RhythmLane) {
  let candidateIndex = -1;
  let candidateOffset = Number.POSITIVE_INFINITY;

  session.notes.forEach((note, index) => {
    if (note.judged || note.lane !== lane) return;

    const offset = Math.abs(session.elapsedMs - note.timeMs);
    if (offset <= MISS_WINDOW_MS && offset < candidateOffset) {
      candidateIndex = index;
      candidateOffset = offset;
    }
  });

  return candidateIndex;
}

function judgementFromOffset(signedOffsetMs: number): Exclude<RhythmJudgement, 'empty' | 'miss'> {
  const offsetMs = Math.abs(signedOffsetMs);
  if (offsetMs <= PERFECT_WINDOW_MS) return 'perfect';
  if (offsetMs <= GREAT_WINDOW_MS) return 'great';
  if (offsetMs <= GOOD_WINDOW_MS) return 'good';
  return signedOffsetMs < 0 ? 'too_fast' : 'too_late';
}

function recordEmptyPress(session: RhythmSession, lane: RhythmLane): RhythmSession {
  const isSpamWindow = session.elapsedMs - session.lastEmptyPressMs <= EMPTY_PRESS_SPAM_WINDOW_MS;
  const emptyPressStreak = isSpamWindow ? session.emptyPressStreak + 1 : 1;

  return {
    ...session,
    emptyPresses: session.emptyPresses + 1,
    emptyPressStreak,
    lastEmptyPressMs: session.elapsedMs,
    combo: emptyPressStreak > EMPTY_PRESS_GRACE_COUNT ? 0 : session.combo,
    lastJudgement: 'empty',
    lastLane: lane,
  };
}

function createNote(trackId: string, difficulty: Difficulty, beatIndex: number, lane: RhythmLane, timeMs: number): RhythmNote {
  return {
    id: `${trackId}-${difficulty}-${beatIndex}-${lane}-${Math.round(timeMs)}`,
    lane,
    timeMs: Math.round(timeMs),
  };
}

function pickLane(
  random: () => number,
  lastLaneTimes: Map<RhythmLane, number>,
  timeMs: number,
  blockedLane?: RhythmLane,
) {
  const startIndex = Math.floor(random() * RHYTHM_LANES.length);

  for (let offset = 0; offset < RHYTHM_LANES.length; offset += 1) {
    const lane = RHYTHM_LANES[(startIndex + offset) % RHYTHM_LANES.length];
    const lastTime = lastLaneTimes.get(lane) ?? -Infinity;
    if (lane !== blockedLane && timeMs - lastTime > GOOD_WINDOW_MS * 2) return lane;
  }

  return RHYTHM_LANES[startIndex];
}

function hashSeed(baseSeed: number, trackId: string, difficulty: Difficulty, bpm: number, durationMs: number) {
  let hash = (baseSeed ^ bpm ^ durationMs) >>> 0;
  const source = `${trackId}:${difficulty}:${bpm}:${durationMs}`;

  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 2654435761) >>> 0;
  }

  return hash || 1;
}

function createRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
