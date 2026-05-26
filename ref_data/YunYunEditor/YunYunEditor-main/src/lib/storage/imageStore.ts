// IndexedDB store for icon image bytes — keyed by draft id, mirroring audioStore.ts.
// The icon is an optional .png/.jpg asset; like audio it can be multiple MB and can't live in
// localStorage. Connection plumbing is shared via db.ts.

import { STORE_IMAGE, txRead, txWrite } from './db';

export interface StoredImage {
  id: string;
  filename: string;
  mime: string;
  bytes: ArrayBuffer;
}

export async function putImage(image: StoredImage): Promise<void> {
  await txWrite(STORE_IMAGE, (s) => s.put(image));
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  return txRead<StoredImage | undefined>(STORE_IMAGE, (s) => s.get(id) as IDBRequest<StoredImage | undefined>);
}

export async function deleteImage(id: string): Promise<void> {
  await txWrite(STORE_IMAGE, (s) => s.delete(id));
}
