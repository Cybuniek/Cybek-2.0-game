import type { NeuraPresenceEventId } from './dialogueTypes';

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
