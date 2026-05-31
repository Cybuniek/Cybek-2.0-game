import type { BondWithNeura, EndingRoute, GameState, ResonanceLevel } from '../../types.ts';

export const dialoguePriorities = ['critical', 'main', 'milestone', 'lore', 'side', 'ambient'] as const;
export type DialoguePriority = (typeof dialoguePriorities)[number];

export const voiceLinePlaybackModes = ['requiredOnce', 'onceWhenUnlocked', 'rotating', 'ambientLoop', 'debugOnly'] as const;
export type VoiceLinePlaybackMode = (typeof voiceLinePlaybackModes)[number];

export const voicePackIds = [
  'tutorialPack',
  'earlyNeuraPack',
  'glitchLevel1Pack',
  'glitchLevel2Pack',
  'publicationPack',
  'loreExpansionPack',
  'lateGamePack',
  'finalScenePack',
] as const;
export type VoicePackId = (typeof voicePackIds)[number];

export type NeuraPresenceEventId =
  | 'session.start'
  | 'draft.saved'
  | 'draft.sentToPawel'
  | 'track.published'
  | 'neura.glitchSpike'
  | 'story.finalSceneUnlocked';

export type OperationalPowerLevel = 0 | 1 | 2 | 3;

export type NeuraPresenceState = {
  operationalPowerLevel: OperationalPowerLevel;
  activeWindow: string | null;
  screen: string;
  lastPresenceEventId: NeuraPresenceEventId | null;
};

export type DialogueTrigger =
  | { type: 'event'; eventIds: NeuraPresenceEventId[] }
  | { type: 'ambient' }
  | { type: 'debug'; label: string };

export type DialogueConditions = {
  minOperationalPowerLevel?: OperationalPowerLevel;
  maxOperationalPowerLevel?: OperationalPowerLevel;
  requiredEventIds?: NeuraPresenceEventId[];
  blockedEventIds?: NeuraPresenceEventId[];
  requiredPublishedCount?: number;
  requiredDraftCount?: number;
  requiredSentToPawelCount?: number;
  minChatPressure?: number;
  minCybart?: number;
  minPerformance?: number;
  activeWindow?: string;
  screen?: string;
  lastPresenceEventId?: NeuraPresenceEventId;
  hasPublishedTrackId?: string;
  hasDraftTrackId?: string;
  minEchoCount?: number;
  minResonanceLevel?: ResonanceLevel;
  bondWithNeura?: BondWithNeura;
  endingRoute?: EndingRoute;
};

export type DialogueEffects = {
  enqueueLineIds?: string[];
  unlockPackIds?: VoicePackId[];
  markEventIds?: NeuraPresenceEventId[];
  triggerGlitch?: boolean;
  showSystemEcho?: string;
  setUiHint?: string;
  debugLog?: string;
};

export type DialogueTag = {
  neuraDisclosure: 'masked' | 'hinted' | 'revealed';
  emotion: 'calm' | 'dry' | 'curious' | 'protective' | 'distant';
  narrativeFunction: 'checkpoint' | 'foreshadow' | 'lore' | 'ambient' | 'systemEcho';
  foreshadowType: 'none' | 'identity' | 'control' | 'presence';
  finalSceneRelation: 'seed' | 'bridge' | 'payoff' | 'none';
  canAppearAsGlitchEcho: boolean;
  uiBinding?: 'messenger' | 'desktop' | 'create' | 'me' | 'player';
  audioBinding?: 'ambient' | 'glitch' | 'voice';
  powerBand?: 'low' | 'mid' | 'high';
};

export type DialogueLine = {
  id: string;
  packId: VoicePackId;
  sceneId: string;
  phase: 'final' | 'late' | 'middle' | 'prologue';
  timelineDirection: 'reverse-authored';
  speaker: 'Neura';
  text: string;
  trigger: DialogueTrigger;
  conditions?: DialogueConditions;
  effects?: DialogueEffects;
  tags: DialogueTag;
  audioIntent: 'spoken' | 'whisper' | 'glitch' | 'ambient';
  uiBehavior: 'overlay' | 'inline' | 'none';
  glitchIntensity: 0 | 1 | 2 | 3;
  repeatPolicy: 'never' | 'cooldown' | 'loop';
  priority: DialoguePriority;
  playbackMode: VoiceLinePlaybackMode;
  audio: { id: string; fallbackId?: string };
  debugNotes?: string;
};

export type NeuraVoiceLine = DialogueLine;

export type NeuraVoicePack = {
  id: VoicePackId;
  label: string;
  unlock: DialogueConditions;
  priority: DialoguePriority;
  ordering: number;
  cooldownMs?: number;
  maxPlaysPerSession?: number;
  tags: string[];
  debugNotes?: string;
};

export type NeuraVoiceQueueItem = {
  lineId: string;
  priority: DialoguePriority;
  sourceEventId: NeuraPresenceEventId;
  queuedAt: number;
  expiresAt?: number;
};

export type NeuraVoicePlaybackHistory = {
  byLineId: Record<
    string,
    {
      playCount: number;
      lastPlayedAt: number | null;
      sessionPlayCount: number;
      lastRejectedReason?: string;
    }
  >;
  recentlyPlayedLineIds: string[];
  markedEventIds: NeuraPresenceEventId[];
};

export type NeuraVoiceDirectorState = {
  version: 1;
  unlockedPackIds: VoicePackId[];
  queue: NeuraVoiceQueueItem[];
  history: NeuraVoicePlaybackHistory;
  lastAmbientPlayedAt: number | null;
};

export type DialogueContext = {
  gameState: GameState;
  presence: NeuraPresenceState;
  now: number;
};
