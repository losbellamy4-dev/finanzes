import { useMemo, useState } from 'react';
import { ArrowLeft, Ban, Eye, EyeOff, Gauge, Palette, Receipt, ShoppingBag, Snowflake, Sun, Upload, Wallet, Download } from 'lucide-react';
import { formatDate } from '@/core/time';
import { CARD_TYPE_LABELS, cardAvailable, cardSpending } from '@/engine/cards';
import { dispatch, useMoney, useProfile } from '@/store/hooks';
import { confirm, toast } from '@/store/toast';
import { Link, navigate } from '@/app/router';
import { BankCardVisual } from '@/ui/BankCard';
import { TimeSeriesChart } from '@/ui/charts';
import { TxRow } from '@/ui/domain';
import { Badge, Button, Card, EmptyState, KeyValue, PageHeader, Progress, Select } from '@/ui/primitives';
import { EditCardDialog, LimitsDialog, LoadCardDialog, PayCardDialog, PurchaseDialog } from './CardDialogs';

type Dialog = null | 'purchase' | 'pay' | 'load' | 'unload' | 'limits' | 'edit';

export default function CardDetail({ params }: { params: Record<string, string> }) {
  const p = useProfile();
  const fmt = useMoney();
  const card = p.cards.find((c) => c.id === params.id);
  const [reveal, setReveal] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const txs = useMemo(() => p.transactions.filter((t) => t.cardId === params.id).reverse(), [p.transactions, params.id]);
  if (!card) return <EmptyState title="Tarjeta no encontrada" action={<Link to="/cards" className="text-accent">Volver</Link>} />;
  const cur = p.accounts.find((a) => a.id === card.accountId)?.currency ?? p.profile.baseCurrency;
  const spent = cardSpending(p, card.id);
  const active = card.status !== 'cancelled';
  const m = (c: number) => fmt(c, { currency: cur });
  const debtSeries = card.debtHistory.map((d) => ({ t: Date.parse(d.at), v: d.balance }));
  if (card.type === 'credit') debtSeries.push({ t: Date.parse(p.clock.startAt) + p.clock.tick * 3_600_000, v: card.balance });

  const toggleReveal = async () => {
    if (!reveal && !(await confirm({ title: 'Mostrar datos de la tarjeta', body: 'Se mostrarán el número completo, el CVV y el PIN ficticios. No sirven para pagos reales.', confirmLabel: 'Mostrar' }))) return;
    setReveal((v) => !v);
  };

  return (
    <div>
      <PageHeader
        back={
          <Link to="/cards" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Tarjetas
          </Link>
        }
        title={card.name}
        subtitle={`${CARD_TYPE_LABELS[card.type]} · vinculada a ${p.accounts.find((a) => a.id === card.accountId)?.name ?? '—'}`}
        actions={
          <Badge tone={card.status === 'active' ? 'pos' : card.status === 'frozen' ? 'accent' : 'neg'}>{card.status === 'active' ? 'Activa' : card.status === 'frozen' ? 'Congelada' : 'Cancelada'}</Badge>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-4">
          <BankCardVisual card={card} reveal={reveal} />
          <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="text-sm">
              <div className="text-muted">PIN ficticio</div>
              <div className="tabular font-semibold tracking-[0.3em] text-fg">{reveal ? card.pin : '••••'}</div>
            </div>
            <Button size="sm" variant="secondary" icon={reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onClick={toggleReveal}>
              {reveal ? 'Ocultar datos' : 'Ver datos'}
            </Button>
          </div>
          {active && (
            <div className="grid grid-cols-3 gap-2">
              <ActionBtn icon={ShoppingBag} label="Simular compra" onClick={() => setDialog('purchase')} disabled={card.status === 'frozen'} />
              {card.type === 'credit' && <ActionBtn icon={Receipt} label="Pagar deuda" onClick={() => setDialog('pay')} disabled={card.balance <= 0} />}
              {card.type === 'prepaid' && <ActionBtn icon={Upload} label="Recargar" onClick={() => setDialog('load')} />}
              {card.type === 'prepaid' && <ActionBtn icon={Download} label="Descargar" onClick={() => setDialog('unload')} disabled={card.balance <= 0} />}
              <ActionBtn
                icon={card.status === 'frozen' ? Sun : Snowflake}
                label={card.status === 'frozen' ? 'Descongelar' : 'Congelar'}
                onClick={() => {
                  dispatch('card/freeze', { cardId: card.id, frozen: card.status !== 'frozen' });
                  toast.info(card.status === 'frozen' ? 'Tarjeta descongelada' : 'Tarjeta congelada');
                }}
              />
              <ActionBtn icon={Gauge} label="Límites" onClick={() => setDialog('limits')} />
              <ActionBtn icon={Palette} label="Diseño" onClick={() => setDialog('edit')} />
              <ActionBtn
                icon={Ban}
                label="Cancelar"
                danger
                onClick={async () => {
                  if (!(await confirm({ title: 'Cancelar tarjeta', body: card.type === 'prepaid' ? 'El saldo restante se devolverá a la cuenta vinculada.' : 'La tarjeta dejará de funcionar de forma permanente.', tone: 'danger', confirmLabel: 'Cancelar tarjeta' }))) return;
                  const r = dispatch('card/cancel', { cardId: card.id });
                  if (r.ok) {
                    toast.success('Tarjeta cancelada');
                    navigate('/cards');
                  } else toast.error('No se puede cancelar', r.error.message);
                }}
              />
            </div>
          )}
        </div>
        <div className="space-y-5">
          <Card title={card.type === 'credit' ? 'Crédito' : 'Saldo y límites'}>
            {card.type === 'credit' ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div><div className="text-[12px] text-muted">Utilizado</div><div className="tabular text-lg font-semibold text-fg">{m(card.balance)}</div></div>
                  <div><div className="text-[12px] text-muted">Disponible</div><div className="tabular text-lg font-semibold text-pos">{m(cardAvailable(p, card))}</div></div>
                  <div><div className="text-[12px] text-muted">Límite</div><div className="tabular text-lg font-semibold text-fg">{m(card.creditLimit)}</div></div>
                </div>
                <Progress className="mt-3" value={card.creditLimit ? card.balance / card.creditLimit : 0} label="Uso del crédito" />
                <KeyValue
                  className="mt-3"
                  items={[
                    { label: 'TAE simulada', value: `${(card.apr * 100).toFixed(2)} %` },
                    { label: 'Día de cierre', value: `Día ${card.closingDay} de cada mes` },
                    { label: 'Último extracto', value: card.lastStatementAt ? `${formatDate(card.lastStatementAt)} · ${m(card.statementBalance)}` : 'Aún sin extractos' },
                    { label: 'Pago mínimo', value: m(Math.max(0, card.minimumDue - card.paidSinceStatement)) },
                    { label: 'Fecha límite de pago', value: card.dueAt ? formatDate(card.dueAt) : '—' },
                    { label: 'Intereses cargados', value: m(card.interestCharged), tone: card.interestCharged ? 'neg' : undefined },
                    { label: 'Comisiones', value: m(card.feesCharged), tone: card.feesCharged ? 'neg' : undefined },
                    { label: 'Pagos tardíos', value: String(card.latePayments) },
                    {
                      label: 'Pago automático',
                      value: active ? (
                        <Select aria-label="Pago automático" value={card.autopay} onChange={(e) => dispatch('card/autopay', { cardId: card.id, mode: e.target.value as typeof card.autopay })} className="h-8 w-36 text-[13px]">
                          <option value="full">Total</option>
                          <option value="minimum">Mínimo</option>
                          <option value="none">Manual</option>
                        </Select>
                      ) : (
                        card.autopay
                      ),
                    },
                  ]}
                />
              </>
            ) : (
              <KeyValue
                items={[
                  { label: card.type === 'prepaid' ? 'Saldo de la tarjeta' : 'Saldo de la cuenta', value: m(cardAvailable(p, card)) },
                  { label: 'Gastado hoy', value: `${m(spent.today)} de ${m(card.dailyLimit)}` },
                  { label: 'Gastado este mes', value: `${m(spent.month)} de ${m(card.monthlyLimit)}` },
                  { label: 'Emitida', value: formatDate(card.createdAt) },
                ]}
              />
            )}
            {card.type === 'credit' && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-muted">Gastado hoy</div><div className="tabular font-medium text-fg">{m(spent.today)} / {m(card.dailyLimit)}</div></div>
                <div><div className="text-muted">Gastado este mes</div><div className="tabular font-medium text-fg">{m(spent.month)} / {m(card.monthlyLimit)}</div></div>
              </div>
            )}
          </Card>
          {card.type === 'credit' && (
            <Card title="Historial de deuda" subtitle="Saldo dispuesto en cada cierre de extracto">
              <TimeSeriesChart data={debtSeries} height={170} format={m} label="Deuda" tone="neg" />
            </Card>
          )}
          <Card title={`Movimientos de la tarjeta (${txs.length})`}>
            {txs.length === 0 ? (
              <EmptyState icon={<Wallet className="size-5" />} title="Sin movimientos" body="Simula una compra para ver cómo afecta al saldo." />
            ) : (
              <div className="divide-y divide-line">
                {txs.slice(0, 60).map((t) => (
                  <TxRow key={t.id} tx={t} hide={p.settings.hideBalances} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      {dialog === 'purchase' && <PurchaseDialog card={card} onClose={() => setDialog(null)} />}
      {dialog === 'pay' && <PayCardDialog card={card} onClose={() => setDialog(null)} />}
      {(dialog === 'load' || dialog === 'unload') && <LoadCardDialog card={card} mode={dialog} onClose={() => setDialog(null)} />}
      {dialog === 'limits' && <LimitsDialog card={card} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && <EditCardDialog card={card} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, disabled, danger }: { icon: typeof Eye; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface py-3 text-[12px] font-medium transition-colors disabled:opacity-40 ${danger ? 'text-neg hover:bg-neg/10' : 'text-muted hover:text-fg hover:bg-surface-2'}`}
    >
      <Icon className={`size-5 ${danger ? '' : 'text-accent'}`} />
      {label}
    </button>
  );
}
