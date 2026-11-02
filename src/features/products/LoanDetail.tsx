import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { formatPct } from '@/core/money';
import { formatDate } from '@/core/time';
import { FREQUENCY_LABELS, LOAN_KIND_LABELS, loanDebt, remainingSchedule } from '@/engine/products/loans';
import { useMoney, useProfile } from '@/store/hooks';
import { Link } from '@/app/router';
import { Badge, Button, Card, EmptyState, KeyValue, PageHeader, Progress } from '@/ui/primitives';
import { PrepayDialog } from './dialogs';

export default function LoanDetail({ params }: { params: Record<string, string> }) {
  const p = useProfile();
  const fmt = useMoney();
  const loan = p.loans.find((l) => l.id === params.id);
  const [prepay, setPrepay] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const schedule = useMemo(() => (loan ? remainingSchedule(loan) : []), [loan]);
  if (!loan) return <EmptyState title="Préstamo no encontrado" action={<Link to="/products/loans" className="text-accent">Volver</Link>} />;
  const futureInterest = schedule.reduce((a, r) => a + r.interest, 0);
  const property = loan.propertyId ? p.properties.find((x) => x.id === loan.propertyId) : undefined;
  return (
    <div>
      <PageHeader
        back={
          <Link to="/products/loans" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Préstamos
          </Link>
        }
        title={loan.name}
        subtitle={`${LOAN_KIND_LABELS[loan.kind]} · contratado el ${formatDate(loan.startAt)}`}
        actions={loan.status === 'active' ? <Button onClick={() => setPrepay(true)}>Amortizar</Button> : <Badge tone="pos">Liquidado</Badge>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Resumen">
          <div className="tabular text-[30px] font-semibold text-fg">{fmt(loanDebt(loan))}</div>
          <div className="text-[13px] text-muted">deuda pendiente</div>
          <Progress className="mt-3" value={loan.principal ? 1 - loan.outstanding / loan.principal : 1} color="var(--nx-pos)" label="Capital amortizado" />
          <KeyValue
            className="mt-3"
            items={[
              { label: 'Capital inicial', value: fmt(loan.principal) },
              { label: 'Capital pendiente', value: fmt(loan.outstanding) },
              { label: 'Deuda vencida', value: fmt(loan.overdue), tone: loan.overdue ? 'neg' : undefined },
              { label: 'Interés', value: `${formatPct(loan.rate, 2, false)} TIN` },
              { label: `Cuota ${FREQUENCY_LABELS[loan.frequency].toLowerCase()}`, value: fmt(loan.installment) },
              { label: 'Cuotas pagadas', value: `${loan.periodsPaid} / ${loan.termPeriods}` },
              { label: 'Intereses pagados', value: fmt(loan.totalInterestPaid) },
              { label: 'Intereses futuros', value: fmt(futureInterest) },
              { label: 'Comisiones (apertura + demora)', value: fmt(loan.openingFee + loan.lateFees) },
              { label: 'Impagos', value: String(loan.missedPayments), tone: loan.missedPayments ? 'neg' : undefined },
              { label: 'Cuenta de cargo', value: p.accounts.find((a) => a.id === loan.accountId)?.name ?? '—' },
              ...(property ? [{ label: 'Inmueble', value: <Link to={`/realestate/${property.id}`} className="text-accent">{property.title}</Link> }] : []),
            ]}
          />
        </Card>
        <Card title="Calendario de amortización" subtitle={schedule.length ? `${schedule.length} cuotas restantes` : 'Sin cuotas pendientes'} className="lg:col-span-2" padded={false}>
          {schedule.length === 0 ? (
            <div className="p-5 text-sm text-muted">El préstamo no tiene cuotas pendientes.</div>
          ) : (
            <>
              <div className="nx-scroll max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-y border-line text-left text-[12px] text-muted">
                      <th className="py-2.5 pl-5 font-medium">Nº</th>
                      <th className="py-2.5 font-medium">Fecha</th>
                      <th className="py-2.5 text-right font-medium">Cuota</th>
                      <th className="hidden py-2.5 text-right font-medium sm:table-cell">Intereses</th>
                      <th className="hidden py-2.5 text-right font-medium sm:table-cell">Capital</th>
                      <th className="py-2.5 pr-5 text-right font-medium">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(showAll ? schedule : schedule.slice(0, 24)).map((r) => (
                      <tr key={r.period}>
                        <td className="tabular py-2 pl-5 text-muted">{r.period}</td>
                        <td className="py-2 text-fg">{formatDate(r.date)}</td>
                        <td className="tabular py-2 text-right font-medium text-fg">{fmt(r.payment)}</td>
                        <td className="tabular hidden py-2 text-right text-neg sm:table-cell">{fmt(r.interest)}</td>
                        <td className="tabular hidden py-2 text-right text-muted sm:table-cell">{fmt(r.principal)}</td>
                        <td className="tabular py-2 pr-5 text-right text-muted">{fmt(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {schedule.length > 24 && (
                <div className="border-t border-line p-3 text-center">
                  <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? 'Mostrar menos' : `Ver las ${schedule.length} cuotas`}
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
      <Card className="mt-5" title="Historial de pagos">
        {loan.payments.length === 0 ? (
          <p className="text-sm text-muted">Aún no se ha cargado ninguna cuota. Avanza el tiempo simulado para ver los cargos automáticos.</p>
        ) : (
          <ul className="divide-y divide-line">
            {loan.payments.slice().reverse().map((pay, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <Badge tone={pay.status === 'paid' ? 'pos' : pay.status === 'missed' ? 'neg' : pay.status === 'prepayment' ? 'accent' : 'warn'}>
                    {pay.status === 'paid' ? 'Pagada' : pay.status === 'missed' ? 'Impagada' : pay.status === 'prepayment' ? 'Amortización' : 'Regularizada'}
                  </Badge>
                  <span className="ml-2 text-muted">{formatDate(pay.at)}</span>
                </div>
                <div className="tabular text-right">
                  <div className="font-medium text-fg">{fmt(pay.amount)}</div>
                  {(pay.interest > 0 || pay.fee > 0) && <div className="text-[12px] text-muted">intereses {fmt(pay.interest)}{pay.fee ? ` · comisión ${fmt(pay.fee)}` : ''}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {prepay && <PrepayDialog loan={loan} onClose={() => setPrepay(false)} />}
    </div>
  );
}
