/** Tema visual (preferencia por dispositivo, no forma parte del perfil financiero). */
import { useMemo, useSyncExternalStore } from 'react';

export type ThemePref = 'dark' | 'light' | 'system';
const KEY = 'nexus:theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
  } catch {
    /* almacenamiento no disponible */
  }
  return 'dark';
}

let pref: ThemePref = typeof window === 'undefined' ? 'dark' : readPref();
const listeners = new Set<() => void>();

function systemTheme(): 'dark' | 'light' {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolvedTheme(): 'dark' | 'light' {
  return pref === 'system' ? systemTheme() : pref;
}

export function applyTheme(): void {
  if (typeof document === 'undefined') return;
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#101216' : '#F3F4F7');
}

export function setThemePref(next: ThemePref): void {
  pref = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* almacenamiento no disponible */
  }
  applyTheme();
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (pref === 'system') {
      applyTheme();
      listeners.forEach((l) => l());
    }
  });
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pref,
  );
}

export interface ThemeColors {
  fg: string;
  muted: string;
  subtle: string;
  line: string;
  surface: string;
  surface2: string;
  pos: string;
  neg: string;
  accent: string;
  warn: string;
  series: string[];
}

/** Colores resueltos del tema actual para las gráficas (SVG). */
export function useThemeColors(): ThemeColors {
  const p = useThemePref();
  const resolved = p === 'system' ? systemTheme() : p;
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return {
      fg: v('--nx-fg'),
      muted: v('--nx-muted'),
      subtle: v('--nx-subtle'),
      line: v('--nx-line'),
      surface: v('--nx-surface'),
      surface2: v('--nx-surface-2'),
      pos: v('--nx-pos'),
      neg: v('--nx-neg'),
      accent: v('--nx-accent'),
      warn: v('--nx-warn'),
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--nx-s${i}`)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);
}
