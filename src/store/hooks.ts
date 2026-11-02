import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Currency, ProfileState } from '@/core/schema';
import { formatMoney, type FormatMoneyOptions } from '@/core/money';
import { computeOverview } from '@/engine/selectors';
import type { CommandType, PayloadOf, ResultOf } from '@/engine/commands';
import { appStore, type AppState } from './appStore';
import { toast } from './toast';
import { tickToDate } from '@/core/time';

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(appStore.subscribe, () => selector(appStore.getState()));
}

/** Perfil activo (solo se usa dentro de pantallas con perfil cargado). */
export function useProfile(): ProfileState {
  const p = useApp((s) => s.profile);
  if (!p) throw new Error('No hay perfil activo');
  return p;
}

export function useOverview() {
  const p = useProfile();
  return useMemo(() => computeOverview(p), [p]);
}

export function useNow(): Date {
  const p = useProfile();
  return tickToDate(p.clock.startAt, p.clock.tick);
}

/** Formateador de importes ligado a la divisa base y a la opción de ocultar saldos. */
export function useMoney() {
  const p = useProfile();
  const hide = p.settings.hideBalances;
  const cur = p.profile.baseCurrency;
  return useCallback(
    (cents: number, opts: FormatMoneyOptions & { currency?: Currency; reveal?: boolean } = {}) =>
      formatMoney(cents, opts.currency ?? cur, { ...opts, hide: hide && !opts.reveal }),
    [hide, cur],
  );
}

function newOpId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Ejecuta operaciones del motor desde formularios.
 * - Genera un opId por intento: si el usuario pulsa dos veces, la segunda
 *   petición se rechaza en el motor (y además el botón queda deshabilitado).
 * - Muestra avisos de éxito o error.
 */
export function useOperation() {
  const [pending, setPending] = useState(false);
  const opRef = useRef<string>(newOpId());
  const busy = useRef(false);

  const run = useCallback(
    <K extends CommandType>(
      type: K,
      payload: PayloadOf<K>,
      opts: { success?: string | ((r: ResultOf<K>) => string); silent?: boolean } = {},
    ): { ok: true; result: ResultOf<K> } | { ok: false; message: string } => {
      if (busy.current) return { ok: false, message: 'Operación en curso' };
      busy.current = true;
      setPending(true);
      try {
        const r = appStore.dispatch(type, payload, opRef.current);
        if (r.ok) {
          opRef.current = newOpId();
          if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r.result) : opts.success);
          return { ok: true, result: r.result };
        }
        if (r.error.code !== 'DUPLICATE_OPERATION') {
          opRef.current = newOpId();
          if (!opts.silent) toast.error('Operación rechazada', r.error.message);
        }
        return { ok: false, message: r.error.message };
      } finally {
        busy.current = false;
        // Pequeño retardo para evitar dobles pulsaciones.
        setTimeout(() => setPending(false), 250);
      }
    },
    [],
  );
  return { run, pending };
}

export function dispatch<K extends CommandType>(type: K, payload: PayloadOf<K>) {
  return appStore.dispatch(type, payload);
}
