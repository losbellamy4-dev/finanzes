/**
 * PATRIMONIO: caja fuerte digital, beneficiarios, donaciones, asesor
 * patrimonial simulado (basado en reglas) y planificación patrimonial.
 */
import type { VaultItem } from '@/core/schema';
import { formatMoney, formatPct } from '@/core/money';
import { assertAmount, assertText, fail, findById, nextId, nowISO, type S } from '../context';
import { accountEndpoint, post } from '../ledger';

export const VAULT_CATEGORIES: Record<VaultItem['category'], string> = {
  jewelry: 'Joyas',
  art: 'Arte',
  document: 'Documento',
  collectible: 'Coleccionable',
  vehicle: 'Vehículo',
  other: 'Otro',
};

export const CHARITIES = [
  { id: 'horizonte', name: 'Fundación Horizonte Azul', cause: 'Conservación de océanos', color: '#22B8CF' },
  { id: 'raices', name: 'Raíces Verdes', cause: 'Reforestación', color: '#24C78A' },
  { id: 'aulas', name: 'Aulas Abiertas', cause: 'Educación infantil', color: '#F5A524' },
  { id: 'manos', name: 'Manos Solidarias', cause: 'Banco de alimentos', color: '#F05B65' },
  { id: 'patitas', name: 'Patitas Felices', cause: 'Protección animal', color: '#A78BFA' },
  { id: 'ciencia', name: 'Ciencia para Todos', cause: 'Investigación médica', color: '#5488F5' },
] as const;

export function addVaultItem(s: S, p: { name: string; category: VaultItem['category']; value: number; notes?: string }): string {
  const name = assertText(p.name, 'El nombre', 80);
  if (!(p.category in VAULT_CATEGORIES)) fail('INVALID_INPUT', 'Categoría no válida.');
  if (!Number.isInteger(p.value) || p.value < 0) fail('INVALID_INPUT', 'Valor no válido.');
  const id = nextId(s, 'vlt');
  s.vault.push({ id, name, category: p.category, value: p.value, notes: (p.notes ?? '').slice(0, 400), addedAt: nowISO(s) });
  return id;
}

export function updateVaultItem(s: S, p: { itemId: string; name?: string; value?: number; notes?: string }): void {
  const it = findById(s.vault, p.itemId, 'Elemento');
  if (p.name !== undefined) it.name = assertText(p.name, 'El nombre', 80);
  if (p.value !== undefined) {
    if (!Number.isInteger(p.value) || p.value < 0) fail('INVALID_INPUT', 'Valor no válido.');
    it.value = p.value;
  }
  if (p.notes !== undefined) it.notes = p.notes.slice(0, 400);
}

export function removeVaultItem(s: S, p: { itemId: string }): void {
  findById(s.vault, p.itemId, 'Elemento');
  s.vault = s.vault.filter((x) => x.id !== p.itemId);
}

export function addBeneficiary(s: S, p: { name: string; relation: string; share: number }): string {
  const name = assertText(p.name, 'El nombre', 80);
  if (!Number.isFinite(p.share) || p.share <= 0 || p.share > 100) fail('INVALID_INPUT', 'El porcentaje debe estar entre 1 y 100.');
  const total = s.beneficiaries.reduce((a, b) => a + b.share, 0);
  if (total + p.share > 100.0001) fail('INVALID_INPUT', `El reparto superaría el 100 % (disponible ${100 - total} %).`);
  const id = nextId(s, 'ben');
  s.beneficiaries.push({ id, name, relation: (p.relation ?? '').slice(0, 40), share: p.share });
  return id;
}

export function removeBeneficiary(s: S, p: { beneficiaryId: string }): void {
  findById(s.beneficiaries, p.beneficiaryId, 'Beneficiario');
  s.beneficiaries = s.beneficiaries.filter((b) => b.id !== p.beneficiaryId);
}

export function donate(s: S, p: { charityId: string; accountId: string; amount: number; opId?: string }): string {
  const charity = CHARITIES.find((c) => c.id === p.charityId);
  if (!charity) fail('INVALID_INPUT', 'Entidad benéfica no válida.');
  assertAmount(p.amount, 'La donación');
  const tx = post(s, {
    kind: 'donation',
    flow: 'expense',
    category: 'donations',
    concept: `Donación a ${charity.name}`,
    amount: p.amount,
    from: accountEndpoint(s, p.accountId),
    to: { type: 'external', label: charity.name },
    opId: p.opId,
  });
  s.donations.unshift({ id: nextId(s, 'don'), at: nowISO(s), charityId: charity.id, charityName: charity.name, amount: tx.amount, accountId: p.accountId });
  return tx.id;
}

/* ------------------------------------------------------------------ */
/* Planificación                                                       */
/* ------------------------------------------------------------------ */

export interface ProjectionInput {
  start: number;
  monthly: number;
  annualReturn: number;
  inflation: number;
  years: number;
}

export interface ProjectionPoint {
  year: number;
  nominal: number;
  real: number;
  contributed: number;
}

/** Proyección de patrimonio con aportaciones mensuales e interés compuesto. */
export function projectWealth(p: ProjectionInput): ProjectionPoint[] {
  const out: ProjectionPoint[] = [{ year: 0, nominal: p.start, real: p.start, contributed: p.start }];
  const mr = Math.pow(1 + p.annualReturn, 1 / 12) - 1;
  let value = p.start;
  let contributed = p.start;
  for (let y = 1; y <= Math.min(60, Math.max(1, Math.round(p.years))); y++) {
    for (let m = 0; m < 12; m++) {
      value = value * (1 + mr) + p.monthly;
      contributed += p.monthly;
    }
    out.push({ year: y, nominal: Math.round(value), real: Math.round(value / Math.pow(1 + p.inflation, y)), contributed: Math.round(contributed) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Asesor patrimonial simulado                                         */
/* ------------------------------------------------------------------ */

export interface AdvisorInput {
  netWorth: number;
  cash: number;
  invested: number;
  properties: number;
  debts: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  cryptoShare: number;
  largestPositionShare: number;
  creditUtilization: number;
  hasLifeInsurance: boolean;
  hasHomeInsurance: boolean;
  ownsProperty: boolean;
  currency: Parameters<typeof formatMoney>[1];
}

export interface Advice {
  level: 'good' | 'warning' | 'danger' | 'info';
  title: string;
  detail: string;
}

export function adviseWealth(i: AdvisorInput): Advice[] {
  const out: Advice[] = [];
  const fmt = (c: number) => formatMoney(c, i.currency);
  const expenses = Math.max(i.monthlyExpenses, 1);
  const emergencyMonths = i.cash / expenses;
  if (i.monthlyExpenses > 0) {
    if (emergencyMonths < 3) {
      out.push({ level: 'danger', title: 'Fondo de emergencia insuficiente', detail: `Tu liquidez cubre ${emergencyMonths.toFixed(1)} meses de gastos. Se recomienda entre 3 y 6 meses (${fmt(expenses * 3)}–${fmt(expenses * 6)}).` });
    } else if (emergencyMonths > 12 && i.invested < i.cash) {
      out.push({ level: 'info', title: 'Exceso de liquidez', detail: `Tienes ${emergencyMonths.toFixed(0)} meses de gastos en liquidez. Podrías invertir parte del excedente para combatir la inflación.` });
    } else {
      out.push({ level: 'good', title: 'Fondo de emergencia saludable', detail: `Tu liquidez cubre ${emergencyMonths.toFixed(1)} meses de gastos.` });
    }
  }
  const assets = i.cash + i.invested + i.properties;
  if (assets > 0) {
    const debtRatio = i.debts / assets;
    if (debtRatio > 0.6) out.push({ level: 'danger', title: 'Endeudamiento elevado', detail: `Tus deudas suponen el ${formatPct(debtRatio, 0, false)} de tus activos. Prioriza amortizar la deuda más cara.` });
    else if (debtRatio > 0.35) out.push({ level: 'warning', title: 'Endeudamiento moderado', detail: `Deuda/activos: ${formatPct(debtRatio, 0, false)}. Vigila que las cuotas no superen el 35 % de tus ingresos.` });
  }
  if (i.monthlyIncome > 0) {
    const savingsRate = (i.monthlyIncome - i.monthlyExpenses) / i.monthlyIncome;
    if (savingsRate < 0) out.push({ level: 'danger', title: 'Gastas más de lo que ingresas', detail: `Este mes tus gastos superan a tus ingresos en ${fmt(i.monthlyExpenses - i.monthlyIncome)}.` });
    else if (savingsRate < 0.1) out.push({ level: 'warning', title: 'Tasa de ahorro baja', detail: `Ahorras el ${formatPct(savingsRate, 0, false)} de tus ingresos. Un objetivo razonable es el 20 %.` });
    else out.push({ level: 'good', title: 'Buena tasa de ahorro', detail: `Ahorras el ${formatPct(savingsRate, 0, false)} de tus ingresos este mes.` });
  }
  if (i.invested > 0) {
    if (i.largestPositionShare > 0.4) out.push({ level: 'warning', title: 'Cartera poco diversificada', detail: `Tu mayor posición representa el ${formatPct(i.largestPositionShare, 0, false)} de la cartera. Considera repartir el riesgo.` });
    if (i.cryptoShare > 0.25) out.push({ level: 'warning', title: 'Alta exposición a criptoactivos', detail: `El ${formatPct(i.cryptoShare, 0, false)} de tu cartera está en criptomonedas simuladas, de volatilidad muy alta.` });
  } else if (i.cash > expenses * 6) {
    out.push({ level: 'info', title: 'Empieza a invertir', detail: 'No tienes inversiones. Un ETF global diversificado es un punto de partida habitual.' });
  }
  if (i.creditUtilization > 0.5) out.push({ level: 'warning', title: 'Uso elevado del crédito', detail: `Usas el ${formatPct(i.creditUtilization, 0, false)} de tu crédito disponible, lo que penaliza tu puntuación.` });
  if (i.ownsProperty && !i.hasHomeInsurance) out.push({ level: 'warning', title: 'Inmuebles sin seguro de hogar', detail: 'Tienes propiedades sin un seguro de hogar contratado.' });
  if (i.debts > 0 && !i.hasLifeInsurance) out.push({ level: 'info', title: 'Valora un seguro de vida', detail: 'Tienes deudas vivas; un seguro de vida protege a tus beneficiarios.' });
  if (out.length === 0) out.push({ level: 'info', title: 'Sin datos suficientes', detail: 'Registra ingresos, gastos e inversiones para recibir recomendaciones.' });
  return out;
}
