import { MediaAsset, Project } from './types';

/**
 * Autosave in IndexedDB: the media files themselves plus the project JSON,
 * so a refresh or a closed tab brings the editor back where it was.
 */
const DB_NAME = 'video-editor';
const VERSION = 1;
const ASSETS = 'assets';
const STATE = 'state';

type StoredAsset = Omit<MediaAsset, 'url'>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDb());

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export async function saveAsset(asset: MediaAsset): Promise<void> {
  const { url: _url, ...stored } = asset;
  await run(ASSETS, 'readwrite', (s) => s.put(stored));
}

export async function deleteAssets(ids: string[]): Promise<void> {
  await run(ASSETS, 'readwrite', (s) => {
    for (const id of ids) s.delete(id);
  });
}

export async function saveProject(project: Project): Promise<void> {
  await run(STATE, 'readwrite', (s) => s.put(project, 'project'));
}

export async function clearAll(): Promise<void> {
  await run(ASSETS, 'readwrite', (s) => s.clear());
  await run(STATE, 'readwrite', (s) => s.clear());
}

export async function loadSaved(): Promise<{ project: Project; assets: MediaAsset[] } | null> {
  const project = await run<Project>(STATE, 'readonly', (s) => s.get('project'));
  const stored = (await run<StoredAsset[]>(ASSETS, 'readonly', (s) => s.getAll())) ?? [];
  if (!project) return null;
  const assets = stored.map((a) => {
    const url = URL.createObjectURL(a.file);
    // Image thumbnails pointed at the previous session's object URL.
    return { ...a, url, thumbnail: a.kind === 'image' ? url : a.thumbnail };
  });
  // Projects saved before a field existed get its default.
  return {
    project: {
      ...project,
      overlays: project.overlays ?? [],
      clips: project.clips.map((c) => ({ ...c, motion: c.motion ?? null })),
    },
    assets,
  };
}
