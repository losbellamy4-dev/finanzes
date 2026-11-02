import { useState } from 'react';
import { ShieldCheck, Plus } from 'lucide-react';
import type { InsuranceType } from '@/core/schema';
import { formatDate } from '@/core/time';
import { INSURANCE_PRODUCTS } from '@/engine/products/insurance';
import { dispatch, useMoney, useProfile } from '@/store/hooks';
import { confirm, toast } from '@/store/toast';
import { Badge, Button, Card, EmptyState, KeyValue, PageHeader, Stat } from '@/ui/primitives';
import { ClaimDialog, InsuranceDialog } from './dialogs';

export default function InsurancePage() {
  const p = useProfile();
  const fmt = useMoney();
  const [contract, setContract] = useState<InsuranceType | null>(null);
  const [claim, setClaim] = useState<string | null>(null);
  const policies = p.insurance.filter((x) => x.status !== 'cancelled');
  const cancelled = p.insurance.filter((x) => x.status === 'cancelled');
  const monthly = policies.filter((x) => x.status === 'active').reduce((a, x) => a + x.monthlyPremium, 0);
  const paidOut = p.insurance.reduce((a, x) => a + x.claims.reduce((b, c) => b + c.payout, 0), 0);
  const premiums = p.insurance.reduce((a, x) => a + x.premiumsPaid, 0);
  return (
    <div>
      <PageHeader title="Seguros" subtitle="Pólizas simuladas: primas mensuales y siniestros con franquicia" actions={<Button icon={<Plus className="size-4" />} onClick={() => setContract('home')}>Contratar seguro</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="nx-card p-3.5"><Stat label="Pólizas activas" value={policies.filter((x) => x.status === 'active').length} /></div>
        <div className="nx-card p-3.5"><Stat label="Primas al mes" value={fmt(monthly)} /></div>
        <div className="nx-card p-3.5"><Stat label="Primas pagadas" value={fmt(premiums)} /></div>
        <div className="nx-card p-3.5"><Stat label="Indemnizaciones cobradas" value={fmt(paidOut)} tone={paidOut ? 'pos' : undefined} /></div>
      </div>
      {policies.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="size-5" />} title="Sin seguros contratados" body="Protege tu hogar, tu vida, tus viajes, tus dispositivos y tus bienes de valor." action={<Button onClick={() => setContract('home')}>Ver seguros</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {policies.map((pol) => (
            <Card key={pol.id} title={pol.name} subtitle={pol.insuredItem} action={<Badge tone={pol.status === 'active' ? 'pos' : 'warn'}>{pol.status === 'active' ? 'Activa' : 'Suspendida'}</Badge>}>
              <KeyValue
                items={[
                  { label: 'Capital asegurado', value: fmt(pol.coverage) },
                  { label: 'Prima mensual', value: fmt(pol.monthlyPremium) },
                  { label: 'Franquicia', value: fmt(pol.deductible) },
                  { label: 'Próxima prima', value: formatDate(pol.nextPremiumAt) },
                  { label: 'Primas pagadas', value: fmt(pol.premiumsPaid) },
                ]}
              />
              {pol.claims.length > 0 && (
                <div className="mt-3 rounded-xl border border-line bg-surface-2/50 p-3">
                  <div className="mb-1.5 text-[12px] font-semibold text-muted">Siniestros</div>
                  <ul className="space-y-1.5">
                    {pol.claims.slice(0, 5).map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate text-fg">{c.description}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="tabular text-muted">{fmt(c.amount)}</span>
                          <Badge tone={c.status === 'paid' ? 'pos' : 'neg'}>{c.status === 'paid' ? `Pagado ${fmt(c.payout)}` : c.reason ?? 'Rechazado'}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {pol.status === 'active' ? (
                  <Button size="sm" onClick={() => setClaim(pol.id)}>Declarar siniestro</Button>
                ) : (
                  <Button size="sm" onClick={() => { const r = dispatch('insurance/reactivate', { policyId: pol.id }); if (r.ok) toast.success('Póliza reactivada'); else toast.error(r.error.message); }}>Pagar y reactivar</Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!(await confirm({ title: `Cancelar ${pol.name}`, body: 'Dejarás de estar cubierto y no se cobrarán más primas.', tone: 'danger', confirmLabel: 'Cancelar póliza' }))) return;
                    dispatch('insurance/cancel', { policyId: pol.id });
                    toast.success('Póliza cancelada');
                  }}
                >
                  Cancelar póliza
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <h2 className="mt-8 mb-3 text-[15px] font-semibold text-fg">Catálogo de seguros</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(Object.keys(INSURANCE_PRODUCTS) as InsuranceType[]).map((t) => (
          <button key={t} type="button" onClick={() => setContract(t)} className="nx-card p-4 text-left hover:border-line-strong">
            <div className="font-semibold text-fg">{INSURANCE_PRODUCTS[t].name}</div>
            <p className="mt-1 text-[12px] text-muted">{INSURANCE_PRODUCTS[t].description}</p>
            <div className="mt-2 text-[12px] font-medium text-accent">Desde {fmt(INSURANCE_PRODUCTS[t].minMonthly)}/mes</div>
          </button>
        ))}
      </div>
      {cancelled.length > 0 && <p className="mt-5 text-[13px] text-subtle">{cancelled.length} póliza(s) cancelada(s).</p>}
      {contract && <InsuranceDialog type={contract} onClose={() => setContract(null)} />}
      {claim && <ClaimDialog policyId={claim} onClose={() => setClaim(null)} />}
    </div>
  );
}
