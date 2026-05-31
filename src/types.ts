export type Difficulty = 'Łatwy' | 'Normalny' | 'Cybart';

export type RhythmLane = 'S' | 'D' | 'K' | 'L';
export type QualityTier = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type RhythmNoteKind = 'tap' | 'hold';
export type OperationalPowerLevel = 0 | 1 | 2 | 3 | 4;
export type NeuraEchoEffect = 'whisper' | 'glitch' | 'cutscene';
export type ResonanceLevel = 'silent' | 'low' | 'medium' | 'high' | 'overload';
export type BondWithNeura = 'distant' | 'curious' | 'attuned' | 'merged';
export type EndingRoute = 'quietArchive' | 'neuraBond' | 'publicSpiral' | 'offlineBreak';
export type NeuraPresenceEventId =
  | 'boot'
  | 'draftSaved'
  | 'sentToPawel'
  | 'published'
  | 'rhythmStarted'
  | 'rhythmFinished'
  | 'manualReaction'
  | 'idlePulse'
  | 'debugSetPower';

export type NeuraPresenceEvent = {
  id: NeuraPresenceEventId;
  powerLevel?: OperationalPowerLevel | null;
};

export type NeuraPresenceEventLogEntry = {
  id: NeuraPresenceEventId;
  at: string;
};

export type NeuraPresenceState = {
  powerLevel: OperationalPowerLevel;
  glitchIntensity: number;
  ambientDepth: number;
  avatarInstability: number;
  uiAutonomy: number;
  lastEventId: NeuraPresenceEventId;
  debugOverride: OperationalPowerLevel | null;
  lowFxMode: boolean;
  narrativeTag: string;
  eventLog: NeuraPresenceEventLogEntry[];
};

export type EchoMessage = {
  id: string;
  source: 'decision' | 'publish' | 'ambient';
  phrase: string;
  trackId?: string;
  decisionLabel?: string;
  effect: NeuraEchoEffect;
  count: number;
  createdAt: string;
};

export type EchoState = {
  echoCount: number;
  messages: EchoMessage[];
  lastPhrase: string | null;
  lastEffect: NeuraEchoEffect | null;
  activeCutsceneId: string | null;
};

export type ResonanceVisualEffects = {
  bloom: number;
  glitchIntensity: number;
  uiHighlight: number;
  timerScale: number;
  comboBonus: number;
};

export type NeuraResonanceEffect = {
  level: ResonanceLevel;
  label: string;
  effects: ResonanceVisualEffects;
};

export type ResonanceState = {
  level: ResonanceLevel;
  score: number;
  lastAccuracy: number;
  bondWithNeura: BondWithNeura;
  effects: ResonanceVisualEffects;
};

export type EndingState = {
  route: EndingRoute;
  label: string;
  influence: {
    performance: number;
    chatPressure: number;
    cybart: number;
    echo: number;
    resonance: number;
    bond: number;
  };
  updatedAt: string | null;
};

export type RhythmNote = {
  id: string;
  lane: RhythmLane;
  timeMs: number;
  tick?: number;
  holdTicks?: number;
  kind?: RhythmNoteKind;
  durationMs?: number;
  requiredPresses?: number;
};

export type RhythmMarker = {
  id: string;
  timeMs: number;
  label: string;
  note?: string;
};

export type RhythmBeatmap = {
  trackId: string;
  bpm: number;
  beatUnit?: number;
  ticksPerBeat?: number;
  inputOffsetMs?: number;
  startOffsetMs?: number;
  checkpointEveryTicks?: number;
  sourceStartMs?: number;
  sourceEndMs?: number;
  audioDurationMs?: number;
  durationMs: number;
  source?: 'manual' | 'generated';
  notes: RhythmNote[];
  markers?: RhythmMarker[];
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
  echo: EchoState;
  resonance: ResonanceState;
  ending: EndingState;
  createdTrackIds: string[];
  titleRevealByTrackId: Record<string, number>;
  drafts: DraftTrack[];
  publishedTracks: PublishedTrack[];
  publishedTrackIds: string[];
  pawelMessages: ChatMessage[];
  groupMessages: ChatMessage[];
};
