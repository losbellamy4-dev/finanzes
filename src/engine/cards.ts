/**
 * MÓDULO DE TARJETAS VIRTUALES: débito, crédito y prepago.
 *
 * Los números, CVV y PIN son exclusivamente ficticios: el número empieza por
 * "0" (ningún emisor real usa ese prefijo) y su dígito de control Luhn se
 * fuerza a ser INVÁLIDO, por lo que no puede utilizarse en pagos reales.
 */
import type { Card, CardType, Category } from '@/core/schema';
import { CATEGORY_IDS } from '@/core/schema';
import { formatMoney } from '@/core/money';
import { addDaysUTC, startOfUTCDay } from '@/core/time';
import {
  addCreditEvent,
  assertAmount,
  assertText,
  DomainError,
  fail,
  findById,
  nextId,
  notify,
  nowDate,
  nowISO,
  openAccount,
  rand,
  type S,
} from './context';
import { accountEndpoint, post } from './ledger';

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  debit: 'Débito',
  credit: 'Crédito',
  prepaid: 'Prepago',
};

export const CARD_THEMES = [
  { id: 'midnight', name: 'Medianoche', from: '#1B2333', to: '#0B0E14', accent: '#5488F5' },
  { id: 'aurora', name: 'Aurora', from: '#3B5BDB', to: '#0CA678', accent: '#E6FCF5' },
  { id: 'ember', name: 'Ascua', from: '#F05B65', to: '#7A1E3A', accent: '#FFE3E3' },
  { id: 'gold', name: 'Oro', from: '#C9A227', to: '#6B4E16', accent: '#FFF3BF' },
  { id: 'emerald', name: 'Esmeralda', from: '#24C78A', to: '#0B4F3C', accent: '#D3F9D8' },
  { id: 'violet', name: 'Violeta', from: '#7C5CFC', to: '#2D1B69', accent: '#E5DBFF' },
  { id: 'graphite', name: 'Grafito', from: '#4A5260', to: '#1C2027', accent: '#DEE2E6' },
  { id: 'ocean', name: 'Océano', from: '#0EA5E9', to: '#1E3A8A', accent: '#E0F2FE' },
] as const;

export const CARD_PATTERNS = [
  { id: 'none', name: 'Liso' },
  { id: 'waves', name: 'Ondas' },
  { id: 'grid', name: 'Rejilla' },
  { id: 'circles', name: 'Círculos' },
  { id: 'lines', name: 'Líneas' },
] as const;

export function luhnValid(num: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function generateCardNumber(s: S, salt: string): string {
  let digits = '0';
  for (let i = 0; i < 15; i++) digits += Math.floor(rand(s, `card:${salt}`, i) * 10);
  if (luhnValid(digits)) {
    const last = (Number(digits[15]) + 1) % 10;
    digits = digits.slice(0, 15) + last;
  }
  return digits;
}

function digitsFrom(s: S, salt: string, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += Math.floor(rand(s, salt, i) * 10);
  return out;
}

export function maskCardNumber(num: string): string {
  return `•••• ${num.slice(-4)}`;
}

export function formatCardNumber(num: string): string {
  return num.replace(/(.{4})/g, '$1 ').trim();
}

export function cardCurrency(s: S, card: Card) {
  return s.accounts.find((a) => a.id === card.accountId)?.currency ?? s.profile.baseCurrency;
}

export interface CreateCardInput {
  type: CardType;
  accountId: string;
  name?: string;
  holder?: string;
  theme?: string;
  pattern?: string;
  creditLimit?: number;
  apr?: number;
  closingDay?: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  autopay?: Card['autopay'];
  initialLoad?: number;
}

export function createCard(s: S, p: CreateCardInput): string {
  if (!(p.type in CARD_TYPE_LABELS)) fail('INVALID_INPUT', 'Tipo de tarjeta no válido.');
  const acc = openAccount(s, p.accountId);
  const name = p.name?.trim() ? assertText(p.name, 'El nombre de la tarjeta', 40) : `Tarjeta ${CARD_TYPE_LABELS[p.type]}`;
  const dailyLimit = p.dailyLimit ?? 100_000;
  const monthlyLimit = p.monthlyLimit ?? 500_000;
  assertAmount(dailyLimit, 'El límite diario');
  assertAmount(monthlyLimit, 'El límite mensual');
  if (dailyLimit > monthlyLimit) fail('INVALID_INPUT', 'El límite diario no puede superar el mensual.');

  let creditLimit = 0;
  let apr = 0;
  let closingDay = 1;
  if (p.type === 'credit') {
    creditLimit = p.creditLimit ?? 300_000;
    assertAmount(creditLimit, 'El límite de crédito');
    apr = p.apr ?? 0.199;
    if (!Number.isFinite(apr) || apr < 0 || apr > 1) fail('INVALID_INPUT', 'La TAE debe estar entre 0 % y 100 %.');
    closingDay = p.closingDay ?? Math.min(28, nowDate(s).getUTCDate());
    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 28) fail('INVALID_INPUT', 'El día de cierre debe estar entre 1 y 28.');
  }
  if (p.initialLoad !== undefined && p.initialLoad !== 0) {
    if (p.type !== 'prepaid') fail('INVALID_INPUT', 'Solo las tarjetas prepago admiten recarga inicial.');
    assertAmount(p.initialLoad, 'La recarga inicial');
  }

  const id = nextId(s, 'card');
  const now = nowDate(s);
  const card: Card = {
    id,
    type: p.type,
    name,
    holder: (p.holder?.trim() || acc.holder).toUpperCase().slice(0, 80),
    accountId: acc.id,
    number: generateCardNumber(s, id),
    expMonth: now.getUTCMonth() + 1,
    expYear: now.getUTCFullYear() + 4,
    cvv: digitsFrom(s, `cvv:${id}`, 3),
    pin: digitsFrom(s, `pin:${id}`, 4),
    status: 'active',
    design: {
      theme: CARD_THEMES.some((t) => t.id === p.theme) ? p.theme! : p.type === 'credit' ? 'gold' : p.type === 'prepaid' ? 'violet' : 'midnight',
      pattern: CARD_PATTERNS.some((t) => t.id === p.pattern) ? p.pattern! : 'waves',
    },
    createdAt: nowISO(s),
    dailyLimit,
    monthlyLimit,
    creditLimit,
    balance: 0,
    apr,
    closingDay,
    dueDays: 20,
    statementBalance: 0,
    minimumDue: 0,
    paidSinceStatement: 0,
    autopay: p.type === 'credit' ? (p.autopay ?? 'none') : 'none',
    latePayments: 0,
    interestCharged: 0,
    feesCharged: 0,
    debtHistory: [],
  };
  s.cards.push(card);
  if (p.type === 'credit') addCreditEvent(s, 'hard_inquiry', `Solicitud de tarjeta de crédito «${name}»`);
  if (p.type === 'prepaid' && p.initialLoad) loadCard(s, { cardId: id, amount: p.initialLoad });
  return id;
}

function activeCard(s: S, id: string): Card {
  const card = findById(s.cards, id, 'Tarjeta');
  if (card.status === 'cancelled') fail('CARD_CANCELLED', 'La tarjeta está cancelada.');
  return card;
}

export function updateCard(s: S, p: { cardId: string; name?: string; holder?: string; theme?: string; pattern?: string }): void {
  const card = activeCard(s, p.cardId);
  if (p.name !== undefined) card.name = assertText(p.name, 'El nombre', 40);
  if (p.holder !== undefined) card.holder = assertText(p.holder, 'El titular', 80).toUpperCase();
  if (p.theme !== undefined) {
    if (!CARD_THEMES.some((t) => t.id === p.theme)) fail('INVALID_INPUT', 'Diseño no válido.');
    card.design.theme = p.theme;
  }
  if (p.pattern !== undefined) {
    if (!CARD_PATTERNS.some((t) => t.id === p.pattern)) fail('INVALID_INPUT', 'Patrón no válido.');
    card.design.pattern = p.pattern;
  }
}

export function setCardFrozen(s: S, p: { cardId: string; frozen: boolean }): void {
  const card = activeCard(s, p.cardId);
  card.status = p.frozen ? 'frozen' : 'active';
}

export function cancelCard(s: S, p: { cardId: string }): void {
  const card = activeCard(s, p.cardId);
  if (card.type === 'credit' && card.balance > 0) {
    fail('CARD_DEBT', `Liquida la deuda pendiente (${formatMoney(card.balance, cardCurrency(s, card))}) antes de cancelar la tarjeta.`);
  }
  if (card.type === 'prepaid' && card.balance > 0) unloadCard(s, { cardId: card.id, amount: card.balance });
  card.status = 'cancelled';
}

export function setCardLimits(
  s: S,
  p: { cardId: string; dailyLimit?: number; monthlyLimit?: number; creditLimit?: number },
): void {
  const card = activeCard(s, p.cardId);
  const daily = p.dailyLimit ?? card.dailyLimit;
  const monthly = p.monthlyLimit ?? card.monthlyLimit;
  assertAmount(daily, 'El límite diario');
  assertAmount(monthly, 'El límite mensual');
  if (daily > monthly) fail('INVALID_INPUT', 'El límite diario no puede superar el mensual.');
  if (p.creditLimit !== undefined) {
    if (card.type !== 'credit') fail('INVALID_INPUT', 'Solo las tarjetas de crédito tienen límite de crédito.');
    assertAmount(p.creditLimit, 'El límite de crédito');
    if (p.creditLimit < card.balance) fail('INVALID_INPUT', 'El nuevo límite es inferior a la deuda actual.');
    card.creditLimit = p.creditLimit;
  }
  card.dailyLimit = daily;
  card.monthlyLimit = monthly;
}

export function setAutopay(s: S, p: { cardId: string; mode: Card['autopay'] }): void {
  const card = activeCard(s, p.cardId);
  if (card.type !== 'credit') fail('INVALID_INPUT', 'El pago automático solo aplica a tarjetas de crédito.');
  if (!['none', 'minimum', 'full'].includes(p.mode)) fail('INVALID_INPUT', 'Modo de pago automático no válido.');
  card.autopay = p.mode;
}

/** Gasto con tarjeta en el día y en el mes simulados actuales. */
export function cardSpending(s: S, cardId: string): { today: number; month: number } {
  const now = nowDate(s);
  const dayStart = startOfUTCDay(now).getTime();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  let today = 0;
  let month = 0;
  for (let i = s.transactions.length - 1; i >= 0; i--) {
    const tx = s.transactions[i];
    const t = Date.parse(tx.at);
    if (t < monthStart) break;
    if (tx.cardId !== cardId || tx.kind !== 'card_purchase' || tx.status === 'failed') continue;
    month += tx.amount;
    if (t >= dayStart) today += tx.amount;
  }
  return { today, month };
}

export function cardAvailable(s: S, card: Card): number {
  if (card.type === 'credit') return Math.max(0, card.creditLimit - card.balance);
  if (card.type === 'prepaid') return card.balance;
  const acc = s.accounts.find((a) => a.id === card.accountId);
  return acc ? acc.balance + acc.overdraftLimit : 0;
}

export function purchase(
  s: S,
  p: { cardId: string; amount: number; merchant: string; category?: Category; opId?: string },
): string {
  const card = activeCard(s, p.cardId);
  if (card.status === 'frozen') fail('CARD_FROZEN', 'La tarjeta está congelada. Descongélala para operar.');
  assertAmount(p.amount);
  const merchant = assertText(p.merchant, 'El comercio', 80);
  const category = p.category && (CATEGORY_IDS as readonly string[]).includes(p.category) ? p.category : 'shopping';
  const cur = cardCurrency(s, card);
  const spent = cardSpending(s, card.id);
  if (spent.today + p.amount > card.dailyLimit) {
    fail('CARD_LIMIT', `Superas el límite diario de la tarjeta (${formatMoney(card.dailyLimit, cur)}).`);
  }
  if (spent.month + p.amount > card.monthlyLimit) {
    fail('CARD_LIMIT', `Superas el límite mensual de la tarjeta (${formatMoney(card.monthlyLimit, cur)}).`);
  }
  const concept = `${merchant}`;
  const common = {
    kind: 'card_purchase' as const,
    flow: 'expense' as const,
    category,
    concept,
    amount: p.amount,
    to: { type: 'external' as const, label: merchant },
    cardId: card.id,
    opId: p.opId,
  };
  if (card.type === 'debit') {
    return post(s, { ...common, from: accountEndpoint(s, card.accountId) }).id;
  }
  if (card.type === 'credit') {
    const available = card.creditLimit - card.balance;
    if (p.amount > available) fail('CREDIT_LIMIT', `Crédito disponible insuficiente (${formatMoney(Math.max(0, available), cur)}).`);
    const tx = post(s, { ...common, from: { type: 'card', id: card.id, label: card.name }, currency: cur, toCurrency: cur });
    card.balance += p.amount;
    return tx.id;
  }
  if (p.amount > card.balance) fail('INSUFFICIENT_FUNDS', `Saldo prepago insuficiente (${formatMoney(card.balance, cur)}).`);
  const tx = post(s, { ...common, from: { type: 'card', id: card.id, label: card.name }, currency: cur, toCurrency: cur });
  card.balance -= p.amount;
  return tx.id;
}

/** Pago de la deuda de una tarjeta de crédito. */
export function payCard(s: S, p: { cardId: string; amount: number; accountId?: string; opId?: string; auto?: boolean }): string {
  const card = activeCard(s, p.cardId);
  if (card.type !== 'credit') fail('INVALID_INPUT', 'Solo las tarjetas de crédito tienen deuda que pagar.');
  assertAmount(p.amount);
  if (card.balance <= 0) fail('NO_DEBT', 'La tarjeta no tiene deuda pendiente.');
  if (p.amount > card.balance) fail('INVALID_AMOUNT', 'El importe supera la deuda de la tarjeta.');
  const cur = cardCurrency(s, card);
  const tx = post(s, {
    kind: 'card_payment',
    flow: 'financing',
    category: 'cards',
    concept: `${p.auto ? 'Pago automático' : 'Pago'} tarjeta ${card.name} ${maskCardNumber(card.number)}`,
    amount: p.amount,
    amountIn: 'to',
    from: accountEndpoint(s, p.accountId ?? card.accountId),
    to: { type: 'card', id: card.id, label: card.name },
    toCurrency: cur,
    cardId: card.id,
    opId: p.opId,
  });
  card.balance -= p.amount;
  card.paidSinceStatement += p.amount;
  if (card.balance === 0) card.debtHistory.push({ at: nowISO(s), balance: 0 });
  return tx.id;
}

export function loadCard(s: S, p: { cardId: string; amount: number; opId?: string }): string {
  const card = activeCard(s, p.cardId);
  if (card.type !== 'prepaid') fail('INVALID_INPUT', 'Solo se pueden recargar tarjetas prepago.');
  const cur = cardCurrency(s, card);
  const tx = post(s, {
    kind: 'card_load',
    flow: 'internal',
    category: 'cards',
    concept: `Recarga ${card.name}`,
    amount: p.amount,
    from: accountEndpoint(s, card.accountId),
    to: { type: 'card', id: card.id, label: card.name },
    toCurrency: cur,
    cardId: card.id,
    opId: p.opId,
  });
  card.balance += p.amount;
  return tx.id;
}

export function unloadCard(s: S, p: { cardId: string; amount: number; opId?: string }): string {
  const card = activeCard(s, p.cardId);
  if (card.type !== 'prepaid') fail('INVALID_INPUT', 'Solo las tarjetas prepago tienen saldo propio.');
  assertAmount(p.amount);
  if (p.amount > card.balance) fail('INSUFFICIENT_FUNDS', 'El importe supera el saldo de la tarjeta.');
  const cur = cardCurrency(s, card);
  const tx = post(s, {
    kind: 'card_unload',
    flow: 'internal',
    category: 'cards',
    concept: `Descarga ${card.name}`,
    amount: p.amount,
    from: { type: 'card', id: card.id, label: card.name },
    to: accountEndpoint(s, card.accountId),
    currency: cur,
    cardId: card.id,
    opId: p.opId,
  });
  card.balance -= p.amount;
  return tx.id;
}

/* ------------------------------------------------------------------ */
/* Ciclo de facturación de tarjetas de crédito                         */
/* ------------------------------------------------------------------ */

export const LATE_FEE = 2_500;

function closeStatement(s: S, card: Card): void {
  const cur = cardCurrency(s, card);
  card.statementBalance = Math.max(0, card.balance);
  card.minimumDue = card.statementBalance === 0 ? 0 : Math.min(card.statementBalance, Math.max(2_500, Math.round(card.statementBalance * 0.03)));
  card.paidSinceStatement = 0;
  card.lastStatementAt = nowISO(s);
  card.dueAt = card.statementBalance > 0 ? addDaysUTC(startOfUTCDay(nowDate(s)), card.dueDays).toISOString() : undefined;
  card.debtHistory.push({ at: nowISO(s), balance: card.balance });
  if (card.debtHistory.length > 120) card.debtHistory.splice(0, card.debtHistory.length - 120);
  if (card.statementBalance > 0) {
    notify(
      s,
      'info',
      'Nuevo extracto de tarjeta',
      `${card.name}: ${formatMoney(card.statementBalance, cur)} (mínimo ${formatMoney(card.minimumDue, cur)}).`,
      `/cards/${card.id}`,
    );
  }
}

function settleDue(s: S, card: Card): void {
  const cur = cardCurrency(s, card);
  if (card.autopay !== 'none') {
    const target = card.autopay === 'full' ? card.statementBalance : card.minimumDue;
    const pending = Math.min(card.balance, Math.max(0, target - card.paidSinceStatement));
    if (pending > 0) {
      try {
        payCard(s, { cardId: card.id, amount: pending, auto: true });
      } catch (e) {
        notify(s, 'danger', 'Pago automático fallido', `${card.name}: ${e instanceof DomainError ? e.message : 'error'}`, `/cards/${card.id}`);
      }
    }
  }
  const paid = card.paidSinceStatement;
  if (card.statementBalance > 0) {
    if (paid >= card.statementBalance) {
      addCreditEvent(s, 'on_time_payment', `Tarjeta ${card.name}: extracto pagado en plazo`);
    } else {
      if (paid < card.minimumDue) {
        post(s, {
          kind: 'fee',
          flow: 'expense',
          category: 'fees',
          concept: `Comisión por impago ${card.name}`,
          amount: LATE_FEE,
          from: { type: 'card', id: card.id, label: card.name },
          to: { type: 'system', label: 'NEXUS Bank (simulado)' },
          currency: cur,
          toCurrency: cur,
          cardId: card.id,
        });
        card.balance += LATE_FEE;
        card.feesCharged += LATE_FEE;
        card.latePayments += 1;
        addCreditEvent(s, 'late_payment', `Tarjeta ${card.name}: pago mínimo no realizado`);
        notify(s, 'danger', 'Pago de tarjeta vencido', `${card.name}: no se cubrió el mínimo. Comisión de ${formatMoney(LATE_FEE, cur)}.`, `/cards/${card.id}`);
      } else {
        addCreditEvent(s, 'on_time_payment', `Tarjeta ${card.name}: pago mínimo en plazo`);
      }
      const unpaid = card.statementBalance - paid;
      const interest = Math.round((unpaid * card.apr) / 12);
      if (interest > 0) {
        post(s, {
          kind: 'interest_charged',
          flow: 'expense',
          category: 'interest',
          concept: `Intereses ${card.name} (${(card.apr * 100).toFixed(1)} % TAE)`,
          amount: interest,
          from: { type: 'card', id: card.id, label: card.name },
          to: { type: 'system', label: 'NEXUS Bank (simulado)' },
          currency: cur,
          toCurrency: cur,
          cardId: card.id,
        });
        card.balance += interest;
        card.interestCharged += interest;
      }
    }
  }
  card.dueAt = undefined;
}

export function processCardsDay(s: S): void {
  const now = nowDate(s);
  for (const card of s.cards) {
    if (card.type !== 'credit' || card.status === 'cancelled') continue;
    if (card.dueAt && now.getTime() >= Date.parse(card.dueAt)) settleDue(s, card);
    if (now.getUTCDate() === card.closingDay) closeStatement(s, card);
  }
}
