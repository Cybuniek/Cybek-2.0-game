import type { Difficulty, RhythmBeatmap, RhythmLane, RhythmNote, RhythmSummary, Track } from './types';

export const RHYTHM_LANES: RhythmLane[] = ['S', 'D', 'J', 'K'];
export const RHYTHM_DURATION_MS = 60000;
export const PERFECT_WINDOW_MS = 60;
export const GOOD_WINDOW_MS = 130;
export const MISS_WINDOW_MS = 170;
export const RHYTHM_HIT_LINE_PERCENT = 82;

type DifficultyConfig = {
  density: number;
  doubleChance: number;
  travelMs: number;
};

const difficultyConfig: Record<Difficulty, DifficultyConfig> = {
  Łatwy: { density: 0.44, doubleChance: 0, travelMs: 1750 },
  Normalny: { density: 0.62, doubleChance: 0.06, travelMs: 1400 },
  Cybart: { density: 0.78, doubleChance: 0.14, travelMs: 1120 },
};

export type RhythmJudgement = 'perfect' | 'good' | 'miss' | 'empty';

export type RuntimeRhythmNote = RhythmNote & {
  judged: boolean;
  judgement?: Exclude<RhythmJudgement, 'empty'>;
};

export type VisibleRhythmNote = RuntimeRhythmNote & {
  timeToHitMs: number;
  yPercent: number;
};

export type RhythmSession = {
  beatmap: RhythmBeatmap;
  difficulty: Difficulty;
  elapsedMs: number;
  travelMs: number;
  notes: RuntimeRhythmNote[];
  perfectHits: number;
  goodHits: number;
  misses: number;
  combo: number;
  maxCombo: number;
  isFinished: boolean;
  lastJudgement: RhythmJudgement | null;
  lastLane: RhythmLane | null;
};

export function getRhythmDifficultyConfig(difficulty: Difficulty) {
  return difficultyConfig[difficulty];
}

export function buildRhythmBeatmap(track: Track, difficulty: Difficulty): RhythmBeatmap {
  const config = difficultyConfig[difficulty];
  const beatMs = 60000 / track.bpm;
  const random = createRandom(hashSeed(track.beatmapSeed, track.id, difficulty, track.bpm));
  const notes: RhythmNote[] = [];
  const lastLaneTimes = new Map<RhythmLane, number>();
  const firstNoteMs = 1000;
  const lastNoteMs = RHYTHM_DURATION_MS - 850;

  for (let timeMs = firstNoteMs, beatIndex = 0; timeMs <= lastNoteMs; timeMs += beatMs, beatIndex += 1) {
    const shouldPlace = random() < config.density || beatIndex % 8 === 0;
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
    durationMs: RHYTHM_DURATION_MS,
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
    goodHits: 0,
    misses: 0,
    combo: 0,
    maxCombo: 0,
    isFinished: false,
    lastJudgement: null,
    lastLane: null,
  };
}

export function stepRhythmSession(session: RhythmSession, deltaMs: number): RhythmSession {
  if (session.isFinished) return session;

  const elapsedMs = Math.min(session.beatmap.durationMs, session.elapsedMs + Math.max(0, deltaMs));
  const stepped = markMissedNotes({ ...session, elapsedMs });
  return elapsedMs >= session.beatmap.durationMs ? finishRhythmSession(stepped) : stepped;
}

export function hitRhythmLane(session: RhythmSession, lane: RhythmLane): RhythmSession {
  if (session.isFinished) return session;

  const candidateIndex = findBestCandidate(session, lane);
  if (candidateIndex === -1) {
    return { ...session, lastJudgement: 'empty', lastLane: lane };
  }

  const note = session.notes[candidateIndex];
  const offsetMs = Math.abs(session.elapsedMs - note.timeMs);
  const judgement: Exclude<RhythmJudgement, 'empty'> = offsetMs <= PERFECT_WINDOW_MS ? 'perfect' : 'good';
  const nextCombo = session.combo + 1;
  const notes = session.notes.map((item, index) =>
    index === candidateIndex ? { ...item, judged: true, judgement } : item,
  );

  return {
    ...session,
    notes,
    perfectHits: session.perfectHits + (judgement === 'perfect' ? 1 : 0),
    goodHits: session.goodHits + (judgement === 'good' ? 1 : 0),
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
  const accuracy = totalNotes === 0
    ? 0
    : Math.round(((session.perfectHits + session.goodHits * 0.65) / totalNotes) * 100);

  return {
    accuracy,
    grade: gradeFromAccuracy(accuracy),
    perfectHits: session.perfectHits,
    goodHits: session.goodHits,
    misses: session.misses,
    maxCombo: session.maxCombo,
    totalNotes,
  };
}

export function getVisibleRhythmNotes(session: RhythmSession): VisibleRhythmNote[] {
  return session.notes
    .filter((note) => !note.judged)
    .map((note) => {
      const timeToHitMs = note.timeMs - session.elapsedMs;
      const progress = 1 - timeToHitMs / session.travelMs;
      return {
        ...note,
        timeToHitMs: Math.round(timeToHitMs),
        yPercent: clamp(progress * RHYTHM_HIT_LINE_PERCENT, 0, 96),
      };
    })
    .filter((note) => note.timeToHitMs <= session.travelMs && note.timeToHitMs >= -MISS_WINDOW_MS)
    .sort((left, right) => left.timeMs - right.timeMs);
}

export function gradeFromAccuracy(accuracy: number) {
  if (accuracy > 92) return 'S';
  if (accuracy > 84) return 'A';
  if (accuracy > 74) return 'B';
  return 'C';
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
    if (offset <= GOOD_WINDOW_MS && offset < candidateOffset) {
      candidateIndex = index;
      candidateOffset = offset;
    }
  });

  return candidateIndex;
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

function hashSeed(baseSeed: number, trackId: string, difficulty: Difficulty, bpm: number) {
  let hash = (baseSeed ^ bpm) >>> 0;
  const source = `${trackId}:${difficulty}:${bpm}`;

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
