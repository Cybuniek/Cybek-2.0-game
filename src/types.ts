export type Difficulty = 'Latwy' | 'Normalny' | 'Cybart';

export type Track = {
  id: string;
  order: number;
  title: string;
  artist: string;
  bpm: number;
  mood: string;
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

export type PerformanceResult = {
  id: string;
  trackId: string;
  trackTitle: string;
  difficulty: Difficulty;
  accuracy: number;
  grade: string;
  createdAt: string;
  status: 'inDrawer' | 'sentToPawel' | 'published';
};

export type DraftTrack = {
  id: string;
  trackId: string;
  trackTitle: string;
  difficulty: Difficulty;
  bestAccuracy: number;
  bestGrade: string;
  status: 'inDrawer' | 'sentToPawel';
  updatedAt: string;
};

export type PublishedTrack = {
  id: string;
  trackId: string;
  trackTitle: string;
  difficulty: Difficulty;
  accuracy: number;
  grade: string;
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
