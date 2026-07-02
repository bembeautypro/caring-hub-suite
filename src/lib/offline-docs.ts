/**
 * Cache local (IndexedDB) de documentos favoritados para acesso offline.
 * Escopo: apenas blobs que o usuário marcou explicitamente como "salvar offline".
 * Nada é cacheado silenciosamente.
 */

const DB_NAME = "amparo-offline";
const DB_VERSION = 1;
const STORE = "documents";

export const OFFLINE_DOC_LIMIT = 20;
export const OFFLINE_DOC_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

type StoredDoc = {
  id: string;
  mime: string;
  blob: Blob;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível neste navegador."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir IndexedDB."));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

export async function putBlob(id: string, blob: Blob, mime: string): Promise<void> {
  const record: StoredDoc = { id, mime, blob, savedAt: Date.now() };
  await tx("readwrite", (s) => s.put(record));
}

export async function getBlob(id: string): Promise<StoredDoc | null> {
  try {
    const result = await tx<StoredDoc | undefined>("readonly", (s) => s.get(id));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function hasBlob(id: string): Promise<boolean> {
  const r = await getBlob(id);
  return !!r;
}

export async function deleteBlob(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* noop */
  }
}

export async function listIds(): Promise<string[]> {
  try {
    const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
    return keys.map(String);
  } catch {
    return [];
  }
}

export async function countBlobs(): Promise<number> {
  const ids = await listIds();
  return ids.length;
}
