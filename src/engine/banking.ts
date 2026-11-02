/**
 * MÓDULO BANCARIO: cuentas, operaciones, contactos, transferencias
 * programadas/periódicas y solicitudes de dinero.
 */
import type { Account, AccountType, Category, Currency, ScheduledTransfer } from '@/core/schema';
import { CurrencySchema, CATEGORY_IDS } from '@/core/schema';
import { formatMoney } from '@/core/money';
import { addDaysUTC, fromDateInput, nextOccurrence, startOfUTCDay, type Frequency } from '@/core/time';
import {
  assertAmount,
  assertText,
  base,
  fail,
  findAccount,
  findById,
  nextId,
  notify,
  nowDate,
  nowISO,
  openAccount,
  rand,
  type S,
} from './context';
import { accountEndpoint, post, postFailed } from './ledger';
import { DomainError } from './context';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Cuenta corriente',
  savings: 'Cuenta de ahorro',
  investment: 'Cuenta de inversión',
  business: 'Cuenta empresarial',
};

const ACCOUNT_COLORS = ['#5488F5', '#24C78A', '#A78BFA', '#F5A524', '#F05B65', '#22B8CF', '#E879F9', '#94A3B8'];

/**
 * IBAN ficticio. Usa dígitos de control "00", que el estándar ISO 13616
 * considera inválidos, por lo que nunca coincide con un IBAN real operativo.
 */
export function generateIban(s: S, country: string): string {
  let digits = '';
  for (let i = 0; i < 16; i++) digits += Math.floor(rand(s, 'iban', s.seq * 97 + i) * 10);
  return `${country.toUpperCase()}00NXFS${digits}`;
}

export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

function generateAccountNumber(s: S): string {
  let digits = '';
  for (let i = 0; i < 10; i++) digits += Math.floor(rand(s, 'accnum', s.seq * 53 + i) * 10);
  return `NX-${digits}`;
}

/* ------------------------------------------------------------------ */
/* Cuentas                                                             */
/* ------------------------------------------------------------------ */

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  holder?: string;
  country?: string;
  currency?: Currency;
  initialBalance?: number;
  interestRate?: number;
  overdraftLimit?: number;
  color?: string;
}

export function createAccount(s: S, p: CreateAccountInput): string {
  const name = assertText(p.name, 'El nombre de la cuenta', 60);
  if (!(p.type in ACCOUNT_TYPE_LABELS)) fail('INVALID_INPUT', 'Tipo de cuenta no válido.');
  const currency = p.currency ?? base(s);
  if (!CurrencySchema.safeParse(currency).success) fail('INVALID_INPUT', 'Divisa no válida.');
  const country = (p.country ?? s.profile.country).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) fail('INVALID_INPUT', 'País no válido.');
  const rate = p.interestRate ?? (p.type === 'savings' ? 0.02 : 0);
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.5) fail('INVALID_INPUT', 'El tipo de interés debe estar entre 0 % y 50 %.');
  const overdraft = p.type === 'business' ? (p.overdraftLimit ?? 0) : 0;
  if (!Number.isInteger(overdraft) || overdraft < 0) fail('INVALID_INPUT', 'Límite de descubierto no válido.');
  if (p.initialBalance !== undefined && p.initialBalance !== 0) assertAmount(p.initialBalance, 'El saldo inicial');

  const id = nextId(s, 'acc');
  const acc: Account = {
    id,
    name,
    holder: (p.holder ?? s.profile.ownerName).trim() || s.profile.ownerName,
    country,
    currency,
    iban: generateIban(s, country),
    number: generateAccountNumber(s),
    balance: 0,
    openedAt: nowISO(s),
    type: p.type,
    status: 'open',
    favorite: s.accounts.filter((a) => a.status === 'open').length < 3,
    color: p.color ?? ACCOUNT_COLORS[s.accounts.length % ACCOUNT_COLORS.length],
    interestRate: rate,
    overdraftLimit: overdraft,
  };
  s.accounts.push(acc);
  if (p.initialBalance && p.initialBalance > 0) {
    post(s, {
      kind: 'deposit',
      // El saldo de apertura no es un ingreso del periodo.
      flow: 'internal',
      category: 'cash',
      concept: 'Saldo inicial',
      amount: p.initialBalance,
      from: { type: 'cash', label: 'Ingreso inicial' },
      to: { type: 'account', id, label: name },
    });
  }
  return id;
}

export interface UpdateAccountInput {
  accountId: string;
  name?: string;
  holder?: string;
  color?: string;
  interestRate?: number;
  overdraftLimit?: number;
  favorite?: boolean;
}

export function updateAccount(s: S, p: UpdateAccountInput): void {
  const acc = openAccount(s, p.accountId);
  if (p.name !== undefined) acc.name = assertText(p.name, 'El nombre', 60);
  if (p.holder !== undefined) acc.holder = assertText(p.holder, 'El titular', 80);
  if (p.color !== undefined) acc.color = p.color.slice(0, 20);
  if (p.favorite !== undefined) acc.favorite = p.favorite;
  if (p.interestRate !== undefined) {
    if (!Number.isFinite(p.interestRate) || p.interestRate < 0 || p.interestRate > 0.5) {
      fail('INVALID_INPUT', 'El tipo de interés debe estar entre 0 % y 50 %.');
    }
    acc.interestRate = p.interestRate;
  }
  if (p.overdraftLimit !== undefined) {
    if (acc.type !== 'business') fail('INVALID_INPUT', 'Solo las cuentas empresariales admiten descubierto.');
    if (!Number.isInteger(p.overdraftLimit) || p.overdraftLimit < 0) fail('INVALID_INPUT', 'Límite de descubierto no válido.');
    if (acc.balance < -p.overdraftLimit) fail('INVALID_INPUT', 'El saldo actual supera el nuevo límite de descubierto.');
    acc.overdraftLimit = p.overdraftLimit;
  }
}

/** Comprueba que ningún producto activo dependa de la cuenta. */
function accountDependencies(s: S, id: string): string[] {
  const deps: string[] = [];
  if (s.cards.some((c) => c.accountId === id && c.status !== 'cancelled')) deps.push('tarjetas activas');
  if (s.loans.some((l) => l.accountId === id && l.status === 'active')) deps.push('préstamos activos');
  if (s.creditLines.some((l) => l.accountId === id && l.status === 'active')) deps.push('líneas de crédito');
  if (s.insurance.some((p) => p.accountId === id && p.status !== 'cancelled')) deps.push('seguros');
  if (s.rentals.some((r) => r.accountId === id && r.status === 'active')) deps.push('contratos de alquiler');
  if (s.deposits.some((d) => d.accountId === id && d.status === 'active')) deps.push('depósitos');
  return deps;
}

export function closeAccount(s: S, p: { accountId: string; transferToId?: string }): void {
  const acc = openAccount(s, p.accountId);
  const deps = accountDependencies(s, acc.id);
  if (deps.length) fail('ACCOUNT_IN_USE', `No se puede cerrar: la cuenta tiene ${deps.join(', ')}.`);
  if (acc.balance < 0) fail('NEGATIVE_BALANCE', 'No se puede cerrar una cuenta con saldo negativo.');
  if (acc.balance > 0) {
    if (!p.transferToId) fail('BALANCE_REMAINING', 'Indica una cuenta para traspasar el saldo restante.');
    post(s, {
      kind: 'transfer_internal',
      flow: 'internal',
      category: 'transfers',
      concept: `Cierre de ${acc.name}`,
      amount: acc.balance,
      from: accountEndpoint(s, acc.id),
      to: accountEndpoint(s, p.transferToId),
    });
  }
  for (const sch of s.scheduled) {
    if ((sch.fromAccountId === acc.id || sch.toAccountId === acc.id) && sch.status !== 'completed') sch.status = 'cancelled';
  }
  for (const g of s.goals) if (g.auto?.accountId === acc.id) g.auto = null;
  acc.status = 'closed';
  acc.closedAt = nowISO(s);
  acc.favorite = false;
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

const conceptOr = (c: string | undefined, fallback: string) => (c && c.trim() ? c.trim().slice(0, 160) : fallback);

export function deposit(s: S, p: { accountId: string; amount: number; concept?: string; opId?: string }): string {
  return post(s, {
    kind: 'deposit',
    flow: 'income',
    category: 'cash',
    concept: conceptOr(p.concept, 'Ingreso de efectivo'),
    amount: p.amount,
    from: { type: 'cash', label: 'Efectivo' },
    to: accountEndpoint(s, p.accountId),
    opId: p.opId,
  }).id;
}

export function withdraw(s: S, p: { accountId: string; amount: number; concept?: string; opId?: string }): string {
  return post(s, {
    kind: 'withdrawal',
    flow: 'expense',
    category: 'cash',
    concept: conceptOr(p.concept, 'Retirada de efectivo'),
    amount: p.amount,
    from: accountEndpoint(s, p.accountId),
    to: { type: 'cash', label: 'Efectivo' },
    opId: p.opId,
  }).id;
}

export function transfer(s: S, p: { fromId: string; toId: string; amount: number; concept?: string; opId?: string }): string {
  return post(s, {
    kind: 'transfer_internal',
    flow: 'internal',
    category: 'transfers',
    concept: conceptOr(p.concept, 'Transferencia entre cuentas'),
    amount: p.amount,
    from: accountEndpoint(s, p.fromId),
    to: accountEndpoint(s, p.toId),
    opId: p.opId,
  }).id;
}

export function validateIbanFormat(iban: string): string {
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(clean)) fail('INVALID_IBAN', 'El IBAN de destino no tiene un formato válido.');
  return clean;
}

export function sendExternal(
  s: S,
  p: { fromId: string; name: string; iban: string; amount: number; concept?: string; saveContact?: boolean; opId?: string },
): string {
  const name = assertText(p.name, 'El beneficiario', 80);
  const iban = validateIbanFormat(p.iban);
  const tx = post(s, {
    kind: 'transfer_external_out',
    flow: 'expense',
    category: 'transfers',
    concept: conceptOr(p.concept, `Transferencia a ${name}`),
    amount: p.amount,
    from: accountEndpoint(s, p.fromId),
    to: { type: 'external', label: `${name} · ${iban.slice(-4)}` },
    status: 'pending',
    opId: p.opId,
  });
  if (p.saveContact && !s.contacts.some((c) => c.iban === iban)) {
    s.contacts.push({ id: nextId(s, 'ct'), name, iban, favorite: false });
  }
  return tx.id;
}

export function receiveExternal(s: S, p: { toId: string; name: string; amount: number; concept?: string; opId?: string }): string {
  const name = assertText(p.name, 'El ordenante', 80);
  return post(s, {
    kind: 'transfer_external_in',
    flow: 'income',
    category: 'income',
    concept: conceptOr(p.concept, `Transferencia de ${name}`),
    amount: p.amount,
    from: { type: 'external', label: name },
    to: accountEndpoint(s, p.toId),
    opId: p.opId,
  }).id;
}

export function pay(
  s: S,
  p: { accountId: string; merchant: string; amount: number; category?: Category; concept?: string; opId?: string },
): string {
  const merchant = assertText(p.merchant, 'El comercio', 80);
  const category = p.category && (CATEGORY_IDS as readonly string[]).includes(p.category) ? p.category : 'other';
  return post(s, {
    kind: 'payment',
    flow: 'expense',
    category,
    concept: conceptOr(p.concept, `Pago en ${merchant}`),
    amount: p.amount,
    from: accountEndpoint(s, p.accountId),
    to: { type: 'external', label: merchant },
    opId: p.opId,
  }).id;
}

/* ------------------------------------------------------------------ */
/* Contactos                                                           */
/* ------------------------------------------------------------------ */

export function createContact(s: S, p: { name: string; iban: string }): string {
  const name = assertText(p.name, 'El nombre', 80);
  const iban = validateIbanFormat(p.iban);
  if (s.contacts.some((c) => c.iban === iban)) fail('DUPLICATE', 'Ya existe un contacto con ese IBAN.');
  const id = nextId(s, 'ct');
  s.contacts.push({ id, name, iban, favorite: false });
  return id;
}

export function deleteContact(s: S, p: { contactId: string }): void {
  const idx = s.contacts.findIndex((c) => c.id === p.contactId);
  if (idx < 0) fail('NOT_FOUND', 'Contacto no encontrado.');
  s.contacts.splice(idx, 1);
}

/* ------------------------------------------------------------------ */
/* Solicitudes de dinero                                               */
/* ------------------------------------------------------------------ */

export function createRequest(s: S, p: { contactName: string; amount: number; concept?: string; toAccountId: string }): string {
  const name = assertText(p.contactName, 'El destinatario de la solicitud', 80);
  assertAmount(p.amount);
  openAccount(s, p.toAccountId);
  const id = nextId(s, 'req');
  const delayHours = 6 + Math.floor(rand(s, id, 1) * 60);
  const resolveAt = new Date(nowDate(s).getTime() + delayHours * 3_600_000).toISOString();
  s.requests.unshift({
    id,
    contactName: name,
    amount: p.amount,
    concept: conceptOr(p.concept, 'Solicitud de dinero'),
    toAccountId: p.toAccountId,
    createdAt: nowISO(s),
    resolveAt,
    status: 'pending',
  });
  return id;
}

export function cancelRequest(s: S, p: { requestId: string }): void {
  const r = findById(s.requests, p.requestId, 'Solicitud');
  if (r.status !== 'pending') fail('INVALID_STATE', 'La solicitud ya no está pendiente.');
  r.status = 'cancelled';
  r.resolvedAt = nowISO(s);
}

/** Resuelve las solicitudes vencidas (el contacto paga o rechaza). */
export function processRequests(s: S): void {
  const now = nowDate(s).getTime();
  for (const r of s.requests) {
    if (r.status !== 'pending' || Date.parse(r.resolveAt) > now) continue;
    const acc = s.accounts.find((a) => a.id === r.toAccountId);
    const accepts = rand(s, r.id, 2) < 0.8 && acc?.status === 'open';
    if (accepts && acc) {
      post(s, {
        kind: 'request_payment',
        flow: 'income',
        category: 'income',
        concept: `${r.contactName}: ${r.concept}`,
        amount: r.amount,
        from: { type: 'external', label: r.contactName },
        to: { type: 'account', id: acc.id, label: acc.name },
        refId: r.id,
      });
      r.status = 'paid';
      notify(s, 'success', 'Solicitud pagada', `${r.contactName} te ha enviado ${formatMoney(r.amount, acc.currency)}.`, `/accounts/${acc.id}`);
    } else {
      r.status = 'declined';
      notify(s, 'warning', 'Solicitud rechazada', `${r.contactName} ha rechazado tu solicitud de ${formatMoney(r.amount, base(s))}.`);
    }
    r.resolvedAt = nowISO(s);
  }
}

/** Las transferencias externas se liquidan al día siguiente. */
export function settlePendingTransfers(s: S): void {
  const limit = nowDate(s).getTime() - 20 * 3_600_000;
  for (let i = s.transactions.length - 1; i >= 0; i--) {
    const tx = s.transactions[i];
    if (tx.status === 'pending' && Date.parse(tx.at) <= limit) tx.status = 'completed';
    if (s.transactions.length - i > 3000) break;
  }
}

/* ------------------------------------------------------------------ */
/* Transferencias programadas y periódicas                             */
/* ------------------------------------------------------------------ */

export interface CreateScheduleInput {
  kind: ScheduledTransfer['kind'];
  fromAccountId?: string;
  toAccountId?: string;
  counterparty?: string;
  counterpartyIban?: string;
  amount: number;
  concept?: string;
  category?: Category;
  frequency: Frequency;
  /** Fecha de la primera ejecución (YYYY-MM-DD). */
  startDate: string;
  endDate?: string;
  occurrences?: number;
}

export function createSchedule(s: S, p: CreateScheduleInput): string {
  assertAmount(p.amount);
  const start = fromDateInput(p.startDate);
  if (!start) fail('INVALID_INPUT', 'Fecha de inicio no válida.');
  const todayStart = startOfUTCDay(nowDate(s));
  if (start.getTime() < todayStart.getTime()) fail('INVALID_INPUT', 'La fecha de inicio no puede estar en el pasado.');
  const end = p.endDate ? fromDateInput(p.endDate) : null;
  if (p.endDate && !end) fail('INVALID_INPUT', 'Fecha de fin no válida.');
  if (end && end.getTime() < start.getTime()) fail('INVALID_INPUT', 'La fecha de fin es anterior a la de inicio.');
  if (p.occurrences !== undefined && (!Number.isInteger(p.occurrences) || p.occurrences < 1)) {
    fail('INVALID_INPUT', 'El número de repeticiones no es válido.');
  }
  let counterparty: string | undefined;
  let counterpartyIban: string | undefined;
  if (p.kind === 'internal') {
    openAccount(s, p.fromAccountId);
    openAccount(s, p.toAccountId);
    if (p.fromAccountId === p.toAccountId) fail('SAME_ACCOUNT', 'La cuenta de origen y destino no pueden ser la misma.');
  } else if (p.kind === 'external') {
    openAccount(s, p.fromAccountId);
    counterparty = assertText(p.counterparty, 'El beneficiario', 80);
    counterpartyIban = validateIbanFormat(p.counterpartyIban ?? '');
  } else if (p.kind === 'income') {
    openAccount(s, p.toAccountId);
    counterparty = assertText(p.counterparty, 'El pagador', 80);
  } else fail('INVALID_INPUT', 'Tipo de programación no válido.');

  const id = nextId(s, 'sch');
  const sch: ScheduledTransfer = {
    id,
    kind: p.kind,
    fromAccountId: p.kind === 'income' ? undefined : p.fromAccountId,
    toAccountId: p.kind === 'external' ? undefined : p.toAccountId,
    counterparty,
    counterpartyIban,
    amount: p.amount,
    concept: conceptOr(p.concept, p.kind === 'income' ? `Ingreso de ${counterparty}` : 'Transferencia programada'),
    category: p.category ?? (p.kind === 'income' ? 'salary' : 'transfers'),
    frequency: p.frequency,
    anchorDay: start.getUTCDate(),
    nextAt: start.toISOString(),
    endAt: end ? end.toISOString() : undefined,
    remaining: p.frequency === 'once' ? 1 : p.occurrences,
    status: 'active',
    executions: 0,
    failures: 0,
    createdAt: nowISO(s),
  };
  s.scheduled.push(sch);
  // Si la primera ejecución es hoy, se ejecuta inmediatamente.
  runDueSchedule(s, sch);
  return id;
}

export function setScheduleStatus(s: S, p: { scheduleId: string; status: 'active' | 'paused' | 'cancelled' }): void {
  const sch = findById(s.scheduled, p.scheduleId, 'Programación');
  if (sch.status === 'completed' || sch.status === 'cancelled') fail('INVALID_STATE', 'La programación ya ha finalizado.');
  sch.status = p.status;
  if (p.status === 'active') {
    // Al reanudar se omiten las ejecuciones atrasadas.
    const now = nowDate(s);
    let next = new Date(sch.nextAt);
    let guard = 0;
    while (next.getTime() < startOfUTCDay(now).getTime() && guard++ < 1000) {
      next = nextOccurrence(next, sch.frequency, sch.anchorDay);
    }
    sch.nextAt = next.toISOString();
  }
}

function executeSchedule(s: S, sch: ScheduledTransfer): boolean {
  const spec =
    sch.kind === 'internal'
      ? {
          kind: 'transfer_internal' as const,
          flow: 'internal' as const,
          from: accountEndpoint(s, sch.fromAccountId!),
          to: accountEndpoint(s, sch.toAccountId!),
        }
      : sch.kind === 'external'
        ? {
            kind: 'transfer_external_out' as const,
            flow: 'expense' as const,
            from: accountEndpoint(s, sch.fromAccountId!),
            to: { type: 'external' as const, label: `${sch.counterparty} · ${sch.counterpartyIban?.slice(-4)}` },
          }
        : {
            kind: 'transfer_external_in' as const,
            flow: 'income' as const,
            from: { type: 'external' as const, label: sch.counterparty ?? 'Pagador' },
            to: accountEndpoint(s, sch.toAccountId!),
          };
  const full = { ...spec, category: sch.category, concept: sch.concept, amount: sch.amount, refId: sch.id };
  try {
    post(s, full);
    sch.executions += 1;
    sch.lastResult = 'ok';
    return true;
  } catch (e) {
    const reason = e instanceof DomainError ? e.message : 'Error desconocido';
    postFailed(s, full, reason);
    sch.failures += 1;
    sch.lastResult = 'failed';
    notify(s, 'danger', 'Transferencia programada fallida', `${sch.concept}: ${reason}`, '/operations');
    return false;
  }
}

/** Ejecuta la programación si está vencida y calcula la siguiente fecha. */
export function runDueSchedule(s: S, sch: ScheduledTransfer): void {
  const now = nowDate(s).getTime();
  let guard = 0;
  while (sch.status === 'active' && Date.parse(sch.nextAt) <= now && guard++ < 400) {
    // Si alguna cuenta implicada se cerró, se cancela la programación.
    const ids = [sch.fromAccountId, sch.toAccountId].filter(Boolean) as string[];
    if (ids.some((id) => findAccount(s, id).status !== 'open')) {
      sch.status = 'cancelled';
      break;
    }
    executeSchedule(s, sch);
    sch.lastRunAt = nowISO(s);
    if (sch.remaining !== undefined) sch.remaining = Math.max(0, sch.remaining - 1);
    const next = sch.frequency === 'once' ? null : nextOccurrence(new Date(sch.nextAt), sch.frequency, sch.anchorDay);
    if (!next || sch.remaining === 0 || (sch.endAt && next.getTime() > Date.parse(sch.endAt))) {
      sch.status = 'completed';
    } else {
      sch.nextAt = next.toISOString();
    }
  }
}

export function processSchedules(s: S): void {
  for (const sch of s.scheduled) if (sch.status === 'active') runDueSchedule(s, sch);
}

/** Intereses mensuales de las cuentas remuneradas. */
export function payAccountInterest(s: S): void {
  for (const acc of s.accounts) {
    if (acc.status !== 'open' || acc.interestRate <= 0 || acc.balance <= 0) continue;
    const interest = Math.round((acc.balance * acc.interestRate) / 12);
    if (interest <= 0) continue;
    post(s, {
      kind: 'interest_earned',
      flow: 'income',
      category: 'interest',
      concept: `Intereses ${(acc.interestRate * 100).toFixed(2)} % TIN`,
      amount: interest,
      from: { type: 'system', label: 'NEXUS Bank (simulado)' },
      to: { type: 'account', id: acc.id, label: acc.name },
      currency: acc.currency,
    });
  }
}

export const nextDayStart = (s: S) => addDaysUTC(startOfUTCDay(nowDate(s)), 1);
