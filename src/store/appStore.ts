/**
 * Store de la aplicación: perfil activo, despacho de comandos al motor,
 * autoguardado en IndexedDB y reloj de simulación en tiempo real.
 *
 * La interfaz NUNCA modifica balances directamente: llama a `dispatch()`,
 * que delega en el motor de comandos (src/engine/commands.ts).
 */
import type { Currency, ProfileMeta, ProfileState } from '@/core/schema';
import { randomSeed } from '@/core/random';
import { execute, isDomainError, type CommandType, type PayloadOf, type ResultOf } from '@/engine/commands';
import { createProfileState } from '@/engine/factory';
import { computeOverview } from '@/engine/selectors';
import { computeCreditScore } from '@/engine/creditScore';
import { seedDemo } from '@/engine/demo';
import { Repository, type BackupMeta } from '@/persistence/repository';
import { exportFileName, parseProfileFile, serializeProfile } from '@/persistence/exportImport';
import { pushToast } from './toast';

export type Phase = 'booting' | 'onboarding' | 'ready' | 'error';

export interface AppState {
  phase: Phase;
  error: string | null;
  profiles: ProfileMeta[];
  profile: ProfileState | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: number | null;
  busy: string | null;
}

export type DispatchResult<R> = { ok: true; result: R } | { ok: false; error: { code: string; message: string } };

export interface CreateProfileInput {
  name: string;
  ownerName: string;
  baseCurrency: Currency;
  country: string;
  mode: 'empty' | 'quick' | 'demo';
  initialBalance?: number;
  seed?: number;
  color?: string;
}

const PROFILE_COLORS = ['#5488F5', '#24C78A', '#A78BFA', '#F5A524', '#F05B65', '#22B8CF'];
const AUTO_BACKUP_KEY = 'nexus:lastAutoBackup';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `p_${crypto.randomUUID().slice(0, 13)}`;
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export class AppStore {
  private state: AppState = {
    phase: 'booting',
    error: null,
    profiles: [],
    profile: null,
    saveStatus: 'idle',
    lastSavedAt: null,
    busy: null,
  };
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private dirty = false;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private tickAcc = 0;
  readonly repo: Repository;

  constructor(repo = new Repository()) {
    this.repo = repo;
  }

  getState = (): AppState => this.state;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /* ---------------------------------------------------------------- */
  /* Arranque                                                          */
  /* ---------------------------------------------------------------- */

  async boot(): Promise<void> {
    try {
      const profiles = await this.repo.listProfiles();
      if (profiles.length === 0) {
        this.set({ phase: 'onboarding', profiles });
        return;
      }
      const activeId = (await this.repo.getActiveProfileId()) ?? profiles[0].id;
      const id = profiles.some((p) => p.id === activeId) ? activeId : profiles[0].id;
      const profile = await this.repo.loadProfile(id);
      if (!profile) {
        this.set({ phase: 'onboarding', profiles });
        return;
      }
      this.set({ phase: 'ready', profiles, profile });
      this.startTicker();
      void this.autoBackup();
    } catch (e) {
      this.set({ phase: 'error', error: e instanceof Error ? e.message : 'No se pudieron cargar los datos locales.' });
    }
  }

  private async autoBackup(): Promise<void> {
    const p = this.state.profile;
    if (!p) return;
    try {
      const last = Number(localStorage.getItem(`${AUTO_BACKUP_KEY}:${p.profile.id}`) ?? 0);
      if (Date.now() - last < 24 * 3_600_000) return;
      await this.repo.createBackup(p, 'auto');
      localStorage.setItem(`${AUTO_BACKUP_KEY}:${p.profile.id}`, String(Date.now()));
    } catch {
      /* el almacenamiento local puede no estar disponible */
    }
  }

  /* ---------------------------------------------------------------- */
  /* Comandos                                                          */
  /* ---------------------------------------------------------------- */

  dispatch<K extends CommandType>(type: K, payload: PayloadOf<K>, opId?: string): DispatchResult<ResultOf<K>> {
    const current = this.state.profile;
    if (!current) return { ok: false, error: { code: 'NO_PROFILE', message: 'No hay ningún perfil activo.' } };
    try {
      const { state, result } = execute(current, type, payload, opId);
      const isClock = type === 'clock/advance';
      const prevTop = current.notifications[0]?.id;
      this.set({ profile: state });
      if (isClock) this.toastNewNotifications(state, prevTop);
      this.scheduleSave(isClock ? 4000 : 120);
      return { ok: true, result };
    } catch (e) {
      if (isDomainError(e)) return { ok: false, error: { code: e.code, message: e.message } };
      console.error(e);
      return { ok: false, error: { code: 'UNEXPECTED', message: 'Se produjo un error inesperado. La operación no se ha aplicado.' } };
    }
  }

  private toastNewNotifications(state: ProfileState, prevTop?: string): void {
    const fresh: ProfileState['notifications'] = [];
    for (const n of state.notifications) {
      if (n.id === prevTop) break;
      fresh.push(n);
    }
    if (fresh.length === 0) return;
    for (const n of fresh.slice(0, 3)) {
      pushToast(n.level === 'danger' ? 'error' : n.level, n.title, n.body);
    }
    if (fresh.length > 3) pushToast('info', `Y ${fresh.length - 3} notificaciones más`, 'Consúltalas en el centro de notificaciones.');
  }

  /* ---------------------------------------------------------------- */
  /* Guardado automático                                               */
  /* ---------------------------------------------------------------- */

  private scheduleSave(delay: number): void {
    this.dirty = true;
    if (this.saveTimer) {
      if (delay > 1000) return; // ya hay un guardado programado
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, delay);
  }

  async flush(): Promise<void> {
    if (this.saving) await this.saving;
    if (!this.dirty || !this.state.profile) return;
    const snapshot = this.state.profile;
    this.dirty = false;
    this.set({ saveStatus: 'saving' });
    this.saving = (async () => {
      try {
        await this.repo.saveProfile(snapshot);
        const profiles = await this.repo.listProfiles();
        this.set({ saveStatus: 'saved', lastSavedAt: Date.now(), profiles });
      } catch (e) {
        this.dirty = true;
        this.set({ saveStatus: 'error' });
        pushToast('error', 'No se pudo guardar', e instanceof Error ? e.message : undefined);
      } finally {
        this.saving = null;
      }
    })();
    await this.saving;
  }

  /* ---------------------------------------------------------------- */
  /* Reloj en tiempo real                                              */
  /* ---------------------------------------------------------------- */

  startTicker(): void {
    if (this.ticker || typeof window === 'undefined') return;
    this.ticker = setInterval(() => {
      const p = this.state.profile;
      if (!p || this.state.phase !== 'ready' || p.clock.speed <= 0) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      this.tickAcc += p.clock.speed;
      if (this.tickAcc >= 1) {
        const hours = Math.floor(this.tickAcc);
        this.tickAcc -= hours;
        this.dispatch('clock/advance', { hours });
      }
    }, 1000);
  }

  stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  /* ---------------------------------------------------------------- */
  /* Perfiles                                                          */
  /* ---------------------------------------------------------------- */

  async createProfile(input: CreateProfileInput): Promise<void> {
    this.set({ busy: 'Creando perfil…' });
    try {
      await this.flush();
      // Cede el hilo para que la interfaz muestre el estado de carga.
      await new Promise((r) => setTimeout(r, 30));
      let state = createProfileState({
        id: newId(),
        name: input.name,
        ownerName: input.ownerName,
        baseCurrency: input.baseCurrency,
        country: input.country,
        seed: input.seed ?? randomSeed(),
        now: new Date(),
        color: input.color ?? PROFILE_COLORS[this.state.profiles.length % PROFILE_COLORS.length],
      });
      if (input.mode === 'demo') state = seedDemo(state);
      else if (input.mode === 'quick') {
        state = execute(state, 'account/create', { name: 'Cuenta principal', type: 'checking', initialBalance: input.initialBalance ?? 0 }).state;
      }
      // El punto inicial del historial refleja el patrimonio tras preparar el perfil.
      const startAt = state.netWorthHistory[0]?.at ?? state.profile.createdAt;
      state = {
        ...state,
        netWorthHistory: [{ at: startAt, v: computeOverview(state).netWorth }],
        creditHistory: [{ at: startAt, score: computeCreditScore(state).score }],
      };
      await this.repo.saveProfile(state);
      await this.repo.setActiveProfileId(state.profile.id);
      const profiles = await this.repo.listProfiles();
      this.tickAcc = 0;
      this.set({ phase: 'ready', profiles, profile: state, busy: null });
      this.startTicker();
    } catch (e) {
      this.set({ busy: null });
      throw e;
    }
  }

  async switchProfile(id: string): Promise<void> {
    if (this.state.profile?.profile.id === id) return;
    this.set({ busy: 'Cambiando de perfil…' });
    try {
      await this.flush();
      const profile = await this.repo.loadProfile(id);
      if (!profile) throw new Error('Perfil no encontrado.');
      await this.repo.setActiveProfileId(id);
      this.tickAcc = 0;
      this.set({ profile, phase: 'ready', busy: null });
      void this.autoBackup();
    } catch (e) {
      this.set({ busy: null });
      throw e;
    }
  }

  async deleteProfile(id: string): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.state.profile?.profile.id === id) this.dirty = false;
    await this.repo.deleteProfile(id);
    const profiles = await this.repo.listProfiles();
    if (this.state.profile?.profile.id === id) {
      if (profiles.length === 0) {
        this.set({ profiles, profile: null, phase: 'onboarding' });
        return;
      }
      const next = await this.repo.loadProfile(profiles[0].id);
      await this.repo.setActiveProfileId(profiles[0].id);
      this.set({ profiles, profile: next });
    } else {
      this.set({ profiles });
    }
  }

  async duplicateProfile(id: string): Promise<void> {
    await this.flush();
    const src = await this.repo.loadProfile(id);
    if (!src) throw new Error('Perfil no encontrado.');
    const copy: ProfileState = { ...src, profile: { ...src.profile, id: newId(), name: `${src.profile.name} (copia)`.slice(0, 60) } };
    await this.repo.saveProfile(copy);
    this.set({ profiles: await this.repo.listProfiles() });
  }

  /* ---------------------------------------------------------------- */
  /* Exportación, importación y copias                                 */
  /* ---------------------------------------------------------------- */

  async exportProfile(id?: string): Promise<{ fileName: string; text: string }> {
    await this.flush();
    const state = id && id !== this.state.profile?.profile.id ? await this.repo.loadProfile(id) : this.state.profile;
    if (!state) throw new Error('Perfil no encontrado.');
    return { fileName: exportFileName(state), text: serializeProfile(state) };
  }

  /** Importa un perfil. Si el id ya existe se importa como perfil nuevo. */
  async importProfile(text: string): Promise<ProfileState> {
    const parsed = parseProfileFile(text);
    await this.flush();
    const exists = this.state.profiles.some((p) => p.id === parsed.profile.id);
    const state: ProfileState = exists
      ? { ...parsed, profile: { ...parsed.profile, id: newId(), name: `${parsed.profile.name} (importado)`.slice(0, 60) } }
      : parsed;
    await this.repo.saveProfile(state);
    await this.repo.setActiveProfileId(state.profile.id);
    this.tickAcc = 0;
    this.set({ profiles: await this.repo.listProfiles(), profile: state, phase: 'ready' });
    this.startTicker();
    return state;
  }

  async createBackup(): Promise<BackupMeta> {
    await this.flush();
    const p = this.state.profile;
    if (!p) throw new Error('No hay perfil activo.');
    return this.repo.createBackup(p, 'manual');
  }

  async listBackups(): Promise<BackupMeta[]> {
    const p = this.state.profile;
    return p ? this.repo.listBackups(p.profile.id) : [];
  }

  async restoreBackup(backupId: string): Promise<void> {
    const p = this.state.profile;
    if (!p) return;
    const data = await this.repo.readBackup(backupId);
    if (data.profile.id !== p.profile.id) throw new Error('La copia pertenece a otro perfil.');
    await this.repo.createBackup(p, 'pre-restore');
    await this.repo.saveProfile(data);
    this.dirty = false;
    this.set({ profile: data, profiles: await this.repo.listProfiles() });
  }

  async deleteBackup(id: string): Promise<void> {
    await this.repo.deleteBackup(id);
  }
}

export const appStore = new AppStore();

if (typeof window !== 'undefined') {
  const flushNow = () => void appStore.flush();
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
}
