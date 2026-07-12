import { tracks } from '../src/data/tracks.ts';
import {
  getStorySceneById,
  getStorySceneForTrigger,
  storyScenes,
  storySceneTrackIds,
} from '../src/data/dialogue/storyScenes.ts';
import { deriveMainStoryProgress } from '../src/data/dialogue/mainStory.ts';
import {
  completeStoryScene,
  createDefaultStorySceneDirectorState,
  queueStoryScenesForPresenceLevel,
  queueStorySceneForTrigger,
} from '../src/neura/StorySceneDirector.ts';
import { defaultState } from '../src/storage.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const trackIds = tracks.map((track) => track.id);

// 1) katalog scen obejmuje wszystkie utwory runtime'u
{
  assertEqual(storySceneTrackIds.length, trackIds.length, 'liczba trackId w scenach zgadza się z tracks.ts');
  for (const trackId of trackIds) {
    assert(storySceneTrackIds.includes(trackId), `sceny zawierają trackId: ${trackId}`);
    assert(!!getStorySceneForTrigger({ type: 'remix.firstOverwritten', trackId }), `istnieje scena remixu dla ${trackId}`);
    assert(!!getStorySceneForTrigger({ type: 'share', channel: 'pawel', trackId }), `istnieje scena Pawła dla ${trackId}`);
    assert(!!getStorySceneForTrigger({ type: 'share', channel: 'chat', trackId }), `istnieje scena czatu dla ${trackId}`);
  }
}

// 2) każda kwestia ma speaker; poprawione teksty bez dogranego głosu są jawnie tekstowe
{
  const audioIds = new Set<string>();
  const textOnlyLineIds = new Set([
    'story.remix.wystep.001.cybek',
    'story.share.pawel.wystep.001.cybek',
    'story.share.pawel.wystep.002.neura',
  ]);
  for (const scene of storyScenes) {
    assert(scene.lines.length > 0, `scena ${scene.id} ma co najmniej jedną kwestię`);
    for (const line of scene.lines) {
      assert(line.speaker === 'Neura' || line.speaker === 'Cybek', `speaker ${line.id} jest obsługiwany`);
      if (!line.audioId) {
        assert(textOnlyLineIds.has(line.id), `tylko świadomie tekstowa kwestia może nie mieć audioId: ${line.id}`);
        continue;
      }
      assert(!audioIds.has(line.audioId), `audioId jest unikalne: ${line.audioId}`);
      audioIds.add(line.audioId);
    }
  }

  const sceneText = storyScenes.flatMap((scene) => scene.lines.map((line) => line.text)).join('\n');
  for (const fragment of ['Nadpisałem draft', 'wersji demo', 'wersja robocza', 'wersję roboczą']) {
    assert(!sceneText.includes(fragment), `sceny VN nie wracają do roboczego fragmentu: ${fragment}`);
  }
}

// 3) Paweł i czat są osobnymi checkpointami per utwór
{
  let state = createDefaultStorySceneDirectorState();
  const trackId = 'wystep-czekamy-czekamy';

  state = queueStorySceneForTrigger(state, { type: 'share', channel: 'pawel', trackId }).state;
  assertEqual(state.queue.length, 1, 'pierwsza wysyłka do Pawła kolejkuje scenę');
  const pawelSceneId = state.queue[0];
  state = completeStoryScene(state, pawelSceneId);
  state = queueStorySceneForTrigger(state, { type: 'share', channel: 'pawel', trackId }).state;
  assertEqual(state.queue.length, 0, 'druga wysyłka do Pawła nie powtarza sceny');

  state = queueStorySceneForTrigger(state, { type: 'share', channel: 'chat', trackId }).state;
  assertEqual(state.queue.length, 1, 'publikacja na czacie ma osobny checkpoint');
  assert(state.queue[0] !== pawelSceneId, 'scena czatu różni się od sceny Pawła');
}

// 4) scena po minigrze jest globalnie jednorazowa, ale wybiera wariant po trackId
{
  let state = createDefaultStorySceneDirectorState();
  state = queueStorySceneForTrigger(state, { type: 'rhythm.firstFinished', trackId: 'vlog-wildforest-rave-anho27' }).state;
  assertEqual(state.queue.length, 1, 'pierwsza ukończona minigra kolejkuje scenę');
  const scene = getStorySceneById(state.queue[0]);
  assertEqual(scene?.trackId, 'vlog-wildforest-rave-anho27', 'wariant sceny odpowiada zagranemu utworowi');

  state = completeStoryScene(state, state.queue[0]);
  state = queueStorySceneForTrigger(state, { type: 'rhythm.firstFinished', trackId: 'wenezuelski-wystep-mashup' }).state;
  assertEqual(state.queue.length, 0, 'druga ukończona minigra nie kolejkuje globalnego checkpointu');
}

// 5) poziomy glitchy 1-4 kolejkują się raz i rosnąco, nawet po skoku o kilka poziomów
{
  let state = createDefaultStorySceneDirectorState();
  state = queueStoryScenesForPresenceLevel(state, 4).state;
  assertEqual(state.queue.length, 4, 'skok na poziom 4 kolejkuje cztery sceny glitchy');
  assertEqual(
    state.queue.map((sceneId) => getStorySceneById(sceneId)?.trigger.type).join(','),
    'presence.level,presence.level,presence.level,presence.level',
    'kolejka zawiera sceny poziomów obecności',
  );
  assertEqual(
    state.queue.map((sceneId) => getStorySceneById(sceneId)?.presenceLevel).join(','),
    '1,2,3,4',
    'sceny glitchy są w kolejności 1-4',
  );

  for (const sceneId of [...state.queue]) state = completeStoryScene(state, sceneId);
  state = queueStoryScenesForPresenceLevel(state, 4).state;
  assertEqual(state.queue.length, 0, 'ponowny poziom 4 nie powtarza scen glitchy');
}

// 6) onboarding fabularny obejmuje jedna petle: start -> utwor -> remix -> Pawel -> czat
{
  let state = createDefaultStorySceneDirectorState();
  const trackId = 'wystep-czekamy-czekamy';

  state = queueStorySceneForTrigger(state, { type: 'boot.firstCompleted' }).state;
  state = queueStorySceneForTrigger(state, { type: 'rhythm.firstFinished', trackId }).state;
  state = queueStorySceneForTrigger(state, { type: 'remix.firstOverwritten', trackId }).state;
  state = queueStorySceneForTrigger(state, { type: 'share', channel: 'pawel', trackId }).state;
  state = queueStorySceneForTrigger(state, { type: 'share', channel: 'chat', trackId }).state;

  assertEqual(
    state.queue.map((sceneId) => getStorySceneById(sceneId)?.trigger.type).join(' -> '),
    'boot.firstCompleted -> rhythm.firstFinished -> remix.firstOverwritten -> share -> share',
    'kolejka pierwszej petli ma oczekiwana kolejnosc scen',
  );

  for (const sceneId of [...state.queue]) state = completeStoryScene(state, sceneId);
  state = queueStorySceneForTrigger(state, { type: 'remix.firstOverwritten', trackId: 'vlog-wildforest-rave-anho27' }).state;
  assertEqual(state.queue.length, 0, 'pierwszy remix jest globalnym checkpointem petli');
}

// 7) most finałowy odpala się osobnym triggerem i nie udaje pełnego endingu
{
  let state = createDefaultStorySceneDirectorState();
  state = queueStorySceneForTrigger(state, { type: 'final.ready' }).state;
  assertEqual(state.queue.length, 1, 'trigger final.ready kolejkuje most finałowy');
  const scene = getStorySceneById(state.queue[0]);
  assertEqual(scene?.checkpointId, 'checkpoint.final.ready', 'most finałowy ma osobny checkpoint');
  assert(scene?.lines.some((line) => line.text.includes('finał')), 'most finałowy mówi o finale bez implementacji endingów');

  state = completeStoryScene(state, state.queue[0]);
  state = queueStorySceneForTrigger(state, { type: 'final.ready' }).state;
  assertEqual(state.queue.length, 0, 'most finałowy nie powtarza się po ukończeniu');
}

// 8) mainStory prowadzi gracza od bootu do domknięcia repertuaru
{
  const state = createDefaultStorySceneDirectorState();
  const startProgress = deriveMainStoryProgress(defaultState, state);
  assertEqual(startProgress.currentBeat.id, 'boot', 'pierwszy beat historii to boot');

  const afterBoot = deriveMainStoryProgress(defaultState, {
    ...state,
    completedCheckpointIds: ['checkpoint.boot.firstCompleted'],
  });
  assertEqual(afterBoot.currentBeat.id, 'first-song', 'po bootowaniu celem jest pierwszy utwór');

  const finishedGameState = {
    ...defaultState,
    createdTrackIds: [...trackIds],
    publishedTrackIds: [...trackIds],
    publishedTracks: trackIds.map((trackId) => ({
      id: `published-${trackId}`,
      trackId,
      trackTitle: trackId,
      difficulty: 'Łatwy' as const,
      accuracy: 80,
      grade: 'A' as const,
      qualityProgress: 80,
      quality: 'lepsza wersja' as const,
      publishedAt: '2026-07-04T00:00:00.000Z',
    })),
    drafts: [
      {
        id: 'sent-demo',
        trackId: trackIds[0],
        trackTitle: trackIds[0],
        difficulty: 'Łatwy' as const,
        bestAccuracy: 80,
        bestGrade: 'A' as const,
        qualityProgress: 80,
        status: 'sentToPawel' as const,
        updatedAt: '2026-07-04T00:00:00.000Z',
      },
    ],
  };
  const finalProgress = deriveMainStoryProgress(finishedGameState, {
    ...state,
    completedCheckpointIds: [
      'checkpoint.boot.firstCompleted',
      'checkpoint.rhythm.firstFinished',
      'checkpoint.remix.firstOverwritten',
      'checkpoint.share.pawel.wystep-czekamy-czekamy',
    ],
  });
  assertEqual(finalProgress.currentBeat.id, 'final-bridge', 'po repertuarze celem jest most finałowy');
  assertEqual(finalProgress.isComplete, false, 'przed checkpointem final.ready historia nie jest domknięta');

  const completedProgress = deriveMainStoryProgress(finishedGameState, {
    ...state,
    completedCheckpointIds: [
      'checkpoint.boot.firstCompleted',
      'checkpoint.rhythm.firstFinished',
      'checkpoint.remix.firstOverwritten',
      'checkpoint.share.pawel.wystep-czekamy-czekamy',
      'checkpoint.final.ready',
    ],
  });
  assertEqual(completedProgress.currentBeat.id, 'session-complete', 'po moście finałowym plan pokazuje domkniętą sesję');
  assertEqual(completedProgress.isComplete, true, 'po checkpointach cały mainStory jest ukończony');
}
