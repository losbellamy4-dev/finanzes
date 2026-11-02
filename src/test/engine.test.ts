import { describe, expect, it } from 'vitest';
import { Sim, newState, hoursToNextMonth } from './helpers';
import { parseMoney, formatMoney, convert } from '@/core/money';
import { luhnValid } from '@/engine/cards';
import { computeInstallment, amortizationSchedule } from '@/engine/products/loans';
import { computeCreditScore, simulateScore } from '@/engine/creditScore';
import { computeOverview } from '@/engine/selectors';
import { blackScholes } from '@/engine/derivatives';
import { execute } from '@/engine/commands';

function setup(initial = 1_000_000) {
  const sim = new Sim();
  const acc = sim.run('account/create', { name: 'Principal', type: 'checking', initialBalance: initial }) as string;
  return { sim, acc };
}

describe('Utilidades monetarias', () => {
  it('interpreta importes en formato español e internacional', () => {
    expect(parseMoney('1.000')).toBe(100_000);
    expect(parseMoney('1.234,56')).toBe(123_456);
    expect(parseMoney('1,234.56')).toBe(123_456);
    expect(parseMoney('200')).toBe(20_000);
    expect(parseMoney('12,5')).toBe(1_250);
    expect(parseMoney('0.75')).toBe(75);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.2.3')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('10,999')).toBe(1_099_900);
  });
  it('formatea con separador de miles siempre', () => {
    expect(formatMoney(100_000, 'EUR').replace(/\s/g, ' ')).toBe('1.000,00 €');
    expect(formatMoney(130_000, 'EUR').replace(/\s/g, ' ')).toBe('1.300,00 €');
  });
  it('convierte divisas con tipos simulados', () => {
    expect(convert(10_000, 'EUR', 'USD')).toBe(10_800);
    expect(convert(10_800, 'USD', 'EUR')).toBe(10_000);
  });
});

describe('Motor de transacciones', () => {
  it('rechaza importes no válidos', () => {
    const { sim, acc } = setup();
    for (const amount of [0, -5, 1.5, NaN, Infinity]) {
      expect(() => sim.run('bank/deposit', { accountId: acc, amount })).toThrow();
    }
  });

  it('no permite operar con cuentas cerradas y exige traspasar el saldo al cerrar', () => {
    const { sim, acc } = setup(10_000);
    const other = sim.run('account/create', { name: 'Otra', type: 'savings' }) as string;
    expect(() => sim.run('account/close', { accountId: acc })).toThrow(/traspasar/);
    sim.run('account/close', { accountId: acc, transferToId: other });
    expect(sim.balance(other)).toBe(10_000);
    expect(sim.account(acc).status).toBe('closed');
    expect(() => sim.run('bank/deposit', { accountId: acc, amount: 100 })).toThrow(/cerrada/);
  });

  it('convierte divisa en transferencias entre cuentas de distinta moneda', () => {
    const { sim, acc } = setup(100_000);
    const usd = sim.run('account/create', { name: 'USD', type: 'checking', currency: 'USD' }) as string;
    sim.run('bank/transfer', { fromId: acc, toId: usd, amount: 10_000 });
    expect(sim.balance(acc)).toBe(90_000);
    expect(sim.balance(usd)).toBe(10_800);
    const tx = sim.state.transactions.at(-1)!;
    expect(tx.toAmount).toBe(10_800);
    expect(tx.toCurrency).toBe('USD');
  });

  it('la cuenta empresarial puede usar descubierto autorizado', () => {
    const { sim } = setup();
    const biz = sim.run('account/create', { name: 'Empresa', type: 'business', overdraftLimit: 50_000 }) as string;
    sim.run('bank/pay', { accountId: biz, merchant: 'Proveedor', amount: 40_000 });
    expect(sim.balance(biz)).toBe(-40_000);
    expect(() => sim.run('bank/pay', { accountId: biz, merchant: 'Proveedor', amount: 20_000 })).toThrow(/Saldo insuficiente/);
  });

  it('las transferencias externas quedan pendientes y se liquidan al día siguiente', () => {
    const { sim, acc } = setup(100_000);
    sim.run('bank/send', { fromId: acc, name: 'Laura', iban: 'ES91 2100 0418 4502 0005 1332', amount: 5_000 });
    expect(sim.balance(acc)).toBe(95_000);
    expect(sim.state.transactions.at(-1)!.status).toBe('pending');
    sim.advanceDays(2);
    expect(sim.state.transactions.find((t) => t.kind === 'transfer_external_out')!.status).toBe('completed');
  });

  it('el patrimonio neto se actualiza tras cada operación', () => {
    const { sim, acc } = setup(100_000);
    expect(computeOverview(sim.state).netWorth).toBe(100_000);
    sim.run('bank/pay', { accountId: acc, merchant: 'Tienda', amount: 25_000 });
    expect(computeOverview(sim.state).netWorth).toBe(75_000);
    expect(computeOverview(sim.state).monthlyExpenses).toBe(25_000);
  });
});

describe('Motor de mercado', () => {
  it('es reproducible con la misma semilla', () => {
    const a = new Sim(newState({ seed: 42 }));
    const b = new Sim(newState({ seed: 42 }));
    a.run('clock/advance', { hours: 24 * 10 });
    b.run('clock/advance', { hours: 24 * 10 });
    expect(a.state.market.assets.map((x) => x.price)).toEqual(b.state.market.assets.map((x) => x.price));
  });

  it('semillas distintas producen trayectorias distintas', () => {
    const a = new Sim(newState({ seed: 1 }));
    const b = new Sim(newState({ seed: 2 }));
    expect(a.state.market.assets[0].price).not.toBe(b.state.market.assets[0].price);
  });

  it('avanzar en un bloque o en pasos da el mismo resultado', () => {
    const a = new Sim(newState({ seed: 7 }));
    const b = new Sim(newState({ seed: 7 }));
    a.run('clock/advance', { hours: 72 });
    for (let i = 0; i < 72; i++) b.run('clock/advance', { hours: 1 });
    expect(a.state.market.assets.map((x) => x.price)).toEqual(b.state.market.assets.map((x) => x.price));
  });

  it('el régimen de crisis hace caer el mercado frente al alcista', () => {
    const bull = new Sim(newState({ seed: 5 }));
    const crisis = new Sim(newState({ seed: 5 }));
    bull.run('market/regime', { regime: 'bull' });
    crisis.run('market/regime', { regime: 'crisis' });
    bull.advanceDays(60);
    crisis.advanceDays(60);
    const avg = (s: Sim) => s.state.market.assets.filter((a) => a.type === 'stock').reduce((acc, a) => acc + Math.log(a.price), 0);
    expect(avg(crisis)).toBeLessThan(avg(bull));
  });

  it('genera velas diarias y permite fijar precios y crear activos', () => {
    const sim = new Sim();
    const before = sim.state.market.assets[0].daily.length;
    sim.advanceDays(3);
    expect(sim.state.market.assets[0].daily.length).toBe(before + 3);
    sim.run('market/asset-price', { assetId: 'ast_aurx', price: 500 });
    expect(sim.state.market.assets.find((a) => a.id === 'ast_aurx')!.price).toBe(500);
    const id = sim.run('market/asset-create', { symbol: 'ZEN', name: 'Zenith Labs', type: 'stock', price: 25, drift: 0.1, volatility: 0.3 }) as string;
    const created = sim.state.market.assets.find((a) => a.id === id)!;
    expect(created.price).toBe(25);
    expect(created.daily.length).toBeGreaterThan(80);
    expect(() => sim.run('market/asset-create', { symbol: 'ZEN', name: 'Otra', type: 'stock', price: 1, drift: 0, volatility: 0.1 })).toThrow(/Ya existe/);
  });

  it('los escenarios activos expiran solos', () => {
    const sim = new Sim();
    const scn = sim.state.market.scenarios[0];
    sim.run('market/scenario-activate', { scenarioId: scn.id });
    expect(sim.state.market.activeScenario?.scenarioId).toBe(scn.id);
    sim.advanceDays(scn.durationDays + 1);
    expect(sim.state.market.activeScenario).toBeNull();
  });
});

describe('Tarjetas', () => {
  it('los números generados son ficticios: empiezan por 0 y no superan Luhn', () => {
    const { sim, acc } = setup();
    for (let i = 0; i < 20; i++) sim.run('card/create', { type: 'debit', accountId: acc });
    for (const c of sim.state.cards) {
      expect(c.number).toMatch(/^0\d{15}$/);
      expect(luhnValid(c.number)).toBe(false);
    }
  });

  it('débito descuenta de la cuenta y respeta límites y congelación', () => {
    const { sim, acc } = setup(500_000);
    const card = sim.run('card/create', { type: 'debit', accountId: acc, dailyLimit: 30_000, monthlyLimit: 100_000 }) as string;
    sim.run('card/purchase', { cardId: card, amount: 20_000, merchant: 'Cafetería' });
    expect(sim.balance(acc)).toBe(480_000);
    expect(() => sim.run('card/purchase', { cardId: card, amount: 15_000, merchant: 'Tienda' })).toThrow(/límite diario/);
    sim.run('card/freeze', { cardId: card, frozen: true });
    expect(() => sim.run('card/purchase', { cardId: card, amount: 100, merchant: 'Kiosco' })).toThrow(/congelada/);
    sim.run('card/freeze', { cardId: card, frozen: false });
    sim.run('card/purchase', { cardId: card, amount: 100, merchant: 'Kiosco' });
    expect(sim.balance(acc)).toBe(479_900);
  });

  it('crédito: límite, extracto, intereses y comisión por impago', () => {
    const { sim, acc } = setup(0);
    const card = sim.run('card/create', { type: 'credit', accountId: acc, creditLimit: 100_000, apr: 0.24, closingDay: 15, dailyLimit: 500_000, monthlyLimit: 1_000_000 }) as string;
    sim.run('card/purchase', { cardId: card, amount: 60_000, merchant: 'Electrónica' });
    expect(() => sim.run('card/purchase', { cardId: card, amount: 50_000, merchant: 'Viaje' })).toThrow(/Crédito disponible/);
    expect(sim.balance(acc)).toBe(0);
    // Hoy es 10-mar: cierre el 15-mar, vencimiento el 4-abr. Avanzamos al 5-abr sin pagar.
    sim.advanceDays(26);
    const c = sim.state.cards.find((x) => x.id === card)!;
    expect(c.statementBalance).toBe(60_000);
    expect(c.latePayments).toBe(1);
    // 60.000 + comisión 2.500 + intereses (60.000 * 24% / 12 = 1.200)
    expect(c.balance).toBe(60_000 + 2_500 + 1_200);
    expect(computeCreditScore(sim.state).factors.find((f) => f.key === 'payments')!.impact).toBe('negative');
  });

  it('crédito: pagar el extracto completo evita intereses', () => {
    const { sim, acc } = setup(200_000);
    const card = sim.run('card/create', { type: 'credit', accountId: acc, creditLimit: 100_000, closingDay: 15, autopay: 'full' }) as string;
    sim.run('card/purchase', { cardId: card, amount: 30_000, merchant: 'Restaurante', category: 'restaurants' });
    sim.advanceDays(40);
    const c = sim.state.cards.find((x) => x.id === card)!;
    expect(c.balance).toBe(0);
    expect(c.interestCharged).toBe(0);
    expect(sim.balance(acc)).toBe(170_000);
  });

  it('prepago: recarga, gasto con saldo propio y devolución al cancelar', () => {
    const { sim, acc } = setup(100_000);
    const card = sim.run('card/create', { type: 'prepaid', accountId: acc, initialLoad: 20_000 }) as string;
    expect(sim.balance(acc)).toBe(80_000);
    sim.run('card/purchase', { cardId: card, amount: 5_000, merchant: 'Online' });
    expect(() => sim.run('card/purchase', { cardId: card, amount: 16_000, merchant: 'Online' })).toThrow(/prepago insuficiente/);
    sim.run('card/cancel', { cardId: card });
    expect(sim.balance(acc)).toBe(95_000);
  });
});

describe('Préstamos', () => {
  it('calcula la cuota francesa y el calendario cuadra con el capital', () => {
    const inst = computeInstallment(1_000_000, 0.06, 12, 'monthly');
    expect(inst).toBe(86_067);
    const rows = amortizationSchedule(1_000_000, 0.06, 12, 'monthly', new Date('2026-01-01'), 1);
    expect(rows).toHaveLength(12);
    expect(rows.reduce((a, r) => a + r.principal, 0)).toBe(1_000_000);
    expect(rows.at(-1)!.balance).toBe(0);
  });

  it('desembolsa, cobra cuotas automáticamente y registra impagos', () => {
    const { sim, acc } = setup(0);
    const loan = sim.run('loan/create', { kind: 'personal', principal: 120_000, rate: 0.12, termPeriods: 12, frequency: 'monthly', accountId: acc }) as string;
    // Desembolso menos comisión de apertura del 1 %.
    expect(sim.balance(acc)).toBe(120_000 - 1_200);
    const l0 = sim.state.loans[0];
    sim.advanceDays(32);
    const l1 = sim.state.loans.find((x) => x.id === loan)!;
    expect(l1.periodsPaid).toBe(1);
    expect(l1.payments[0].status).toBe('paid');
    expect(sim.balance(acc)).toBe(120_000 - 1_200 - l0.installment);
    // Vaciamos la cuenta: la siguiente cuota queda impagada.
    sim.run('bank/withdraw', { accountId: acc, amount: sim.balance(acc) });
    sim.advanceDays(31);
    const l2 = sim.state.loans.find((x) => x.id === loan)!;
    expect(l2.missedPayments).toBe(1);
    expect(l2.overdue).toBeGreaterThan(l0.installment);
    // Al ingresar dinero se regulariza la deuda vencida.
    sim.run('bank/deposit', { accountId: acc, amount: 50_000 });
    sim.advanceDays(1);
    expect(sim.state.loans.find((x) => x.id === loan)!.overdue).toBe(0);
  });

  it('amortización anticipada total liquida el préstamo', () => {
    const { sim, acc } = setup(500_000);
    const loan = sim.run('loan/create', { kind: 'personal', principal: 100_000, rate: 0.05, termPeriods: 24, frequency: 'monthly', accountId: acc }) as string;
    sim.run('loan/prepay', { loanId: loan, accountId: acc, full: true });
    expect(sim.state.loans[0].status).toBe('paid');
    expect(computeOverview(sim.state).debts.loans).toBe(0);
  });
});

describe('Productos de ahorro, seguros y crédito', () => {
  it('objetivos de ahorro notifican hitos y pagan intereses', () => {
    const { sim, acc } = setup(1_000_000);
    const goal = sim.run('goal/create', { kind: 'goal', name: 'Viaje', target: 100_000, accountId: acc, interestRate: 0.12 }) as string;
    sim.run('goal/contribute', { goalId: goal, accountId: acc, amount: 30_000 });
    sim.run('goal/contribute', { goalId: goal, accountId: acc, amount: 25_000 });
    const g = sim.state.goals[0];
    expect(g.balance).toBe(55_000);
    expect(g.milestones).toEqual([25, 50]);
    expect(sim.state.notifications.filter((n) => n.title.includes('Viaje'))).toHaveLength(2);
    sim.run('clock/advance', { hours: hoursToNextMonth(sim.state) });
    expect(sim.state.goals[0].balance).toBe(55_000 + 550);
    sim.run('goal/withdraw', { goalId: goal, accountId: acc, amount: 10_000 });
    expect(sim.state.goals[0].balance).toBe(45_550);
  });

  it('las aportaciones automáticas se ejecutan periódicamente', () => {
    const { sim, acc } = setup(1_000_000);
    const goal = sim.run('goal/create', { kind: 'pot', name: 'Hucha', accountId: acc, interestRate: 0 }) as string;
    sim.run('goal/auto', { goalId: goal, amount: 5_000, frequency: 'weekly' });
    sim.advanceDays(22);
    expect(sim.state.goals[0].balance).toBe(15_000);
  });

  it('depósito a plazo fijo devuelve capital más intereses al vencer', () => {
    const { sim, acc } = setup(1_000_000);
    sim.run('deposit/open', { kind: 'fixed', accountId: acc, amount: 500_000, termMonths: 3, rate: 0.04 });
    expect(sim.balance(acc)).toBe(500_000);
    sim.advanceDays(95);
    const d = sim.state.deposits[0];
    expect(d.status).toBe('matured');
    expect(d.payout!).toBeGreaterThan(500_000 + 4_800);
    expect(sim.balance(acc)).toBe(500_000 + d.payout!);
  });

  it('seguro: prima mensual y siniestro con franquicia', () => {
    const { sim, acc } = setup(1_000_000);
    const pol = sim.run('insurance/contract', { type: 'device', coverage: 120_000, accountId: acc, insuredItem: 'Portátil' }) as string;
    const p = sim.state.insurance[0];
    expect(sim.balance(acc)).toBe(1_000_000 - p.monthlyPremium);
    const payout = sim.run('insurance/claim', { policyId: pol, description: 'Pantalla rota', amount: 40_000 }) as number;
    expect(payout).toBe(40_000 - p.deductible);
    sim.advanceDays(32);
    expect(sim.state.insurance[0].premiumsPaid).toBe(p.monthlyPremium * 2);
  });

  it('línea de crédito: disposición, intereses mensuales y devolución', () => {
    const { sim, acc } = setup(0);
    const line = sim.run('creditline/open', { limit: 200_000, rate: 0.12, accountId: acc }) as string;
    sim.run('creditline/draw', { lineId: line, amount: 100_000 });
    expect(sim.balance(acc)).toBe(100_000);
    sim.run('clock/advance', { hours: hoursToNextMonth(sim.state) });
    expect(sim.state.creditLines[0].drawn).toBe(101_000);
    sim.run('creditline/repay', { lineId: line, amount: 101_000 - 1_000 });
    expect(() => sim.run('creditline/close', { lineId: line })).toThrow();
  });
});

describe('Inmobiliario', () => {
  it('compra al contado, alquila, cobra rentas y vende', () => {
    const sim = new Sim();
    const prop = sim.state.properties[0];
    const acc = sim.run('account/create', { name: 'Inmuebles', type: 'checking', initialBalance: prop.value * 2 }) as string;
    sim.run('property/buy', { propertyId: prop.id, accountId: acc });
    const costs = Math.round(prop.value * 0.08);
    expect(sim.balance(acc)).toBe(prop.value * 2 - prop.value - costs);
    const tenant = [...sim.state.tenants].sort((a, b) => b.reliability - a.reliability)[0];
    sim.run('rental/create', { propertyId: prop.id, tenantId: tenant.id, monthlyRent: 100_000, months: 12, dueDay: 1, accountId: acc });
    const afterDeposit = sim.balance(acc);
    expect(afterDeposit).toBe(prop.value - costs + 200_000);
    sim.run('clock/advance', { hours: hoursToNextMonth(sim.state) + 1 });
    const contract = sim.state.rentals[0];
    expect(contract.payments).toHaveLength(1);
    const p = contract.payments[0];
    if (p.status === 'paid') expect(sim.balance(acc)).toBe(afterDeposit + 100_000);
    else expect(contract.arrears).toBe(100_000);
    expect(() => sim.run('property/sell', { propertyId: prop.id, accountId: acc })).toThrow(/alquiler/);
    sim.run('rental/end', { contractId: contract.id });
    const value = sim.state.properties[0].value;
    const before = sim.balance(acc);
    sim.run('property/sell', { propertyId: prop.id, accountId: acc });
    expect(sim.balance(acc)).toBe(before + value - Math.round(value * 0.03));
    expect(sim.state.properties[0].owned).toBe(false);
  });

  it('compra con hipoteca crea el préstamo y la venta lo cancela', () => {
    const sim = new Sim();
    const prop = sim.state.properties[1];
    const acc = sim.run('account/create', { name: 'Cuenta', type: 'checking', initialBalance: Math.round(prop.value * 0.4) }) as string;
    const down = Math.round(prop.value * 0.2);
    sim.run('property/buy', { propertyId: prop.id, accountId: acc, financing: { downPayment: down, rate: 0.03, years: 25 } });
    const loan = sim.state.loans[0];
    expect(loan.kind).toBe('mortgage');
    expect(loan.principal).toBe(prop.value - down);
    expect(sim.state.properties[1].mortgageLoanId).toBe(loan.id);
    sim.run('property/sell', { propertyId: prop.id, accountId: acc });
    expect(sim.state.loans[0].status).toBe('paid');
  });

  it('registrar impago y cobrar atrasos', () => {
    const sim = new Sim();
    const prop = sim.state.properties[0];
    const acc = sim.run('account/create', { name: 'C', type: 'checking', initialBalance: prop.value * 2 }) as string;
    sim.run('property/buy', { propertyId: prop.id, accountId: acc });
    const rental = sim.run('rental/create', { propertyId: prop.id, tenantId: sim.state.tenants[0].id, monthlyRent: 80_000, months: 12, dueDay: 28, accountId: acc }) as string;
    sim.run('rental/default', { contractId: rental });
    expect(sim.state.rentals[0].arrears).toBe(80_000);
    const before = sim.balance(acc);
    sim.run('rental/collect', { contractId: rental });
    expect(sim.balance(acc)).toBe(before + 80_000);
    expect(sim.state.rentals[0].arrears).toBe(0);
  });
});

describe('Credit score', () => {
  it('está en el rango 300–850 y responde a decisiones', () => {
    const { sim } = setup();
    const r = computeCreditScore(sim.state);
    expect(r.score).toBeGreaterThanOrEqual(300);
    expect(r.score).toBeLessThanOrEqual(850);
    const worse = simulateScore(sim.state, { missedPayments: 3 });
    const better = simulateScore(sim.state, { onTimePayments: 12 });
    expect(worse.score).toBeLessThan(r.score);
    expect(better.score).toBeGreaterThan(worse.score);
  });
});

describe('Transferencias programadas y periódicas', () => {
  it('una nómina mensual genera ingresos recurrentes', () => {
    const { sim, acc } = setup(0);
    const now = new Date(Date.parse(sim.state.clock.startAt) + sim.state.clock.tick * 3_600_000);
    const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
    sim.run('schedule/create', { kind: 'income', toAccountId: acc, counterparty: 'Empresa Ficticia S.L.', amount: 250_000, frequency: 'monthly', startDate: tomorrow });
    sim.advanceDays(1);
    expect(sim.balance(acc)).toBe(250_000);
    sim.advanceDays(31);
    expect(sim.balance(acc)).toBe(500_000);
  });

  it('una transferencia periódica sin saldo se registra como fallida', () => {
    const { sim, acc } = setup(10_000);
    const other = sim.run('account/create', { name: 'Destino', type: 'savings' }) as string;
    const today = new Date(Date.parse(sim.state.clock.startAt) + sim.state.clock.tick * 3_600_000).toISOString().slice(0, 10);
    sim.run('schedule/create', { kind: 'internal', fromAccountId: acc, toAccountId: other, amount: 6_000, frequency: 'weekly', startDate: today, occurrences: 3 });
    expect(sim.balance(other)).toBe(6_000);
    sim.advanceDays(15);
    const sch = sim.state.scheduled[0];
    expect(sch.executions).toBe(1);
    expect(sch.failures).toBe(2);
    expect(sch.status).toBe('completed');
    expect(sim.state.transactions.filter((t) => t.status === 'failed')).toHaveLength(2);
  });
});

describe('Derivados', () => {
  it('Black-Scholes respeta la paridad put-call', () => {
    const S0 = 100, K = 95, T = 0.5, sigma = 0.3, r = 0.03;
    const c = blackScholes('call', S0, K, T, sigma, r);
    const p = blackScholes('put', S0, K, T, sigma, r);
    expect(c - p).toBeCloseTo(S0 - K * Math.exp(-r * T), 3);
  });

  it('abrir y cerrar una opción mueve el saldo de forma coherente', () => {
    const { sim, acc } = setup(1_000_000);
    const id = sim.run('deriv/option', { underlyingId: 'ast_nx100', optionType: 'call', strike: 15_000, days: 30, quantity: 1, accountId: acc }) as string;
    const d = sim.state.portfolio.derivatives[0];
    expect(sim.balance(acc)).toBe(1_000_000 - d.margin);
    sim.run('deriv/close', { derivativeId: id });
    expect(sim.state.portfolio.derivatives[0].status).toBe('closed');
  });

  it('un futuro apalancado se liquida si las pérdidas agotan el margen', () => {
    const { sim, acc } = setup(1_000_000);
    sim.run('deriv/future', { underlyingId: 'ast_aurx', direction: 'long', quantity: 10, leverage: 20, days: 60, accountId: acc });
    const price = sim.state.market.assets.find((a) => a.id === 'ast_aurx')!.price;
    sim.run('market/asset-price', { assetId: 'ast_aurx', price: price * 0.8 });
    sim.run('clock/advance', { hours: 1 });
    expect(sim.state.portfolio.derivatives[0].status).toBe('liquidated');
  });
});

describe('Atomicidad del despachador', () => {
  it('un error a mitad de comando no deja cambios parciales', () => {
    const { sim, acc } = setup(50_000);
    const prop = sim.state.properties[0];
    const before = sim.state;
    // La entrada se cobraría, pero los gastos de compra hacen fallar la operación.
    expect(() =>
      execute(sim.state, 'property/buy', { propertyId: prop.id, accountId: acc, financing: { downPayment: 49_000_000, rate: 0.03, years: 30 } }),
    ).toThrow();
    expect(sim.state).toBe(before);
    expect(sim.balance(acc)).toBe(50_000);
  });
});
