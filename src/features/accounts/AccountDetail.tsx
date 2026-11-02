import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, Banknote, Copy, Pencil, ShoppingBag, Star, Trash2 } from 'lucide-react';
import { formatDate } from '@/core/time';
import { countryName } from '@/data/labels';
import { ACCOUNT_TYPE_LABELS, formatIban } from '@/engine/banking';
import { accountBalanceSeries, accountHistory } from '@/engine/selectors';
import { dispatch, useMoney, useProfile } from '@/store/hooks';
import { toast } from '@/store/toast';
import { Link } from '@/app/router';
import { openMoneyDialog } from '@/features/banking/MoneyDialog';
import { TimeSeriesChart } from '@/ui/charts';
import { Badge, Button, Card, cx, EmptyState, Input, KeyValue, PageHeader, Segmented } from '@/ui/primitives';
import { TxRow } from '@/ui/domain';
import { CloseAccountDialog, EditAccountDialog } from './AccountDialogs';

type Filter = 'all' | 'in' | 'out';

export default function AccountDetail({ params }: { params: Record<string, string> }) {
  const p = useProfile();
  const fmt = useMoney();
  const acc = p.accounts.find((a) => a.id === params.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(30);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);

  const history = useMemo(() => (acc ? accountHistory(p, acc.id) : []), [p, acc]);
  const series = useMemo(() => (acc ? accountBalanceSeries(p, acc.id).map((x) => ({ t: Date.parse(x.at), v: x.v })) : []), [p, acc]);
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return history.filter((h) => (filter === 'all' || (filter === 'in' ? h.signed > 0 : h.signed < 0)) && (!qq || h.tx.concept.toLowerCase().includes(qq)));
  }, [history, filter, q]);

  if (!acc) return <EmptyState title="Cuenta no encontrada" action={<Link to="/accounts" className="text-accent">Volver a cuentas</Link>} />;
  const isOpen = acc.status === 'open';
  const totalIn = history.reduce((a, h) => a + Math.max(0, h.signed), 0);
  const totalOut = history.reduce((a, h) => a + Math.min(0, h.signed), 0);

  return (
    <div>
      <PageHeader
        back={
          <Link to="/accounts" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Cuentas
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: acc.color }} />
            {acc.name}
            {!isOpen && <Badge tone="neg">Cerrada</Badge>}
          </span>
        }
        subtitle={`${ACCOUNT_TYPE_LABELS[acc.type]} · ${acc.currency} · ${countryName(acc.country)}`}
        actions={
          isOpen && (
            <>
              <Button variant="ghost" icon={<Star className={cx('size-4', acc.favorite && 'fill-warn text-warn')} />} onClick={() => dispatch('account/update', { accountId: acc.id, favorite: !acc.favorite })}>
                {acc.favorite ? 'Favorita' : 'Favorita'}
              </Button>
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Editar
              </Button>
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setClosing(true)}>
                Cerrar
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="text-[13px] font-medium text-muted">Saldo disponible</p>
          <p className={cx('tabular mt-1 text-[34px] font-semibold tracking-tight', acc.balance < 0 ? 'text-neg' : 'text-fg')} data-testid="account-balance">
            {fmt(acc.balance, { currency: acc.currency })}
          </p>
          {isOpen && (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                { l: 'Ingresar', i: Banknote, m: 'deposit' as const },
                { l: 'Retirar', i: ArrowUpRight, m: 'withdraw' as const },
                { l: 'Traspasar', i: ArrowLeftRight, m: 'transfer' as const },
                { l: 'Enviar', i: ArrowUpRight, m: 'send' as const },
                { l: 'Recibir', i: ArrowDownLeft, m: 'receive' as const },
                { l: 'Pagar', i: ShoppingBag, m: 'pay' as const },
              ].map((b) => (
                <button key={b.l} type="button" onClick={() => openMoneyDialog(b.m, acc.id)} className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface-2 py-3 text-[12px] font-medium text-muted hover:border-accent/40 hover:text-fg">
                  <b.i className="size-5 text-accent" />
                  {b.l}
                </button>
              ))}
            </div>
          )}
          <div className="mt-5">
            <TimeSeriesChart data={series} height={200} format={(v) => fmt(v, { currency: acc.currency })} label="Saldo" tone="accent" />
          </div>
        </Card>
        <Card title="Datos de la cuenta" subtitle="Identificadores ficticios, no operativos">
          <KeyValue
            items={[
              {
                label: 'IBAN',
                value: (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-[13px] hover:text-accent"
                    onClick={() => {
                      void navigator.clipboard?.writeText(acc.iban).then(() => toast.success('IBAN copiado'));
                    }}
                  >
                    {formatIban(acc.iban)} <Copy className="size-3.5" />
                  </button>
                ),
              },
              { label: 'Número', value: acc.number },
              { label: 'Titular', value: acc.holder },
              { label: 'Apertura', value: formatDate(acc.openedAt) },
              { label: 'Interés', value: acc.interestRate > 0 ? `${(acc.interestRate * 100).toFixed(2)} % TIN` : '—' },
              { label: 'Descubierto', value: acc.overdraftLimit > 0 ? fmt(acc.overdraftLimit, { currency: acc.currency }) : 'No' },
              { label: 'Entradas', value: fmt(totalIn, { currency: acc.currency }), tone: 'pos' },
              { label: 'Salidas', value: fmt(totalOut, { currency: acc.currency }) },
            ]}
          />
        </Card>
      </div>
      <Card className="mt-5" title={`Movimientos (${history.length})`} action={<Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todos' }, { value: 'in', label: 'Entradas' }, { value: 'out', label: 'Salidas' }]} />}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por concepto…" aria-label="Buscar movimientos" className="mb-2" />
        {filtered.length === 0 ? (
          <EmptyState title="Sin movimientos" body="Los movimientos de esta cuenta aparecerán aquí." />
        ) : (
          <>
            <div className="divide-y divide-line">
              {filtered.slice(0, limit).map((h) => (
                <TxRow key={h.tx.id} tx={h.tx} signed={h.signed} currency={acc.currency} hide={p.settings.hideBalances} />
              ))}
            </div>
            {filtered.length > limit && (
              <div className="mt-3 text-center">
                <Button variant="ghost" onClick={() => setLimit((l) => l + 50)}>
                  Cargar más
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      {editing && <EditAccountDialog account={acc} open onClose={() => setEditing(false)} />}
      {closing && <CloseAccountDialog account={acc} open onClose={() => setClosing(false)} />}
    </div>
  );
}
