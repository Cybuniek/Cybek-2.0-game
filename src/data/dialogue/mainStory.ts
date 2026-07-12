import { tracks } from '../tracks.ts';
import type { NeuraPresenceEventId } from './dialogueTypes.ts';
import type { GameState } from '../../types.ts';

export const mainStoryEventOrder: readonly NeuraPresenceEventId[] = [
  'session.start',
  'draft.saved',
  'draft.sentToPawel',
  'track.published',
  'neura.glitchSpike',
  'story.finalSceneUnlocked',
] as const;

export const storyFinalToPrologueSceneIds = [
  'final.scene.reveal',
  'late.publish',
  'late.pressure',
  'middle.analysis',
  'prologue.widget',
] as const;

export type MainStoryActId =
  | 'prologue'
  | 'firstTake'
  | 'privateBuffer'
  | 'publicShow'
  | 'instability'
  | 'finalBridge';

export type MainStoryProgressState = {
  queue: string[];
  completedCheckpointIds: string[];
};

export type MainStoryBeat = {
  id: string;
  actId: MainStoryActId;
  actLabel: string;
  title: string;
  objective: string;
  isComplete: (gameState: GameState, storyState: MainStoryProgressState) => boolean;
};

export type MainStoryProgress = {
  currentBeat: MainStoryBeat;
  completedBeatIds: string[];
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
};

const allTrackCount = tracks.length;

export const mainStoryBeats: readonly MainStoryBeat[] = [
  {
    id: 'boot',
    actId: 'prologue',
    actLabel: 'Prolog',
    title: 'Uruchom Cybek OS',
    objective: 'Wejdź na pulpit i pozwól Neurze przedstawić się jako część systemu.',
    isComplete: (_gameState, storyState) => hasCheckpoint(storyState, 'checkpoint.boot.firstCompleted'),
  },
  {
    id: 'first-song',
    actId: 'firstTake',
    actLabel: 'Pierwszy numer',
    title: 'Zagraj pierwszy Występ',
    objective: 'Otwórz Ustno.ai Create, wybierz dostępny utwór i przejdź próbę rytmiczną.',
    isComplete: (gameState, storyState) => (
      gameState.createdTrackIds.length > 0
      || hasCheckpoint(storyState, 'checkpoint.rhythm.firstFinished')
    ),
  },
  {
    id: 'first-remix',
    actId: 'firstTake',
    actLabel: 'Pierwszy numer',
    title: 'Popraw szkic',
    objective: 'Zostaw numer w szufladzie, wróć do niego i nadpisz go lepszym podejściem.',
    isComplete: (_gameState, storyState) => hasCheckpoint(storyState, 'checkpoint.remix.firstOverwritten'),
  },
  {
    id: 'pawel-buffer',
    actId: 'privateBuffer',
    actLabel: 'Bufor Pawła',
    title: 'Wyślij szkic Pawłowi',
    objective: 'Użyj prywatnego czatu jako bezpiecznego bufora przed publikacją na grupie.',
    isComplete: (gameState, storyState) => (
      gameState.drafts.some((draft) => draft.status === 'sentToPawel')
      || hasCheckpointPrefix(storyState, 'checkpoint.share.pawel.')
    ),
  },
  {
    id: 'first-publication',
    actId: 'publicShow',
    actLabel: 'Publiczny Występ',
    title: 'Opublikuj pierwszy numer',
    objective: 'Wrzuć gotowy plik na czat główny i zobacz, jak presja zamienia się w reakcje.',
    isComplete: (gameState) => gameState.publishedTracks.length >= 1,
  },
  {
    id: 'full-repertoire',
    actId: 'instability',
    actLabel: 'Narastanie',
    title: 'Domknij repertuar',
    objective: 'Przygotuj i opublikuj wszystkie dostępne utwory, obserwując jak rośnie wpływ Neury.',
    isComplete: (gameState) => gameState.publishedTrackIds.length >= allTrackCount,
  },
  {
    id: 'final-bridge',
    actId: 'finalBridge',
    actLabel: 'Most finałowy',
    title: 'Przejdź przez ostatni dialog',
    objective: 'Pozwól scenie finałowej związać Występ, czat i Neurę w jeden wybór na późniejszy finał.',
    isComplete: (_gameState, storyState) => hasCheckpoint(storyState, 'checkpoint.final.ready'),
  },
] as const;

export const completedMainStoryBeat: MainStoryBeat = {
  id: 'session-complete',
  actId: 'finalBridge',
  actLabel: 'Po Występie',
  title: 'Sesja domknięta',
  objective: 'Repertuar, czat i Neura są spięte w jeden zapis. Możesz wrócić do odsłuchu albo zostawić pulpit w tym stanie.',
  isComplete: () => true,
};

export function deriveMainStoryProgress(
  gameState: GameState,
  storyState: MainStoryProgressState,
): MainStoryProgress {
  const completedBeatIds = mainStoryBeats
    .filter((beat) => beat.isComplete(gameState, storyState))
    .map((beat) => beat.id);
  const completedIdSet = new Set(completedBeatIds);
  const isComplete = completedBeatIds.length === mainStoryBeats.length;
  const currentBeat = isComplete
    ? completedMainStoryBeat
    : mainStoryBeats.find((beat) => !completedIdSet.has(beat.id)) ?? mainStoryBeats[mainStoryBeats.length - 1];

  return {
    currentBeat,
    completedBeatIds,
    completedCount: completedBeatIds.length,
    totalCount: mainStoryBeats.length,
    isComplete,
  };
}

function hasCheckpoint(storyState: MainStoryProgressState, checkpointId: string) {
  return storyState.completedCheckpointIds.includes(checkpointId);
}

function hasCheckpointPrefix(storyState: MainStoryProgressState, checkpointPrefix: string) {
  return storyState.completedCheckpointIds.some((checkpointId) => checkpointId.startsWith(checkpointPrefix));
}
