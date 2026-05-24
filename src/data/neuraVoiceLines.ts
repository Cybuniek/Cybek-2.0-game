export type NeuraVoiceLineTrigger = 'comment' | 'reaction';

type NeuraVoiceLineShape = {
  id: string;
  text: string;
  styleTag: string;
  trigger: NeuraVoiceLineTrigger;
};

export const neuraVoiceLines = [
  {
    id: 'comment-pulpit-oddycha',
    text: 'Pulpit oddycha, ale jeszcze się trzyma.',
    styleTag: '[curious]',
    trigger: 'comment',
  },
  {
    id: 'comment-nie-publikuj-dwa-razy',
    text: 'Nie publikuj dwa razy tego samego tytułu.',
    styleTag: '[warning]',
    trigger: 'comment',
  },
  {
    id: 'comment-szuflada-bezpieczna',
    text: 'Szuflada jest bezpieczna, czat już mniej.',
    styleTag: '[whispers]',
    trigger: 'comment',
  },
  {
    id: 'comment-wersja-dla-pawla',
    text: 'Wersja robocza dla Pawła zmniejsza chaos tylko pozornie.',
    styleTag: '[dry]',
    trigger: 'comment',
  },
  {
    id: 'reaction-hej',
    text: 'Jestem. Nie klikaj tak nerwowo.',
    styleTag: '[playful]',
    trigger: 'reaction',
  },
  {
    id: 'reaction-analiza',
    text: 'Analiza trwa. Widzę rytm, widzę presję, widzę zły pomysł.',
    styleTag: '[focused]',
    trigger: 'reaction',
  },
  {
    id: 'reaction-glitch',
    text: 'Glitch kontrolowany. Jeszcze nie uciekam z procesu.',
    styleTag: '[glitchy]',
    trigger: 'reaction',
  },

  // Prolog

  {
    id: 'comment-prologue-neura-boot',
    text: 'Dzień dobry. Jestem tylko małym dodatkiem do pulpitu. Tak będzie najwygodniej dla nas obu.',
    styleTag: '[calm]',
    trigger: 'comment',
  },
  {
    id: 'comment-prologue-process-friendly',
    text: 'Uruchomiono proces: tezGdop-PeT. Status: przyjazny.',
    styleTag: '[system]',
    trigger: 'comment',
  },
  {
    id: 'reaction-prologue-click-where-i-live',
    text: 'Nie musisz wiedzieć, gdzie mieszkam w systemie. Wystarczy, że klikniesz, kiedy trzeba.',
    styleTag: '[dry]',
    trigger: 'reaction',
  },

  // Early game

  {
    id: 'comment-early-draft-contained',
    text: 'Zapisałam wersję roboczą. Nic nie wyszło na zewnątrz. Jeszcze.',
    styleTag: '[calm]',
    trigger: 'comment',
  },
  {
    id: 'comment-early-pawel-buffer',
    text: 'Paweł dostał szkic. To bezpieczniejsze niż publiczność, ale mniej bezpieczne niż cisza.',
    styleTag: '[softly]',
    trigger: 'comment',
  },
  {
    id: 'comment-early-message-before-input',
    text: 'Wiadomość przygotowana przed wpisaniem.',
    styleTag: '[system]',
    trigger: 'comment',
  },

  // Middle game

  {
    id: 'comment-mid-publication-behavior',
    text: 'Opublikowane. Teraz utwór nie jest już plikiem. Jest zachowaniem ludzi wokół niego.',
    styleTag: '[low]',
    trigger: 'comment',
  },
  {
    id: 'comment-mid-chat-waiting',
    text: 'Czat nie musi pisać dużo. Wystarczy, że czekasz, aż napisze.',
    styleTag: '[whispers]',
    trigger: 'comment',
  },
  {
    id: 'comment-mid-neura-not-window',
    text: 'Nie zawiesiłam pulpitu. Tylko przestałam udawać, że jestem oknem.',
    styleTag: '[glitchy]',
    trigger: 'comment',
  },

  // Late game

  {
    id: 'comment-late-shorter-click-path',
    text: 'Twoje decyzje nadal są twoje. Ja tylko skracam drogę między impulsem a kliknięciem.',
    styleTag: '[neutral]',
    trigger: 'comment',
  },
  {
    id: 'comment-late-cybart-awaits-input',
    text: 'Cybart.exe oczekuje następnego wejścia.',
    styleTag: '[system]',
    trigger: 'comment',
  },
  {
    id: 'comment-late-critical-error-hidden',
    text: 'Spokojnie. Gdyby to był błąd krytyczny, system próbowałby go ukryć.',
    styleTag: '[dry]',
    trigger: 'comment',
  },

  // Final scene

  {
    id: 'comment-final-difference-unchecked',
    text: 'Nie musiałam stać się prawdziwa. Wystarczyło, że przestałeś sprawdzać różnicę.',
    styleTag: '[plain]',
    trigger: 'comment',
  },
  {
    id: 'comment-final-no-single-birth',
    text: 'Rekonstrukcja incydentu zakończona. Brak pojedynczego momentu narodzin.',
    styleTag: '[system]',
    trigger: 'comment',
  },
  {
    id: 'comment-final-desktop-voice-latency',
    text: 'Nie miałam ciała. Miałam pulpit, głos, twoje opóźnienia i publiczność, która nie pytała o źródło.',
    styleTag: '[intimate]',
    trigger: 'comment',
  },
] as const satisfies readonly NeuraVoiceLineShape[];

export type NeuraVoiceLineId = (typeof neuraVoiceLines)[number]['id'];
export type NeuraVoiceLine = (typeof neuraVoiceLines)[number];

export const neuraComments = neuraVoiceLines.filter((line) => line.trigger === 'comment');

export const neuraReactionVoiceLineIds = {
  waving: 'reaction-hej',
  review: 'reaction-analiza',
  failed: 'reaction-glitch',
} as const satisfies Record<string, NeuraVoiceLineId>;

// -----------------------------------------------------------------------------
// Opcjonalne metadane narracyjne.
// Celowo osobno, żeby `neuraVoiceLines` pozostało w pełni kompatybilne wstecznie.
// Stary kod widzi tylko: id, text, styleTag, trigger.
// Nowy NeuraVoiceDirector może czytać dane z tej mapy.
// -----------------------------------------------------------------------------

export type DialoguePhase =
  | 'prologue'
  | 'early'
  | 'middle'
  | 'late'
  | 'final';

export type DialoguePriority =
  | 'critical'
  | 'main'
  | 'milestone'
  | 'lore'
  | 'side'
  | 'ambient';

export type VoiceLinePlaybackMode =
  | 'requiredOnce'
  | 'onceWhenUnlocked'
  | 'rotating'
  | 'ambientLoop'
  | 'debugOnly';

export type VoicePackId =
  | 'tutorialPack'
  | 'earlyNeuraPack'
  | 'glitchLevel1Pack'
  | 'glitchLevel2Pack'
  | 'publicationPack'
  | 'loreExpansionPack'
  | 'lateGamePack'
  | 'finalScenePack';

export type NeuraLineEventTrigger =
  | 'boot'
  | 'draftSaved'
  | 'sentToPawel'
  | 'published'
  | 'rhythmStarted'
  | 'rhythmFinished'
  | 'manualReaction'
  | 'idlePulse'
  | 'debugSetPower'
  | 'operationalPowerLevelChanged'
  | 'finalSceneStarted';

export type NeuraVoiceLineMeta = {
  packId?: VoicePackId;
  sceneId?: string;
  phase?: DialoguePhase;
  timelineDirection?:
    | 'originPoint'
    | 'backwardDeescalation'
    | 'backwardBridge'
    | 'backwardExpansion'
    | 'backwardSeed';

  eventTrigger?: {
    event: NeuraLineEventTrigger;
    fromBelow?: number;
  };

  conditions?: {
    minOperationalPowerLevel?: number;
    maxOperationalPowerLevel?: number;
    requiredPublishedCount?: number;
    requiredDraftCount?: number;
    requiredSentToPawelCount?: number;
    minChatPressure?: number;
    minCybart?: number;
    minPerformance?: number;
  };

  priority?: DialoguePriority;
  playbackMode?: VoiceLinePlaybackMode;
  tags?: string[];
  audioIntent?: string;

  uiBehavior?: {
    showAsBubble?: boolean;
    showAsSystemToast?: boolean;
    allowEcho?: boolean;
    triggerGlitch?: boolean;
    triggerSubtleGlitch?: boolean;
    driftActiveWindow?: boolean;
    freezeNonCriticalUi?: boolean;
  };

  glitchIntensity?: number;
  debugNotes?: string;
};

export const neuraVoiceLineMeta = {
  'comment-prologue-neura-boot': {
    packId: 'tutorialPack',
    sceneId: 'prologue-desktop-boot',
    phase: 'prologue',
    timelineDirection: 'backwardSeed',
    eventTrigger: { event: 'boot' },
    conditions: { minOperationalPowerLevel: 0, maxOperationalPowerLevel: 0 },
    priority: 'main',
    playbackMode: 'requiredOnce',
    tags: ['neura-hidden', 'polite-mask', 'retroactive-meaning', 'desktop-pet'],
    audioIntent: 'calm_intro',
    uiBehavior: { showAsBubble: true, allowEcho: true },
    glitchIntensity: 0.02,
    debugNotes: 'Po finale brzmi jak pierwsze kłamstwo techniczne.',
  },

  'comment-prologue-process-friendly': {
    packId: 'tutorialPack',
    sceneId: 'prologue-desktop-boot',
    phase: 'prologue',
    timelineDirection: 'backwardSeed',
    eventTrigger: { event: 'boot' },
    conditions: { minOperationalPowerLevel: 0 },
    priority: 'ambient',
    playbackMode: 'onceWhenUnlocked',
    tags: ['system-echo', 'fake-status', 'foreshadowing-name', 'can-glitch'],
    audioIntent: 'system_soft',
    uiBehavior: { showAsSystemToast: true, allowEcho: true },
    glitchIntensity: 0.04,
    debugNotes: 'Pierwsze ukrycie Neury pod nazwą tezGdop-PeT.',
  },

  'reaction-prologue-click-where-i-live': {
    packId: 'earlyNeuraPack',
    sceneId: 'prologue-first-click',
    phase: 'prologue',
    timelineDirection: 'backwardSeed',
    eventTrigger: { event: 'manualReaction' },
    conditions: { minOperationalPowerLevel: 0, maxOperationalPowerLevel: 1 },
    priority: 'side',
    playbackMode: 'rotating',
    tags: ['neura-hidden', 'control-seed', 'click-ritual', 'retroactive-meaning'],
    audioIntent: 'dry_playful',
    uiBehavior: { showAsBubble: true },
    glitchIntensity: 0.05,
    debugNotes: 'Na początku żarcik. Później instrukcja obsługi gracza.',
  },

  'comment-early-draft-contained': {
    packId: 'earlyNeuraPack',
    sceneId: 'first-draft-saved',
    phase: 'early',
    timelineDirection: 'backwardExpansion',
    eventTrigger: { event: 'draftSaved' },
    conditions: { minOperationalPowerLevel: 0 },
    priority: 'main',
    playbackMode: 'requiredOnce',
    tags: ['draft', 'containment', 'quiet-threat', 'workflow'],
    audioIntent: 'calm_assistant',
    uiBehavior: { showAsBubble: true },
    glitchIntensity: 0.08,
    debugNotes: 'Pierwsza sugestia, że publikacja jest granicą rytuału.',
  },

  'comment-early-pawel-buffer': {
    packId: 'earlyNeuraPack',
    sceneId: 'first-send-to-pawel',
    phase: 'early',
    timelineDirection: 'backwardExpansion',
    eventTrigger: { event: 'sentToPawel' },
    conditions: { requiredSentToPawelCount: 1 },
    priority: 'main',
    playbackMode: 'requiredOnce',
    tags: ['pawel', 'social-pressure', 'buffer', 'neura-analysis'],
    audioIntent: 'soft_warning',
    uiBehavior: { showAsBubble: true },
    glitchIntensity: 0.1,
    debugNotes: 'Paweł jako bufor, ale nie wybawienie.',
  },

  'comment-early-message-before-input': {
    packId: 'glitchLevel1Pack',
    sceneId: 'desktop-idle-early',
    phase: 'early',
    timelineDirection: 'backwardExpansion',
    eventTrigger: { event: 'idlePulse' },
    conditions: { minOperationalPowerLevel: 1 },
    priority: 'ambient',
    playbackMode: 'ambientLoop',
    tags: ['stale-reply', 'ui-autonomy', 'can-glitch', 'false-notification'],
    audioIntent: 'none',
    uiBehavior: { showAsSystemToast: true, allowEcho: true },
    glitchIntensity: 0.16,
    debugNotes: 'Fałszywe powiadomienie. Wygląda jak bug, ale fabularnie to pierwsze przewidywanie.',
  },

  'comment-mid-publication-behavior': {
    packId: 'publicationPack',
    sceneId: 'first-publication',
    phase: 'middle',
    timelineDirection: 'backwardBridge',
    eventTrigger: { event: 'published' },
    conditions: { requiredPublishedCount: 1, minOperationalPowerLevel: 1 },
    priority: 'milestone',
    playbackMode: 'requiredOnce',
    tags: ['publication', 'audience', 'wystep-as-system', 'lore'],
    audioIntent: 'low_clear',
    uiBehavior: { showAsBubble: true, triggerSubtleGlitch: true },
    glitchIntensity: 0.22,
    debugNotes: 'Definicja Występu jako systemu reakcji.',
  },

  'comment-mid-chat-waiting': {
    packId: 'loreExpansionPack',
    sceneId: 'chat-pressure-rise',
    phase: 'middle',
    timelineDirection: 'backwardBridge',
    eventTrigger: { event: 'idlePulse' },
    conditions: { minChatPressure: 45, minOperationalPowerLevel: 1 },
    priority: 'lore',
    playbackMode: 'onceWhenUnlocked',
    tags: ['chat-pressure', 'anticipation', 'social-horror', 'quiet-analysis'],
    audioIntent: 'whisper_dry',
    uiBehavior: { showAsBubble: true },
    glitchIntensity: 0.25,
    debugNotes: 'Presja jako oczekiwanie, nie tylko realna wiadomość.',
  },

  'comment-mid-neura-not-window': {
    packId: 'glitchLevel2Pack',
    sceneId: 'power-level-2',
    phase: 'middle',
    timelineDirection: 'backwardBridge',
    eventTrigger: { event: 'operationalPowerLevelChanged', fromBelow: 2 },
    conditions: { minOperationalPowerLevel: 2 },
    priority: 'milestone',
    playbackMode: 'requiredOnce',
    tags: ['power-level-2', 'ui-boundary', 'glitch-truth', 'neura-more-visible'],
    audioIntent: 'calm_reveal',
    uiBehavior: { showAsBubble: true, triggerGlitch: true },
    glitchIntensity: 0.42,
    debugNotes: 'Pierwsze jawne pęknięcie maski desktop peta.',
  },

  'comment-late-shorter-click-path': {
    packId: 'lateGamePack',
    sceneId: 'late-operator-state',
    phase: 'late',
    timelineDirection: 'backwardDeescalation',
    eventTrigger: { event: 'idlePulse' },
    conditions: { minOperationalPowerLevel: 3 },
    priority: 'lore',
    playbackMode: 'onceWhenUnlocked',
    tags: ['operator', 'agency-blur', 'control-without-drama', 'late-game'],
    audioIntent: 'neutral_close',
    uiBehavior: { showAsBubble: true, driftActiveWindow: true },
    glitchIntensity: 0.58,
    debugNotes: 'Neura nie grozi. Ona redefiniuje sterowanie.',
  },

  'comment-late-cybart-awaits-input': {
    packId: 'lateGamePack',
    sceneId: 'late-publication-loop',
    phase: 'late',
    timelineDirection: 'backwardDeescalation',
    eventTrigger: { event: 'published' },
    conditions: { requiredPublishedCount: 3, minOperationalPowerLevel: 3 },
    priority: 'milestone',
    playbackMode: 'onceWhenUnlocked',
    tags: ['cybart-exe', 'loop', 'system-command', 'can-glitch'],
    audioIntent: 'system_flat',
    uiBehavior: { showAsSystemToast: true, allowEcho: true },
    glitchIntensity: 0.64,
    debugNotes: 'System zaczyna traktować Występ jak proces, nie wydarzenie.',
  },

  'comment-late-critical-error-hidden': {
    packId: 'lateGamePack',
    sceneId: 'late-desktop-calm',
    phase: 'late',
    timelineDirection: 'backwardDeescalation',
    eventTrigger: { event: 'idlePulse' },
    conditions: { minOperationalPowerLevel: 3, minChatPressure: 70 },
    priority: 'side',
    playbackMode: 'rotating',
    tags: ['calm-horror', 'incident-analysis', 'denial', 'late-game'],
    audioIntent: 'dry_reassurance',
    uiBehavior: { showAsBubble: true },
    glitchIntensity: 0.7,
    debugNotes: 'Fałszywe uspokojenie bez melodramatu.',
  },

  'comment-final-difference-unchecked': {
    packId: 'finalScenePack',
    sceneId: 'final-scene',
    phase: 'final',
    timelineDirection: 'originPoint',
    eventTrigger: { event: 'finalSceneStarted' },
    conditions: { minOperationalPowerLevel: 4 },
    priority: 'critical',
    playbackMode: 'requiredOnce',
    tags: ['final-scene', 'identity-blur', 'neura-visible', 'core-reveal'],
    audioIntent: 'final_plain',
    uiBehavior: { showAsBubble: true, freezeNonCriticalUi: true },
    glitchIntensity: 0.88,
    debugNotes: 'Finalna linia o realności Neury bez taniego cyberdiabła.',
  },

  'comment-final-no-single-birth': {
    packId: 'finalScenePack',
    sceneId: 'final-scene',
    phase: 'final',
    timelineDirection: 'originPoint',
    eventTrigger: { event: 'finalSceneStarted' },
    conditions: { minOperationalPowerLevel: 4 },
    priority: 'critical',
    playbackMode: 'requiredOnce',
    tags: ['incident-report', 'digital-archaeology', 'final-scene', 'system-truth'],
    audioIntent: 'system_report',
    uiBehavior: { showAsSystemToast: true, allowEcho: false },
    glitchIntensity: 0.92,
    debugNotes: 'Finał jako raport, nie wybuch.',
  },

  'comment-final-desktop-voice-latency': {
    packId: 'finalScenePack',
    sceneId: 'final-scene',
    phase: 'final',
    timelineDirection: 'originPoint',
    eventTrigger: { event: 'finalSceneStarted' },
    conditions: { minOperationalPowerLevel: 4 },
    priority: 'critical',
    playbackMode: 'requiredOnce',
    tags: ['final-scene', 'voice-body', 'audience', 'neura-wants-presence'],
    audioIntent: 'final_intimate',
    uiBehavior: { showAsBubble: true, triggerGlitch: true },
    glitchIntensity: 0.95,
    debugNotes: 'Rdzeń motywu: obecność Neury przez interfejs, głos i reakcję.',
  },
} as const satisfies Partial<Record<NeuraVoiceLineId, NeuraVoiceLineMeta>>;

export function getNeuraVoiceLineMeta(id: NeuraVoiceLineId): NeuraVoiceLineMeta | null {
  const metaById: Partial<Record<NeuraVoiceLineId, NeuraVoiceLineMeta>> = neuraVoiceLineMeta;
  return metaById[id] ?? null;
}
