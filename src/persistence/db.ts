/**
 * Envoltorio mínimo y tipado sobre IndexedDB (sin dependencias externas).
 *
 * Almacenes:
 *  - meta:     lista de perfiles y perfil activo.
 *  - profiles: estado completo de cada perfil (clave = id del perfil).
 *  - backups:  copias de seguridad (índice por perfil).
 */
export const DB_NAME = 'nexus-finance';
export const DB_VERSION = 1;

export const STORES = { meta: 'meta', profiles: 'profiles', backups: 'backups' } as const;

export function openDatabase(name: string = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no admite IndexedDB: no es posible guardar los datos.'));
      return;
    }
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta);
      if (!db.objectStoreNames.contains(STORES.profiles)) db.createObjectStore(STORES.profiles);
      if (!db.objectStoreNames.contains(STORES.backups)) {
        const b = db.createObjectStore(STORES.backups, { keyPath: 'id' });
        b.createIndex('profileId', 'profileId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir la base de datos local.'));
    req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
  });
}

export async function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  const tx = db.transaction(store, 'readonly');
  const v = await promisify(tx.objectStore(store).get(key));
  return v as T | undefined;
}

export async function idbPut(db: IDBDatabase, store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  await txDone(tx);
}

export async function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function idbGetAllByIndex<T>(db: IDBDatabase, store: string, index: string, key: IDBValidKey): Promise<T[]> {
  const tx = db.transaction(store, 'readonly');
  const v = await promisify(tx.objectStore(store).index(index).getAll(key));
  return v as T[];
}

/** Escritura atómica de varias claves en varios almacenes. */
export async function idbWriteMany(
  db: IDBDatabase,
  ops: { store: string; value?: unknown; key?: IDBValidKey; delete?: boolean }[],
): Promise<void> {
  const stores = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(stores, 'readwrite');
  for (const op of ops) {
    const st = tx.objectStore(op.store);
    if (op.delete) st.delete(op.key!);
    else st.put(op.value, op.key);
  }
  await txDone(tx);
}
