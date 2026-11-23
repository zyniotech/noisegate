import { isSafeLookupKey } from './normalize';
import type { ParsedListEntry } from './types';

const DB_NAME = 'noisegate_cache';
const DB_VERSION = 1;
const STORE_LIST_ENTRIES = 'list_entries';

interface StoredListPayload {
  listId: string;
  entries: ParsedListEntry[];
  savedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_LIST_ENTRIES)) {
        db.createObjectStore(STORE_LIST_ENTRIES, { keyPath: 'listId' });
      }
    };

    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('IndexedDB open blocked by another connection'));
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('Failed to open IndexedDB'));
    };
  });

  return dbPromise;
}

export async function saveListEntries(
  listId: string,
  entries: ParsedListEntry[],
): Promise<void> {
  if (!isSafeLookupKey(listId)) {
    throw new Error(`Invalid listId "${listId}"`);
  }
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_LIST_ENTRIES, 'readwrite');
    const store = tx.objectStore(STORE_LIST_ENTRIES);
    const payload: StoredListPayload = {
      listId,
      entries,
      savedAt: new Date().toISOString(),
    };
    store.put(payload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save list entries'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted while saving list entries'));
  });
}

export async function getListEntries(listId: string): Promise<ParsedListEntry[]> {
  if (!isSafeLookupKey(listId)) return [];
  const db = await openDb();
  return new Promise<ParsedListEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE_LIST_ENTRIES, 'readonly');
    const store = tx.objectStore(STORE_LIST_ENTRIES);
    const req = store.get(listId);
    req.onsuccess = () => {
      const record = req.result as StoredListPayload | undefined;
      resolve(record?.entries ?? []);
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to read list entries'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted while reading list entries'));
  });
}

export async function getAllListEntries(): Promise<Record<string, ParsedListEntry[]>> {
  const db = await openDb();
  return new Promise<Record<string, ParsedListEntry[]>>((resolve, reject) => {
    const tx = db.transaction(STORE_LIST_ENTRIES, 'readonly');
    const store = tx.objectStore(STORE_LIST_ENTRIES);
    const req = store.getAll();
    req.onsuccess = () => {
      const result = Object.create(null) as Record<string, ParsedListEntry[]>;
      const records = (req.result as StoredListPayload[]) ?? [];
      for (const rec of records) {
        if (rec?.listId && isSafeLookupKey(rec.listId)) {
          result[rec.listId] = Array.isArray(rec.entries) ? rec.entries : [];
        }
      }
      resolve(result);
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to read all list entries'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted while reading list entries'));
  });
}

export async function deleteListEntries(listId: string): Promise<void> {
  if (!isSafeLookupKey(listId)) return;
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_LIST_ENTRIES, 'readwrite');
    const store = tx.objectStore(STORE_LIST_ENTRIES);
    store.delete(listId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete list entries'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted while deleting list entries'));
  });
}

export async function clearAllListEntries(): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_LIST_ENTRIES, 'readwrite');
    const store = tx.objectStore(STORE_LIST_ENTRIES);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear list entries'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted while clearing list entries'));
  });
}
