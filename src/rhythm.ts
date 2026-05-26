import manualBeatmaps from './data/manualBeatmaps.json' with { type: 'json' };
import type {
  Difficulty,
  QualityTier,
  RhythmBeatmap,
  RhythmLane,
  RhythmNote,
  RhythmNoteKind,
  RhythmSummary,
  Track,
} from './types';

export const RHYTHM_LANES: RhythmLane[] = ['S', 'D', 'K', 'L'];
export const FALLBACK_BEATS_PER_TRACK = 96;
export const PERFECT_WINDOW_MS = 45;
export const GREAT_WINDOW_MS = 85;
export const GOOD_WINDOW_MS = 130;
export const MISS_WINDOW_MS = 170;
export const LATE_HIT_GRACE_MS = 35;
export const MISS_FADE_MS = 620;
export const EMPTY_PRESS_GRACE_COUNT = 2;
export const EMPTY_PRESS_SPAM_WINDOW_MS = 1000;
export const RHYTHM_HIT_LINE_PERCENT = 82;
export const MIN_LONG_NOTE_DURATION_MS = 240;
export const HOLD_MAX_PRESS_GAP_MS = 220;
export const RHYTHM_NOTE_FALL_SPEED_SCALE = 2.5;
export const HIT_NOTE_FADE_MS = 160;

type HitJudgement = 'perfect' | 'great' | 'good';

type DifficultyConfig = {
  densityMultiplier: number;
  doubleChance: number;
  holdChance: number;
  travelMs: number;
  qualityMultiplier: number;
};

type ManualBeatmapCatalog = {
  schemaVersion?: number;
  tracks?: Record<string, Partial<Record<Difficulty, RhythmBeatmap>>>;
};

export const difficultyConfig: Record<Difficulty, DifficultyConfig> = {
  Łatwy: {
    densityMultiplier: 0.5,
    doubleChance: 0,
    holdChance: 0.08,
    travelMs: 1750,
    qualityMultiplier: 0.85,
  },
  Normalny: {
    densityMultiplier: 0.7,
    doubleChance: 0.06,
    holdChance: 0.12,
    travelMs: 1400,
    qualityMultiplier: 1,
  },
  Cybart: {
    densityMultiplier: 1,
    doubleChance: 0.14,
    holdChance: 0.16,
    travelMs: 1120,
    qualityMultiplier: 1.15,
  },
};

export type RhythmJudgement = 'perfect' | 'great' | 'good' | 'too_fast' | 'too_late' | 'miss' | 'empty';

export type RuntimeRhythmNote = RhythmNote & {
  judged: boolean;
  judgement?: Exclude<RhythmJudgement, 'empty'>;
  resolvedAtMs?: number;
  startedAtMs?: number;
  releasedAtMs?: number;
  startJudgement?: HitJudgement;
  presses?: number;
  lastHoldPressMs?: number;
};

export type VisibleRhythmNote = RuntimeRhythmNote & {
  timeToHitMs: number;
  endTimeToHitMs: number;
  yPercent: number;
  visualTopPercent: number;
  durationPercent: number;
  holdProgress: number;
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

const defaultManualBeatmaps = manualBeatmaps as ManualBeatmapCatalog;

export function getRhythmDifficultyConfig(difficulty: Difficulty) {
  return difficultyConfig[difficulty];
}

export function estimateRhythmDurationMs(track: Pick<Track, 'bpm' | 'durationMs'>) {
  return track.durationMs ?? Math.round((FALLBACK_BEATS_PER_TRACK * 60000) / track.bpm);
}

export function resolveRhythmBeatmap(
  track: Track,
  difficulty: Difficulty,
  durationMs = estimateRhythmDurationMs(track),
  catalog: ManualBeatmapCatalog = defaultManualBeatmaps,
): RhythmBeatmap {
  const manual = catalog.tracks?.[track.id]?.[difficulty];
  const normalized = normalizeManualBeatmap(manual, track, difficulty, durationMs);

  return normalized ?? buildRhythmBeatmap(track, difficulty, durationMs);
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
  const blockedLaneUntil = new Map<RhythmLane, number>();
  const firstNoteMs = 1000;
  const lastNoteMs = Math.max(firstNoteMs, durationMs - 850);

  for (let timeMs = firstNoteMs, beatIndex = 0; timeMs <= lastNoteMs; timeMs += beatMs, beatIndex += 1) {
    const shouldPlace = random() < config.densityMultiplier || beatIndex % 8 === 0;
    if (!shouldPlace) continue;

    const lane = pickLane(random, blockedLaneUntil, timeMs);
    const note = createGeneratedNote(track.id, difficulty, beatIndex, lane, timeMs, beatMs, random, config);
    notes.push(note);
    blockedLaneUntil.set(lane, getRhythmNoteEndMs(note) + GOOD_WINDOW_MS);

    if (config.doubleChance > 0 && getRhythmNoteKind(note) === 'tap' && random() < config.doubleChance) {
      const secondLane = pickLane(random, blockedLaneUntil, timeMs, lane);
      const secondNote = createTapNote(track.id, difficulty, beatIndex, secondLane, timeMs + 8);
      notes.push(secondNote);
      blockedLaneUntil.set(secondLane, getRhythmNoteEndMs(secondNote) + GOOD_WINDOW_MS);
    }
  }

  return {
    trackId: track.id,
    bpm: track.bpm,
    sourceStartMs: 0,
    sourceEndMs: durationMs,
    audioDurationMs: durationMs,
    durationMs,
    source: 'generated',
    notes: notes.sort(compareNotes),
  };
}

export function createRhythmSession(beatmap: RhythmBeatmap, difficulty: Difficulty): RhythmSession {
  const baseTravelMs = difficultyConfig[difficulty].travelMs;
  const scaledTravelMs = Math.max(320, Math.round(baseTravelMs / RHYTHM_NOTE_FALL_SPEED_SCALE));
  return {
    beatmap,
    difficulty,
    elapsedMs: 0,
    travelMs: scaledTravelMs,
    notes: beatmap.notes.map((note) => ({ ...normalizeNoteShape(note), judged: false })),
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
  const synced = { ...session, elapsedMs: nextElapsedMs };
  const completed = finishCompletedLongNotes(synced);
  const stepped = markMissedNotes(completed);
  return nextElapsedMs >= session.beatmap.durationMs ? finishRhythmSession(stepped) : stepped;
}

export function hitRhythmLane(session: RhythmSession, lane: RhythmLane): RhythmSession {
  if (session.isFinished) return session;

  const holdIndex = findActiveHoldCandidate(session, lane);
  if (holdIndex !== -1) {
    return recordHoldPress(session, holdIndex, lane);
  }

  const candidateIndex = findBestStartCandidate(session, lane);
  if (candidateIndex === -1) {
    return recordEmptyPress(session, lane);
  }

  const note = session.notes[candidateIndex];
  const signedOffsetMs = getInputAdjustedElapsedMs(session) - note.timeMs;
  const judgement = judgementFromOffset(signedOffsetMs);

  if (judgement === 'too_fast' || judgement === 'too_late') {
    return {
      ...session,
      combo: 0,
      lastJudgement: judgement,
      lastLane: lane,
    };
  }

  if (getRhythmNoteKind(note) === 'tap') {
    return settleNote(session, candidateIndex, judgement, lane);
  }

  const notes = session.notes.map((item, index) =>
    index === candidateIndex
      ? {
          ...item,
          startedAtMs: session.elapsedMs,
          startJudgement: judgement,
          presses: getRhythmNoteKind(item) === 'hold' ? 1 : item.presses,
          lastHoldPressMs: getRhythmNoteKind(item) === 'hold' ? session.elapsedMs : item.lastHoldPressMs,
        }
      : item,
  );

  return {
    ...session,
    notes,
    emptyPressStreak: 0,
    lastJudgement: judgement,
    lastLane: lane,
  };
}

export function holdRhythmLane(session: RhythmSession, lane: RhythmLane): RhythmSession {
  if (session.isFinished || findActiveHoldCandidate(session, lane) !== -1) return session;

  const candidateIndex = findBestHoldStartCandidate(session, lane);
  if (candidateIndex === -1) return session;

  const note = session.notes[candidateIndex];
  const judgement = judgementFromOffset(getInputAdjustedElapsedMs(session) - note.timeMs);
  if (judgement === 'too_fast' || judgement === 'too_late') return session;

  const notes = session.notes.map((item, index) =>
    index === candidateIndex
      ? {
          ...item,
          startedAtMs: session.elapsedMs,
          startJudgement: judgement,
        }
      : item,
  );

  return {
    ...session,
    notes,
    emptyPressStreak: 0,
    lastJudgement: judgement,
    lastLane: lane,
  };
}

export function releaseRhythmLane(session: RhythmSession, lane: RhythmLane): RhythmSession {
  if (session.isFinished) return session;

  const holdIndex = findActiveHoldCandidate(session, lane);
  if (holdIndex === -1) return session;

  return finishHoldNote(session, holdIndex, session.elapsedMs, lane);
}

export function finishRhythmSession(session: RhythmSession): RhythmSession {
  let nextSession = finishAllActiveLongNotes({ ...session, elapsedMs: session.beatmap.durationMs });

  for (let index = 0; index < nextSession.notes.length; index += 1) {
    const note = nextSession.notes[index];
    if (!note.judged) nextSession = settleNote(nextSession, index, 'miss', note.lane);
  }

  return {
    ...nextSession,
    elapsedMs: session.beatmap.durationMs,
    combo: 0,
    isFinished: true,
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
    .filter((note) => {
      if (!note.judged) return true;
      if (note.judgement === 'miss') return session.elapsedMs - note.timeMs <= MISS_FADE_MS;
      if ((note.judgement === 'perfect' || note.judgement === 'great' || note.judgement === 'good') && note.resolvedAtMs !== undefined) {
        return session.elapsedMs - note.resolvedAtMs <= HIT_NOTE_FADE_MS;
      }
      return false;
    })
    .map((note) => {
      const timeToHitMs = note.timeMs - session.elapsedMs;
      const endTimeToHitMs = getRhythmNoteEndMs(note) - session.elapsedMs;
      const progress = 1 - timeToHitMs / session.travelMs;
      const lateMs = Math.max(0, session.elapsedMs - note.timeMs);
      const missProgress = note.judgement === 'miss' ? lateMs / MISS_FADE_MS : 0;
      const durationPercent = isLongNote(note)
        ? clamp((getRhythmNoteDurationMs(note) / session.travelMs) * RHYTHM_HIT_LINE_PERCENT, 6, 90)
        : 0;
      const yPercent = progress * RHYTHM_HIT_LINE_PERCENT + missProgress * 20;
      const visualTopPercent = isLongNote(note) ? yPercent - durationPercent : yPercent;

      const hitFadeProgress = note.judgement !== 'miss' && note.resolvedAtMs !== undefined
        ? clamp((session.elapsedMs - note.resolvedAtMs) / HIT_NOTE_FADE_MS, 0, 1)
        : 0;
      return {
        ...note,
        timeToHitMs: Math.round(timeToHitMs),
        endTimeToHitMs: Math.round(endTimeToHitMs),
        yPercent,
        visualTopPercent: roundTo(visualTopPercent, 2),
        durationPercent: roundTo(durationPercent, 2),
        holdProgress: getRhythmNoteKind(note) === 'hold' ? getHoldPulseHealth(note, session.elapsedMs) : 0,
        opacity: note.judgement === 'miss' ? roundTo(1 - missProgress, 2) : roundTo(1 - hitFadeProgress, 2),
      };
    })
    .filter((note) => {
      const lowerBound = isLongNote(note) && note.judgement !== 'miss' ? note.endTimeToHitMs : note.timeToHitMs;
      return note.timeToHitMs <= session.travelMs && lowerBound >= -MISS_FADE_MS;
    })
    .sort((left, right) => left.timeMs - right.timeMs);
}

export function getRhythmNoteKind(note: Pick<RhythmNote, 'kind'>): RhythmNoteKind {
  return note.kind ?? 'tap';
}

export function getRhythmNoteDurationMs(note: Pick<RhythmNote, 'kind' | 'durationMs'>): number {
  return isLongNote(note) ? Math.max(MIN_LONG_NOTE_DURATION_MS, Math.round(note.durationMs ?? 0)) : 0;
}

export function getRhythmNoteEndMs(note: Pick<RhythmNote, 'kind' | 'timeMs' | 'durationMs'>): number {
  return Math.round(note.timeMs + getRhythmNoteDurationMs(note));
}

export function getHoldRequiredPresses(note: Pick<RhythmNote, 'kind' | 'durationMs' | 'requiredPresses'>): number {
  if (getRhythmNoteKind(note) !== 'hold') return 0;
  return Math.max(2, Math.round(note.requiredPresses ?? Math.ceil(getRhythmNoteDurationMs(note) / 240)));
}

export function rhythmTickToMs(tick: number, bpm: number, ticksPerBeat = 4, startOffsetMs = 0): number {
  const beatMs = 60000 / bpm;
  return Math.round(startOffsetMs + (tick * beatMs) / Math.max(1, ticksPerBeat));
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

function normalizeManualBeatmap(
  beatmap: RhythmBeatmap | undefined,
  track: Track,
  difficulty: Difficulty,
  fallbackDurationMs: number,
): RhythmBeatmap | null {
  if (!beatmap || beatmap.trackId !== track.id || !Array.isArray(beatmap.notes)) return null;

  const audioDurationMs = Math.max(1, Math.round(fallbackDurationMs));
  const sourceStartMs = isPositiveNumber(beatmap.sourceStartMs) ? Math.round(beatmap.sourceStartMs) : 0;
  const sourceEndMs = isPositiveNumber(beatmap.sourceEndMs)
    ? Math.round(beatmap.sourceEndMs)
    : audioDurationMs;
  if (sourceEndMs <= sourceStartMs || sourceEndMs > audioDurationMs + MISS_FADE_MS) return null;

  const hasExplicitRange = isPositiveNumber(beatmap.sourceStartMs) || isPositiveNumber(beatmap.sourceEndMs);
  const legacyDurationMs = isPositiveNumber(beatmap.durationMs) ? Math.round(beatmap.durationMs) : audioDurationMs;
  const durationMs = hasExplicitRange ? sourceEndMs - sourceStartMs : Math.max(legacyDurationMs, audioDurationMs);
  const bpm = isPositiveNumber(beatmap.bpm) ? Math.round(beatmap.bpm) : track.bpm;
  const notes: RhythmNote[] = [];

  for (let index = 0; index < beatmap.notes.length; index += 1) {
    const normalized = normalizeManualNote(beatmap.notes[index], track, difficulty, durationMs, index, bpm, beatmap.startOffsetMs ?? 0, beatmap.ticksPerBeat ?? 4);
    if (!normalized) return null;
    notes.push(normalized);
  }

  return {
    trackId: track.id,
    bpm,
    sourceStartMs,
    sourceEndMs: hasExplicitRange ? sourceEndMs : sourceStartMs + durationMs,
    audioDurationMs,
    durationMs,
    source: 'manual',
    inputOffsetMs: Number.isFinite(beatmap.inputOffsetMs) ? Math.round(beatmap.inputOffsetMs ?? 0) : undefined,
    markers: beatmap.markers?.map((marker) => ({ ...marker })),
    notes: notes.sort(compareNotes),
  };
}

function normalizeManualNote(
  note: RhythmNote,
  track: Track,
  difficulty: Difficulty,
  beatmapDurationMs: number,
  index: number,
  bpm: number,
  startOffsetMs: number,
  ticksPerBeatDefault: number,
): RhythmNote | null {
  if (!note || !RHYTHM_LANES.includes(note.lane)) return null;
  const ticksPerBeat = Math.max(1, Math.round(ticksPerBeatDefault));
  const tickMs = isPositiveNumber(note.tick) ? rhythmTickToMs(note.tick, bpm, ticksPerBeat, startOffsetMs) : null;
  if (!isPositiveNumber(note.timeMs) && tickMs === null) return null;

  const kind = getRhythmNoteKind(note);
  if (!['tap', 'hold'].includes(kind)) return null;

  const timeMs = tickMs ?? Math.round(note.timeMs);
  if (timeMs > beatmapDurationMs) return null;

  const normalized: RhythmNote = {
    id: typeof note.id === 'string' && note.id.trim().length > 0
      ? note.id
      : `${track.id}-${difficulty}-manual-${index}`,
    lane: note.lane,
    timeMs,
  };

  if (kind !== 'tap') {
    if (!isPositiveNumber(note.durationMs)) return null;
    normalized.kind = kind;
    const durationMs = isPositiveNumber(note.holdTicks)
      ? rhythmTickToMs(note.holdTicks, bpm, ticksPerBeat, 0)
      : Math.round(note.durationMs);
    normalized.durationMs = Math.max(MIN_LONG_NOTE_DURATION_MS, durationMs);
    if (timeMs + normalized.durationMs > beatmapDurationMs + MISS_FADE_MS) return null;
  }

  if (kind === 'hold' && note.requiredPresses !== undefined) {
    normalized.requiredPresses = Math.max(2, Math.round(note.requiredPresses));
  }

  return normalized;
}

function normalizeNoteShape(note: RhythmNote): RhythmNote {
  const kind = getRhythmNoteKind(note);
  if (kind === 'tap') return { id: note.id, lane: note.lane, timeMs: Math.round(note.timeMs) };

  const normalized: RhythmNote = {
    id: note.id,
    lane: note.lane,
    timeMs: Math.round(note.timeMs),
    kind,
    durationMs: getRhythmNoteDurationMs(note),
  };

  if (kind === 'hold' && note.requiredPresses !== undefined) {
    normalized.requiredPresses = getHoldRequiredPresses(note);
  }

  return normalized;
}

function finishCompletedLongNotes(session: RhythmSession): RhythmSession {
  let nextSession = session;

  for (let index = 0; index < nextSession.notes.length; index += 1) {
    const note = nextSession.notes[index];
    if (note.judged || note.startedAtMs === undefined || !isLongNote(note)) continue;
    if (nextSession.elapsedMs < getRhythmNoteEndMs(note)) continue;

    nextSession = finishHoldNote(nextSession, index, getRhythmNoteEndMs(note), note.lane);
  }

  return nextSession;
}

function finishAllActiveLongNotes(session: RhythmSession): RhythmSession {
  let nextSession = session;

  for (let index = 0; index < nextSession.notes.length; index += 1) {
    const note = nextSession.notes[index];
    if (note.judged || note.startedAtMs === undefined || !isLongNote(note)) continue;

    nextSession = finishHoldNote(nextSession, index, Math.min(session.elapsedMs, getRhythmNoteEndMs(note)), note.lane);
  }

  return nextSession;
}

function finishHoldNote(session: RhythmSession, noteIndex: number, releaseAtMs: number, lane: RhythmLane): RhythmSession {
  const note = session.notes[noteIndex];
  const durationMs = getRhythmNoteDurationMs(note);
  const completionRatio = clamp((releaseAtMs - note.timeMs) / durationMs, 0, 1);
  const startJudgement = note.startJudgement ?? 'good';
  const requiredPresses = note.requiredPresses ?? 0;
  const pressJudgement = requiredPresses > 1 && (note.presses ?? 0) < requiredPresses
    ? degradeJudgement(startJudgement)
    : startJudgement;
  const judgement = holdJudgementFromCompletion(pressJudgement, completionRatio);

  return settleNote(
    {
      ...session,
      notes: session.notes.map((item, index) =>
        index === noteIndex ? { ...item, releasedAtMs: releaseAtMs } : item,
      ),
    },
    noteIndex,
    judgement,
    lane,
  );
}

function holdJudgementFromCompletion(startJudgement: HitJudgement, completionRatio: number): HitJudgement | 'miss' {
  if (completionRatio < 0.35) return 'miss';
  if (completionRatio < 0.75) return 'good';
  if (completionRatio < 0.92) return degradeJudgement(startJudgement);
  return startJudgement;
}

function markMissedNotes(session: RhythmSession): RhythmSession {
  let nextSession = session;

  for (let index = 0; index < nextSession.notes.length; index += 1) {
    const note = nextSession.notes[index];
    if (note.judged || note.startedAtMs !== undefined || nextSession.elapsedMs - note.timeMs <= MISS_WINDOW_MS + LATE_HIT_GRACE_MS) continue;
    nextSession = settleNote(nextSession, index, 'miss', note.lane);
  }

  for (let index = 0; index < nextSession.notes.length; index += 1) {
    const note = nextSession.notes[index];
    if (
      note.judged
      || note.startedAtMs === undefined
      || getRhythmNoteKind(note) !== 'hold'
      || (note.requiredPresses ?? 0) < 2
      || nextSession.elapsedMs >= getRhythmNoteEndMs(note)
      || !holdHadGap(note, nextSession.elapsedMs)
    ) {
      continue;
    }

    nextSession = settleNote(nextSession, index, 'miss', note.lane);
  }

  return nextSession;
}

function settleNote(
  session: RhythmSession,
  noteIndex: number,
  judgement: HitJudgement | 'miss',
  lane: RhythmLane,
): RhythmSession {
  const note = session.notes[noteIndex];
  if (!note || note.judged) return session;

  const notes = session.notes.map((item, index) =>
    index === noteIndex
      ? {
          ...item,
          judged: true,
          judgement,
          resolvedAtMs: judgement === 'miss' ? item.resolvedAtMs : session.elapsedMs,
        }
      : item,
  );

  if (judgement === 'miss') {
    return {
      ...session,
      notes,
      misses: session.misses + 1,
      combo: 0,
      lastJudgement: 'miss',
      lastLane: lane,
    };
  }

  const nextCombo = session.combo + 1;

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

function findBestStartCandidate(session: RhythmSession, lane: RhythmLane) {
  let candidateIndex = -1;
  let candidateOffset = Number.POSITIVE_INFINITY;

  session.notes.forEach((note, index) => {
    if (note.judged || note.startedAtMs !== undefined || note.lane !== lane) return;

    const signedOffset = getInputAdjustedElapsedMs(session) - note.timeMs;
    const lowerBound = -MISS_WINDOW_MS;
    const upperBound = MISS_WINDOW_MS + LATE_HIT_GRACE_MS;
    const offset = Math.abs(signedOffset);
    if (signedOffset >= lowerBound && signedOffset <= upperBound && offset < candidateOffset) {
      candidateIndex = index;
      candidateOffset = offset;
    }
  });

  return candidateIndex;
}

function findBestHoldStartCandidate(session: RhythmSession, lane: RhythmLane) {
  let candidateIndex = -1;
  let candidateOffset = Number.POSITIVE_INFINITY;

  session.notes.forEach((note, index) => {
    if (
      note.judged
      || note.startedAtMs !== undefined
      || note.lane !== lane
      || getRhythmNoteKind(note) !== 'hold'
    ) {
      return;
    }

    const signedOffset = getInputAdjustedElapsedMs(session) - note.timeMs;
    const lowerBound = -MISS_WINDOW_MS;
    const upperBound = MISS_WINDOW_MS + LATE_HIT_GRACE_MS;
    const offset = Math.abs(signedOffset);
    if (signedOffset >= lowerBound && signedOffset <= upperBound && offset < candidateOffset) {
      candidateIndex = index;
      candidateOffset = offset;
    }
  });

  return candidateIndex;
}

function findActiveHoldCandidate(session: RhythmSession, lane: RhythmLane) {
  return session.notes.findIndex((note) =>
    !note.judged
    && note.startedAtMs !== undefined
    && note.lane === lane
    && getRhythmNoteKind(note) === 'hold'
    && session.elapsedMs <= getRhythmNoteEndMs(note),
  );
}

function recordHoldPress(session: RhythmSession, noteIndex: number, lane: RhythmLane): RhythmSession {
  const notes = session.notes.map((note, index) =>
    index === noteIndex ? { ...note, presses: (note.presses ?? 0) + 1, lastHoldPressMs: session.elapsedMs } : note,
  );

  return {
    ...session,
    notes,
    emptyPressStreak: 0,
    lastJudgement: 'good',
    lastLane: lane,
  };
}

function judgementFromOffset(signedOffsetMs: number): Exclude<RhythmJudgement, 'empty' | 'miss'> {
  const offsetMs = Math.abs(signedOffsetMs);
  if (offsetMs <= PERFECT_WINDOW_MS) return 'perfect';
  if (offsetMs <= GREAT_WINDOW_MS) return 'great';
  if (offsetMs <= GOOD_WINDOW_MS) return 'good';
  if (signedOffsetMs > GOOD_WINDOW_MS && signedOffsetMs <= GOOD_WINDOW_MS + LATE_HIT_GRACE_MS) return 'good';
  return signedOffsetMs < 0 ? 'too_fast' : 'too_late';
}

function getInputAdjustedElapsedMs(session: RhythmSession): number {
  return session.elapsedMs + Math.round(session.beatmap.inputOffsetMs ?? 0);
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

function createGeneratedNote(
  trackId: string,
  difficulty: Difficulty,
  beatIndex: number,
  lane: RhythmLane,
  timeMs: number,
  beatMs: number,
  random: () => number,
  config: DifficultyConfig,
): RhythmNote {
  const kind = pickNoteKind(random, config);
  if (kind === 'hold') {
    const durationMs = Math.round(beatMs * (random() < 0.4 ? 1.5 : 2));
    return {
      id: `${trackId}-${difficulty}-${beatIndex}-${lane}-hold-${Math.round(timeMs)}`,
      lane,
      timeMs: Math.round(timeMs),
      kind,
      durationMs,
    };
  }

  return createTapNote(trackId, difficulty, beatIndex, lane, timeMs);
}

function createTapNote(trackId: string, difficulty: Difficulty, beatIndex: number, lane: RhythmLane, timeMs: number): RhythmNote {
  return {
    id: `${trackId}-${difficulty}-${beatIndex}-${lane}-${Math.round(timeMs)}`,
    lane,
    timeMs: Math.round(timeMs),
  };
}

function pickNoteKind(random: () => number, config: DifficultyConfig): RhythmNoteKind {
  const roll = random();
  if (roll < config.holdChance) return 'hold';
  return 'tap';
}

function pickLane(
  random: () => number,
  blockedLaneUntil: Map<RhythmLane, number>,
  timeMs: number,
  blockedLane?: RhythmLane,
) {
  const startIndex = Math.floor(random() * RHYTHM_LANES.length);

  for (let offset = 0; offset < RHYTHM_LANES.length; offset += 1) {
    const lane = RHYTHM_LANES[(startIndex + offset) % RHYTHM_LANES.length];
    const blockedUntil = blockedLaneUntil.get(lane) ?? -Infinity;
    if (lane !== blockedLane && timeMs - blockedUntil > GOOD_WINDOW_MS * 2) return lane;
  }

  return RHYTHM_LANES[startIndex];
}

function compareNotes(left: RhythmNote, right: RhythmNote) {
  return left.timeMs - right.timeMs || left.lane.localeCompare(right.lane);
}

function degradeJudgement(judgement: HitJudgement): HitJudgement {
  if (judgement === 'perfect') return 'great';
  return 'good';
}

function holdHadGap(note: RuntimeRhythmNote, elapsedMs: number): boolean {
  const lastPressMs = note.lastHoldPressMs ?? note.startedAtMs ?? note.timeMs;
  return elapsedMs - lastPressMs > HOLD_MAX_PRESS_GAP_MS;
}

function getHoldPulseHealth(note: RuntimeRhythmNote, elapsedMs: number): number {
  if (note.startedAtMs === undefined || note.judged || (note.requiredPresses ?? 0) < 2) return 0;

  const lastPressMs = note.lastHoldPressMs ?? note.startedAtMs;
  return clamp(1 - (elapsedMs - lastPressMs) / HOLD_MAX_PRESS_GAP_MS, 0, 1);
}

function isLongNote(note: Pick<RhythmNote, 'kind'>): boolean {
  const kind = getRhythmNoteKind(note);
  return kind === 'hold';
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
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
