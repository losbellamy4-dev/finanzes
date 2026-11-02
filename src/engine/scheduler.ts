/**
 * PLANIFICADOR TEMPORAL.
 *
 * Avanza el reloj simulado hora a hora. En cada tick se mueven los precios y
 * se vigilan los derivados; al cambiar de día se procesan todos los eventos
 * del calendario financiero (transferencias programadas, cuotas, extractos,
 * rentas, intereses, dividendos, revalorizaciones...).
 */
import { current, isDraft } from 'immer';
import { HOURS_PER_DAY } from '@/core/time';
import { DomainError, notify, nowDate, nowISO, type S } from './context';
import { stepMarketTick, thawMarket } from './market';
import { processDerivatives } from './derivatives';
import { checkScenarioExpiry } from './marketAdmin';
import { payAccountInterest, processRequests, processSchedules, settlePendingTransfers } from './banking';
import { processCardsDay } from './cards';
import { payDistributions } from './portfolio';
import { payGoalInterest, processGoalContributions } from './products/savings';
import { processDeposits } from './products/deposits';
import { chargeCreditLineInterest, processLoans } from './products/loans';
import { processInsurance } from './products/insurance';
import { processRentals, revalueProperties } from './realestate';
import { recordCreditScore } from './creditScore';
import { computeOverview } from './selectors';

export const MAX_ADVANCE_HOURS = 24 * 400;

function safe(s: S, label: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof DomainError ? e.message : e instanceof Error ? e.message : String(e);
    notify(s, 'warning', `Incidencia en ${label}`, msg);
  }
}

export function recordNetWorth(s: S): void {
  const v = computeOverview(s).netWorth;
  s.netWorthHistory.push({ at: nowISO(s), v });
  if (s.netWorthHistory.length > 1500) s.netWorthHistory.splice(0, s.netWorthHistory.length - 1500);
}

/** Procesa los eventos financieros del día que acaba de comenzar. */
export function processDay(s: S): void {
  const day = nowDate(s).getUTCDate();
  safe(s, 'transferencias pendientes', () => settlePendingTransfers(s));
  safe(s, 'transferencias programadas', () => processSchedules(s));
  safe(s, 'aportaciones de ahorro', () => processGoalContributions(s));
  safe(s, 'préstamos', () => processLoans(s));
  safe(s, 'tarjetas', () => processCardsDay(s));
  safe(s, 'depósitos', () => processDeposits(s));
  safe(s, 'seguros', () => processInsurance(s));
  safe(s, 'alquileres', () => processRentals(s));
  safe(s, 'solicitudes de dinero', () => processRequests(s));
  if (day === 1) {
    safe(s, 'intereses de cuentas', () => payAccountInterest(s));
    safe(s, 'intereses de ahorro', () => payGoalInterest(s));
    safe(s, 'líneas de crédito', () => chargeCreditLineInterest(s));
    safe(s, 'dividendos', () => payDistributions(s));
    safe(s, 'revalorización inmobiliaria', () => revalueProperties(s));
  }
  safe(s, 'credit score', () => recordCreditScore(s));
  safe(s, 'patrimonio', () => recordNetWorth(s));
}

/** Avanza el reloj `hours` horas simuladas. */
export function advanceClock(s: S, p: { hours: number }): number {
  const hours = Math.floor(p.hours);
  if (!Number.isFinite(hours) || hours < 1) return 0;
  const n = Math.min(hours, MAX_ADVANCE_HOURS);
  // El mercado se simula sobre una copia mutable (sin proxies de Immer).
  s.market = thawMarket(isDraft(s.market) ? current(s.market) : s.market);
  for (let i = 0; i < n; i++) {
    const tick = s.clock.tick + 1;
    stepMarketTick(s.market, tick, true);
    s.clock.tick = tick;
    checkScenarioExpiry(s);
    processDerivatives(s);
    if (tick % HOURS_PER_DAY === 0) processDay(s);
  }
  return n;
}
