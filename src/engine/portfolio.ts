/**
 * MOTOR DE INVERSIONES: compra y venta de activos, cartera, dividendos.
 *
 * Los activos cotizan en la divisa base del perfil. Las compras se liquidan
 * desde una cuenta bancaria (con conversión de divisa si procede) y las
 * ventas abonan el producto en la cuenta indicada.
 */
import type { Asset, Position } from '@/core/schema';
import { formatMoney, formatQty, roundQty } from '@/core/money';
import { assertAmount, base, fail, nextId, notify, nowDate, nowISO, openAccount, type S } from './context';
import { accountEndpoint, post } from './ledger';
import { assetById } from './market';

const QTY_EPSILON = 1e-8;

function tradableAsset(s: S, id: string): Asset {
  const a = assetById(s.market, id);
  if (!a) fail('ASSET_NOT_FOUND', 'Activo no encontrado.');
  return a;
}

export function positionValue(s: S, p: Position): number {
  const a = assetById(s.market, p.assetId);
  return a ? Math.round(p.quantity * a.price * 100) : 0;
}

export interface BuyInput {
  assetId: string;
  accountId: string;
  /** Importe a invertir (en divisa base, céntimos). */
  amount?: number;
  /** Alternativamente, número de participaciones. */
  quantity?: number;
  opId?: string;
}

export function buy(s: S, p: BuyInput): string {
  const asset = tradableAsset(s, p.assetId);
  openAccount(s, p.accountId);
  let quantity: number;
  let gross: number;
  if (p.quantity !== undefined) {
    if (!Number.isFinite(p.quantity) || p.quantity <= 0) fail('INVALID_INPUT', 'La cantidad debe ser mayor que cero.');
    quantity = roundQty(p.quantity);
    gross = Math.round(quantity * asset.price * 100);
  } else {
    assertAmount(p.amount, 'El importe a invertir');
    gross = p.amount;
    quantity = roundQty(gross / 100 / asset.price);
  }
  if (quantity <= 0 || gross <= 0) fail('INVALID_AMOUNT', 'El importe es demasiado pequeño para comprar este activo.');
  const fee = Math.round(gross * s.market.feeRate);
  const total = gross + fee;
  const id = nextId(s, 'trd');
  post(s, {
    kind: 'trade_buy',
    flow: 'investment',
    category: 'investments',
    concept: `Compra ${formatQty(quantity)} ${asset.symbol}`,
    amount: total,
    amountIn: 'to',
    from: accountEndpoint(s, p.accountId),
    to: { type: 'portfolio', id: asset.id, label: `Cartera · ${asset.symbol}` },
    refId: id,
    opId: p.opId,
  });
  let pos = s.portfolio.positions.find((x) => x.assetId === asset.id);
  if (!pos) {
    pos = { assetId: asset.id, quantity: 0, costBasis: 0, openedAt: nowISO(s), settlementAccountId: p.accountId };
    s.portfolio.positions.push(pos);
  }
  pos.quantity = roundQty(pos.quantity + quantity);
  pos.costBasis += gross;
  pos.settlementAccountId = p.accountId;
  s.portfolio.trades.push({
    id,
    at: nowISO(s),
    assetId: asset.id,
    symbol: asset.symbol,
    side: 'buy',
    quantity,
    price: asset.price,
    amount: gross,
    fee,
    realizedPnL: 0,
    accountId: p.accountId,
  });
  return id;
}

export interface SellInput {
  assetId: string;
  accountId: string;
  quantity?: number;
  /** Importe aproximado a vender (en divisa base). */
  amount?: number;
  all?: boolean;
  opId?: string;
}

export function sell(s: S, p: SellInput): string {
  const asset = tradableAsset(s, p.assetId);
  openAccount(s, p.accountId);
  const pos = s.portfolio.positions.find((x) => x.assetId === asset.id);
  if (!pos) fail('NO_POSITION', `No tienes participaciones de ${asset.symbol}.`);
  let quantity: number;
  if (p.all) quantity = pos.quantity;
  else if (p.quantity !== undefined) {
    if (!Number.isFinite(p.quantity) || p.quantity <= 0) fail('INVALID_INPUT', 'La cantidad debe ser mayor que cero.');
    quantity = roundQty(p.quantity);
  } else {
    assertAmount(p.amount, 'El importe a vender');
    quantity = roundQty(p.amount / 100 / asset.price);
  }
  if (quantity > pos.quantity + QTY_EPSILON) {
    fail('INSUFFICIENT_POSITION', `Solo tienes ${formatQty(pos.quantity)} ${asset.symbol}.`);
  }
  quantity = Math.min(quantity, pos.quantity);
  const closesPosition = pos.quantity - quantity <= QTY_EPSILON;
  const gross = Math.round(quantity * asset.price * 100);
  const fee = Math.round(gross * s.market.feeRate);
  const net = gross - fee;
  if (net <= 0) fail('INVALID_AMOUNT', 'El importe de la venta es demasiado pequeño.');
  const costPart = closesPosition ? pos.costBasis : Math.round(pos.costBasis * (quantity / pos.quantity));
  const realized = gross - fee - costPart;
  const id = nextId(s, 'trd');
  post(s, {
    kind: 'trade_sell',
    flow: 'investment',
    category: 'investments',
    concept: `Venta ${formatQty(quantity)} ${asset.symbol}`,
    amount: net,
    from: { type: 'portfolio', id: asset.id, label: `Cartera · ${asset.symbol}` },
    to: accountEndpoint(s, p.accountId),
    currency: base(s),
    refId: id,
    opId: p.opId,
  });
  if (closesPosition) {
    s.portfolio.positions = s.portfolio.positions.filter((x) => x.assetId !== asset.id);
  } else {
    pos.quantity = roundQty(pos.quantity - quantity);
    pos.costBasis -= costPart;
  }
  s.portfolio.realizedPnL += realized;
  s.portfolio.trades.push({
    id,
    at: nowISO(s),
    assetId: asset.id,
    symbol: asset.symbol,
    side: 'sell',
    quantity,
    price: asset.price,
    amount: gross,
    fee,
    realizedPnL: realized,
    accountId: p.accountId,
  });
  return id;
}

export function toggleWatch(s: S, p: { assetId: string }): boolean {
  tradableAsset(s, p.assetId);
  const idx = s.portfolio.watchlist.indexOf(p.assetId);
  if (idx >= 0) {
    s.portfolio.watchlist.splice(idx, 1);
    return false;
  }
  s.portfolio.watchlist.push(p.assetId);
  return true;
}

/**
 * Dividendos y cupones. Se pagan el día 1 de cada mes: bonos y fondos con
 * rendimiento mensualmente; acciones y ETF trimestralmente (ene/abr/jul/oct).
 */
export function payDistributions(s: S): void {
  const month = nowDate(s).getUTCMonth();
  const quarterly = month % 3 === 0;
  for (const pos of s.portfolio.positions) {
    const asset = assetById(s.market, pos.assetId);
    if (!asset || asset.yield <= 0) continue;
    const monthlyType = asset.type === 'bond' || asset.type === 'fund';
    if (!monthlyType && !quarterly) continue;
    const value = positionValue(s, pos);
    const amount = Math.round((value * asset.yield) / (monthlyType ? 12 : 4));
    if (amount <= 0) continue;
    const acc = s.accounts.find((a) => a.id === pos.settlementAccountId && a.status === 'open') ?? s.accounts.find((a) => a.status === 'open');
    if (!acc) continue;
    post(s, {
      kind: 'dividend',
      flow: 'income',
      category: 'investments',
      concept: `${asset.type === 'bond' ? 'Cupón' : 'Dividendo'} ${asset.symbol}`,
      amount,
      from: { type: 'portfolio', id: asset.id, label: asset.name },
      to: { type: 'account', id: acc.id, label: acc.name },
      currency: base(s),
    });
    s.portfolio.incomeReceived += amount;
    notify(s, 'success', asset.type === 'bond' ? 'Cupón cobrado' : 'Dividendo cobrado', `${asset.symbol}: ${formatMoney(amount, base(s))}`, `/invest/asset/${asset.id}`);
  }
}
