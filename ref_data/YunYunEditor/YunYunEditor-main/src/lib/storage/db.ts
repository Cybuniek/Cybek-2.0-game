// Shared IndexedDB connection for the binary asset stores (audio + icon bytes). These are
// multiple MB each, so they can't live in localStorage. Both stores share one db so the version
// is bumped in exactly one place — a mismatched DB_VERSION across openers throws VersionError.

const DB_NAME = 'yyedit';
// v1: only the `audio` store. v2 adds `image` (additive — onupgradeneeded creates only the
// missing store, so existing users keep their audio data untouched, no migration needed).
const DB_VERSION = 2;

export const STORE_AUDIO = 'audio';
export const STORE_IMAGE = 'image';
const STORES = [STORE_AUDIO, STORE_IMAGE];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Read transactions resolve on the request's onsuccess (the value is what callers want and
// transaction completion adds nothing). Writes resolve on transaction.oncomplete so callers can
// trust durability — request.onsuccess fires before the transaction commits, so an earlier resolve
// would let callers chain dependent work that races the actual write.
export function txRead<T>(store: string, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, 'readonly');
        const r = fn(t.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error(`${store} transaction aborted`));
      }),
  );
}

export function txWrite(store: string, fn: (s: IDBObjectStore) => IDBRequest): Promise<void> {
  return open().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(store, 'readwrite');
        const r = fn(t.objectStore(store));
        r.onerror = () => reject(r.error);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error(`${store} transaction aborted`));
      }),
  );
}
