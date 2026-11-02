/**
 * Utilidades compartidas por todos los módulos del motor.
 * Ninguna de estas funciones depende de React ni del navegador.
 */
import type { Account, AppNotification, ProfileState } from '@/core/schema';
import { MAX_OPERATION_CENTS, type Cents } from '@/core/money';
import { dayIndexOfTick, tickToDate, tickToISO } from '@/core/time';
import { uniformAt } from '@/core/random';

export type S = ProfileState;

export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'DomainError';
  }
}

export function fail(code: string, message: string): never {
  throw new DomainError(code, message);
}

export function nowISO(s: S): string {
  return tickToISO(s.clock.startAt, s.clock.tick);
}

export function nowDate(s: S): Date {
  return tickToDate(s.clock.startAt, s.clock.tick);
}

export function today(s: S): number {
  return dayIndexOfTick(s.clock.tick);
}

/** Identificadores deterministas basados en un contador del perfil. */
export function nextId(s: S, prefix: string): string {
  s.seq += 1;
  return `${prefix}_${s.seq.toString(36).padStart(5, '0')}`;
}

export function rand(s: S, key: string, index: number): number {
  return uniformAt(s.market.seed, key, index);
}

export function notify(
  s: S,
  level: AppNotification['level'],
  title: string,
  body: string,
  link?: string,
): void {
  s.notifications.unshift({ id: nextId(s, 'ntf'), at: nowISO(s), level, title, body, read: false, link });
  if (s.notifications.length > 200) s.notifications.length = 200;
}

export function assertAmount(amount: unknown, label = 'El importe'): asserts amount is Cents {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isInteger(amount)) {
    fail('INVALID_AMOUNT', `${label} no es válido.`);
  }
  if (amount <= 0) fail('INVALID_AMOUNT', `${label} debe ser mayor que cero.`);
  if (amount > MAX_OPERATION_CENTS) fail('INVALID_AMOUNT', `${label} supera el máximo permitido por operación.`);
}

export function assertText(value: unknown, label: string, max = 80): string {
  if (typeof value !== 'string' || !value.trim()) fail('INVALID_INPUT', `${label} es obligatorio.`);
  const v = value.trim();
  if (v.length > max) fail('INVALID_INPUT', `${label} no puede superar ${max} caracteres.`);
  return v;
}

export function findAccount(s: S, id: string | undefined): Account {
  const acc = s.accounts.find((a) => a.id === id);
  if (!acc) fail('ACCOUNT_NOT_FOUND', 'La cuenta indicada no existe.');
  return acc;
}

export function openAccount(s: S, id: string | undefined): Account {
  const acc = findAccount(s, id);
  if (acc.status !== 'open') fail('ACCOUNT_CLOSED', `La cuenta «${acc.name}» está cerrada.`);
  return acc;
}

export function findById<T extends { id: string }>(list: T[], id: string, what: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) fail('NOT_FOUND', `${what} no encontrado.`);
  return item;
}

export function base(s: S) {
  return s.profile.baseCurrency;
}

export function addCreditEvent(
  s: S,
  type: ProfileState['creditEvents'][number]['type'],
  description: string,
): void {
  s.creditEvents.push({ at: nowISO(s), type, description });
  if (s.creditEvents.length > 500) s.creditEvents.splice(0, s.creditEvents.length - 500);
}
