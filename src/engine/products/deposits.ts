/**
 * DEPÓSITOS A PLAZO FIJO Y ESTRUCTURADOS.
 *
 * - Fijo: interés simple anual pagado al vencimiento. Cancelación anticipada
 *   con penalización sobre los intereses devengados.
 * - Estructurado: capital garantizado; la rentabilidad depende de la
 *   evolución de un índice del mercado simulado (participación con tope).
 */
import type { TermDeposit } from '@/core/schema';
import { formatMoney } from '@/core/money';
import { addMonthsUTC, daysBetween, startOfUTCDay } from '@/core/time';
import { assertAmount, base, fail, findById, nextId, notify, nowDate, nowISO, openAccount, type S } from '../context';
import { accountEndpoint, post, receivedAmount } from '../ledger';
import { assetById } from '../market';

export interface OpenDepositInput {
  kind: 'fixed' | 'structured';
  accountId: string;
  amount: number;
  termMonths: number;
  rate?: number;
  underlyingId?: string;
  participation?: number;
  cap?: number;
  opId?: string;
}

export function suggestedDepositRate(termMonths: number): number {
  if (termMonths <= 3) return 0.018;
  if (termMonths <= 6) return 0.022;
  if (termMonths <= 12) return 0.027;
  if (termMonths <= 24) return 0.03;
  return 0.032;
}

export function openDeposit(s: S, p: OpenDepositInput): string {
  openAccount(s, p.accountId);
  assertAmount(p.amount, 'El capital del depósito');
  if (!Number.isInteger(p.termMonths) || p.termMonths < 1 || p.termMonths > 120) fail('INVALID_INPUT', 'El plazo debe estar entre 1 y 120 meses.');
  const id = nextId(s, 'dep');
  let rate = 0;
  let underlyingId: string | undefined;
  let initialPrice: number | undefined;
  let participation: number | undefined;
  let cap: number | undefined;
  if (p.kind === 'fixed') {
    rate = p.rate ?? suggestedDepositRate(p.termMonths);
    if (!Number.isFinite(rate) || rate < 0 || rate > 0.3) fail('INVALID_INPUT', 'Tipo de interés no válido.');
  } else if (p.kind === 'structured') {
    const a = assetById(s.market, p.underlyingId ?? '');
    if (!a) fail('ASSET_NOT_FOUND', 'Selecciona un índice de referencia válido.');
    underlyingId = a.id;
    initialPrice = a.price;
    participation = p.participation ?? 0.7;
    cap = p.cap ?? 0.25;
    if (participation <= 0 || participation > 2) fail('INVALID_INPUT', 'Participación no válida.');
    if (cap <= 0 || cap > 2) fail('INVALID_INPUT', 'Tope de rentabilidad no válido.');
  } else fail('INVALID_INPUT', 'Tipo de depósito no válido.');

  const tx = post(s, {
    kind: 'deposit_open',
    flow: 'internal',
    category: 'savings',
    concept: `Apertura depósito ${p.kind === 'fixed' ? 'a plazo fijo' : 'estructurado'} ${p.termMonths} meses`,
    amount: p.amount,
    amountIn: 'to',
    from: accountEndpoint(s, p.accountId),
    to: { type: 'deposit', id, label: 'Depósito' },
    refId: id,
    opId: p.opId,
  });
  const start = startOfUTCDay(nowDate(s));
  const deposit: TermDeposit = {
    id,
    kind: p.kind,
    name: p.kind === 'fixed' ? `Depósito ${p.termMonths} meses` : `Depósito estructurado ${assetById(s.market, underlyingId!)!.symbol}`,
    principal: receivedAmount(tx),
    rate,
    termMonths: p.termMonths,
    startAt: nowISO(s),
    maturityAt: addMonthsUTC(start, p.termMonths).toISOString(),
    accountId: p.accountId,
    status: 'active',
    earlyPenalty: 0.5,
    underlyingId,
    initialPrice,
    participation,
    cap,
  };
  s.deposits.push(deposit);
  return id;
}

/** Intereses devengados a fecha (depósitos fijos, interés simple). */
export function accruedInterest(s: S, d: TermDeposit, at = nowDate(s)): number {
  if (d.kind !== 'fixed') return 0;
  const days = Math.max(0, Math.min(daysBetween(d.startAt, at), daysBetween(d.startAt, d.maturityAt)));
  return Math.round((d.principal * d.rate * days) / 365);
}

/** Rentabilidad del depósito estructurado si venciera ahora. */
export function structuredReturn(s: S, d: TermDeposit): number {
  if (d.kind !== 'structured' || !d.underlyingId || !d.initialPrice) return 0;
  const a = assetById(s.market, d.underlyingId);
  if (!a) return 0;
  const perf = a.price / d.initialPrice - 1;
  return Math.min(d.cap ?? 0, Math.max(0, perf * (d.participation ?? 0)));
}

export function depositCurrentValue(s: S, d: TermDeposit): number {
  if (d.status !== 'active') return 0;
  if (d.kind === 'fixed') return d.principal + accruedInterest(s, d);
  return d.principal; // capital garantizado; la rentabilidad solo se cobra al vencimiento
}

function payOut(s: S, d: TermDeposit, interest: number, label: string): void {
  const acc = s.accounts.find((a) => a.id === d.accountId && a.status === 'open') ?? s.accounts.find((a) => a.status === 'open');
  if (!acc) fail('ACCOUNT_NOT_FOUND', 'No hay ninguna cuenta abierta para recibir el depósito.');
  post(s, {
    kind: 'deposit_close',
    flow: 'internal',
    category: 'savings',
    concept: `${label}: devolución de capital`,
    amount: d.principal,
    from: { type: 'deposit', id: d.id, label: d.name },
    to: { type: 'account', id: acc.id, label: acc.name },
    currency: base(s),
    refId: d.id,
  });
  if (interest > 0) {
    post(s, {
      kind: 'interest_earned',
      flow: 'income',
      category: 'interest',
      concept: `${label}: rendimiento`,
      amount: interest,
      from: { type: 'deposit', id: d.id, label: d.name },
      to: { type: 'account', id: acc.id, label: acc.name },
      currency: base(s),
      refId: d.id,
    });
  }
  d.payout = d.principal + interest;
  d.closedAt = nowISO(s);
}

export function cancelDeposit(s: S, p: { depositId: string }): number {
  const d = findById(s.deposits, p.depositId, 'Depósito');
  if (d.status !== 'active') fail('INVALID_STATE', 'El depósito no está activo.');
  const interest = d.kind === 'fixed' ? Math.round(accruedInterest(s, d) * (1 - d.earlyPenalty)) : 0;
  payOut(s, d, interest, `Cancelación anticipada ${d.name}`);
  d.status = 'cancelled';
  return d.payout ?? d.principal;
}

export function processDeposits(s: S): void {
  const now = nowDate(s).getTime();
  for (const d of s.deposits) {
    if (d.status !== 'active' || Date.parse(d.maturityAt) > now) continue;
    const interest = d.kind === 'fixed' ? accruedInterest(s, d, new Date(d.maturityAt)) : Math.round(d.principal * structuredReturn(s, d));
    payOut(s, d, interest, `Vencimiento ${d.name}`);
    d.status = 'matured';
    notify(s, 'success', 'Depósito vencido', `${d.name}: has recibido ${formatMoney(d.principal + interest, base(s))}.`, '/products/savings');
  }
}
