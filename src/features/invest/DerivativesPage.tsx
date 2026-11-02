import { useMemo, useState } from 'react';
import { formatMoney, formatPrice, formatQty } from '@/core/money';
import { formatDate, tickToDate } from '@/core/time';
import { derivativeValue, optionQuote } from '@/engine/derivatives';
import { useMoney, useOperation, useProfile } from '@/store/hooks';
import { confirm } from '@/store/toast';
import { AccountSelect, openAccounts } from '@/ui/domain';
import { Badge, Button, Card, EmptyState, Field, FormError, Input, KeyValue, PageHeader, Segmented, Select } from '@/ui/primitives';
import { InvestTabs, RegimeBadge } from './shared';

export default function DerivativesPage() {
  const p = useProfile();
  const fmt = useMoney();
  const open = p.portfolio.derivatives.filter((d) => d.status === 'open');
  const closed = p.portfolio.derivatives.filter((d) => d.status !== 'open').slice().reverse();
  const { run, pending } = useOperation();
  return (
    <div>
      <PageHeader title="Derivados simulados" subtitle="Opciones europeas y futuros con apalancamiento. Alto riesgo, solo con fines educativos." actions={<RegimeBadge p={p} />} />
      <InvestTabs />
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <OptionForm />
        <FutureForm />
      </div>
      <Card title={`Posiciones abiertas (${open.length})`}>
        {open.length === 0 ? (
          <EmptyState title="Sin derivados abiertos" body="Las opciones se valoran con Black-Scholes y los futuros por diferencias con margen." />
        ) : (
          <ul className="divide-y divide-line">
            {open.map((d) => {
              const value = derivativeValue(p, d);
              const pnl = value - d.margin;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-fg">{d.symbol}</span>
                      <Badge tone={d.kind === 'option' ? 'accent' : 'warn'}>{d.kind === 'option' ? 'Opción' : 'Futuro'}</Badge>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {formatQty(d.quantity)} uds · entrada {formatPrice(d.entryPrice, p.profile.baseCurrency)} · vence {formatDate(tickToDate(p.clock.startAt, d.expiryTick))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-sm font-semibold text-fg">{fmt(value)}</div>
                    <div className={`tabular text-[12px] ${pnl >= 0 ? 'text-pos' : 'text-neg'}`}>{fmt(pnl, { sign: true })}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={async () => {
                      if (await confirm({ title: `Cerrar ${d.symbol}`, details: [{ label: 'Valor de liquidación', value: fmt(value) }, { label: 'Resultado', value: fmt(pnl, { sign: true }) }], confirmLabel: 'Cerrar posición' })) {
                        run('deriv/close', { derivativeId: d.id }, { success: 'Posición cerrada' });
                      }
                    }}
                  >
                    Cerrar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {closed.length > 0 && (
        <Card className="mt-5" title="Historial de derivados">
          <ul className="divide-y divide-line">
            {closed.slice(0, 30).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-fg">{d.symbol}</div>
                  <div className="text-[12px] text-muted">{d.status === 'expired' ? 'Vencida' : d.status === 'liquidated' ? 'Liquidada por margen' : 'Cerrada'} · {d.closedAt ? formatDate(d.closedAt) : ''}</div>
                </div>
                <span className={`tabular font-semibold ${(d.realizedPnL ?? 0) >= 0 ? 'text-pos' : 'text-neg'}`}>{fmt(d.realizedPnL ?? 0, { sign: true })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function UnderlyingSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const p = useProfile();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {p.market.assets.map((a) => (
        <option key={a.id} value={a.id}>
          {a.symbol} · {a.name} · {formatPrice(a.price, p.profile.baseCurrency)}
        </option>
      ))}
    </Select>
  );
}

function OptionForm() {
  const p = useProfile();
  const cur = p.profile.baseCurrency;
  const accounts = openAccounts(p);
  const [underlyingId, setUnderlying] = useState('ast_nx100');
  const u = p.market.assets.find((a) => a.id === underlyingId) ?? p.market.assets[0];
  const [type, setType] = useState<'call' | 'put'>('call');
  const [strike, setStrike] = useState(() => String(Math.round(u.price)));
  const [days, setDays] = useState('30');
  const [qty, setQty] = useState('1');
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type === 'investment')?.id ?? accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const k = Number(strike.replace(',', '.'));
  const d = Number(days);
  const q = Number(qty.replace(',', '.'));
  const premium = useMemo(() => (k > 0 && d > 0 ? optionQuote(p, u.id, type, k, d) : 0), [p, u.id, type, k, d]);
  const cost = Math.round(premium * (q > 0 ? q : 0) * 100);

  const submit = async () => {
    setError(null);
    if (!(await confirm({ title: `Comprar ${type === 'call' ? 'CALL' : 'PUT'} sobre ${u.symbol}`, details: [{ label: 'Prima unitaria', value: formatPrice(premium, cur) }, { label: 'Coste total', value: formatMoney(cost, cur) }], body: 'Puedes perder la totalidad de la prima.', confirmLabel: 'Comprar opción' }))) return;
    const r = run('deriv/option', { underlyingId: u.id, optionType: type, strike: k, days: d, quantity: q, accountId }, { success: 'Opción comprada' });
    if (!r.ok) setError(r.message);
  };

  return (
    <Card title="Comprar opción" subtitle="Europea, liquidación por diferencias">
      <div className="space-y-3">
        <Field label="Subyacente">{(id) => <UnderlyingSelect id={id} value={u.id} onChange={(v) => { setUnderlying(v); const a = p.market.assets.find((x) => x.id === v); if (a) setStrike(String(Number(a.price.toPrecision(4)))); }} />}</Field>
        <Segmented value={type} onChange={setType} className="w-full" options={[{ value: 'call', label: 'CALL (alcista)' }, { value: 'put', label: 'PUT (bajista)' }]} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Strike">{(id) => <Input id={id} value={strike} onChange={(e) => setStrike(e.target.value)} inputMode="decimal" />}</Field>
          <Field label="Días">{(id) => <Input id={id} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>
          <Field label="Contratos">{(id) => <Input id={id} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />}</Field>
        </div>
        <Field label="Cuenta">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={p.settings.hideBalances} />}</Field>
        <KeyValue items={[{ label: 'Prima por unidad', value: formatPrice(premium, cur) }, { label: 'Coste total', value: formatMoney(cost, cur) }]} />
        <FormError message={error} />
        <Button block onClick={submit} loading={pending} disabled={!accounts.length || cost <= 0}>
          Comprar opción
        </Button>
      </div>
    </Card>
  );
}

function FutureForm() {
  const p = useProfile();
  const cur = p.profile.baseCurrency;
  const accounts = openAccounts(p);
  const [underlyingId, setUnderlying] = useState('ast_nxc');
  const u = p.market.assets.find((a) => a.id === underlyingId) ?? p.market.assets[0];
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [qty, setQty] = useState('0,05');
  const [leverage, setLeverage] = useState('5');
  const [days, setDays] = useState('30');
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type === 'investment')?.id ?? accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const q = Number(qty.replace(',', '.'));
  const lev = Number(leverage);
  const notional = Math.round(u.price * (q > 0 ? q : 0) * 100);
  const margin = lev > 0 ? Math.ceil(notional / lev) : 0;
  const liqMove = lev > 0 ? 1 / lev : 0;

  const submit = async () => {
    setError(null);
    if (!(await confirm({ title: `Abrir futuro ${direction === 'long' ? 'largo' : 'corto'} en ${u.symbol}`, details: [{ label: 'Nocional', value: formatMoney(notional, cur) }, { label: 'Margen', value: formatMoney(margin, cur) }, { label: 'Liquidación aprox.', value: `${direction === 'long' ? '−' : '+'}${(liqMove * 100).toFixed(1)} %` }], confirmLabel: 'Abrir futuro', tone: 'danger' }))) return;
    const r = run('deriv/future', { underlyingId: u.id, direction, quantity: q, leverage: lev, days: Number(days), accountId }, { success: 'Futuro abierto' });
    if (!r.ok) setError(r.message);
  };

  return (
    <Card title="Abrir futuro" subtitle="Posición apalancada con margen">
      <div className="space-y-3">
        <Field label="Subyacente">{(id) => <UnderlyingSelect id={id} value={u.id} onChange={setUnderlying} />}</Field>
        <Segmented value={direction} onChange={setDirection} className="w-full" options={[{ value: 'long', label: 'Largo (sube)' }, { value: 'short', label: 'Corto (baja)' }]} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Unidades">{(id) => <Input id={id} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />}</Field>
          <Field label="Apalanc.">
            {(id) => (
              <Select id={id} value={leverage} onChange={(e) => setLeverage(e.target.value)}>
                {[1, 2, 3, 5, 10, 20, 50].map((l) => (
                  <option key={l} value={l}>
                    x{l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Días">{(id) => <Input id={id} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>
        </div>
        <Field label="Cuenta">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={p.settings.hideBalances} />}</Field>
        <KeyValue items={[{ label: 'Nocional', value: formatMoney(notional, cur) }, { label: 'Margen requerido', value: formatMoney(margin, cur) }, { label: 'Liquidación si el precio se mueve', value: `${(liqMove * 100).toFixed(1)} % en contra` }]} />
        <FormError message={error} />
        <Button block variant="outline" onClick={submit} loading={pending} disabled={!accounts.length || margin <= 0}>
          Abrir futuro
        </Button>
      </div>
    </Card>
  );
}
