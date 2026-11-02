import type { ProfileState } from '@/core/schema';
import { createProfileState } from '@/engine/factory';
import { execute, type CommandType, type PayloadOf, type ResultOf } from '@/engine/commands';

export const FIXED_NOW = new Date('2026-03-10T09:00:00.000Z');

export function newState(overrides: Partial<Parameters<typeof createProfileState>[0]> = {}): ProfileState {
  return createProfileState({
    id: 'p_test',
    name: 'Test',
    ownerName: 'Ana Prueba',
    baseCurrency: 'EUR',
    country: 'ES',
    seed: 12345,
    now: FIXED_NOW,
    historyDays: 30,
    listings: 6,
    ...overrides,
  });
}

/** Pequeño "intérprete" que encadena comandos sobre un estado mutable de prueba. */
export class Sim {
  state: ProfileState;
  constructor(state: ProfileState = newState()) {
    this.state = state;
  }
  run<K extends CommandType>(type: K, payload: PayloadOf<K>, opId?: string): ResultOf<K> {
    const r = execute(this.state, type, payload, opId);
    this.state = r.state;
    return r.result;
  }
  advanceDays(days: number): void {
    this.run('clock/advance', { hours: days * 24 });
  }
  account(id: string) {
    const a = this.state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('no account');
    return a;
  }
  balance(id: string): number {
    return this.account(id).balance;
  }
}

/** Avanza hasta la medianoche del día 1 del mes siguiente. */
export function hoursToNextMonth(s: ProfileState): number {
  const now = new Date(Date.parse(s.clock.startAt) + s.clock.tick * 3_600_000);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.ceil((next - now.getTime()) / 3_600_000);
}
