/**
 * PUNTUACIÓN CREDITICIA SIMULADA ("Nexus Score", escala 300–850).
 *
 * Es un modelo educativo inspirado en factores habituales (historial de
 * pagos, uso del crédito, antigüedad, mezcla de productos, solicitudes
 * recientes). NO es una puntuación oficial ni una evaluación crediticia real.
 */
import type { S } from './context';
import { nowDate, nowISO } from './context';
import { computeOverview, toBase } from './selectors';

export interface ScoreInputs {
  onTime: number;
  late: number;
  missed: number;
  defaults: number;
  revolvingBalance: number;
  revolvingLimit: number;
  historyDays: number;
  mixCount: number;
  inquiries180: number;
  debts: number;
  assets: number;
  overdue: number;
}

export interface ScoreFactor {
  key: string;
  label: string;
  weight: number;
  component: number;
  impact: 'positive' | 'negative' | 'neutral';
  value: string;
  description: string;
}

export interface ScoreResult {
  score: number;
  band: { label: string; color: string };
  factors: ScoreFactor[];
}

const WEIGHTS = { payments: 0.35, utilization: 0.3, history: 0.15, mix: 0.1, inquiries: 0.1 };

export function scoreBand(score: number) {
  if (score >= 800) return { label: 'Excelente', color: '#24C78A' };
  if (score >= 740) return { label: 'Muy bueno', color: '#4ADE80' };
  if (score >= 670) return { label: 'Bueno', color: '#5488F5' };
  if (score >= 580) return { label: 'Regular', color: '#F5A524' };
  return { label: 'Bajo', color: '#F05B65' };
}

export function scoreInputs(s: S): ScoreInputs {
  const now = nowDate(s).getTime();
  const twoYears = now - 730 * 86_400_000;
  const halfYear = now - 180 * 86_400_000;
  let onTime = 0;
  let late = 0;
  let missed = 0;
  let defaults = 0;
  let inquiries180 = 0;
  for (const e of s.creditEvents) {
    const t = Date.parse(e.at);
    if (e.type === 'hard_inquiry' && t >= halfYear) inquiries180++;
    if (t < twoYears) continue;
    if (e.type === 'on_time_payment') onTime++;
    else if (e.type === 'late_payment') late++;
    else if (e.type === 'missed_payment') missed++;
    else if (e.type === 'default') defaults++;
  }
  let revolvingBalance = 0;
  let revolvingLimit = 0;
  for (const c of s.cards) {
    if (c.type !== 'credit' || c.status === 'cancelled') continue;
    const cur = s.accounts.find((a) => a.id === c.accountId)?.currency ?? s.profile.baseCurrency;
    revolvingBalance += toBase(s, Math.max(0, c.balance), cur);
    revolvingLimit += toBase(s, c.creditLimit, cur);
  }
  for (const l of s.creditLines) {
    if (l.status !== 'active') continue;
    revolvingBalance += l.drawn;
    revolvingLimit += l.limit;
  }
  const opened = [
    ...s.accounts.map((a) => a.openedAt),
    ...s.cards.map((c) => c.createdAt),
    ...s.loans.map((l) => l.startAt),
  ].map((x) => Date.parse(x));
  const oldest = opened.length ? Math.min(...opened) : now;
  const mix = new Set<string>();
  if (s.cards.some((c) => c.type === 'credit' && c.status !== 'cancelled')) mix.add('card');
  if (s.loans.some((l) => l.kind === 'personal' || l.kind === 'business')) mix.add('installment');
  if (s.loans.some((l) => l.kind === 'mortgage')) mix.add('mortgage');
  if (s.creditLines.length) mix.add('line');
  const ov = computeOverview(s);
  const overdue = s.loans.reduce((a, l) => a + (l.status === 'active' ? l.overdue : 0), 0);
  return {
    onTime,
    late,
    missed,
    defaults,
    revolvingBalance,
    revolvingLimit,
    historyDays: Math.max(0, (now - oldest) / 86_400_000),
    mixCount: mix.size,
    inquiries180,
    debts: ov.debts.total,
    assets: ov.assets,
    overdue,
  };
}

export function scoreFromInputs(i: ScoreInputs): ScoreResult {
  const totalEvents = i.onTime + i.late + i.missed + i.defaults;
  let payments = totalEvents === 0 ? 0.72 : 0.3 + 0.7 * (i.onTime / (i.onTime + 2 * i.late + 4 * i.missed + 8 * i.defaults));
  if (i.overdue > 0) payments *= 0.7;

  const util = i.revolvingLimit > 0 ? i.revolvingBalance / i.revolvingLimit : null;
  const utilization =
    util === null ? 0.7 : util < 0.1 ? 1 : util < 0.3 ? 0.88 : util < 0.5 ? 0.65 : util < 0.75 ? 0.4 : util < 0.9 ? 0.22 : 0.1;
  const history = Math.min(1, 0.35 + i.historyDays / (365 * 8));
  const mix = Math.min(1, 0.4 + 0.15 * Math.min(4, i.mixCount));
  const inquiries = Math.max(0, 1 - 0.18 * i.inquiries180);

  const weighted =
    WEIGHTS.payments * payments + WEIGHTS.utilization * utilization + WEIGHTS.history * history + WEIGHTS.mix * mix + WEIGHTS.inquiries * inquiries;
  const debtRatio = i.assets > 0 ? i.debts / i.assets : i.debts > 0 ? 2 : 0;
  const penalty = debtRatio > 1 ? 60 : debtRatio > 0.8 ? 25 : 0;
  const score = Math.max(300, Math.min(850, Math.round(300 + 550 * weighted - penalty)));

  const imp = (c: number): ScoreFactor['impact'] => (c >= 0.8 ? 'positive' : c < 0.55 ? 'negative' : 'neutral');
  const factors: ScoreFactor[] = [
    {
      key: 'payments',
      label: 'Historial de pagos',
      weight: WEIGHTS.payments,
      component: payments,
      impact: totalEvents === 0 ? 'neutral' : imp(payments),
      value: totalEvents === 0 ? 'Sin historial' : `${i.onTime} en plazo · ${i.late} tarde · ${i.missed} impagados`,
      description: 'Pagar cuotas y tarjetas en plazo es el factor más importante. Los impagos penalizan durante dos años.',
    },
    {
      key: 'utilization',
      label: 'Uso del crédito',
      weight: WEIGHTS.utilization,
      component: utilization,
      impact: util === null ? 'neutral' : imp(utilization),
      value: util === null ? 'Sin crédito rotativo' : `${Math.round(util * 100)} % del límite`,
      description: 'Mantener el saldo de tarjetas y líneas de crédito por debajo del 30 % del límite mejora la puntuación.',
    },
    {
      key: 'history',
      label: 'Antigüedad crediticia',
      weight: WEIGHTS.history,
      component: history,
      impact: imp(history),
      value: i.historyDays < 60 ? `${Math.round(i.historyDays)} días` : `${(i.historyDays / 365).toFixed(1)} años`,
      description: 'Cuanto más antiguos son tus productos, más fiable se considera tu perfil.',
    },
    {
      key: 'mix',
      label: 'Variedad de productos',
      weight: WEIGHTS.mix,
      component: mix,
      impact: imp(mix),
      value: `${i.mixCount} tipo(s) de crédito`,
      description: 'Combinar tarjeta, préstamo a plazos e hipoteca demuestra capacidad de gestión.',
    },
    {
      key: 'inquiries',
      label: 'Solicitudes recientes',
      weight: WEIGHTS.inquiries,
      component: inquiries,
      impact: i.inquiries180 === 0 ? 'positive' : imp(inquiries),
      value: `${i.inquiries180} en 6 meses`,
      description: 'Solicitar mucho crédito en poco tiempo resta puntos temporalmente.',
    },
  ];
  if (penalty > 0) {
    factors.push({
      key: 'debt',
      label: 'Endeudamiento',
      weight: 0,
      component: 0,
      impact: 'negative',
      value: `${Math.round(debtRatio * 100)} % deuda/activos`,
      description: 'Tus deudas son muy elevadas en relación con tus activos.',
    });
  }
  return { score, band: scoreBand(score), factors };
}

export function computeCreditScore(s: S): ScoreResult {
  return scoreFromInputs(scoreInputs(s));
}

export interface WhatIf {
  payRevolving?: number;
  newLoan?: number;
  latePayments?: number;
  onTimePayments?: number;
  newCardLimit?: number;
  missedPayments?: number;
}

/** Simula el efecto de decisiones financieras hipotéticas. */
export function simulateScore(s: S, w: WhatIf): ScoreResult {
  const i = { ...scoreInputs(s) };
  if (w.payRevolving) {
    const pay = Math.min(i.revolvingBalance, w.payRevolving);
    i.revolvingBalance -= pay;
    i.debts -= pay;
    i.assets -= pay;
  }
  if (w.newLoan) {
    i.inquiries180 += 1;
    i.debts += w.newLoan;
    i.assets += w.newLoan;
    if (i.mixCount < 4) i.mixCount += 1;
  }
  if (w.newCardLimit) {
    i.inquiries180 += 1;
    i.revolvingLimit += w.newCardLimit;
  }
  if (w.latePayments) i.late += w.latePayments;
  if (w.missedPayments) i.missed += w.missedPayments;
  if (w.onTimePayments) i.onTime += w.onTimePayments;
  return scoreFromInputs(i);
}

export function recordCreditScore(s: S): void {
  const score = computeCreditScore(s).score;
  const last = s.creditHistory[s.creditHistory.length - 1];
  const now = nowDate(s).getTime();
  if (!last || last.score !== score || now - Date.parse(last.at) >= 7 * 86_400_000) {
    s.creditHistory.push({ at: nowISO(s), score });
    if (s.creditHistory.length > 730) s.creditHistory.splice(0, s.creditHistory.length - 730);
  }
}
