import type { NeuraVoiceDirectorState } from '../data/dialogue/dialogueTypes.ts';
import { createDefaultNeuraVoiceDirectorState } from './NeuraVoiceDirector.ts';

const STORAGE_KEY = 'ustnik.neura.voiceDirector.v1';

export function loadNeuraVoiceDirectorState(storageKey = STORAGE_KEY): NeuraVoiceDirectorState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return createDefaultNeuraVoiceDirectorState();
    const parsed = JSON.parse(raw) as Partial<NeuraVoiceDirectorState>;
    if (!parsed || typeof parsed !== 'object') return createDefaultNeuraVoiceDirectorState();
    if (parsed.version !== 1 || !Array.isArray(parsed.unlockedPackIds) || !Array.isArray(parsed.queue) || !parsed.history) {
      return createDefaultNeuraVoiceDirectorState();
    }
    return {
      ...createDefaultNeuraVoiceDirectorState(),
      ...parsed,
      history: {
        ...createDefaultNeuraVoiceDirectorState().history,
        ...parsed.history,
      },
    };
  } catch {
    return createDefaultNeuraVoiceDirectorState();
  }
}

export function saveNeuraVoiceDirectorState(state: NeuraVoiceDirectorState, storageKey = STORAGE_KEY) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // storage może być niedostępny np. w trybach prywatnych przeglądarki
  }
}

export function getNeuraVoiceDirectorStorageKey() {
  return STORAGE_KEY;
}
