/**
 * MOTOR DE PRÉSTAMOS (sistema francés) y LÍNEAS DE CRÉDITO.
 *
 * - Cuota constante: C = P·r / (1 − (1 + r)^−n), con r = TIN / periodos al año.
 * - Las cuotas se cargan automáticamente en la cuenta asociada al vencer.
 * - Si no hay saldo, la cuota pasa a "vencida", se aplica una comisión y se
 *   reintenta el cobro cada día. Afecta negativamente al credit score.
 * - Amortización anticipada parcial (reduce cuota) o total.
 */
import type { Loan, LoanFrequency, LoanKind } from '@/core/schema';
import { formatMoney } from '@/core/money';
import { addDaysUTC, addMonthsUTC, PERIODS_PER_YEAR, startOfUTCDay } from '@/core/time';
import {
  addCreditEvent,
  assertAmount,
  assertText,
  base,
  fail,
  findById,
  nextId,
  notify,
  nowDate,
  nowISO,
  openAccount,
  type S,
} from '../context';
import { accountEndpoint, post } from '../ledger';

export const LOAN_KIND_LABELS: Record<LoanKind, string> = {
  personal: 'Préstamo personal',
  mortgage: 'Hipoteca',
  business: 'Financiación empresarial',
};

export const FREQUENCY_LABELS: Record<LoanFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
};

export const OPENING_FEE: Record<LoanKind, number> = { personal: 0.01, mortgage: 0.005, business: 0.01 };
export const LATE_FEE_RATE = 0.03;
export const MIN_LATE_FEE = 1_500;

export function periodRate(annualRate: number, frequency: LoanFrequency): number {
  return annualRate / PERIODS_PER_YEAR[frequency];
}

export function computeInstallment(principal: number, annualRate: number, periods: number, frequency: LoanFrequency): number {
  if (periods <= 0) return principal;
  const r = periodRate(annualRate, frequency);
  if (r === 0) return Math.ceil(principal / periods);
  return Math.ceil((principal * r) / (1 - Math.pow(1 + r, -periods)));
}

export function nextDueDate(from: Date, frequency: LoanFrequency, anchorDay: number): Date {
  switch (frequency) {
    case 'weekly':
      return addDaysUTC(from, 7);
    case 'biweekly':
      return addDaysUTC(from, 14);
    case 'monthly':
      return addMonthsUTC(from, 1, anchorDay);
    case 'quarterly':
      return addMonthsUTC(from, 3, anchorDay);
  }
}

export interface AmortizationRow {
  period: number;
  date: string;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

/** Calendario de amortización completo (o restante desde el estado actual). */
export function amortizationSchedule(
  principal: number,
  annualRate: number,
  periods: number,
  frequency: LoanFrequency,
  firstDue: Date,
  anchorDay: number,
  startPeriod = 1,
  installment?: number,
): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  const r = periodRate(annualRate, frequency);
  const pay = installment ?? computeInstallment(principal, annualRate, periods, frequency);
  let balance = principal;
  let date = firstDue;
  for (let i = 0; i < periods && balance > 0; i++) {
    const interest = Math.round(balance * r);
    const last = i === periods - 1;
    let principalPart = last ? balance : Math.min(balance, pay - interest);
    if (principalPart < 0) principalPart = 0;
    const payment = principalPart + interest;
    balance -= principalPart;
    rows.push({ period: startPeriod + i, date: date.toISOString(), payment, interest, principal: principalPart, balance });
    date = nextDueDate(date, frequency, anchorDay);
  }
  return rows;
}

export function loanSummary(principal: number, annualRate: number, periods: number, frequency: LoanFrequency) {
  const rows = amortizationSchedule(principal, annualRate, periods, frequency, new Date(0), 1);
  const totalInterest = rows.reduce((acc, r) => acc + r.interest, 0);
  return { installment: computeInstallment(principal, annualRate, periods, frequency), totalInterest, totalPaid: principal + totalInterest };
}

export interface CreateLoanInput {
  kind: LoanKind;
  principal: number;
  rate: number;
  termPeriods: number;
  frequency: LoanFrequency;
  accountId: string;
  name?: string;
  /** Si se indica, el capital se entrega al vendedor (no a la cuenta). */
  disburseTo?: { type: 'property'; id: string; label: string };
  propertyId?: string;
  opId?: string;
}

export function validateLoanTerms(p: { principal: number; rate: number; termPeriods: number; frequency: LoanFrequency }): void {
  assertAmount(p.principal, 'El capital solicitado');
  if (!Number.isFinite(p.rate) || p.rate < 0 || p.rate > 1) fail('INVALID_INPUT', 'El interés debe estar entre 0 % y 100 %.');
  if (!Number.isInteger(p.termPeriods) || p.termPeriods < 1 || p.termPeriods > 1560) fail('INVALID_INPUT', 'Duración no válida.');
  if (!(p.frequency in PERIODS_PER_YEAR)) fail('INVALID_INPUT', 'Frecuencia de pago no válida.');
}

export function createLoan(s: S, p: CreateLoanInput): string {
  if (!(p.kind in LOAN_KIND_LABELS)) fail('INVALID_INPUT', 'Tipo de préstamo no válido.');
  validateLoanTerms(p);
  const acc = openAccount(s, p.accountId);
  const id = nextId(s, 'loan');
  const name = p.name?.trim() ? assertText(p.name, 'El nombre', 80) : LOAN_KIND_LABELS[p.kind];
  const installment = computeInstallment(p.principal, p.rate, p.termPeriods, p.frequency);
  const start = startOfUTCDay(nowDate(s));
  const anchorDay = start.getUTCDate();
  const firstDue = nextDueDate(start, p.frequency, anchorDay);
  const openingFee = Math.round(p.principal * OPENING_FEE[p.kind]);

  post(s, {
    kind: 'loan_disbursement',
    flow: 'financing',
    category: 'loans',
    concept: `Desembolso ${name}`,
    amount: p.principal,
    from: { type: 'loan', id, label: name },
    to: p.disburseTo ?? { type: 'account', id: acc.id, label: acc.name },
    currency: base(s),
    refId: id,
    opId: p.opId,
  });
  if (openingFee > 0) {
    post(s, {
      kind: 'fee',
      flow: 'expense',
      category: 'fees',
      concept: `Comisión de apertura ${name}`,
      amount: openingFee,
      amountIn: 'to',
      from: accountEndpoint(s, acc.id),
      to: { type: 'loan', id, label: name },
      refId: id,
    });
  }
  const loan: Loan = {
    id,
    kind: p.kind,
    name,
    principal: p.principal,
    rate: p.rate,
    termPeriods: p.termPeriods,
    frequency: p.frequency,
    installment,
    outstanding: p.principal,
    accountId: acc.id,
    startAt: nowISO(s),
    nextDueAt: firstDue.toISOString(),
    anchorDay,
    periodsPaid: 0,
    status: 'active',
    propertyId: p.propertyId,
    totalInterestPaid: 0,
    overdue: 0,
    missedPayments: 0,
    lateFees: 0,
    openingFee,
    payments: [],
  };
  s.loans.push(loan);
  addCreditEvent(s, 'hard_inquiry', `Solicitud de ${name.toLowerCase()}`);
  return id;
}

export function loanDebt(l: Loan): number {
  return l.status === 'active' ? l.outstanding + l.overdue : 0;
}

function markPaidIfDone(s: S, l: Loan): void {
  if (l.outstanding <= 0 && l.overdue <= 0) {
    l.outstanding = 0;
    l.status = 'paid';
    addCreditEvent(s, 'debt_paid_off', `${l.name} amortizado por completo`);
    notify(s, 'success', 'Préstamo liquidado', `${l.name} está totalmente pagado.`, `/products/loans/${l.id}`);
  }
}

/** Cobra una cuota vencida. Devuelve false si no hay saldo suficiente. */
function chargeInstallment(s: S, l: Loan): boolean {
  const r = periodRate(l.rate, l.frequency);
  const interest = Math.round(l.outstanding * r);
  const isLast = l.periodsPaid >= l.termPeriods - 1;
  const principalPart = isLast ? l.outstanding : Math.max(0, Math.min(l.outstanding, l.installment - interest));
  const total = principalPart + interest;
  const acc = s.accounts.find((a) => a.id === l.accountId);
  const fundsOk = acc && acc.status === 'open';
  try {
    if (!fundsOk) fail('ACCOUNT_CLOSED', 'Cuenta de cargo no disponible.');
    // Ambos cargos se validan juntos para que no quede ninguno a medias.
    post(s, {
      kind: 'loan_payment',
      flow: 'financing',
      category: 'loans',
      concept: `Cuota ${l.periodsPaid + 1}/${l.termPeriods} ${l.name}`,
      amount: total,
      amountIn: 'to',
      from: accountEndpoint(s, l.accountId),
      to: { type: 'loan', id: l.id, label: l.name },
      refId: l.id,
    });
    if (interest > 0) {
      // Registro contable de la parte de intereses (gasto) sin mover saldo adicional.
      post(s, {
        kind: 'interest_charged',
        flow: 'expense',
        category: 'interest',
        concept: `Intereses incluidos en la cuota de ${l.name}`,
        amount: interest,
        from: { type: 'loan', id: l.id, label: l.name },
        to: { type: 'system', label: 'NEXUS Bank (simulado)' },
        currency: base(s),
        refId: l.id,
      });
    }
    l.outstanding -= principalPart;
    l.totalInterestPaid += interest;
    l.payments.push({ at: nowISO(s), amount: total, interest, principal: principalPart, fee: 0, status: 'paid' });
    addCreditEvent(s, 'on_time_payment', `Cuota de ${l.name} pagada en plazo`);
    return true;
  } catch {
    const fee = Math.max(MIN_LATE_FEE, Math.round(total * LATE_FEE_RATE));
    l.outstanding -= principalPart;
    l.overdue += total + fee;
    l.lateFees += fee;
    l.totalInterestPaid += interest;
    l.missedPayments += 1;
    l.payments.push({ at: nowISO(s), amount: total, interest, principal: principalPart, fee, status: 'missed' });
    addCreditEvent(s, 'missed_payment', `Cuota de ${l.name} impagada`);
    notify(
      s,
      'danger',
      'Cuota de préstamo impagada',
      `${l.name}: saldo insuficiente. Deuda vencida ${formatMoney(l.overdue, base(s))} (incluye comisión).`,
      `/products/loans/${l.id}`,
    );
    return false;
  }
}

/** Reintenta cobrar la deuda vencida. */
function collectOverdue(s: S, l: Loan): void {
  if (l.overdue <= 0) return;
  const acc = s.accounts.find((a) => a.id === l.accountId);
  if (!acc || acc.status !== 'open') return;
  const available = acc.balance + acc.overdraftLimit;
  if (available <= 0) return;
  try {
    post(s, {
      kind: 'loan_payment',
      flow: 'financing',
      category: 'loans',
      concept: `Regularización deuda vencida ${l.name}`,
      amount: l.overdue,
      amountIn: 'to',
      from: accountEndpoint(s, l.accountId),
      to: { type: 'loan', id: l.id, label: l.name },
      refId: l.id,
    });
    l.payments.push({ at: nowISO(s), amount: l.overdue, interest: 0, principal: 0, fee: 0, status: 'late-paid' });
    l.overdue = 0;
    addCreditEvent(s, 'late_payment', `Deuda vencida de ${l.name} regularizada con retraso`);
    notify(s, 'info', 'Deuda regularizada', `Se ha cobrado la deuda vencida de ${l.name}.`, `/products/loans/${l.id}`);
  } catch {
    /* sigue sin saldo: se reintentará mañana */
  }
}

export function processLoans(s: S): void {
  const now = nowDate(s).getTime();
  for (const l of s.loans) {
    if (l.status !== 'active') continue;
    collectOverdue(s, l);
    let guard = 0;
    while (l.status === 'active' && l.outstanding > 0 && Date.parse(l.nextDueAt) <= now && guard++ < 60) {
      chargeInstallment(s, l);
      l.periodsPaid += 1;
      l.nextDueAt = nextDueDate(new Date(l.nextDueAt), l.frequency, l.anchorDay).toISOString();
    }
    markPaidIfDone(s, l);
  }
}

/** Amortización anticipada: primero la deuda vencida, después el capital. */
export function prepayLoan(s: S, p: { loanId: string; accountId: string; amount?: number; full?: boolean; opId?: string }): number {
  const l = findById(s.loans, p.loanId, 'Préstamo');
  if (l.status !== 'active') fail('INVALID_STATE', 'El préstamo ya está liquidado.');
  const debt = loanDebt(l);
  const amount = p.full ? debt : (p.amount ?? 0);
  assertAmount(amount, 'El importe a amortizar');
  if (amount > debt) fail('INVALID_AMOUNT', `El importe supera la deuda pendiente (${formatMoney(debt, base(s))}).`);
  post(s, {
    kind: 'loan_payment',
    flow: 'financing',
    category: 'loans',
    concept: `Amortización anticipada ${l.name}`,
    amount,
    amountIn: 'to',
    from: accountEndpoint(s, p.accountId),
    to: { type: 'loan', id: l.id, label: l.name },
    refId: l.id,
    opId: p.opId,
  });
  let rest = amount;
  const toOverdue = Math.min(rest, l.overdue);
  l.overdue -= toOverdue;
  rest -= toOverdue;
  l.outstanding -= rest;
  l.payments.push({ at: nowISO(s), amount, interest: 0, principal: rest, fee: 0, status: 'prepayment' });
  const remainingPeriods = Math.max(1, l.termPeriods - l.periodsPaid);
  if (l.outstanding > 0) l.installment = computeInstallment(l.outstanding, l.rate, remainingPeriods, l.frequency);
  markPaidIfDone(s, l);
  return amount;
}

export function remainingSchedule(l: Loan): AmortizationRow[] {
  if (l.status !== 'active' || l.outstanding <= 0) return [];
  return amortizationSchedule(
    l.outstanding,
    l.rate,
    Math.max(1, l.termPeriods - l.periodsPaid),
    l.frequency,
    new Date(l.nextDueAt),
    l.anchorDay,
    l.periodsPaid + 1,
    l.installment,
  );
}

/** Tipo orientativo según la puntuación crediticia simulada. */
export function suggestedRate(kind: LoanKind, score: number): number {
  const baseRate = kind === 'mortgage' ? 0.029 : kind === 'business' ? 0.055 : 0.069;
  const adj = score >= 780 ? -0.01 : score >= 700 ? -0.004 : score >= 620 ? 0.006 : score >= 550 ? 0.02 : 0.045;
  return Math.max(0.005, Math.round((baseRate + adj) * 10000) / 10000);
}

/* ------------------------------------------------------------------ */
/* Líneas de crédito                                                   */
/* ------------------------------------------------------------------ */

export function openCreditLine(s: S, p: { name?: string; limit: number; rate: number; accountId: string }): string {
  assertAmount(p.limit, 'El límite');
  if (!Number.isFinite(p.rate) || p.rate < 0 || p.rate > 1) fail('INVALID_INPUT', 'Interés no válido.');
  openAccount(s, p.accountId);
  const id = nextId(s, 'cl');
  s.creditLines.push({
    id,
    name: p.name?.trim() ? assertText(p.name, 'El nombre', 80) : 'Línea de crédito',
    limit: p.limit,
    drawn: 0,
    rate: p.rate,
    accountId: p.accountId,
    openedAt: nowISO(s),
    status: 'active',
    history: [],
    interestCharged: 0,
  });
  addCreditEvent(s, 'hard_inquiry', 'Solicitud de línea de crédito');
  return id;
}

function activeLine(s: S, id: string) {
  const l = findById(s.creditLines, id, 'Línea de crédito');
  if (l.status !== 'active') fail('INVALID_STATE', 'La línea de crédito está cerrada.');
  return l;
}

export function drawCreditLine(s: S, p: { lineId: string; amount: number; accountId?: string; opId?: string }): string {
  const l = activeLine(s, p.lineId);
  assertAmount(p.amount);
  if (l.drawn + p.amount > l.limit) fail('CREDIT_LIMIT', `Disponible: ${formatMoney(l.limit - l.drawn, base(s))}.`);
  const tx = post(s, {
    kind: 'credit_line_draw',
    flow: 'financing',
    category: 'loans',
    concept: `Disposición ${l.name}`,
    amount: p.amount,
    from: { type: 'creditLine', id: l.id, label: l.name },
    to: accountEndpoint(s, p.accountId ?? l.accountId),
    currency: base(s),
    refId: l.id,
    opId: p.opId,
  });
  l.drawn += p.amount;
  l.history.push({ at: nowISO(s), type: 'draw', amount: p.amount });
  return tx.id;
}

export function repayCreditLine(s: S, p: { lineId: string; amount: number; accountId?: string; opId?: string }): string {
  const l = activeLine(s, p.lineId);
  assertAmount(p.amount);
  if (p.amount > l.drawn) fail('INVALID_AMOUNT', `La deuda dispuesta es ${formatMoney(l.drawn, base(s))}.`);
  const tx = post(s, {
    kind: 'credit_line_repayment',
    flow: 'financing',
    category: 'loans',
    concept: `Devolución ${l.name}`,
    amount: p.amount,
    amountIn: 'to',
    from: accountEndpoint(s, p.accountId ?? l.accountId),
    to: { type: 'creditLine', id: l.id, label: l.name },
    refId: l.id,
    opId: p.opId,
  });
  l.drawn -= p.amount;
  l.history.push({ at: nowISO(s), type: 'repay', amount: p.amount });
  return tx.id;
}

export function closeCreditLine(s: S, p: { lineId: string }): void {
  const l = activeLine(s, p.lineId);
  if (l.drawn > 0) fail('CREDIT_DEBT', 'Devuelve el saldo dispuesto antes de cerrar la línea.');
  l.status = 'closed';
}

/** Intereses mensuales sobre el saldo dispuesto (se capitalizan). */
export function chargeCreditLineInterest(s: S): void {
  for (const l of s.creditLines) {
    if (l.status !== 'active' || l.drawn <= 0) continue;
    const interest = Math.round((l.drawn * l.rate) / 12);
    if (interest <= 0) continue;
    post(s, {
      kind: 'interest_charged',
      flow: 'expense',
      category: 'interest',
      concept: `Intereses ${l.name}`,
      amount: interest,
      from: { type: 'creditLine', id: l.id, label: l.name },
      to: { type: 'system', label: 'NEXUS Bank (simulado)' },
      currency: base(s),
      refId: l.id,
    });
    l.drawn += interest;
    l.interestCharged += interest;
    l.history.push({ at: nowISO(s), type: 'interest', amount: interest });
  }
}
