import { getNextDifficulty } from '../storage.ts';
import type { DraftTrack, GameState } from '../types.ts';

export type NeuraTutorialScreen = 'boot' | 'desktop' | 'rhythm' | 'results' | 'editor';
export type NeuraTutorialWindowTarget = 'messenger' | 'create' | 'me' | 'player';
export type NeuraTutorialRunMode = 'create' | 'remix' | null;

export type NeuraTutorialStepId =
  | 'open-create'
  | 'choose-track'
  | 'play-create'
  | 'save-draft'
  | 'open-me-remix'
  | 'remix-draft'
  | 'play-remix'
  | 'overwrite-remix'
  | 'open-me-publish'
  | 'publish-draft'
  | 'open-share'
  | 'share-done';

export type NeuraTutorialStep = {
  id: NeuraTutorialStepId;
  order: number;
  total: number;
  title: string;
  text: string;
  speechText: string;
  actionHint?: string;
  targetWindow?: NeuraTutorialWindowTarget;
  targetMessengerTab?: 'pawel' | 'group';
};

export type NeuraTutorialContext = {
  gameState: Pick<GameState, 'drafts' | 'publishedTracks' | 'publishedTrackIds'>;
  screen: NeuraTutorialScreen;
  activeWindow: NeuraTutorialWindowTarget | null;
  messengerTab: 'pawel' | 'group';
  runMode: NeuraTutorialRunMode;
};

const TOTAL_STEPS = 5;

export function getNeuraTutorialStep(context: NeuraTutorialContext): NeuraTutorialStep | null {
  if (context.screen === 'boot' || context.screen === 'editor') return null;

  if (hasPublishedTrack(context.gameState)) {
    if (context.activeWindow !== 'messenger' || context.messengerTab !== 'group') return createStep('open-share');
    return createStep('share-done');
  }

  if (context.screen === 'rhythm') {
    if (context.runMode === 'remix') return createStep('play-remix');
    return createStep('play-create');
  }

  if (context.screen === 'results') {
    if (context.runMode === 'remix') return createStep('overwrite-remix');
    return createStep('save-draft');
  }

  const remixableDraft = findFirstRemixableDraft(context.gameState.drafts);
  if (!context.gameState.drafts.length) {
    if (context.activeWindow === 'create') return createStep('choose-track');
    return createStep('open-create');
  }

  if (remixableDraft) {
    if (context.activeWindow === 'me') return createStep('remix-draft');
    return createStep('open-me-remix');
  }

  if (context.activeWindow === 'me') return createStep('publish-draft');
  return createStep('open-me-publish');
}

export function findFirstRemixableDraft(drafts: readonly DraftTrack[]): DraftTrack | null {
  return drafts.find((draft) => getNextDifficulty(draft.trackId, draft.difficulty)) ?? null;
}

function hasPublishedTrack(gameState: Pick<GameState, 'publishedTracks' | 'publishedTrackIds'>) {
  return gameState.publishedTracks.length > 0 || gameState.publishedTrackIds.length > 0;
}

function createStep(id: NeuraTutorialStepId): NeuraTutorialStep {
  const step = STEPS[id];
  return {
    ...step,
    id,
    speechText: step.speechText ?? step.text,
  };
}

const STEPS: Record<NeuraTutorialStepId, Omit<NeuraTutorialStep, 'id' | 'speechText'> & { speechText?: string }> = {
  'open-create': {
    order: 1,
    total: TOTAL_STEPS,
    title: 'Otwórz generator',
    text: 'Najpierw wejdź do Ustno.ai Utwórz. Pierwsza wersja ma zostawić ślad, nie wygrać internet.',
    actionHint: 'Pokaż generator',
    targetWindow: 'create',
  },
  'choose-track': {
    order: 1,
    total: TOTAL_STEPS,
    title: 'Stwórz pierwszą wersję',
    text: 'Wybierz dostępny kawałek i uruchom próbę. Ja policzę, gdzie system zaczyna udawać rytm.',
  },
  'play-create': {
    order: 1,
    total: TOTAL_STEPS,
    title: 'Zagraj próbę',
    text: 'Na scenie łap wejścia S, D, K i L. Nie poluj na perfekcję; potrzebujemy materiału do szuflady.',
  },
  'save-draft': {
    order: 2,
    total: TOTAL_STEPS,
    title: 'Zapisz draft',
    text: 'Zapisz wersję do szuflady. Publikacja poczeka, aż zrobimy jeden świadomy remix.',
  },
  'open-me-remix': {
    order: 3,
    total: TOTAL_STEPS,
    title: 'Przejdź do szuflady',
    text: 'Otwórz Ustno.ai Me. Tam leży pierwsza wersja, jeszcze bez publicznej odpowiedzialności.',
    actionHint: 'Pokaż szufladę',
    targetWindow: 'me',
  },
  'remix-draft': {
    order: 3,
    total: TOTAL_STEPS,
    title: 'Uruchom remix',
    text: 'Włącz remix na kolejnym poziomie. To ta sama piosenka, tylko z większą pamięcią o błędach.',
  },
  'play-remix': {
    order: 3,
    total: TOTAL_STEPS,
    title: 'Dopisz drugą wersję',
    text: 'Remix nie musi być grzeczny. Zagraj go do końca, a potem porównamy ślady.',
  },
  'overwrite-remix': {
    order: 4,
    total: TOTAL_STEPS,
    title: 'Zapisz remix',
    text: 'Nadpisz draft po remiksie. Jeśli wyszło gorzej, to też informacja, ale samouczek prowadzi stabilną ścieżką.',
  },
  'open-me-publish': {
    order: 5,
    total: TOTAL_STEPS,
    title: 'Wróć do szuflady',
    text: 'Otwórz Ustno.ai Me i wybierz gotowy draft. Teraz można go wypuścić z bezpiecznego katalogu.',
    actionHint: 'Pokaż szufladę',
    targetWindow: 'me',
  },
  'publish-draft': {
    order: 5,
    total: TOTAL_STEPS,
    title: 'Udostępnij kawałek',
    text: 'Opublikuj na czacie głównym. Od tej chwili plik nie jest tylko draftem; zaczyna wracać odpowiedzią.',
  },
  'open-share': {
    order: 5,
    total: TOTAL_STEPS,
    title: 'Sprawdź publikację',
    text: 'Otwórz czat główny. Pierwszy kawałek przeszedł pełną drogę: stworzenie, remix i udostępnienie.',
    actionHint: 'Pokaż czat',
    targetWindow: 'messenger',
    targetMessengerTab: 'group',
  },
  'share-done': {
    order: 5,
    total: TOTAL_STEPS,
    title: 'Pierwszy obieg zamknięty',
    text: 'Gotowe. Na pulpicie jest plik, a na czacie ślad po publikacji. To nie finał, tylko pierwszy poprawny log.',
  },
};
