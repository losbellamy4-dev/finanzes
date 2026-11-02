/**
 * Repositorio de perfiles sobre IndexedDB: guardado, carga validada,
 * lista de perfiles, perfil activo y copias de seguridad.
 */
import type { ProfileMeta, ProfileState } from '@/core/schema';
import { DB_NAME, STORES, idbDelete, idbGet, idbGetAllByIndex, idbPut, idbWriteMany, openDatabase } from './db';
import { validateState } from './exportImport';

export interface BackupMeta {
  id: string;
  profileId: string;
  profileName: string;
  createdAt: string;
  reason: 'manual' | 'auto' | 'pre-import' | 'pre-restore';
  size: number;
}

interface BackupRecord extends BackupMeta {
  data: ProfileState;
}

export const MAX_BACKUPS_PER_PROFILE = 10;

function metaOf(state: ProfileState): ProfileMeta {
  return {
    id: state.profile.id,
    name: state.profile.name,
    ownerName: state.profile.ownerName,
    baseCurrency: state.profile.baseCurrency,
    color: state.profile.color,
    createdAt: state.profile.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

export class Repository {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly dbName: string;

  constructor(dbName: string = DB_NAME) {
    this.dbName = dbName;
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDatabase(this.dbName);
    return this.dbPromise;
  }

  async close(): Promise<void> {
    if (this.dbPromise) {
      (await this.dbPromise).close();
      this.dbPromise = null;
    }
  }

  async listProfiles(): Promise<ProfileMeta[]> {
    return (await idbGet<ProfileMeta[]>(await this.db(), STORES.meta, 'profiles')) ?? [];
  }

  async getActiveProfileId(): Promise<string | null> {
    return (await idbGet<string>(await this.db(), STORES.meta, 'activeProfileId')) ?? null;
  }

  async setActiveProfileId(id: string | null): Promise<void> {
    const db = await this.db();
    if (id) await idbPut(db, STORES.meta, id, 'activeProfileId');
    else await idbDelete(db, STORES.meta, 'activeProfileId');
  }

  /** Guarda el estado y actualiza la lista de perfiles en una sola transacción. */
  async saveProfile(state: ProfileState): Promise<void> {
    const db = await this.db();
    const list = await this.listProfiles();
    const meta = metaOf(state);
    const idx = list.findIndex((p) => p.id === meta.id);
    const next = idx >= 0 ? list.map((p, i) => (i === idx ? meta : p)) : [...list, meta];
    await idbWriteMany(db, [
      { store: STORES.profiles, key: state.profile.id, value: state },
      { store: STORES.meta, key: 'profiles', value: next },
    ]);
  }

  /** Carga y valida un perfil (aplicando migraciones si es necesario). */
  async loadProfile(id: string): Promise<ProfileState | null> {
    const raw = await idbGet<unknown>(await this.db(), STORES.profiles, id);
    if (raw === undefined) return null;
    return validateState(raw);
  }

  async deleteProfile(id: string): Promise<void> {
    const db = await this.db();
    const list = (await this.listProfiles()).filter((p) => p.id !== id);
    const backups = await this.listBackups(id);
    await idbWriteMany(db, [
      { store: STORES.profiles, key: id, delete: true },
      { store: STORES.meta, key: 'profiles', value: list },
      ...backups.map((b) => ({ store: STORES.backups, key: b.id, delete: true })),
    ]);
    if ((await this.getActiveProfileId()) === id) await this.setActiveProfileId(list[0]?.id ?? null);
  }

  async createBackup(state: ProfileState, reason: BackupMeta['reason'] = 'manual'): Promise<BackupMeta> {
    const db = await this.db();
    const record: BackupRecord = {
      id: `bkp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      profileId: state.profile.id,
      profileName: state.profile.name,
      createdAt: new Date().toISOString(),
      reason,
      size: JSON.stringify(state).length,
      data: state,
    };
    await idbPut(db, STORES.backups, record);
    const all = await this.listBackups(state.profile.id);
    const excess = all.slice(MAX_BACKUPS_PER_PROFILE);
    if (excess.length) await idbWriteMany(db, excess.map((b) => ({ store: STORES.backups, key: b.id, delete: true })));
    const { data: _omit, ...meta } = record;
    void _omit;
    return meta;
  }

  async listBackups(profileId: string): Promise<BackupMeta[]> {
    const rows = await idbGetAllByIndex<BackupRecord>(await this.db(), STORES.backups, 'profileId', profileId);
    return rows
      .map(({ data: _d, ...meta }) => {
        void _d;
        return meta;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async readBackup(backupId: string): Promise<ProfileState> {
    const rec = await idbGet<BackupRecord>(await this.db(), STORES.backups, backupId);
    if (!rec) throw new Error('Copia de seguridad no encontrada.');
    return validateState(rec.data);
  }

  async deleteBackup(backupId: string): Promise<void> {
    await idbDelete(await this.db(), STORES.backups, backupId);
  }
}
