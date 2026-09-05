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
  | 'dayAdvanced'
  | 'promiseMissed'
  | 'draftRejected'
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

export type PerformanceIntent = 'close' | 'live';

export type RhythmPhrase = {
  index: number;
  startMs: number;
  endMs: number;
  totalNotes: number;
  accuracy: number;
  complete: boolean;
  comeback: boolean;
};

export type PerformanceTrace = {
  intent?: PerformanceIntent;
  phrases: RhythmPhrase[];
  accuracy: number;
};

export type RhythmSummary = {
  intent?: PerformanceIntent;
  phrases?: RhythmPhrase[];
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
  rhythmStatModifier?: RhythmStatModifier;
};

export type RhythmStatModifier = {
  cybartBand: StatBand;
  pressureBand: StatBand;
  comboBonus: number;
  timingPenaltyMs: number;
  neuraHint: 'zimny silnik' | 'stabilny silnik' | 'przegrzanie' | 'szum publiczności' | 'czysty kanał';
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
  day?: number;
  kind?: CommunicationAction;
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
  lastPerformance?: PerformanceTrace;
  id: string;
  trackId: string;
  trackTitle: string;
  difficulty: Difficulty;
  bestAccuracy: number;
  bestGrade: QualityTier;
  qualityProgress: number;
  status: 'inDrawer' | 'sentToPawel';
  updatedAt: string;
  createdDay?: number;
  lastWorkedDay?: number;
  attemptCount?: number;
};

export type PublishedTrack = {
  lastPerformance?: PerformanceTrace;
  id: string;
  trackId: string;
  trackTitle: string;
  difficulty: Difficulty;
  accuracy: number;
  grade: QualityTier;
  qualityProgress: number;
  quality: 'szkic publiczny' | 'lepsza wersja' | 'cudeńko';
  publishedAt: string;
  publishedDay?: number;
  previousPublicationDay?: number | null;
};

export type Stats = {
  performance: number;
  cybart: number;
  chatPressure: number;
};

export type StatBand = 'low' | 'rising' | 'stable' | 'tense' | 'critical';

export type DayPhase = 'communication' | 'work' | 'result' | 'daySummary' | 'complete';

export type CommunicationAction = 'silence' | 'status' | 'teaser' | 'promise' | 'break' | 'live';

export type CommitmentStatus = 'active' | 'fulfilled' | 'missed';

export type Commitment = {
  id: string;
  kind: 'publication';
  createdDay: number;
  dueDay: number;
  trackId: string;
  status: CommitmentStatus;
};

export type DaySummary = {
  day: number;
  published: boolean;
  pressureDelta: number;
  performanceDelta: number;
  cybartDelta: number;
  missedCommitments: number;
  expiredDraftCount: number;
};

export type DayCycleState = {
  currentDay: number;
  totalDays: 14;
  phase: DayPhase;
  communicationUsed: boolean;
  lastPublicationDay: number | null;
  expectedCadenceDays: number;
  publicationDays: number[];
  commitments: Commitment[];
  rejectedCount: number;
  lastDaySummary: DaySummary | null;
};

export type GameState = {
  settledIntentTrackIds?: string[];
  pendingPerformanceReaction?: { trackId: string; day: number; channel: 'pawel' | 'group'; text: string } | null;
  saveVersion: 2;
  stats: Stats;
  dayCycle: DayCycleState;
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
