/**
 * SISTEMA INMOBILIARIO: mercado ficticio, compraventa (al contado o con
 * hipoteca), gastos, revalorización mensual y gestión de alquileres.
 */
import type { Property, RentalContract } from '@/core/schema';
import { FX_RATES, formatMoney } from '@/core/money';
import { gaussianAt } from '@/core/random';
import { addMonthsUTC, monthKey, startOfUTCDay, daysInMonth } from '@/core/time';
import { generateProperty } from '@/data/realestate';
import {
  assertAmount,
  assertText,
  base,
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
import { accountEndpoint, post, postFailed } from './ledger';
import { scenarioAdjustment } from './market';
import { createLoan, loanDebt, prepayLoan, validateLoanTerms } from './products/loans';

function propEndpoint(p: Property) {
  return { type: 'property' as const, id: p.id, label: p.title };
}

export function generateListings(s: S, p: { count?: number } = {}): number {
  const count = Math.min(24, Math.max(1, p.count ?? 6));
  for (let i = 0; i < count; i++) {
    const id = nextId(s, 'prop');
    s.properties.push(generateProperty(s.market.seed, s.seq + i * 7, id, FX_RATES[base(s)], nowISO(s)));
  }
  return count;
}

export interface BuyPropertyInput {
  propertyId: string;
  accountId: string;
  financing?: { downPayment: number; rate: number; years: number } | null;
  opId?: string;
}

export function purchaseCosts(s: S, price: number): number {
  return Math.round(price * s.settings.propertyPurchaseCostRate);
}

export function buyProperty(s: S, p: BuyPropertyInput): string {
  const prop = findById(s.properties, p.propertyId, 'Inmueble');
  if (prop.owned) fail('INVALID_STATE', 'Ya eres propietario de este inmueble.');
  if (!prop.listed) fail('INVALID_STATE', 'El inmueble no está a la venta.');
  openAccount(s, p.accountId);
  const price = prop.value;
  const costs = purchaseCosts(s, price);
  let paidFromAccount = price;
  if (p.financing) {
    const { downPayment, rate, years } = p.financing;
    assertAmount(downPayment, 'La entrada');
    if (downPayment < Math.round(price * 0.1)) fail('INVALID_INPUT', `La entrada mínima es el 10 % (${formatMoney(Math.round(price * 0.1), base(s))}).`);
    if (downPayment >= price) fail('INVALID_INPUT', 'La entrada debe ser inferior al precio para financiar.');
    if (!Number.isInteger(years) || years < 1 || years > 40) fail('INVALID_INPUT', 'El plazo de la hipoteca debe estar entre 1 y 40 años.');
    validateLoanTerms({ principal: price - downPayment, rate, termPeriods: years * 12, frequency: 'monthly' });
    paidFromAccount = downPayment;
  }
  post(s, {
    kind: 'property_buy',
    flow: 'investment',
    category: 'real_estate',
    concept: `${p.financing ? 'Entrada' : 'Compra'}: ${prop.title}`,
    amount: paidFromAccount,
    amountIn: 'to',
    from: accountEndpoint(s, p.accountId),
    to: propEndpoint(prop),
    refId: prop.id,
    opId: p.opId,
  });
  if (costs > 0) {
    post(s, {
      kind: 'fee',
      flow: 'expense',
      category: 'taxes',
      concept: `Impuestos y gastos de compraventa: ${prop.title}`,
      amount: costs,
      amountIn: 'to',
      from: accountEndpoint(s, p.accountId),
      to: { type: 'external', label: 'Notaría, registro e impuestos (simulado)' },
      toCurrency: base(s),
      refId: prop.id,
    });
  }
  if (p.financing) {
    const loanId = createLoan(s, {
      kind: 'mortgage',
      name: `Hipoteca ${prop.city}`,
      principal: price - p.financing.downPayment,
      rate: p.financing.rate,
      termPeriods: p.financing.years * 12,
      frequency: 'monthly',
      accountId: p.accountId,
      disburseTo: propEndpoint(prop),
      propertyId: prop.id,
    });
    prop.mortgageLoanId = loanId;
  }
  prop.owned = true;
  prop.listed = false;
  prop.purchasePrice = price;
  prop.purchaseCosts = costs;
  prop.purchasedAt = nowISO(s);
  prop.expenses = [];
  prop.rentCollected = 0;
  return prop.id;
}

export function saleCosts(s: S, value: number): number {
  return Math.round(value * s.settings.propertySaleCostRate);
}

export function sellProperty(s: S, p: { propertyId: string; accountId: string; opId?: string }): number {
  const prop = findById(s.properties, p.propertyId, 'Inmueble');
  if (!prop.owned) fail('INVALID_STATE', 'No eres propietario de este inmueble.');
  if (s.rentals.some((r) => r.propertyId === prop.id && r.status === 'active')) {
    fail('RENTED', 'Finaliza el contrato de alquiler antes de vender el inmueble.');
  }
  openAccount(s, p.accountId);
  const costs = saleCosts(s, prop.value);
  const net = prop.value - costs;
  post(s, {
    kind: 'property_sell',
    flow: 'investment',
    category: 'real_estate',
    concept: `Venta: ${prop.title}`,
    amount: net,
    from: propEndpoint(prop),
    to: accountEndpoint(s, p.accountId),
    currency: base(s),
    refId: prop.id,
    opId: p.opId,
  });
  const loan = prop.mortgageLoanId ? s.loans.find((l) => l.id === prop.mortgageLoanId && l.status === 'active') : undefined;
  if (loan && loanDebt(loan) > 0) prepayLoan(s, { loanId: loan.id, accountId: p.accountId, full: true });
  const gain = net - (prop.purchasePrice ?? 0) - (prop.purchaseCosts ?? 0);
  notify(s, gain >= 0 ? 'success' : 'warning', 'Inmueble vendido', `${prop.title}: resultado ${formatMoney(gain, base(s), { sign: true })} tras gastos.`, '/realestate');
  prop.owned = false;
  prop.listed = true;
  prop.purchasePrice = undefined;
  prop.purchaseCosts = undefined;
  prop.purchasedAt = undefined;
  prop.mortgageLoanId = undefined;
  return net;
}

export function addPropertyExpense(
  s: S,
  p: { propertyId: string; accountId: string; type: Property['expenses'][number]['type']; description: string; amount: number; opId?: string },
): string {
  const prop = findById(s.properties, p.propertyId, 'Inmueble');
  if (!prop.owned) fail('INVALID_STATE', 'Solo puedes registrar gastos de inmuebles propios.');
  if (!['repair', 'maintenance', 'tax', 'other'].includes(p.type)) fail('INVALID_INPUT', 'Tipo de gasto no válido.');
  const description = assertText(p.description, 'La descripción', 160);
  const tx = post(s, {
    kind: 'property_expense',
    flow: 'expense',
    category: 'real_estate',
    concept: `${description} · ${prop.title}`,
    amount: p.amount,
    amountIn: 'to',
    from: accountEndpoint(s, p.accountId),
    to: { type: 'external', label: description },
    toCurrency: base(s),
    refId: prop.id,
    opId: p.opId,
  });
  prop.expenses.push({ id: nextId(s, 'pex'), at: nowISO(s), type: p.type, description, amount: p.amount });
  return tx.id;
}

/** Revalorización mensual (día 1 de cada mes). */
export function revalueProperties(s: S): void {
  const now = nowDate(s);
  const monthIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const sc = scenarioAdjustment(s.market, 'real_estate');
  for (const p of s.properties) {
    const mu = p.growth + s.market.realEstateTrend + sc.drift;
    const sigma = p.volatility * sc.vol;
    const z = gaussianAt(s.market.seed, p.id, monthIndex);
    const ret = (mu - (sigma * sigma) / 2) / 12 + (sigma / Math.sqrt(12)) * z;
    const factor = Math.exp(ret);
    p.value = Math.max(100_000, Math.round(p.value * factor));
    p.marketRent = Math.round((p.marketRent * factor) / 100) * 100;
    p.valueHistory.push({ at: now.toISOString(), v: p.value });
    if (p.valueHistory.length > 180) p.valueHistory.splice(0, p.valueHistory.length - 180);
  }
}

export interface PropertyStats {
  invested: number;
  appreciation: number;
  rentCollected: number;
  expenses: number;
  mortgageInterest: number;
  netIncome: number;
  annualRent: number;
  grossYield: number;
  netYield: number;
  totalReturn: number;
  equity: number;
}

export function propertyStats(s: S, p: Property): PropertyStats {
  const invested = (p.purchasePrice ?? 0) + (p.purchaseCosts ?? 0);
  const expenses = p.expenses.reduce((a, e) => a + e.amount, 0);
  const loan = p.mortgageLoanId ? s.loans.find((l) => l.id === p.mortgageLoanId) : undefined;
  const mortgageInterest = loan?.totalInterestPaid ?? 0;
  const contract = s.rentals.find((r) => r.propertyId === p.id && r.status === 'active');
  const annualRent = contract ? contract.monthlyRent * 12 : 0;
  const netIncome = p.rentCollected - expenses - mortgageInterest;
  const appreciation = p.value - (p.purchasePrice ?? p.value);
  const yearlyCostsEstimate = Math.round(p.value * 0.01);
  const debt = loan ? loanDebt(loan) : 0;
  return {
    invested,
    appreciation,
    rentCollected: p.rentCollected,
    expenses,
    mortgageInterest,
    netIncome,
    annualRent,
    grossYield: p.purchasePrice ? annualRent / p.purchasePrice : 0,
    netYield: invested ? (annualRent - yearlyCostsEstimate) / invested : 0,
    totalReturn: invested ? (appreciation + netIncome) / invested : 0,
    equity: p.value - debt,
  };
}

/* ------------------------------------------------------------------ */
/* Alquileres                                                          */
/* ------------------------------------------------------------------ */

export interface CreateRentalInput {
  propertyId: string;
  tenantId: string;
  monthlyRent: number;
  deposit?: number;
  months: number;
  dueDay?: number;
  accountId: string;
  opId?: string;
}

export function createRental(s: S, p: CreateRentalInput): string {
  const prop = findById(s.properties, p.propertyId, 'Inmueble');
  if (!prop.owned) fail('INVALID_STATE', 'Solo puedes alquilar inmuebles de tu propiedad.');
  if (s.rentals.some((r) => r.propertyId === prop.id && r.status === 'active')) fail('INVALID_STATE', 'El inmueble ya está alquilado.');
  const tenant = findById(s.tenants, p.tenantId, 'Inquilino');
  if (s.rentals.some((r) => r.tenantId === tenant.id && r.status === 'active')) fail('INVALID_STATE', `${tenant.name} ya tiene un contrato activo.`);
  assertAmount(p.monthlyRent, 'La mensualidad');
  const deposit = p.deposit ?? p.monthlyRent * 2;
  if (!Number.isInteger(deposit) || deposit < 0) fail('INVALID_INPUT', 'Fianza no válida.');
  if (!Number.isInteger(p.months) || p.months < 1 || p.months > 120) fail('INVALID_INPUT', 'La duración debe estar entre 1 y 120 meses.');
  const dueDay = p.dueDay ?? 1;
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) fail('INVALID_INPUT', 'El día de pago debe estar entre 1 y 28.');
  openAccount(s, p.accountId);
  const id = nextId(s, 'rent');
  if (deposit > 0) {
    post(s, {
      kind: 'rent_deposit_in',
      flow: 'financing',
      category: 'real_estate',
      concept: `Fianza de ${tenant.name} · ${prop.title}`,
      amount: deposit,
      from: { type: 'external', label: tenant.name },
      to: accountEndpoint(s, p.accountId),
      currency: base(s),
      refId: id,
      opId: p.opId,
    });
  }
  const start = startOfUTCDay(nowDate(s));
  const contract: RentalContract = {
    id,
    propertyId: prop.id,
    tenantId: tenant.id,
    monthlyRent: p.monthlyRent,
    deposit,
    startAt: nowISO(s),
    endAt: addMonthsUTC(start, p.months).toISOString(),
    dueDay,
    accountId: p.accountId,
    status: 'active',
    arrears: 0,
    writtenOff: 0,
    payments: [],
  };
  s.rentals.push(contract);
  return id;
}

function activeContract(s: S, id: string): RentalContract {
  const c = findById(s.rentals, id, 'Contrato');
  if (c.status !== 'active') fail('INVALID_STATE', 'El contrato ya ha finalizado.');
  return c;
}

function contractAccount(s: S, c: RentalContract) {
  return s.accounts.find((a) => a.id === c.accountId && a.status === 'open') ?? s.accounts.find((a) => a.status === 'open');
}

function postRent(s: S, c: RentalContract, amount: number, concept: string, opId?: string): void {
  const acc = contractAccount(s, c);
  if (!acc) fail('ACCOUNT_NOT_FOUND', 'No hay ninguna cuenta abierta para cobrar la renta.');
  const prop = s.properties.find((p) => p.id === c.propertyId);
  const tenant = s.tenants.find((t) => t.id === c.tenantId);
  post(s, {
    kind: 'rent_income',
    flow: 'income',
    category: 'real_estate',
    concept,
    amount,
    from: { type: 'external', label: tenant?.name ?? 'Inquilino' },
    to: { type: 'account', id: acc.id, label: acc.name },
    currency: base(s),
    refId: c.id,
    opId,
  });
  if (prop) prop.rentCollected += amount;
}

/** Cobro de las rentas atrasadas (reclamación al inquilino). */
export function collectRent(s: S, p: { contractId: string; opId?: string }): number {
  const c = activeContract(s, p.contractId);
  if (c.arrears <= 0) fail('NOTHING_DUE', 'El inquilino no tiene rentas pendientes.');
  const amount = c.arrears;
  postRent(s, c, amount, `Cobro de rentas atrasadas`, p.opId);
  for (const pay of c.payments) if (pay.status === 'unpaid') pay.status = 'late-paid';
  c.arrears = 0;
  return amount;
}

/** Registra manualmente el impago de la mensualidad del mes en curso. */
export function registerDefault(s: S, p: { contractId: string }): void {
  const c = activeContract(s, p.contractId);
  const period = monthKey(nowDate(s));
  const existing = c.payments.find((x) => x.period === period);
  if (existing?.status === 'paid' || existing?.status === 'late-paid') fail('INVALID_STATE', 'La renta de este mes ya está cobrada.');
  if (existing?.status === 'unpaid') fail('INVALID_STATE', 'El impago de este mes ya está registrado.');
  c.payments.push({ id: nextId(s, 'rp'), period, at: nowISO(s), amount: c.monthlyRent, status: 'unpaid' });
  c.arrears += c.monthlyRent;
  const tenant = s.tenants.find((t) => t.id === c.tenantId);
  notify(s, 'danger', 'Impago registrado', `${tenant?.name ?? 'Inquilino'}: ${formatMoney(c.monthlyRent, base(s))} pendientes.`, `/realestate/${c.propertyId}`);
}

/** Finaliza el contrato: la fianza cubre atrasos y el resto se devuelve. */
export function endRental(s: S, p: { contractId: string; opId?: string }): void {
  const c = activeContract(s, p.contractId);
  const tenant = s.tenants.find((t) => t.id === c.tenantId);
  const fromDeposit = Math.min(c.deposit, c.arrears);
  const refund = c.deposit - fromDeposit;
  // Primero el movimiento de dinero (puede fallar); después los cambios de estado.
  if (refund > 0) {
    const acc = contractAccount(s, c);
    if (!acc) fail('ACCOUNT_NOT_FOUND', 'No hay ninguna cuenta abierta para devolver la fianza.');
    post(s, {
      kind: 'rent_deposit_out',
      flow: 'financing',
      category: 'real_estate',
      concept: `Devolución de fianza a ${tenant?.name ?? 'inquilino'}`,
      amount: refund,
      amountIn: 'to',
      from: { type: 'account', id: acc.id, label: acc.name },
      to: { type: 'external', label: tenant?.name ?? 'Inquilino' },
      toCurrency: base(s),
      refId: c.id,
      opId: p.opId,
    });
  }
  if (fromDeposit > 0) {
    // La fianza retenida compensa rentas impagadas.
    const prop = s.properties.find((x) => x.id === c.propertyId);
    if (prop) prop.rentCollected += fromDeposit;
    for (const pay of c.payments) if (pay.status === 'unpaid') pay.status = 'late-paid';
  }
  c.writtenOff += Math.max(0, c.arrears - fromDeposit);
  c.arrears = 0;
  c.status = 'ended';
  c.endedAt = nowISO(s);
}

export function processRentals(s: S): void {
  const now = nowDate(s);
  const period = monthKey(now);
  const periodIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
  for (const c of s.rentals) {
    if (c.status !== 'active') continue;
    if (now.getTime() >= Date.parse(c.endAt)) {
      try {
        endRental(s, { contractId: c.id });
        notify(s, 'info', 'Contrato de alquiler finalizado', 'El contrato ha llegado a su fecha de fin.', `/realestate/${c.propertyId}`);
      } catch (e) {
        const reason = e instanceof DomainError ? e.message : 'error';
        postFailed(
          s,
          {
            kind: 'rent_deposit_out',
            flow: 'financing',
            category: 'real_estate',
            concept: 'Devolución de fianza',
            amount: Math.max(1, c.deposit),
            amountIn: 'to',
            from: { type: 'account', id: c.accountId, label: 'Cuenta' },
            to: { type: 'external', label: 'Inquilino' },
            toCurrency: base(s),
          },
          reason,
        );
        notify(s, 'danger', 'No se pudo devolver la fianza', reason, `/realestate/${c.propertyId}`);
      }
      continue;
    }
    const due = Math.min(c.dueDay, daysInMonth(now.getUTCFullYear(), now.getUTCMonth()));
    if (now.getUTCDate() !== due) continue;
    if (c.payments.some((x) => x.period === period)) continue;
    const tenant = s.tenants.find((t) => t.id === c.tenantId);
    const pays = rand(s, c.id, periodIndex) < (tenant?.reliability ?? 0.9);
    if (pays) {
      try {
        postRent(s, c, c.monthlyRent, `Renta ${period} · ${tenant?.name ?? 'Inquilino'}`);
        c.payments.push({ id: nextId(s, 'rp'), period, at: nowISO(s), amount: c.monthlyRent, status: 'paid' });
        notify(s, 'success', 'Renta cobrada', `${tenant?.name ?? 'Inquilino'}: ${formatMoney(c.monthlyRent, base(s))}.`, `/realestate/${c.propertyId}`);
      } catch {
        /* sin cuenta disponible */
      }
    } else {
      c.payments.push({ id: nextId(s, 'rp'), period, at: nowISO(s), amount: c.monthlyRent, status: 'unpaid' });
      c.arrears += c.monthlyRent;
      notify(s, 'danger', 'Impago de alquiler', `${tenant?.name ?? 'Inquilino'} no ha pagado la renta de ${period}.`, `/realestate/${c.propertyId}`);
    }
  }
}
