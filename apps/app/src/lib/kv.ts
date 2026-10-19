// Armazenamento local de dados maiores (texto bíblico offline, cópia dos estudos, fila de sincronização).
// Web: IndexedDB. Celular: arquivos JSON na pasta de documentos do app.

import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const DB_NAME = 'biblealpha';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function idb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function idbRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return idb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

function nativeFile(key: string) {
  const dir = new Directory(Paths.document, 'kv');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `${encodeURIComponent(key)}.json`);
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    if (Platform.OS === 'web') {
      const value = await idbRequest<T | undefined>('readonly', (s) => s.get(key));
      return value ?? null;
    }
    const file = nativeFile(key);
    if (!file.exists) return null;
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await idbRequest('readwrite', (s) => s.put(value, key));
      return;
    }
    const file = nativeFile(key);
    if (!file.exists) file.create();
    await file.write(JSON.stringify(value));
  } catch {
    // Sem espaço ou armazenamento bloqueado (navegação privada): o app segue funcionando online
  }
}

export async function kvDelete(key: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await idbRequest('readwrite', (s) => s.delete(key));
      return;
    }
    const file = nativeFile(key);
    if (file.exists) file.delete();
  } catch {
    // ignora
  }
}
