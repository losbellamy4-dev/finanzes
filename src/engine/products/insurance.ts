/**
 * SEGUROS SIMULADOS: hogar, vida, viaje, dispositivos y bienes de valor.
 * Prima mensual domiciliada; los siniestros se indemnizan descontando la
 * franquicia. Si una prima no puede cobrarse, la póliza queda suspendida.
 */
import type { InsurancePolicy, InsuranceType } from '@/core/schema';
import { formatMoney } from '@/core/money';
import { addMonthsUTC, startOfUTCDay } from '@/core/time';
import { assertAmount, assertText, base, DomainError, fail, findById, nextId, notify, nowDate, nowISO, openAccount, type S } from '../context';
import { accountEndpoint, post } from '../ledger';

export interface InsuranceProductDef {
  type: InsuranceType;
  name: string;
  description: string;
  /** Prima anual como porcentaje de la cobertura. */
  annualRate: number;
  minMonthly: number;
  deductibleRate: number;
  minDeductible: number;
  defaultCoverage: number;
  maxCoverage: number;
  itemLabel: string;
  coverages: string[];
}

export const INSURANCE_PRODUCTS: Record<InsuranceType, InsuranceProductDef> = {
  home: {
    type: 'home', name: 'Seguro de Hogar', description: 'Continente y contenido frente a incendio, agua, robo y responsabilidad civil.',
    annualRate: 0.0011, minMonthly: 900, deductibleRate: 0.002, minDeductible: 15_000, defaultCoverage: 20_000_000, maxCoverage: 500_000_000,
    itemLabel: 'Vivienda asegurada', coverages: ['Incendio y explosión', 'Daños por agua', 'Robo', 'Responsabilidad civil', 'Asistencia 24 h'],
  },
  life: {
    type: 'life', name: 'Seguro de Vida', description: 'Capital para tus beneficiarios en caso de fallecimiento o invalidez (simulado).',
    annualRate: 0.0009, minMonthly: 800, deductibleRate: 0, minDeductible: 0, defaultCoverage: 15_000_000, maxCoverage: 300_000_000,
    itemLabel: 'Asegurado', coverages: ['Fallecimiento', 'Invalidez absoluta', 'Anticipo por enfermedad grave'],
  },
  travel: {
    type: 'travel', name: 'Seguro de Viaje', description: 'Gastos médicos, cancelación y equipaje durante tus viajes.',
    annualRate: 0.012, minMonthly: 600, deductibleRate: 0.01, minDeductible: 5_000, defaultCoverage: 5_000_000, maxCoverage: 50_000_000,
    itemLabel: 'Destino habitual', coverages: ['Asistencia médica', 'Cancelación', 'Pérdida de equipaje', 'Retrasos'],
  },
  device: {
    type: 'device', name: 'Seguro de Dispositivos', description: 'Roturas, robo y averías de móviles, portátiles y tablets.',
    annualRate: 0.09, minMonthly: 499, deductibleRate: 0.1, minDeductible: 4_900, defaultCoverage: 120_000, maxCoverage: 1_000_000,
    itemLabel: 'Dispositivo', coverages: ['Rotura accidental', 'Robo', 'Daños por líquidos', 'Avería fuera de garantía'],
  },
  valuables: {
    type: 'valuables', name: 'Seguro de Bienes de Valor', description: 'Joyas, arte y colecciones con cobertura a valor de tasación.',
    annualRate: 0.015, minMonthly: 1_500, deductibleRate: 0.02, minDeductible: 10_000, defaultCoverage: 2_500_000, maxCoverage: 200_000_000,
    itemLabel: 'Bien asegurado', coverages: ['Robo', 'Daños accidentales', 'Transporte', 'Exposiciones'],
  },
};

export function quoteInsurance(type: InsuranceType, coverage: number): { monthlyPremium: number; deductible: number } {
  const def = INSURANCE_PRODUCTS[type];
  const monthlyPremium = Math.max(def.minMonthly, Math.round((coverage * def.annualRate) / 12));
  const deductible = Math.max(def.minDeductible, Math.round(coverage * def.deductibleRate));
  return { monthlyPremium, deductible: Math.min(deductible, coverage) };
}

function chargePremium(s: S, pol: InsurancePolicy): void {
  post(s, {
    kind: 'insurance_premium',
    flow: 'expense',
    category: 'insurance',
    concept: `Prima ${pol.name}`,
    amount: pol.monthlyPremium,
    amountIn: 'to',
    from: accountEndpoint(s, pol.accountId),
    to: { type: 'insurance', id: pol.id, label: pol.name },
    refId: pol.id,
  });
  pol.premiumsPaid += pol.monthlyPremium;
}

export function contractInsurance(
  s: S,
  p: { type: InsuranceType; coverage: number; accountId: string; insuredItem: string; opId?: string },
): string {
  const def = INSURANCE_PRODUCTS[p.type];
  if (!def) fail('INVALID_INPUT', 'Tipo de seguro no válido.');
  assertAmount(p.coverage, 'La cobertura');
  if (p.coverage > def.maxCoverage) fail('INVALID_INPUT', `La cobertura máxima es ${formatMoney(def.maxCoverage, base(s))}.`);
  const item = assertText(p.insuredItem, def.itemLabel, 120);
  openAccount(s, p.accountId);
  const { monthlyPremium, deductible } = quoteInsurance(p.type, p.coverage);
  const id = nextId(s, 'ins');
  const start = startOfUTCDay(nowDate(s));
  const pol: InsurancePolicy = {
    id,
    type: p.type,
    name: def.name,
    insuredItem: item,
    coverage: p.coverage,
    deductible,
    monthlyPremium,
    accountId: p.accountId,
    startAt: nowISO(s),
    nextPremiumAt: addMonthsUTC(start, 1).toISOString(),
    status: 'active',
    premiumsPaid: 0,
    claims: [],
  };
  s.insurance.push(pol);
  chargePremium(s, pol);
  return id;
}

export function claimInsurance(s: S, p: { policyId: string; description: string; amount: number; opId?: string }): number {
  const pol = findById(s.insurance, p.policyId, 'Póliza');
  const description = assertText(p.description, 'La descripción del siniestro', 200);
  assertAmount(p.amount, 'El importe del siniestro');
  const id = nextId(s, 'clm');
  if (pol.status !== 'active') {
    pol.claims.unshift({ id, at: nowISO(s), description, amount: p.amount, payout: 0, status: 'rejected', reason: 'Póliza no activa' });
    fail('POLICY_INACTIVE', 'La póliza no está activa: el siniestro ha sido rechazado.');
  }
  const yearAgo = nowDate(s).getTime() - 365 * 86_400_000;
  const paidThisYear = pol.claims.filter((c) => c.status === 'paid' && Date.parse(c.at) >= yearAgo).reduce((a, c) => a + c.payout, 0);
  const remainingCoverage = Math.max(0, pol.coverage - paidThisYear);
  const payout = Math.min(remainingCoverage, Math.max(0, p.amount - pol.deductible));
  if (payout <= 0) {
    pol.claims.unshift({
      id,
      at: nowISO(s),
      description,
      amount: p.amount,
      payout: 0,
      status: 'rejected',
      reason: remainingCoverage <= 0 ? 'Cobertura anual agotada' : 'Importe inferior a la franquicia',
    });
    return 0;
  }
  post(s, {
    kind: 'insurance_claim',
    flow: 'income',
    category: 'insurance',
    concept: `Indemnización ${pol.name}: ${description}`,
    amount: payout,
    from: { type: 'insurance', id: pol.id, label: pol.name },
    to: accountEndpoint(s, pol.accountId),
    currency: base(s),
    refId: pol.id,
    opId: p.opId,
  });
  pol.claims.unshift({ id, at: nowISO(s), description, amount: p.amount, payout, status: 'paid' });
  return payout;
}

export function cancelInsurance(s: S, p: { policyId: string }): void {
  const pol = findById(s.insurance, p.policyId, 'Póliza');
  if (pol.status === 'cancelled') fail('INVALID_STATE', 'La póliza ya está cancelada.');
  pol.status = 'cancelled';
}

export function reactivateInsurance(s: S, p: { policyId: string }): void {
  const pol = findById(s.insurance, p.policyId, 'Póliza');
  if (pol.status !== 'suspended') fail('INVALID_STATE', 'Solo se pueden reactivar pólizas suspendidas.');
  chargePremium(s, pol);
  pol.status = 'active';
  pol.nextPremiumAt = addMonthsUTC(startOfUTCDay(nowDate(s)), 1).toISOString();
}

export function processInsurance(s: S): void {
  const now = nowDate(s).getTime();
  for (const pol of s.insurance) {
    if (pol.status !== 'active') continue;
    let guard = 0;
    while (pol.status === 'active' && Date.parse(pol.nextPremiumAt) <= now && guard++ < 24) {
      try {
        chargePremium(s, pol);
        pol.nextPremiumAt = addMonthsUTC(new Date(pol.nextPremiumAt), 1).toISOString();
      } catch (e) {
        pol.status = 'suspended';
        notify(s, 'danger', 'Póliza suspendida', `${pol.name}: no se pudo cobrar la prima (${e instanceof DomainError ? e.message : 'error'}).`, '/products/insurance');
      }
    }
  }
}
