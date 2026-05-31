import {
  getStorySceneById,
  getStorySceneForTrigger,
  getStoryScenesForPresenceLevel,
  type StoryScene,
  type StorySceneTrigger,
} from '../data/dialogue/storyScenes.ts';
import type { OperationalPowerLevel } from '../types.ts';

export type StorySceneDirectorState = {
  version: 1;
  queue: string[];
  completedSceneIds: string[];
  completedCheckpointIds: string[];
  highestQueuedPresenceLevel: OperationalPowerLevel;
};

export function createDefaultStorySceneDirectorState(): StorySceneDirectorState {
  return {
    version: 1,
    queue: [],
    completedSceneIds: [],
    completedCheckpointIds: [],
    highestQueuedPresenceLevel: 0,
  };
}

export function queueStorySceneForTrigger(
  state: StorySceneDirectorState,
  trigger: StorySceneTrigger,
): { state: StorySceneDirectorState; scene: StoryScene | null } {
  const scene = getStorySceneForTrigger(trigger);
  if (!scene || isStorySceneConsumed(state, scene)) return { state, scene: null };

  return {
    state: {
      ...state,
      queue: addUnique(state.queue, scene.id),
    },
    scene,
  };
}

export function queueStoryScenesForPresenceLevel(
  state: StorySceneDirectorState,
  level: OperationalPowerLevel,
): { state: StorySceneDirectorState; scenes: StoryScene[] } {
  const normalizedLevel = Math.max(0, Math.min(4, level)) as OperationalPowerLevel;
  const scenes = getStoryScenesForPresenceLevel(normalizedLevel)
    .filter((scene) => scene.presenceLevel !== undefined && scene.presenceLevel > state.highestQueuedPresenceLevel)
    .filter((scene) => !isStorySceneConsumed(state, scene))
    .sort((left, right) => (left.presenceLevel ?? 0) - (right.presenceLevel ?? 0));

  if (scenes.length === 0) {
    return {
      state: {
        ...state,
        highestQueuedPresenceLevel: Math.max(state.highestQueuedPresenceLevel, normalizedLevel) as OperationalPowerLevel,
      },
      scenes,
    };
  }

  return {
    state: {
      ...state,
      queue: scenes.reduce((queue, scene) => addUnique(queue, scene.id), state.queue),
      highestQueuedPresenceLevel: Math.max(state.highestQueuedPresenceLevel, normalizedLevel) as OperationalPowerLevel,
    },
    scenes,
  };
}

export function getActiveStoryScene(state: StorySceneDirectorState) {
  const sceneId = state.queue[0];
  return sceneId ? getStorySceneById(sceneId) : null;
}

export function completeStoryScene(
  state: StorySceneDirectorState,
  sceneId: string,
): StorySceneDirectorState {
  const scene = getStorySceneById(sceneId);
  const checkpointId = scene?.checkpointId ?? sceneId;

  return {
    ...state,
    queue: state.queue.filter((id) => id !== sceneId),
    completedSceneIds: addUnique(state.completedSceneIds, sceneId),
    completedCheckpointIds: addUnique(state.completedCheckpointIds, checkpointId),
  };
}

export function loadStorySceneDirectorState(storageKey = STORY_SCENE_STORAGE_KEY): StorySceneDirectorState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return createDefaultStorySceneDirectorState();
    return normalizeStorySceneDirectorState(JSON.parse(raw));
  } catch {
    return createDefaultStorySceneDirectorState();
  }
}

export function saveStorySceneDirectorState(
  state: StorySceneDirectorState,
  storageKey = STORY_SCENE_STORAGE_KEY,
) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable in strict browser privacy modes.
  }
}

export function clearStorySceneDirectorState(storageKey = STORY_SCENE_STORAGE_KEY) {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // localStorage may be unavailable in strict browser privacy modes.
  }
}

export const STORY_SCENE_STORAGE_KEY = 'ustnik.storyScenes.v1';

function normalizeStorySceneDirectorState(parsed: unknown): StorySceneDirectorState {
  if (!parsed || typeof parsed !== 'object') return createDefaultStorySceneDirectorState();
  const partial = parsed as Partial<StorySceneDirectorState>;
  const defaults = createDefaultStorySceneDirectorState();

  return {
    version: 1,
    queue: Array.isArray(partial.queue) ? partial.queue.filter(isString) : defaults.queue,
    completedSceneIds: Array.isArray(partial.completedSceneIds)
      ? partial.completedSceneIds.filter(isString)
      : defaults.completedSceneIds,
    completedCheckpointIds: Array.isArray(partial.completedCheckpointIds)
      ? partial.completedCheckpointIds.filter(isString)
      : defaults.completedCheckpointIds,
    highestQueuedPresenceLevel: normalizePresenceLevel(partial.highestQueuedPresenceLevel),
  };
}

function isStorySceneConsumed(state: StorySceneDirectorState, scene: StoryScene) {
  return (
    state.queue.includes(scene.id)
    || state.completedSceneIds.includes(scene.id)
    || state.completedCheckpointIds.includes(scene.checkpointId)
  );
}

function addUnique(items: string[], item: string) {
  return items.includes(item) ? items : [...items, item];
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function normalizePresenceLevel(value: unknown): OperationalPowerLevel {
  if (typeof value !== 'number') return 0;
  if (value >= 4) return 4;
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  if (value >= 1) return 1;
  return 0;
}
