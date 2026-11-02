/**
 * Reloj simulado.
 *
 * El tiempo del simulador se mide en "ticks" de una hora desde el inicio del
 * perfil (medianoche UTC del día de creación). Todo el calendario financiero
 * (cuotas, rentas, extractos...) se basa en este reloj, no en el reloj real,
 * para que la simulación sea determinista y comprobable.
 */

export const HOURS_PER_DAY = 24;
export const HOURS_PER_YEAR = 24 * 365;
const HOUR_MS = 3_600_000;
const DAY_MS = HOUR_MS * 24;

export function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function tickToDate(startAt: string, tick: number): Date {
  return new Date(Date.parse(startAt) + tick * HOUR_MS);
}

export function tickToISO(startAt: string, tick: number): string {
  return tickToDate(startAt, tick).toISOString();
}

export function dayIndexOfTick(tick: number): number {
  return Math.floor(tick / HOURS_PER_DAY);
}

export function dayToDate(startAt: string, day: number): Date {
  return new Date(Date.parse(startAt) + day * DAY_MS);
}

export function dateToTick(startAt: string, date: Date | string): number {
  const ms = typeof date === 'string' ? Date.parse(date) : date.getTime();
  return Math.floor((ms - Date.parse(startAt)) / HOUR_MS);
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Suma meses respetando el último día del mes (31 ene + 1 mes = 28/29 feb). */
export function addMonthsUTC(date: Date, months: number, anchorDay?: number): Date {
  const day = anchorDay ?? date.getUTCDate();
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1, date.getUTCHours()));
  const dim = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  target.setUTCDate(Math.min(day, dim));
  return target;
}

export function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export type Frequency = 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export function nextOccurrence(date: Date, frequency: Frequency, anchorDay?: number): Date {
  switch (frequency) {
    case 'daily':
      return addDaysUTC(date, 1);
    case 'weekly':
      return addDaysUTC(date, 7);
    case 'biweekly':
      return addDaysUTC(date, 14);
    case 'monthly':
      return addMonthsUTC(date, 1, anchorDay);
    case 'quarterly':
      return addMonthsUTC(date, 3, anchorDay);
    case 'yearly':
      return addMonthsUTC(date, 12, anchorDay);
    default:
      return date;
  }
}

export const PERIODS_PER_YEAR: Record<Exclude<Frequency, 'once' | 'daily'>, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

export function sameUTCDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
  );
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const ta = typeof a === 'string' ? Date.parse(a) : a.getTime();
  const tb = typeof b === 'string' ? Date.parse(b) : b.getTime();
  return (tb - ta) / DAY_MS;
}

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});
const shortFmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

const toDate = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d);

export const formatDate = (d: Date | string) => dateFmt.format(toDate(d));
export const formatDateTime = (d: Date | string) => dateTimeFmt.format(toDate(d));
export const formatShortDate = (d: Date | string) => shortFmt.format(toDate(d));
export const formatMonth = (d: Date | string) => monthFmt.format(toDate(d));
export const formatTime = (d: Date | string) => timeFmt.format(toDate(d));

/** Fecha ISO (YYYY-MM-DD) para inputs de tipo date. */
export function toDateInput(d: Date | string): string {
  return toDate(d).toISOString().slice(0, 10);
}

export function fromDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
