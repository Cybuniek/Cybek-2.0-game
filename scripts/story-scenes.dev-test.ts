import { tracks } from '../src/data/tracks.ts';
import {
  getStorySceneById,
  getStorySceneForTrigger,
  storyScenes,
  storySceneTrackIds,
} from '../src/data/dialogue/storyScenes.ts';
import {
  completeStoryScene,
  createDefaultStorySceneDirectorState,
  queueStoryScenesForPresenceLevel,
  queueStorySceneForTrigger,
} from '../src/neura/StorySceneDirector.ts';

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
    assert(!!getStorySceneForTrigger({ type: 'share', channel: 'pawel', trackId }), `istnieje scena Pawcia dla ${trackId}`);
    assert(!!getStorySceneForTrigger({ type: 'share', channel: 'chat', trackId }), `istnieje scena czatu dla ${trackId}`);
  }
}

// 2) każda kwestia ma speaker i audioId, bo dialogi są w pełni udźwiękowione
{
  const audioIds = new Set<string>();
  for (const scene of storyScenes) {
    assert(scene.lines.length > 0, `scena ${scene.id} ma co najmniej jedną kwestię`);
    for (const line of scene.lines) {
      assert(line.speaker === 'Neura' || line.speaker === 'Cybek', `speaker ${line.id} jest obsługiwany`);
      assert(line.audioId.length > 0, `kwestia ${line.id} ma audioId`);
      assert(!audioIds.has(line.audioId), `audioId jest unikalne: ${line.audioId}`);
      audioIds.add(line.audioId);
    }
  }
}

// 3) Pawcio i czat są osobnymi checkpointami per utwór
{
  let state = createDefaultStorySceneDirectorState();
  const trackId = 'wystep-czekamy-czekamy';

  state = queueStorySceneForTrigger(state, { type: 'share', channel: 'pawel', trackId }).state;
  assertEqual(state.queue.length, 1, 'pierwsza wysyłka do Pawcia kolejkuje scenę');
  const pawelSceneId = state.queue[0];
  state = completeStoryScene(state, pawelSceneId);
  state = queueStorySceneForTrigger(state, { type: 'share', channel: 'pawel', trackId }).state;
  assertEqual(state.queue.length, 0, 'druga wysyłka do Pawcia nie powtarza sceny');

  state = queueStorySceneForTrigger(state, { type: 'share', channel: 'chat', trackId }).state;
  assertEqual(state.queue.length, 1, 'publikacja na czacie ma osobny checkpoint');
  assert(state.queue[0] !== pawelSceneId, 'scena czatu różni się od sceny Pawcia');
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
