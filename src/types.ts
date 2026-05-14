export type Difficulty = 'Łatwy' | 'Normalny' | 'Cybart';

export type RhythmLane = 'S' | 'D' | 'K' | 'L';
export type QualityTier = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type RhythmNoteKind = 'tap' | 'hold' | 'smash';

export type RhythmNote = {
  id: string;
  lane: RhythmLane;
  timeMs: number;
  kind?: RhythmNoteKind;
  durationMs?: number;
  requiredPresses?: number;
};

export type RhythmBeatmap = {
  trackId: string;
  bpm: number;
  sourceStartMs?: number;
  sourceEndMs?: number;
  audioDurationMs?: number;
  durationMs: number;
  source?: 'manual' | 'generated';
  notes: RhythmNote[];
};

export type RhythmSummary = {
  accuracy: number;
  grade: QualityTier;
  qualityProgress: number;
  comboMultiplier: number;
  perfectHits: number;
  greatHits: number;
  goodHits: number;
  misses: number;
  emptyPresses: number;
  maxCombo: number;
  totalNotes: number;
};

export type Track = {
  id: string;
  order: number;
  title: string;
  artist: string;
  bpm: number;
  durationMs?: number;
  mood: string;
  beatmapSeed: number;
  audioFolder?: string;
  audioTitle?: string;
  difficulties: Difficulty[];
  audio: {
    instrumental: string;
    vocals: string;
    merged: string;
  };
};

export type ChatMessage = {
  author: string;
  text: string;
};

export type PerformanceResult = RhythmSummary & {
  id: string;
  trackId: string;
  trackTitle: string;
  difficulty: Difficulty;
  createdAt: string;
  status: 'inDrawer' | 'sentToPawel' | 'published';
};

export type DraftTrack = {
  id: string;
  trackId: string;
  trackTitle: string;
  difficulty: Difficulty;
  bestAccuracy: number;
  bestGrade: QualityTier;
  qualityProgress: number;
  status: 'inDrawer' | 'sentToPawel';
  updatedAt: string;
};

export type PublishedTrack = {
  id: string;
  trackId: string;
  trackTitle: string;
  difficulty: Difficulty;
  accuracy: number;
  grade: QualityTier;
  qualityProgress: number;
  quality: 'slaba wersja' | 'lepsza wersja' | 'cudenko';
  publishedAt: string;
};

export type Stats = {
  performance: number;
  cybart: number;
  chatPressure: number;
};

export type GameState = {
  saveVersion: 1;
  stats: Stats;
  createdTrackIds: string[];
  titleRevealByTrackId: Record<string, number>;
  drafts: DraftTrack[];
  publishedTracks: PublishedTrack[];
  publishedTrackIds: string[];
  pawelMessages: ChatMessage[];
  groupMessages: ChatMessage[];
};
