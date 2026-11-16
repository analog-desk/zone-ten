// Local storage: one versioned JSON document plus reference images, both in IndexedDB.
// Offline only; nothing leaves the device unless you export it.

const DB_NAME = 'zone-ten';
const STORE_KV = 'kv';
const STORE_IMG = 'images';

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
      if (!db.objectStoreNames.contains(STORE_IMG)) db.createObjectStore(STORE_IMG);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const kvGet = <T>(key: string) => tx<T | undefined>(STORE_KV, 'readonly', (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => tx(STORE_KV, 'readwrite', (s) => s.put(value, key));
export const imgGet = (key: string) => tx<Blob | undefined>(STORE_IMG, 'readonly', (s) => s.get(key));
export const imgSet = (key: string, blob: Blob) => tx(STORE_IMG, 'readwrite', (s) => s.put(blob, key));
export const imgDelete = (key: string) => tx(STORE_IMG, 'readwrite', (s) => s.delete(key));
export const imgKeys = () => tx<IDBValidKey[]>(STORE_IMG, 'readonly', (s) => s.getAllKeys());

export async function persistStorage() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* best effort */
  }
}
