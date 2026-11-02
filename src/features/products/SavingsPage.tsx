import { useState } from 'react';
import { Lock, PiggyBank, Plus, Sparkles, Target, Trash2 } from 'lucide-react';
import type { SavingsGoal } from '@/core/schema';
import { formatPct } from '@/core/money';
import { formatDate, tickToDate } from '@/core/time';
import { accruedInterest, structuredReturn } from '@/engine/products/deposits';
import { goalProgress, requiredMonthly } from '@/engine/products/savings';
import { dispatch, useMoney, useOverview, useProfile } from '@/store/hooks';
import { confirm, toast } from '@/store/toast';
import { Badge, Button, Card, EmptyState, KeyValue, PageHeader, Progress, Stat } from '@/ui/primitives';
import { DepositDialog, GoalDialog, GoalMoneyDialog } from './dialogs';

export default function SavingsPage() {
  const p = useProfile();
  const ov = useOverview();
  const fmt = useMoney();
  const now = tickToDate(p.clock.startAt, p.clock.tick);
  const [newGoal, setNewGoal] = useState<SavingsGoal['kind'] | null>(null);
  const [newDeposit, setNewDeposit] = useState<'fixed' | 'structured' | null>(null);
  const [money, setMoney] = useState<{ goal: SavingsGoal; mode: 'contribute' | 'withdraw' } | null>(null);
  const goals = p.goals.filter((g) => g.status === 'active');
  const deposits = p.deposits.filter((d) => d.status === 'active');
  const pastDeposits = p.deposits.filter((d) => d.status !== 'active');
  const interestEarned = p.goals.reduce((a, g) => a + g.interestEarned, 0);

  return (
    <div>
      <PageHeader
        title="Ahorro"
        subtitle="Objetivos, huchas digitales y depósitos"
        actions={
          <>
            <Button variant="secondary" icon={<PiggyBank className="size-4" />} onClick={() => setNewGoal('pot')}>Nueva hucha</Button>
            <Button variant="secondary" icon={<Lock className="size-4" />} onClick={() => setNewDeposit('fixed')}>Depósito</Button>
            <Button icon={<Target className="size-4" />} onClick={() => setNewGoal('goal')}>Nuevo objetivo</Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="nx-card p-3.5"><Stat label="Total ahorrado" value={fmt(ov.savings)} /></div>
        <div className="nx-card p-3.5"><Stat label="En objetivos y huchas" value={fmt(ov.goals)} /></div>
        <div className="nx-card p-3.5"><Stat label="En depósitos" value={fmt(ov.deposits)} /></div>
        <div className="nx-card p-3.5"><Stat label="Intereses de ahorro" value={fmt(interestEarned)} tone={interestEarned ? 'pos' : undefined} /></div>
      </div>
      <h2 className="mb-3 text-[15px] font-semibold text-fg">Objetivos y huchas</h2>
      {goals.length === 0 ? (
        <EmptyState icon={<Target className="size-5" />} title="Sin objetivos de ahorro" body="Crea un objetivo con fecha o una hucha flexible." action={<Button onClick={() => setNewGoal('goal')}>Crear objetivo</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const prog = goalProgress(g);
            const req = requiredMonthly(g, now);
            return (
              <div key={g.id} className="nx-card anim-fade-up p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: g.color }}>
                      {g.kind === 'pot' ? <PiggyBank className="size-5" /> : <Target className="size-5" />}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-fg">{g.name}</div>
                      <div className="text-[12px] text-muted">{g.kind === 'pot' ? 'Hucha digital' : `Objetivo · ${g.targetDate ? formatDate(g.targetDate) : 'sin fecha'}`}</div>
                    </div>
                  </div>
                  {g.target > 0 && <Badge tone={prog >= 1 ? 'pos' : 'accent'}>{Math.floor(prog * 100)} %</Badge>}
                </div>
                <div className="tabular mt-4 text-2xl font-semibold text-fg">{fmt(g.balance)}</div>
                {g.target > 0 && (
                  <>
                    <Progress className="mt-2" value={prog} color={g.color} label={`Progreso de ${g.name}`} />
                    <div className="mt-1.5 flex justify-between text-[12px] text-muted">
                      <span>de {fmt(g.target)}</span>
                      <span>{[25, 50, 75, 100].map((m) => (g.milestones.includes(m) ? `✓${m}` : `${m}`)).join(' · ')}</span>
                    </div>
                  </>
                )}
                <KeyValue
                  className="mt-3"
                  items={[
                    { label: 'Interés', value: `${formatPct(g.interestRate, 2, false)} · ganado ${fmt(g.interestEarned)}` },
                    { label: 'Aportación automática', value: g.auto ? `${fmt(g.auto.amount)} ${g.auto.frequency === 'weekly' ? 'semanal' : 'mensual'} · próx. ${formatDate(g.auto.nextAt)}` : 'Desactivada' },
                    ...(req !== null ? [{ label: 'Necesitas al mes', value: fmt(req) }] : []),
                  ]}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setMoney({ goal: g, mode: 'contribute' })}>Aportar</Button>
                  <Button size="sm" variant="secondary" onClick={() => setMoney({ goal: g, mode: 'withdraw' })} disabled={g.balance <= 0}>Retirar</Button>
                  {g.auto && <Button size="sm" variant="ghost" onClick={() => { dispatch('goal/auto', { goalId: g.id, disable: true }); toast.info('Aportación automática desactivada'); }}>Parar auto</Button>}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Cerrar ${g.name}`}
                    onClick={async () => {
                      if (!(await confirm({ title: `Cerrar «${g.name}»`, body: `El saldo (${fmt(g.balance)}) volverá a la cuenta de origen.`, tone: 'danger', confirmLabel: 'Cerrar' }))) return;
                      const acc = p.accounts.find((a) => a.id === g.accountId && a.status === 'open') ?? p.accounts.find((a) => a.status === 'open');
                      if (!acc) return toast.error('No hay cuentas abiertas para recibir el saldo');
                      const r = dispatch('goal/close', { goalId: g.id, accountId: acc.id });
                      if (r.ok) toast.success('Objetivo cerrado');
                      else toast.error(r.error.message);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-fg">Depósitos</h2>
        <Button size="sm" variant="secondary" icon={<Sparkles className="size-4" />} onClick={() => setNewDeposit('structured')}>Estructurado</Button>
      </div>
      {deposits.length === 0 ? (
        <EmptyState icon={<Lock className="size-5" />} title="Sin depósitos activos" body="Bloquea capital a plazo fijo o en un depósito estructurado con capital garantizado." action={<Button onClick={() => setNewDeposit('fixed')}>Contratar depósito</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {deposits.map((d) => {
            const total = Date.parse(d.maturityAt) - Date.parse(d.startAt);
            const elapsed = now.getTime() - Date.parse(d.startAt);
            const accrued = accruedInterest(p, d);
            return (
              <Card key={d.id} title={d.name} subtitle={`${formatDate(d.startAt)} → ${formatDate(d.maturityAt)}`} action={<Badge tone={d.kind === 'fixed' ? 'accent' : 'warn'}>{d.kind === 'fixed' ? 'Plazo fijo' : 'Estructurado'}</Badge>}>
                <div className="tabular text-2xl font-semibold text-fg">{fmt(d.principal)}</div>
                <Progress className="mt-2" value={total > 0 ? elapsed / total : 1} label="Tiempo transcurrido" />
                <KeyValue
                  className="mt-3"
                  items={
                    d.kind === 'fixed'
                      ? [{ label: 'TIN', value: formatPct(d.rate, 2, false) }, { label: 'Intereses devengados', value: fmt(accrued), tone: 'pos' }]
                      : [{ label: 'Rentabilidad actual', value: formatPct(structuredReturn(p, d), 2), tone: structuredReturn(p, d) > 0 ? 'pos' : undefined }, { label: 'Participación / tope', value: `${formatPct(d.participation ?? 0, 0, false)} / ${formatPct(d.cap ?? 0, 0, false)}` }]
                  }
                />
                <Button
                  size="sm"
                  variant="danger"
                  className="mt-3"
                  onClick={async () => {
                    if (!(await confirm({ title: 'Cancelar depósito anticipadamente', body: d.kind === 'fixed' ? `Perderás el 50 % de los intereses devengados (${fmt(Math.round(accrued * 0.5))}).` : 'Recuperarás el capital, sin rentabilidad.', tone: 'danger', confirmLabel: 'Cancelar depósito' }))) return;
                    const r = dispatch('deposit/cancel', { depositId: d.id });
                    if (r.ok) toast.success('Depósito cancelado', `Recibido: ${fmt(r.result as number)}`);
                    else toast.error(r.error.message);
                  }}
                >
                  Cancelar anticipadamente
                </Button>
              </Card>
            );
          })}
        </div>
      )}
      {pastDeposits.length > 0 && (
        <Card className="mt-5" title="Depósitos finalizados">
          <ul className="divide-y divide-line">
            {pastDeposits.map((d) => (
              <li key={d.id} className="flex justify-between py-2.5 text-sm">
                <span className="text-muted">{d.name} · {d.status === 'matured' ? 'Vencido' : 'Cancelado'} {d.closedAt ? formatDate(d.closedAt) : ''}</span>
                <span className="tabular font-medium text-fg">{fmt(d.payout ?? 0)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {newGoal && <GoalDialog kind={newGoal} onClose={() => setNewGoal(null)} />}
      {newDeposit && <DepositDialog kind={newDeposit} onClose={() => setNewDeposit(null)} />}
      {money && <GoalMoneyDialog goal={money.goal} mode={money.mode} onClose={() => setMoney(null)} />}
    </div>
  );
}
