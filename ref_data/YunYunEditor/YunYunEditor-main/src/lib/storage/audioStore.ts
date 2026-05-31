// IndexedDB store for audio bytes — keyed by draft id.
// Audio is multiple MB, so it can't live in localStorage. Connection plumbing lives in db.ts
// (shared with the icon store).

import { STORE_AUDIO, txRead, txWrite } from './db';

export interface StoredAudio {
  id: string;
  filename: string;
  mime: string;
  bytes: ArrayBuffer;
}

export async function putAudio(audio: StoredAudio): Promise<void> {
  await txWrite(STORE_AUDIO, (s) => s.put(audio));
}

export async function getAudio(id: string): Promise<StoredAudio | undefined> {
  return txRead<StoredAudio | undefined>(STORE_AUDIO, (s) => s.get(id) as IDBRequest<StoredAudio | undefined>);
}

export async function deleteAudio(id: string): Promise<void> {
  await txWrite(STORE_AUDIO, (s) => s.delete(id));
}
