import { useState } from 'react';
import { Briefcase, Landmark, Plus } from 'lucide-react';
import { formatPct } from '@/core/money';
import { formatDate } from '@/core/time';
import { FREQUENCY_LABELS, LOAN_KIND_LABELS, loanDebt } from '@/engine/products/loans';
import { dispatch, useMoney, useOverview, useProfile } from '@/store/hooks';
import { confirm, toast } from '@/store/toast';
import { Link } from '@/app/router';
import { Badge, Button, Card, EmptyState, KeyValue, PageHeader, Progress, Stat } from '@/ui/primitives';
import { CreditLineDialog, CreditLineOpDialog, LoanDialog } from './dialogs';

export default function LoansPage() {
  const p = useProfile();
  const ov = useOverview();
  const fmt = useMoney();
  const [newLoan, setNewLoan] = useState(false);
  const [newLine, setNewLine] = useState(false);
  const [lineOp, setLineOp] = useState<{ id: string; mode: 'draw' | 'repay' } | null>(null);
  const active = p.loans.filter((l) => l.status === 'active');
  const paid = p.loans.filter((l) => l.status === 'paid');
  const lines = p.creditLines.filter((l) => l.status === 'active');
  const monthlyBurden = active.reduce((a, l) => a + (l.frequency === 'monthly' ? l.installment : l.frequency === 'quarterly' ? l.installment / 3 : l.frequency === 'biweekly' ? (l.installment * 26) / 12 : (l.installment * 52) / 12), 0);

  return (
    <div>
      <PageHeader
        title="Préstamos y créditos"
        subtitle="Préstamos personales, hipotecas, financiación empresarial y líneas de crédito"
        actions={
          <>
            <Button variant="secondary" icon={<Briefcase className="size-4" />} onClick={() => setNewLine(true)}>Línea de crédito</Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setNewLoan(true)}>Solicitar préstamo</Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="nx-card p-3.5"><Stat label="Deuda total" value={fmt(ov.debts.total)} tone={ov.debts.total ? 'neg' : undefined} /></div>
        <div className="nx-card p-3.5"><Stat label="Préstamos" value={fmt(ov.debts.loans)} /></div>
        <div className="nx-card p-3.5"><Stat label="Líneas de crédito" value={fmt(ov.debts.creditLines)} /></div>
        <div className="nx-card p-3.5"><Stat label="Cuotas al mes (aprox.)" value={fmt(Math.round(monthlyBurden))} /></div>
      </div>
      {active.length === 0 ? (
        <EmptyState icon={<Landmark className="size-5" />} title="Sin préstamos activos" body="Simula y contrata un préstamo: verás la cuota, los intereses y el calendario de amortización." action={<Button onClick={() => setNewLoan(true)}>Simular préstamo</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((l) => (
            <Link key={l.id} to={`/products/loans/${l.id}`} className="nx-card anim-fade-up block p-5 hover:border-line-strong">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-fg">{l.name}</div>
                  <div className="text-[12px] text-muted">{LOAN_KIND_LABELS[l.kind]} · {formatPct(l.rate, 2, false)} TIN</div>
                </div>
                {l.overdue > 0 ? <Badge tone="neg">Impagos</Badge> : <Badge tone="pos">Al día</Badge>}
              </div>
              <div className="tabular mt-4 text-2xl font-semibold text-fg">{fmt(loanDebt(l))}</div>
              <div className="text-[12px] text-muted">pendiente de {fmt(l.principal)}</div>
              <Progress className="mt-3" value={l.principal ? 1 - l.outstanding / l.principal : 1} color="var(--nx-pos)" label="Capital amortizado" />
              <KeyValue className="mt-3" items={[{ label: `Cuota ${FREQUENCY_LABELS[l.frequency].toLowerCase()}`, value: fmt(l.installment) }, { label: 'Próximo cargo', value: formatDate(l.nextDueAt) }, { label: 'Cuotas pagadas', value: `${l.periodsPaid} de ${l.termPeriods}` }]} />
            </Link>
          ))}
        </div>
      )}

      <h2 className="mt-8 mb-3 text-[15px] font-semibold text-fg">Líneas de crédito</h2>
      {lines.length === 0 ? (
        <EmptyState icon={<Briefcase className="size-5" />} title="Sin líneas de crédito" body="Dinero disponible cuando lo necesites; pagas intereses solo por lo dispuesto." action={<Button variant="secondary" onClick={() => setNewLine(true)}>Abrir línea</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lines.map((l) => (
            <Card key={l.id} title={l.name} subtitle={`${formatPct(l.rate, 2, false)} TIN · abierta ${formatDate(l.openedAt)}`}>
              <div className="tabular text-2xl font-semibold text-fg">{fmt(l.drawn)}</div>
              <div className="text-[12px] text-muted">dispuesto de {fmt(l.limit)}</div>
              <Progress className="mt-3" value={l.limit ? l.drawn / l.limit : 0} label="Uso de la línea" />
              <KeyValue className="mt-3" items={[{ label: 'Intereses cargados', value: fmt(l.interestCharged), tone: l.interestCharged ? 'neg' : undefined }]} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setLineOp({ id: l.id, mode: 'draw' })} disabled={l.drawn >= l.limit}>Disponer</Button>
                <Button size="sm" variant="secondary" onClick={() => setLineOp({ id: l.id, mode: 'repay' })} disabled={l.drawn <= 0}>Devolver</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!(await confirm({ title: 'Cerrar línea de crédito', tone: 'danger', confirmLabel: 'Cerrar' }))) return;
                    const r = dispatch('creditline/close', { lineId: l.id });
                    if (r.ok) toast.success('Línea cerrada');
                    else toast.error(r.error.message);
                  }}
                >
                  Cerrar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {paid.length > 0 && (
        <Card className="mt-5" title="Préstamos liquidados">
          <ul className="divide-y divide-line">
            {paid.map((l) => (
              <li key={l.id}>
                <Link to={`/products/loans/${l.id}`} className="flex justify-between py-2.5 text-sm">
                  <span className="text-muted">{l.name}</span>
                  <span className="tabular text-fg">{fmt(l.principal)} · intereses {fmt(l.totalInterestPaid)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {newLoan && <LoanDialog kind="personal" onClose={() => setNewLoan(false)} />}
      {newLine && <CreditLineDialog onClose={() => setNewLine(false)} />}
      {lineOp && <CreditLineOpDialog lineId={lineOp.id} mode={lineOp.mode} onClose={() => setLineOp(null)} />}
    </div>
  );
}
