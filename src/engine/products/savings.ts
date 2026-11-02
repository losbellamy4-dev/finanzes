/**
 * AHORRO: objetivos de ahorro y huchas digitales.
 * El dinero aportado sale de una cuenta y queda depositado en el objetivo,
 * que genera intereses mensuales y notifica los hitos 25/50/75/100 %.
 */
import type { SavingsGoal } from '@/core/schema';
import { formatMoney } from '@/core/money';
import { addDaysUTC, addMonthsUTC, fromDateInput, startOfUTCDay } from '@/core/time';
import { assertAmount, assertText, base, DomainError, fail, findById, nextId, notify, nowDate, nowISO, openAccount, type S } from '../context';
import { accountEndpoint, post, receivedAmount } from '../ledger';

export const MILESTONES = [25, 50, 75, 100];
export const DEFAULT_GOAL_RATE = 0.015;

export interface CreateGoalInput {
  kind: 'goal' | 'pot';
  name: string;
  icon?: string;
  color?: string;
  target?: number;
  targetDate?: string;
  accountId: string;
  interestRate?: number;
  initialAmount?: number;
  auto?: { amount: number; frequency: 'weekly' | 'monthly' } | null;
}

export function goalProgress(g: SavingsGoal): number {
  return g.target > 0 ? Math.min(1, g.balance / g.target) : 0;
}

function checkMilestones(s: S, g: SavingsGoal): void {
  if (g.target <= 0) return;
  const pct = (g.balance / g.target) * 100;
  for (const m of MILESTONES) {
    if (pct >= m && !g.milestones.includes(m)) {
      g.milestones.push(m);
      notify(
        s,
        m === 100 ? 'success' : 'info',
        m === 100 ? `¡Objetivo «${g.name}» completado!` : `«${g.name}» al ${m} %`,
        `Llevas ${formatMoney(g.balance, base(s))} de ${formatMoney(g.target, base(s))}.`,
        '/products/savings',
      );
    }
  }
}

export function createGoal(s: S, p: CreateGoalInput): string {
  const name = assertText(p.name, 'El nombre', 60);
  openAccount(s, p.accountId);
  const target = p.target ?? 0;
  if (p.kind === 'goal') assertAmount(target, 'La cantidad objetivo');
  else if (target !== 0) assertAmount(target, 'La cantidad objetivo');
  let targetDate: string | undefined;
  if (p.targetDate) {
    const d = fromDateInput(p.targetDate);
    if (!d) fail('INVALID_INPUT', 'Fecha objetivo no válida.');
    if (d.getTime() <= nowDate(s).getTime()) fail('INVALID_INPUT', 'La fecha objetivo debe ser futura.');
    targetDate = d.toISOString();
  }
  const rate = p.interestRate ?? DEFAULT_GOAL_RATE;
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.2) fail('INVALID_INPUT', 'Interés no válido.');
  const id = nextId(s, 'goal');
  const goal: SavingsGoal = {
    id,
    kind: p.kind,
    name,
    icon: p.icon ?? (p.kind === 'pot' ? 'piggy' : 'target'),
    color: p.color ?? '#24C78A',
    target,
    targetDate,
    balance: 0,
    interestRate: rate,
    accountId: p.accountId,
    auto: null,
    contributions: [],
    milestones: [],
    interestEarned: 0,
    createdAt: nowISO(s),
    status: 'active',
  };
  s.goals.push(goal);
  if (p.auto) setGoalAuto(s, { goalId: id, amount: p.auto.amount, frequency: p.auto.frequency, accountId: p.accountId });
  if (p.initialAmount) contribute(s, { goalId: id, accountId: p.accountId, amount: p.initialAmount });
  return id;
}

function activeGoal(s: S, id: string): SavingsGoal {
  const g = findById(s.goals, id, 'Objetivo');
  if (g.status !== 'active') fail('INVALID_STATE', 'El objetivo está cerrado.');
  return g;
}

export function contribute(
  s: S,
  p: { goalId: string; accountId: string; amount: number; source?: 'manual' | 'auto'; opId?: string },
): string {
  const g = activeGoal(s, p.goalId);
  const tx = post(s, {
    kind: 'savings_in',
    flow: 'internal',
    category: 'savings',
    concept: `Aportación a «${g.name}»`,
    amount: p.amount,
    amountIn: 'to',
    from: accountEndpoint(s, p.accountId),
    to: { type: 'goal', id: g.id, label: g.name },
    refId: g.id,
    opId: p.opId,
  });
  const received = receivedAmount(tx);
  g.balance += received;
  g.contributions.push({ at: nowISO(s), amount: received, source: p.source ?? 'manual' });
  checkMilestones(s, g);
  return tx.id;
}

export function withdrawFromGoal(s: S, p: { goalId: string; accountId: string; amount: number; opId?: string }): string {
  const g = activeGoal(s, p.goalId);
  assertAmount(p.amount);
  if (p.amount > g.balance) fail('INSUFFICIENT_FUNDS', `El objetivo solo tiene ${formatMoney(g.balance, base(s))}.`);
  const tx = post(s, {
    kind: 'savings_out',
    flow: 'internal',
    category: 'savings',
    concept: `Retirada de «${g.name}»`,
    amount: p.amount,
    from: { type: 'goal', id: g.id, label: g.name },
    to: accountEndpoint(s, p.accountId),
    currency: base(s),
    refId: g.id,
    opId: p.opId,
  });
  g.balance -= p.amount;
  g.contributions.push({ at: nowISO(s), amount: -p.amount, source: 'withdrawal' });
  return tx.id;
}

export function setGoalAuto(
  s: S,
  p: { goalId: string; amount?: number; frequency?: 'weekly' | 'monthly'; accountId?: string; disable?: boolean },
): void {
  const g = activeGoal(s, p.goalId);
  if (p.disable) {
    g.auto = null;
    return;
  }
  assertAmount(p.amount, 'La aportación periódica');
  const frequency = p.frequency ?? 'monthly';
  if (!['weekly', 'monthly'].includes(frequency)) fail('INVALID_INPUT', 'Frecuencia no válida.');
  const accountId = p.accountId ?? g.accountId;
  openAccount(s, accountId);
  const start = startOfUTCDay(nowDate(s));
  const nextAt = frequency === 'weekly' ? addDaysUTC(start, 7) : addMonthsUTC(start, 1);
  g.auto = { amount: p.amount!, frequency, nextAt: nextAt.toISOString(), accountId };
}

export function updateGoal(s: S, p: { goalId: string; name?: string; target?: number; targetDate?: string | null; color?: string; icon?: string }): void {
  const g = activeGoal(s, p.goalId);
  if (p.name !== undefined) g.name = assertText(p.name, 'El nombre', 60);
  if (p.target !== undefined) {
    if (g.kind === 'goal' || p.target !== 0) assertAmount(p.target, 'La cantidad objetivo');
    g.target = p.target;
    g.milestones = g.milestones.filter((m) => g.target > 0 && (g.balance / g.target) * 100 >= m);
    checkMilestones(s, g);
  }
  if (p.targetDate !== undefined) {
    if (p.targetDate === null || p.targetDate === '') g.targetDate = undefined;
    else {
      const d = fromDateInput(p.targetDate);
      if (!d) fail('INVALID_INPUT', 'Fecha objetivo no válida.');
      g.targetDate = d.toISOString();
    }
  }
  if (p.color !== undefined) g.color = p.color.slice(0, 20);
  if (p.icon !== undefined) g.icon = p.icon.slice(0, 30);
}

export function closeGoal(s: S, p: { goalId: string; accountId: string }): void {
  const g = activeGoal(s, p.goalId);
  if (g.balance > 0) withdrawFromGoal(s, { goalId: g.id, accountId: p.accountId, amount: g.balance });
  g.status = 'closed';
  g.auto = null;
}

/** Aportaciones periódicas automáticas vencidas. */
export function processGoalContributions(s: S): void {
  const now = nowDate(s).getTime();
  for (const g of s.goals) {
    if (g.status !== 'active' || !g.auto) continue;
    let guard = 0;
    while (g.auto && Date.parse(g.auto.nextAt) <= now && guard++ < 60) {
      const auto = g.auto;
      try {
        contribute(s, { goalId: g.id, accountId: auto.accountId, amount: auto.amount, source: 'auto' });
      } catch (e) {
        notify(s, 'warning', 'Aportación automática fallida', `«${g.name}»: ${e instanceof DomainError ? e.message : 'error'}`, '/products/savings');
      }
      const next = auto.frequency === 'weekly' ? addDaysUTC(new Date(auto.nextAt), 7) : addMonthsUTC(new Date(auto.nextAt), 1);
      auto.nextAt = next.toISOString();
    }
  }
}

/** Intereses mensuales de objetivos y huchas. */
export function payGoalInterest(s: S): void {
  for (const g of s.goals) {
    if (g.status !== 'active' || g.balance <= 0 || g.interestRate <= 0) continue;
    const interest = Math.round((g.balance * g.interestRate) / 12);
    if (interest <= 0) continue;
    post(s, {
      kind: 'interest_earned',
      flow: 'income',
      category: 'interest',
      concept: `Intereses «${g.name}»`,
      amount: interest,
      from: { type: 'system', label: 'NEXUS Bank (simulado)' },
      to: { type: 'goal', id: g.id, label: g.name },
      currency: base(s),
      refId: g.id,
    });
    g.balance += interest;
    g.interestEarned += interest;
    g.contributions.push({ at: nowISO(s), amount: interest, source: 'interest' });
    checkMilestones(s, g);
  }
}

/** Aportación mensual necesaria para llegar al objetivo en fecha. */
export function requiredMonthly(g: SavingsGoal, now: Date): number | null {
  if (!g.targetDate || g.target <= 0) return null;
  const months = Math.max(
    1,
    (new Date(g.targetDate).getUTCFullYear() - now.getUTCFullYear()) * 12 + (new Date(g.targetDate).getUTCMonth() - now.getUTCMonth()),
  );
  return Math.max(0, Math.ceil((g.target - g.balance) / months));
}
