import { defaultState } from '../src/storage.ts';
import { getNeuraTutorialStep } from '../src/neura/tutorialGuide.ts';
import type { DraftTrack, GameState, PublishedTrack } from '../src/types.ts';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function withDraft(draft: Partial<DraftTrack>): GameState {
  const fullDraft: DraftTrack = {
    id: draft.trackId ?? 'wystep-czekamy-czekamy',
    trackId: draft.trackId ?? 'wystep-czekamy-czekamy',
    trackTitle: draft.trackTitle ?? 'Występ Czekamy Czekamy',
    difficulty: draft.difficulty ?? 'Łatwy',
    bestAccuracy: draft.bestAccuracy ?? 72,
    bestGrade: draft.bestGrade ?? 'B',
    qualityProgress: draft.qualityProgress ?? 72,
    status: draft.status ?? 'inDrawer',
    updatedAt: draft.updatedAt ?? '2026-05-22T00:00:00.000Z',
  };

  return {
    ...defaultState,
    createdTrackIds: [fullDraft.trackId],
    drafts: [fullDraft],
  };
}

function withPublished(): GameState {
  const published: PublishedTrack = {
    id: 'wystep-czekamy-czekamy',
    trackId: 'wystep-czekamy-czekamy',
    trackTitle: 'Występ Czekamy Czekamy',
    difficulty: 'Normalny',
    accuracy: 84,
    grade: 'A',
    qualityProgress: 130,
    quality: 'cudenko',
    publishedAt: '2026-05-22T00:00:00.000Z',
  };

  return {
    ...defaultState,
    createdTrackIds: [published.trackId],
    publishedTracks: [published],
    publishedTrackIds: [published.trackId],
  };
}

assertEqual(
  getNeuraTutorialStep({
    gameState: defaultState,
    screen: 'desktop',
    activeWindow: 'messenger',
    messengerTab: 'pawel',
    runMode: null,
  })?.id,
  'open-create',
  'pusty save prowadzi do generatora',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: defaultState,
    screen: 'desktop',
    activeWindow: 'create',
    messengerTab: 'pawel',
    runMode: null,
  })?.id,
  'choose-track',
  'otwarty generator prowadzi do pierwszej wersji',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: defaultState,
    screen: 'rhythm',
    activeWindow: 'create',
    messengerTab: 'pawel',
    runMode: 'create',
  })?.id,
  'play-create',
  'próba tworzenia pokazuje krok gry',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: defaultState,
    screen: 'results',
    activeWindow: 'create',
    messengerTab: 'pawel',
    runMode: 'create',
  })?.id,
  'save-draft',
  'wynik tworzenia prowadzi do zapisu draftu',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: withDraft({ difficulty: 'Łatwy' }),
    screen: 'desktop',
    activeWindow: 'messenger',
    messengerTab: 'pawel',
    runMode: null,
  })?.id,
  'open-me-remix',
  'draft z kolejnym poziomem prowadzi do szuflady',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: withDraft({ difficulty: 'Łatwy' }),
    screen: 'desktop',
    activeWindow: 'me',
    messengerTab: 'pawel',
    runMode: null,
  })?.id,
  'remix-draft',
  'otwarta szuflada prowadzi do remixu',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: withDraft({ difficulty: 'Normalny' }),
    screen: 'rhythm',
    activeWindow: 'me',
    messengerTab: 'pawel',
    runMode: 'remix',
  })?.id,
  'play-remix',
  'próba remixu pokazuje krok drugiej wersji',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: withDraft({ difficulty: 'Normalny' }),
    screen: 'results',
    activeWindow: 'me',
    messengerTab: 'pawel',
    runMode: 'remix',
  })?.id,
  'overwrite-remix',
  'wynik remixu prowadzi do nadpisania draftu',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: withDraft({ difficulty: 'Cybart' }),
    screen: 'desktop',
    activeWindow: 'me',
    messengerTab: 'pawel',
    runMode: null,
  })?.id,
  'publish-draft',
  'draft bez kolejnego poziomu prowadzi do publikacji',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: withPublished(),
    screen: 'desktop',
    activeWindow: 'create',
    messengerTab: 'pawel',
    runMode: null,
  })?.id,
  'open-share',
  'opublikowany utwór prowadzi do czatu',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: withPublished(),
    screen: 'desktop',
    activeWindow: 'messenger',
    messengerTab: 'group',
    runMode: null,
  })?.id,
  'share-done',
  'czat po publikacji zamyka obieg',
);

assertEqual(
  getNeuraTutorialStep({
    gameState: withPublished(),
    screen: 'desktop',
    activeWindow: 'messenger',
    messengerTab: 'pawel',
    runMode: null,
  })?.id,
  'open-share',
  'opublikowany utwór na prywatnej karcie nadal prowadzi do czatu głównego',
);
