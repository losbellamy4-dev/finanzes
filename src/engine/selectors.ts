/**
 * Selectores: métricas derivadas del estado (patrimonio, flujos, cartera).
 * Son funciones puras; la interfaz las memoriza con useMemo.
 */
import type { AssetType, Category, Currency, Transaction } from '@/core/schema';
import { convert } from '@/core/money';
import type { S } from './context';
import { nowDate } from './context';
import { assetById, dailyChange } from './market';
import { positionValue } from './portfolio';
import { derivativeValue } from './derivatives';
import { depositCurrentValue } from './products/deposits';
import { loanDebt } from './products/loans';
import { signedForAccount } from './ledger';

export function toBase(s: S, cents: number, cur: Currency): number {
  return convert(cents, cur, s.profile.baseCurrency);
}

function txBaseAmount(s: S, tx: Transaction): number {
  return toBase(s, tx.amount, tx.currency);
}

export interface Overview {
  netWorth: number;
  accountsTotal: number;
  available: number;
  prepaid: number;
  invested: number;
  costBasis: number;
  unrealized: number;
  realized: number;
  derivatives: number;
  savings: number;
  goals: number;
  deposits: number;
  properties: number;
  vault: number;
  debts: { cards: number; loans: number; creditLines: number; total: number };
  monthlyIncome: number;
  monthlyExpenses: number;
  monthNet: number;
  pnl: number;
  assets: number;
}

export function monthlyFlows(s: S, year: number, month0: number) {
  const start = Date.UTC(year, month0, 1);
  const end = Date.UTC(year, month0 + 1, 1);
  let income = 0;
  let expenses = 0;
  const byCategory = new Map<Category, number>();
  for (let i = s.transactions.length - 1; i >= 0; i--) {
    const tx = s.transactions[i];
    const t = Date.parse(tx.at);
    if (t >= end) continue;
    if (t < start) break;
    if (tx.status === 'failed' || tx.status === 'cancelled') continue;
    if (tx.flow === 'income') income += txBaseAmount(s, tx);
    else if (tx.flow === 'expense') {
      const v = txBaseAmount(s, tx);
      expenses += v;
      byCategory.set(tx.category, (byCategory.get(tx.category) ?? 0) + v);
    }
  }
  return { income, expenses, byCategory };
}

export function flowHistory(s: S, months = 6) {
  const now = nowDate(s);
  const out: { key: string; label: string; income: number; expenses: number }[] = [];
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const f = monthlyFlows(s, d.getUTCFullYear(), d.getUTCMonth());
    out.push({
      key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`,
      label: d.toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' }),
      income: f.income,
      expenses: f.expenses,
    });
  }
  return out;
}

export function computeOverview(s: S): Overview {
  let accountsTotal = 0;
  let available = 0;
  for (const a of s.accounts) {
    if (a.status !== 'open') continue;
    const v = toBase(s, a.balance, a.currency);
    accountsTotal += v;
    available += Math.max(0, v);
  }
  let prepaid = 0;
  let cardDebt = 0;
  for (const c of s.cards) {
    if (c.status === 'cancelled') continue;
    const cur = s.accounts.find((a) => a.id === c.accountId)?.currency ?? s.profile.baseCurrency;
    if (c.type === 'prepaid') prepaid += toBase(s, c.balance, cur);
    if (c.type === 'credit') cardDebt += toBase(s, Math.max(0, c.balance), cur);
  }
  let invested = 0;
  let costBasis = 0;
  for (const p of s.portfolio.positions) {
    invested += positionValue(s, p);
    costBasis += p.costBasis;
  }
  let derivatives = 0;
  let derivativeMargin = 0;
  for (const d of s.portfolio.derivatives) {
    if (d.status !== 'open') continue;
    derivatives += derivativeValue(s, d);
    derivativeMargin += d.margin;
  }
  const goals = s.goals.filter((g) => g.status === 'active').reduce((a, g) => a + g.balance, 0);
  const deposits = s.deposits.reduce((a, d) => a + depositCurrentValue(s, d), 0);
  const properties = s.properties.filter((p) => p.owned).reduce((a, p) => a + p.value, 0);
  const vault = s.vault.reduce((a, v) => a + v.value, 0);
  const loans = s.loans.reduce((a, l) => a + loanDebt(l), 0);
  const creditLines = s.creditLines.filter((l) => l.status === 'active').reduce((a, l) => a + l.drawn, 0);
  const debtsTotal = cardDebt + loans + creditLines;
  const now = nowDate(s);
  const flows = monthlyFlows(s, now.getUTCFullYear(), now.getUTCMonth());
  const unrealized = invested - costBasis + (derivatives - derivativeMargin);
  const assets = accountsTotal + prepaid + invested + derivatives + goals + deposits + properties + vault;
  return {
    netWorth: assets - debtsTotal,
    accountsTotal,
    available: available + prepaid,
    prepaid,
    invested: invested + derivatives,
    costBasis: costBasis + derivativeMargin,
    unrealized,
    realized: s.portfolio.realizedPnL,
    derivatives,
    savings: goals + deposits,
    goals,
    deposits,
    properties,
    vault,
    debts: { cards: cardDebt, loans, creditLines, total: debtsTotal },
    monthlyIncome: flows.income,
    monthlyExpenses: flows.expenses,
    monthNet: flows.income - flows.expenses,
    pnl: unrealized + s.portfolio.realizedPnL,
    assets,
  };
}

export interface PositionView {
  assetId: string;
  symbol: string;
  name: string;
  type: AssetType;
  quantity: number;
  price: number;
  value: number;
  costBasis: number;
  avgPrice: number;
  pnl: number;
  pnlPct: number;
  dayChange: number;
  weight: number;
}

export function portfolioView(s: S) {
  const positions: PositionView[] = [];
  let total = 0;
  let cost = 0;
  for (const p of s.portfolio.positions) {
    const a = assetById(s.market, p.assetId);
    if (!a) continue;
    const value = positionValue(s, p);
    total += value;
    cost += p.costBasis;
    positions.push({
      assetId: a.id,
      symbol: a.symbol,
      name: a.name,
      type: a.type,
      quantity: p.quantity,
      price: a.price,
      value,
      costBasis: p.costBasis,
      avgPrice: p.quantity > 0 ? p.costBasis / 100 / p.quantity : 0,
      pnl: value - p.costBasis,
      pnlPct: p.costBasis > 0 ? (value - p.costBasis) / p.costBasis : 0,
      dayChange: dailyChange(a),
      weight: 0,
    });
  }
  for (const p of positions) p.weight = total > 0 ? p.value / total : 0;
  positions.sort((a, b) => b.value - a.value);
  const byType = new Map<AssetType, number>();
  for (const p of positions) byType.set(p.type, (byType.get(p.type) ?? 0) + p.value);
  const dayPnl = positions.reduce((acc, p) => acc + (p.value - p.value / (1 + p.dayChange)), 0);
  return {
    positions,
    total,
    cost,
    unrealized: total - cost,
    unrealizedPct: cost > 0 ? (total - cost) / cost : 0,
    realized: s.portfolio.realizedPnL,
    income: s.portfolio.incomeReceived,
    byType,
    dayPnl: Math.round(dayPnl),
  };
}

/** Historial de una cuenta con el importe firmado de cada movimiento. */
export function accountHistory(s: S, accountId: string) {
  const out: { tx: Transaction; signed: number; balanceAfter?: number }[] = [];
  for (let i = s.transactions.length - 1; i >= 0; i--) {
    const tx = s.transactions[i];
    const isFrom = tx.from.type === 'account' && tx.from.id === accountId;
    const isTo = tx.to.type === 'account' && tx.to.id === accountId;
    if (!isFrom && !isTo) continue;
    out.push({ tx, signed: signedForAccount(tx, accountId), balanceAfter: isTo ? tx.toBalanceAfter : tx.fromBalanceAfter });
  }
  return out;
}

/** Serie del saldo de una cuenta reconstruida a partir de los movimientos. */
export function accountBalanceSeries(s: S, accountId: string) {
  const pts: { at: string; v: number }[] = [];
  for (const tx of s.transactions) {
    if (tx.status === 'failed' || tx.status === 'cancelled') continue;
    if (tx.to.type === 'account' && tx.to.id === accountId && tx.toBalanceAfter !== undefined) pts.push({ at: tx.at, v: tx.toBalanceAfter });
    else if (tx.from.type === 'account' && tx.from.id === accountId && tx.fromBalanceAfter !== undefined) pts.push({ at: tx.at, v: tx.fromBalanceAfter });
  }
  return pts;
}

export function totalTransactions(s: S): number {
  return s.transactions.length;
}
