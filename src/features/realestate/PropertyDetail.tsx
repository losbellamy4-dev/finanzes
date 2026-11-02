import { useMemo, useState } from 'react';
import { ArrowLeft, Bath, BedDouble, Calendar, Hammer, Home, Maximize, PawPrint, Users } from 'lucide-react';
import type { Property } from '@/core/schema';
import { formatMoney, formatPct, parseMoney } from '@/core/money';
import { formatDate, monthKey, tickToDate } from '@/core/time';
import { CONDITION_LABELS, PROPERTY_TYPE_LABELS } from '@/data/realestate';
import { purchaseCosts, propertyStats, saleCosts } from '@/engine/realestate';
import { loanSummary, suggestedRate } from '@/engine/products/loans';
import { computeCreditScore } from '@/engine/creditScore';
import { useMoney, useOperation, useProfile } from '@/store/hooks';
import { confirm } from '@/store/toast';
import { Link, navigate } from '@/app/router';
import { TimeSeriesChart } from '@/ui/charts';
import { AccountSelect, openAccounts } from '@/ui/domain';
import { Modal } from '@/ui/overlays';
import { PropertyArt } from '@/ui/PropertyArt';
import { Badge, Button, Card, cx, EmptyState, Field, FormError, Input, KeyValue, MoneyInput, PageHeader, Segmented, Select } from '@/ui/primitives';

export default function PropertyDetail({ params }: { params: Record<string, string> }) {
  const p = useProfile();
  const fmt = useMoney();
  const prop = p.properties.find((x) => x.id === params.id);
  const [photo, setPhoto] = useState(0);
  const [dialog, setDialog] = useState<null | 'rent' | 'expense' | 'sell'>(null);
  const series = useMemo(() => (prop ? prop.valueHistory.map((v) => ({ t: Date.parse(v.at), v: v.v })) : []), [prop]);
  if (!prop) return <EmptyState title="Inmueble no encontrado" action={<Link to="/realestate" className="text-accent">Volver</Link>} />;
  const contract = p.rentals.find((r) => r.propertyId === prop.id && r.status === 'active');
  const pastContracts = p.rentals.filter((r) => r.propertyId === prop.id && r.status === 'ended');
  const st = propertyStats(p, prop);
  const loan = prop.mortgageLoanId ? p.loans.find((l) => l.id === prop.mortgageLoanId) : undefined;

  return (
    <div>
      <PageHeader
        back={
          <Link to="/realestate" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Inmobiliario
          </Link>
        }
        title={prop.title}
        subtitle={`${prop.address} · ${prop.city}, ${prop.country}`}
        actions={prop.owned ? <Badge tone="pos">En propiedad</Badge> : <Badge tone="accent">En venta</Badge>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="nx-card overflow-hidden">
            <div className="aspect-[16/9]">
              <PropertyArt type={prop.type} seed={prop.imageSeed} variant={photo} className="h-full w-full" />
            </div>
            <div className="flex gap-2 p-3">
              {['Fachada', 'Atardecer', 'Interior'].map((l, i) => (
                <button key={l} type="button" onClick={() => setPhoto(i)} aria-label={`Foto: ${l}`} aria-pressed={photo === i} className={cx('h-14 w-20 overflow-hidden rounded-lg ring-2 transition', photo === i ? 'ring-accent' : 'ring-transparent opacity-70 hover:opacity-100')}>
                  <PropertyArt type={prop.type} seed={prop.imageSeed} variant={i} className="h-full w-full" />
                </button>
              ))}
              <span className="ml-auto self-end text-[11px] text-subtle">Ilustraciones generadas</span>
            </div>
          </div>
          <Card>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { i: Home, l: 'Tipo', v: PROPERTY_TYPE_LABELS[prop.type] },
                { i: Maximize, l: 'Superficie', v: `${prop.area} m²` },
                { i: BedDouble, l: prop.type === 'commercial' || prop.type === 'office' ? 'Estancias' : 'Habitaciones', v: String(prop.rooms) },
                { i: Bath, l: 'Baños', v: String(prop.baths) },
                { i: Hammer, l: 'Estado', v: CONDITION_LABELS[prop.condition] },
                { i: Calendar, l: 'Construcción', v: String(prop.yearBuilt) },
              ].map((x) => (
                <div key={x.l} className="rounded-xl border border-line bg-surface-2/50 p-3">
                  <div className="flex items-center gap-1.5 text-[12px] text-muted"><x.i className="size-3.5" /> {x.l}</div>
                  <div className="mt-0.5 text-sm font-semibold text-fg">{x.v}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">{prop.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {prop.features.map((f) => (
                <Badge key={f}>{f}</Badge>
              ))}
            </div>
          </Card>
          <Card title="Evolución del valor" subtitle={`${formatMoney(Math.round(prop.value / prop.area), p.profile.baseCurrency)}/m² · revalorización mensual`}>
            <TimeSeriesChart data={series} height={220} format={(v) => fmt(v)} label="Valor del inmueble" />
          </Card>
          {prop.owned && (
            <Card title="Alquiler" action={!contract && <Button size="sm" onClick={() => setDialog('rent')}>Alquilar</Button>}>
              {contract ? <ContractPanel contractId={contract.id} /> : <p className="text-sm text-muted">El inmueble está vacío. Selecciona un inquilino ficticio y crea un contrato para generar rentas.</p>}
              {pastContracts.length > 0 && (
                <div className="mt-4 border-t border-line pt-3 text-[13px] text-muted">
                  Contratos anteriores: {pastContracts.map((c) => `${p.tenants.find((t) => t.id === c.tenantId)?.name} (${formatDate(c.startAt)} – ${c.endedAt ? formatDate(c.endedAt) : ''})`).join(' · ')}
                </div>
              )}
            </Card>
          )}
        </div>
        <div className="space-y-5">
          {prop.owned ? (
            <>
              <Card title="Rentabilidad">
                <KeyValue
                  items={[
                    { label: 'Valor actual', value: fmt(prop.value) },
                    { label: 'Precio de compra', value: fmt(prop.purchasePrice ?? 0) },
                    { label: 'Gastos de compra', value: fmt(prop.purchaseCosts ?? 0) },
                    { label: 'Revalorización', value: fmt(st.appreciation, { sign: true }), tone: st.appreciation >= 0 ? 'pos' : 'neg' },
                    { label: 'Rentas cobradas', value: fmt(st.rentCollected), tone: st.rentCollected ? 'pos' : undefined },
                    { label: 'Gastos y reparaciones', value: fmt(st.expenses), tone: st.expenses ? 'neg' : undefined },
                    { label: 'Intereses hipoteca pagados', value: fmt(st.mortgageInterest), tone: st.mortgageInterest ? 'neg' : undefined },
                    { label: 'Rentabilidad bruta', value: formatPct(st.grossYield, 2, false) },
                    { label: 'Rentabilidad neta estimada', value: formatPct(st.netYield, 2) },
                    { label: 'Retorno total', value: formatPct(st.totalReturn, 2), tone: st.totalReturn >= 0 ? 'pos' : 'neg' },
                    { label: 'Patrimonio neto (valor − hipoteca)', value: fmt(st.equity) },
                    ...(loan ? [{ label: 'Hipoteca', value: <Link to={`/products/loans/${loan.id}`} className="text-accent">{loan.status === 'active' ? fmt(loan.outstanding + loan.overdue) : 'Liquidada'}</Link> }] : []),
                  ]}
                />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon={<Hammer className="size-4" />} onClick={() => setDialog('expense')}>Registrar gasto</Button>
                  <Button variant="outline" onClick={() => setDialog('sell')}>Vender</Button>
                </div>
              </Card>
              <Card title="Gastos registrados">
                {prop.expenses.length === 0 ? (
                  <p className="text-sm text-muted">Sin gastos registrados.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {prop.expenses.slice().reverse().map((e) => (
                      <li key={e.id} className="flex justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate text-muted">{e.description} · {formatDate(e.at)}</span>
                        <span className="tabular text-fg">{fmt(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          ) : (
            <BuyPanel prop={prop} />
          )}
        </div>
      </div>
      {dialog === 'rent' && <RentalDialog prop={prop} onClose={() => setDialog(null)} />}
      {dialog === 'expense' && <ExpenseDialog prop={prop} onClose={() => setDialog(null)} />}
      {dialog === 'sell' && <SellDialog prop={prop} onClose={() => setDialog(null)} />}
    </div>
  );
}

function BuyPanel({ prop }: { prop: Property }) {
  const p = useProfile();
  const cur = p.profile.baseCurrency;
  const accounts = openAccounts(p);
  const score = useMemo(() => computeCreditScore(p).score, [p]);
  const [mode, setMode] = useState<'cash' | 'mortgage'>('mortgage');
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type === 'savings')?.id ?? accounts[0]?.id ?? '');
  const [down, setDown] = useState(((prop.value * 0.2) / 100).toFixed(0));
  const [rate, setRate] = useState(String(Math.round(suggestedRate('mortgage', score) * 10000) / 100).replace('.', ','));
  const [years, setYears] = useState('25');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const costs = purchaseCosts(p, prop.value);
  const downC = parseMoney(down) ?? 0;
  const r = Number(rate.replace(',', '.')) / 100;
  const y = Number(years) || 0;
  const principal = Math.max(0, prop.value - downC);
  const sum = mode === 'mortgage' && principal > 0 && y > 0 ? loanSummary(principal, r, y * 12, 'monthly') : null;
  const fromAccount = mode === 'cash' ? prop.value + costs : downC + costs;
  const submit = async () => {
    setError(null);
    if (!(await confirm({
      title: `Comprar ${prop.title}`,
      details: [
        { label: 'Precio', value: formatMoney(prop.value, cur) },
        { label: 'Impuestos y gastos', value: formatMoney(costs, cur) },
        ...(mode === 'mortgage' && sum ? [{ label: 'Hipoteca', value: formatMoney(principal, cur) }, { label: 'Cuota mensual', value: formatMoney(sum.installment, cur) }] : []),
        { label: 'Pagas hoy', value: formatMoney(fromAccount, cur) },
      ],
      confirmLabel: 'Firmar compra',
    }))) return;
    const res = run('property/buy', { propertyId: prop.id, accountId, financing: mode === 'mortgage' ? { downPayment: downC, rate: r, years: y } : null }, { success: '¡Enhorabuena! Ya eres propietario' });
    if (!res.ok) setError(res.message);
  };
  return (
    <Card title="Comprar inmueble">
      <div className="tabular text-[28px] font-semibold text-fg">{formatMoney(prop.value, cur)}</div>
      <div className="text-[12px] text-muted">Renta de mercado estimada {formatMoney(prop.marketRent, cur)}/mes · {formatPct((prop.marketRent * 12) / prop.value, 1, false)} bruta</div>
      <div className="mt-4 space-y-4">
        <Segmented value={mode} onChange={setMode} className="w-full" options={[{ value: 'mortgage', label: 'Con hipoteca' }, { value: 'cash', label: 'Al contado' }]} />
        <Field label="Cuenta de pago">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={p.settings.hideBalances} />}</Field>
        {mode === 'mortgage' && (
          <>
            <Field label="Entrada (mín. 10 %)">{(id) => <MoneyInput id={id} value={down} onChange={setDown} currency={cur} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Interés (TIN %)">{(id) => <Input id={id} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />}</Field>
              <Field label="Plazo (años)">{(id) => <Input id={id} value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>
            </div>
          </>
        )}
        <KeyValue
          items={[
            { label: `Impuestos y gastos (${formatPct(p.settings.propertyPurchaseCostRate, 0, false)})`, value: formatMoney(costs, cur) },
            ...(sum ? [{ label: 'Importe hipoteca', value: formatMoney(principal, cur) }, { label: 'Cuota mensual', value: formatMoney(sum.installment, cur) }, { label: 'Intereses totales', value: formatMoney(sum.totalInterest, cur), tone: 'neg' as const }] : []),
            { label: 'Pagas hoy', value: formatMoney(fromAccount, cur) },
          ]}
        />
        <FormError message={error} />
        <Button block size="lg" onClick={submit} loading={pending} disabled={!accounts.length}>
          Comprar
        </Button>
      </div>
    </Card>
  );
}

function ContractPanel({ contractId }: { contractId: string }) {
  const p = useProfile();
  const fmt = useMoney();
  const c = p.rentals.find((r) => r.id === contractId)!;
  const tenant = p.tenants.find((t) => t.id === c.tenantId);
  const { run, pending } = useOperation();
  const now = tickToDate(p.clock.startAt, p.clock.tick);
  const thisMonth = c.payments.find((x) => x.period === monthKey(now));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">{tenant?.name.split(' ').map((w) => w[0]).join('')}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">{tenant?.name}</div>
          <div className="text-[12px] text-muted">{tenant?.profession} · fiabilidad {Math.round((tenant?.reliability ?? 0) * 100)} %</div>
        </div>
        {c.arrears > 0 ? <Badge tone="neg">Debe {fmt(c.arrears)}</Badge> : <Badge tone="pos">Al corriente</Badge>}
      </div>
      <KeyValue
        className="mt-3"
        items={[
          { label: 'Mensualidad', value: fmt(c.monthlyRent) },
          { label: 'Fianza', value: fmt(c.deposit) },
          { label: 'Día de pago', value: `Día ${c.dueDay}` },
          { label: 'Vigencia', value: `${formatDate(c.startAt)} – ${formatDate(c.endAt)}` },
          { label: 'Este mes', value: thisMonth ? (thisMonth.status === 'paid' ? 'Cobrado' : thisMonth.status === 'unpaid' ? 'Impagado' : 'Cobrado con retraso') : 'Pendiente de vencimiento' },
        ]}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => run('rental/collect', { contractId: c.id }, { success: (v) => `Cobrados ${fmt(v)} de rentas atrasadas` })} disabled={pending || c.arrears <= 0}>
          Cobrar atrasos
        </Button>
        <Button size="sm" variant="secondary" onClick={() => run('rental/default', { contractId: c.id }, { success: 'Impago registrado' })} disabled={pending}>
          Registrar impago
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (await confirm({ title: 'Finalizar contrato', body: `Se devolverá la fianza (${fmt(c.deposit)}), descontando posibles atrasos.`, tone: 'danger', confirmLabel: 'Finalizar' })) run('rental/end', { contractId: c.id }, { success: 'Contrato finalizado' });
          }}
        >
          Finalizar contrato
        </Button>
      </div>
      {c.payments.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[12px] font-semibold text-muted">Historial de rentas</div>
          <div className="flex flex-wrap gap-1.5">
            {c.payments.slice(-12).map((x) => (
              <Badge key={x.id} tone={x.status === 'paid' ? 'pos' : x.status === 'unpaid' ? 'neg' : 'warn'}>
                {x.period} · {x.status === 'paid' ? 'cobrada' : x.status === 'unpaid' ? 'impago' : 'tarde'}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RentalDialog({ prop, onClose }: { prop: Property; onClose: () => void }) {
  const p = useProfile();
  const cur = p.profile.baseCurrency;
  const accounts = openAccounts(p);
  const busy = new Set(p.rentals.filter((r) => r.status === 'active').map((r) => r.tenantId));
  const tenants = p.tenants.filter((t) => !busy.has(t.id));
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '');
  const [rent, setRent] = useState((prop.marketRent / 100).toFixed(0));
  const [months, setMonths] = useState('12');
  const [dueDay, setDueDay] = useState('1');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const rentC = parseMoney(rent) ?? 0;
  const submit = () => {
    if (!rentC) return setError('Mensualidad no válida.');
    const r = run('rental/create', { propertyId: prop.id, tenantId, monthlyRent: rentC, months: Number(months), dueDay: Number(dueDay), accountId }, { success: 'Contrato de alquiler firmado' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Nuevo contrato de alquiler" subtitle={prop.title} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={pending} disabled={!tenantId}>Firmar contrato</Button></>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[13px] font-medium text-muted">Selecciona un inquilino (ficticio)</div>
          <ul className="nx-scroll max-h-80 space-y-2 overflow-y-auto pr-1">
            {tenants.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setTenantId(t.id)} aria-pressed={tenantId === t.id} className={cx('w-full rounded-xl border p-3 text-left', tenantId === t.id ? 'border-accent bg-accent/10' : 'border-line bg-surface-2/60')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-fg">{t.name}</span>
                    <Badge tone={t.reliability > 0.92 ? 'pos' : t.reliability > 0.8 ? 'warn' : 'neg'}>{Math.round(t.reliability * 100)} % fiable</Badge>
                  </div>
                  <div className="mt-1 text-[12px] text-muted">{t.profession} · {t.age} años · ingresos {formatMoney(t.monthlyIncome, cur)}/mes</div>
                  <div className="mt-1 flex items-center gap-3 text-[12px] text-subtle">
                    <span className="flex items-center gap-1"><Users className="size-3.5" /> {t.household}</span>
                    {t.pets && <span className="flex items-center gap-1"><PawPrint className="size-3.5" /> Mascotas</span>}
                    <span className="truncate">{t.bio}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <Field label="Mensualidad" hint={`Renta de mercado: ${formatMoney(prop.marketRent, cur)}`}>{(id) => <MoneyInput id={id} value={rent} onChange={setRent} currency={cur} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duración">
              {(id) => (
                <Select id={id} value={months} onChange={(e) => setMonths(e.target.value)}>
                  {[6, 12, 24, 36, 60].map((m) => (
                    <option key={m} value={m}>{m} meses</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Día de cobro">{(id) => <Input id={id} value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>
          </div>
          <Field label="Cuenta para cobrar">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={p.settings.hideBalances} />}</Field>
          <KeyValue items={[{ label: 'Fianza (2 meses)', value: formatMoney(rentC * 2, cur) }, { label: 'Ingresos anuales', value: formatMoney(rentC * 12, cur), tone: 'pos' }, { label: 'Rentabilidad bruta', value: formatPct((rentC * 12) / prop.value, 2, false) }]} />
          <p className="text-[12px] text-subtle">Cada mes el inquilino paga o incurre en impago según su fiabilidad (determinista por semilla).</p>
          <FormError message={error} />
        </div>
      </div>
    </Modal>
  );
}

function ExpenseDialog({ prop, onClose }: { prop: Property; onClose: () => void }) {
  const p = useProfile();
  const accounts = openAccounts(p);
  const [type, setType] = useState<'repair' | 'maintenance' | 'tax' | 'other'>('repair');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = parseMoney(amount);
    if (!c) return setError('Importe no válido.');
    const r = run('property/expense', { propertyId: prop.id, accountId, type, description, amount: c }, { success: 'Gasto registrado' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Registrar gasto o reparación" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={pending}>Registrar</Button></>}>
      <div className="space-y-4">
        <Segmented value={type} onChange={setType} className="w-full" size="sm" options={[{ value: 'repair', label: 'Reparación' }, { value: 'maintenance', label: 'Mantenimiento' }, { value: 'tax', label: 'Impuesto' }, { value: 'other', label: 'Otro' }]} />
        <Field label="Descripción">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="p. ej. Cambio de caldera" maxLength={160} />}</Field>
        <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={p.profile.baseCurrency} />}</Field>
        <Field label="Pagar desde">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={p.settings.hideBalances} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

function SellDialog({ prop, onClose }: { prop: Property; onClose: () => void }) {
  const p = useProfile();
  const cur = p.profile.baseCurrency;
  const accounts = openAccounts(p);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const costs = saleCosts(p, prop.value);
  const loan = prop.mortgageLoanId ? p.loans.find((l) => l.id === prop.mortgageLoanId && l.status === 'active') : undefined;
  const payoff = loan ? loan.outstanding + loan.overdue : 0;
  const net = prop.value - costs - payoff;
  const gain = prop.value - costs - (prop.purchasePrice ?? 0) - (prop.purchaseCosts ?? 0);
  const submit = async () => {
    if (!(await confirm({ title: 'Confirmar venta', details: [{ label: 'Precio de venta', value: formatMoney(prop.value, cur) }, { label: 'Neto en cuenta', value: formatMoney(net, cur) }], confirmLabel: 'Vender', tone: 'danger' }))) return;
    const r = run('property/sell', { propertyId: prop.id, accountId }, { success: 'Inmueble vendido' });
    if (r.ok) {
      onClose();
      navigate('/realestate');
    } else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Vender inmueble" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" onClick={submit} loading={pending}>Vender</Button></>}>
      <div className="space-y-4">
        <KeyValue
          items={[
            { label: 'Precio de mercado', value: formatMoney(prop.value, cur) },
            { label: `Gastos de venta (${formatPct(p.settings.propertySaleCostRate, 0, false)})`, value: formatMoney(-costs, cur), tone: 'neg' },
            ...(loan ? [{ label: 'Cancelación de hipoteca', value: formatMoney(-payoff, cur), tone: 'neg' as const }] : []),
            { label: 'Neto que recibirás', value: formatMoney(net, cur), tone: net >= 0 ? 'pos' : 'neg' },
            { label: 'Resultado de la inversión', value: formatMoney(gain, cur, { sign: true }), tone: gain >= 0 ? 'pos' : 'neg' },
          ]}
        />
        <Field label="Abonar en">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={p.settings.hideBalances} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}
