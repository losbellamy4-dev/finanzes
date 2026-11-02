/**
 * DERIVADOS SIMULADOS: opciones europeas (compra de call/put) y futuros con
 * apalancamiento (largos y cortos).
 *
 * Opciones: prima calculada con Black-Scholes usando la volatilidad efectiva
 * del subyacente. A vencimiento se liquidan por diferencias.
 * Futuros: se deposita un margen = nocional / apalancamiento. Si las pérdidas
 * consumen el margen, la posición se liquida automáticamente.
 */
import type { Derivative } from '@/core/schema';
import { formatMoney, formatPrice } from '@/core/money';
import { HOURS_PER_DAY, HOURS_PER_YEAR } from '@/core/time';
import { assertAmount, base, fail, findById, nextId, notify, nowISO, openAccount, type S } from './context';
import { accountEndpoint, post } from './ledger';
import { assetById, effectiveParams } from './market';

export const RISK_FREE_RATE = 0.03;

/** Función de distribución normal estándar (aproximación de Abramowitz-Stegun). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function blackScholes(type: 'call' | 'put', S0: number, K: number, T: number, sigma: number, r = RISK_FREE_RATE): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, type === 'call' ? S0 - K : K - S0);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S0 / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === 'call') return S0 * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  return K * Math.exp(-r * T) * normCdf(-d2) - S0 * normCdf(-d1);
}

export function optionQuote(s: S, underlyingId: string, type: 'call' | 'put', strike: number, days: number): number {
  const a = assetById(s.market, underlyingId);
  if (!a) fail('ASSET_NOT_FOUND', 'Subyacente no encontrado.');
  const { sigma } = effectiveParams(s.market, a);
  return blackScholes(type, a.price, strike, days / 365, Math.max(0.05, sigma));
}

/** Valor actual (en céntimos de divisa base) de un derivado abierto. */
export function derivativeValue(s: S, d: Derivative): number {
  const a = assetById(s.market, d.underlyingId);
  if (!a || d.status !== 'open') return 0;
  if (d.kind === 'option') {
    const T = Math.max(0, (d.expiryTick - s.clock.tick) / HOURS_PER_YEAR);
    const { sigma } = effectiveParams(s.market, a);
    const unit = blackScholes(d.optionType!, a.price, d.strike!, T, Math.max(0.05, sigma));
    return Math.max(0, Math.round(unit * d.quantity * 100));
  }
  const dir = d.direction === 'long' ? 1 : -1;
  const pnl = (a.price - d.entryPrice) * d.quantity * dir * 100;
  return Math.max(0, Math.round(d.margin + pnl));
}

export interface OpenOptionInput {
  underlyingId: string;
  optionType: 'call' | 'put';
  strike: number;
  days: number;
  quantity: number;
  accountId: string;
  opId?: string;
}

export function openOption(s: S, p: OpenOptionInput): string {
  const a = assetById(s.market, p.underlyingId);
  if (!a) fail('ASSET_NOT_FOUND', 'Subyacente no encontrado.');
  if (!['call', 'put'].includes(p.optionType)) fail('INVALID_INPUT', 'Tipo de opción no válido.');
  if (!Number.isFinite(p.strike) || p.strike <= 0) fail('INVALID_INPUT', 'Precio de ejercicio no válido.');
  if (!Number.isInteger(p.days) || p.days < 1 || p.days > 730) fail('INVALID_INPUT', 'El vencimiento debe estar entre 1 y 730 días.');
  if (!Number.isFinite(p.quantity) || p.quantity <= 0) fail('INVALID_INPUT', 'Número de contratos no válido.');
  openAccount(s, p.accountId);
  const premium = optionQuote(s, a.id, p.optionType, p.strike, p.days);
  const cost = Math.round(premium * p.quantity * 100);
  assertAmount(cost, 'La prima total');
  const id = nextId(s, 'drv');
  const symbol = `${a.symbol} ${p.optionType === 'call' ? 'CALL' : 'PUT'} ${formatPrice(p.strike, base(s))} ${p.days}d`;
  post(s, {
    kind: 'derivative_open',
    flow: 'investment',
    category: 'investments',
    concept: `Compra opción ${symbol}`,
    amount: cost,
    amountIn: 'to',
    from: accountEndpoint(s, p.accountId),
    to: { type: 'portfolio', id, label: symbol },
    refId: id,
    opId: p.opId,
  });
  s.portfolio.derivatives.push({
    id,
    kind: 'option',
    underlyingId: a.id,
    symbol,
    optionType: p.optionType,
    direction: 'long',
    strike: p.strike,
    expiryTick: s.clock.tick + p.days * HOURS_PER_DAY,
    quantity: p.quantity,
    entryPrice: premium,
    leverage: 1,
    margin: cost,
    openedAt: nowISO(s),
    accountId: p.accountId,
    status: 'open',
  });
  return id;
}

export interface OpenFutureInput {
  underlyingId: string;
  direction: 'long' | 'short';
  /** Unidades del subyacente. */
  quantity: number;
  leverage: number;
  days: number;
  accountId: string;
  opId?: string;
}

export function openFuture(s: S, p: OpenFutureInput): string {
  const a = assetById(s.market, p.underlyingId);
  if (!a) fail('ASSET_NOT_FOUND', 'Subyacente no encontrado.');
  if (!['long', 'short'].includes(p.direction)) fail('INVALID_INPUT', 'Dirección no válida.');
  if (!Number.isFinite(p.quantity) || p.quantity <= 0) fail('INVALID_INPUT', 'Cantidad no válida.');
  if (!Number.isFinite(p.leverage) || p.leverage < 1 || p.leverage > 50) fail('INVALID_INPUT', 'El apalancamiento debe estar entre 1x y 50x.');
  if (!Number.isInteger(p.days) || p.days < 1 || p.days > 365) fail('INVALID_INPUT', 'El vencimiento debe estar entre 1 y 365 días.');
  openAccount(s, p.accountId);
  const notional = Math.round(a.price * p.quantity * 100);
  const margin = Math.ceil(notional / p.leverage);
  assertAmount(margin, 'El margen requerido');
  const id = nextId(s, 'drv');
  const symbol = `${a.symbol} FUT ${p.direction === 'long' ? 'LARGO' : 'CORTO'} x${p.leverage} ${p.days}d`;
  post(s, {
    kind: 'derivative_open',
    flow: 'investment',
    category: 'investments',
    concept: `Margen futuro ${symbol}`,
    amount: margin,
    amountIn: 'to',
    from: accountEndpoint(s, p.accountId),
    to: { type: 'portfolio', id, label: symbol },
    refId: id,
    opId: p.opId,
  });
  s.portfolio.derivatives.push({
    id,
    kind: 'future',
    underlyingId: a.id,
    symbol,
    direction: p.direction,
    expiryTick: s.clock.tick + p.days * HOURS_PER_DAY,
    quantity: p.quantity,
    entryPrice: a.price,
    leverage: p.leverage,
    margin,
    openedAt: nowISO(s),
    accountId: p.accountId,
    status: 'open',
  });
  return id;
}

function settle(s: S, d: Derivative, status: Derivative['status'], accountId?: string): number {
  const value = derivativeValue(s, d);
  const accId = accountId ?? d.accountId;
  const acc = s.accounts.find((x) => x.id === accId && x.status === 'open') ?? s.accounts.find((x) => x.status === 'open');
  if (value > 0 && acc) {
    post(s, {
      kind: 'derivative_close',
      flow: 'investment',
      category: 'investments',
      concept: `${status === 'expired' ? 'Vencimiento' : 'Cierre'} ${d.symbol}`,
      amount: value,
      from: { type: 'portfolio', id: d.id, label: d.symbol },
      to: { type: 'account', id: acc.id, label: acc.name },
      currency: base(s),
      refId: d.id,
    });
  }
  const pnl = value - d.margin;
  d.status = status;
  d.closedAt = nowISO(s);
  d.closeValue = value;
  d.realizedPnL = pnl;
  s.portfolio.realizedPnL += pnl;
  return value;
}

export function closeDerivative(s: S, p: { derivativeId: string; accountId?: string; opId?: string }): number {
  const d = findById(s.portfolio.derivatives, p.derivativeId, 'Derivado');
  if (d.status !== 'open') fail('INVALID_STATE', 'La posición ya está cerrada.');
  if (p.accountId) openAccount(s, p.accountId);
  return settle(s, d, 'closed', p.accountId);
}

/** Liquidación por margen (futuros) y vencimientos. Se ejecuta en cada tick. */
export function processDerivatives(s: S): void {
  for (const d of s.portfolio.derivatives) {
    if (d.status !== 'open') continue;
    if (d.kind === 'future') {
      const a = assetById(s.market, d.underlyingId);
      if (!a) continue;
      const dir = d.direction === 'long' ? 1 : -1;
      const pnl = (a.price - d.entryPrice) * d.quantity * dir * 100;
      if (d.margin + pnl <= 0) {
        settle(s, d, 'liquidated');
        notify(s, 'danger', 'Futuro liquidado', `${d.symbol}: las pérdidas han consumido el margen (${formatMoney(d.margin, base(s))}).`, '/invest/derivatives');
        continue;
      }
    }
    if (s.clock.tick >= d.expiryTick) {
      const value = settle(s, d, 'expired');
      notify(s, value > 0 ? 'success' : 'warning', 'Derivado vencido', `${d.symbol} liquidado por ${formatMoney(value, base(s))}.`, '/invest/derivatives');
    }
  }
}
