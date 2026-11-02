/** Sistema de avisos efímeros (toasts) y diálogos de confirmación. */
import { useSyncExternalStore } from 'react';

export type ToastLevel = 'success' | 'error' | 'info' | 'warning';
export interface Toast {
  id: number;
  level: ToastLevel;
  title: string;
  body?: string;
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushToast(level: ToastLevel, title: string, body?: string, ttl = 4200): void {
  const t: Toast = { id: ++seq, level, title, body };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => dismissToast(t.id), ttl);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (title: string, body?: string) => pushToast('success', title, body),
  error: (title: string, body?: string) => pushToast('error', title, body, 6000),
  info: (title: string, body?: string) => pushToast('info', title, body),
  warning: (title: string, body?: string) => pushToast('warning', title, body, 5500),
};

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
  );
}

/* ---------------- Confirmación ---------------- */

export interface ConfirmRequest {
  title: string;
  body?: string;
  details?: { label: string; value: string }[];
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  resolve: (ok: boolean) => void;
}

let confirmReq: ConfirmRequest | null = null;
const confirmListeners = new Set<() => void>();

export function confirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq = { ...opts, resolve };
    confirmListeners.forEach((l) => l());
  });
}

export function closeConfirm(ok: boolean): void {
  const r = confirmReq;
  confirmReq = null;
  confirmListeners.forEach((l) => l());
  r?.resolve(ok);
}

export function useConfirmRequest(): ConfirmRequest | null {
  return useSyncExternalStore(
    (l) => {
      confirmListeners.add(l);
      return () => confirmListeners.delete(l);
    },
    () => confirmReq,
  );
}
