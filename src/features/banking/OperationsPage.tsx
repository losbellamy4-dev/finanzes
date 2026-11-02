import { useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, CalendarClock, HandCoins, Pause, Play, Plus, ShoppingBag, Trash2, UserPlus, Users, X } from 'lucide-react';
import type { Category, ScheduledTransfer } from '@/core/schema';
import { formatMoney, parseMoney } from '@/core/money';
import { formatDate, formatDateTime, tickToDate, toDateInput, type Frequency } from '@/core/time';
import { CATEGORY_LABELS } from '@/data/labels';
import { formatIban } from '@/engine/banking';
import { dispatch, useMoney, useOperation, useProfile } from '@/store/hooks';
import { confirm, toast } from '@/store/toast';
import { openMoneyDialog } from './MoneyDialog';
import { AccountSelect, openAccounts } from '@/ui/domain';
import { Modal } from '@/ui/overlays';
import { Badge, Button, Card, EmptyState, Field, FormError, IconButton, Input, MoneyInput, PageHeader, Segmented, Select } from '@/ui/primitives';

const FREQ_LABELS: Record<Frequency, string> = {
  once: 'Una vez',
  daily: 'Diaria',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};
const SCH_KIND: Record<ScheduledTransfer['kind'], string> = { internal: 'Traspaso', external: 'Transferencia externa', income: 'Ingreso recurrente' };
const STATUS: Record<ScheduledTransfer['status'], { label: string; tone: 'pos' | 'warn' | 'neutral' | 'neg' }> = {
  active: { label: 'Activa', tone: 'pos' },
  paused: { label: 'En pausa', tone: 'warn' },
  completed: { label: 'Finalizada', tone: 'neutral' },
  cancelled: { label: 'Cancelada', tone: 'neg' },
};

function ScheduleDialog({ onClose }: { onClose: () => void }) {
  const p = useProfile();
  const accounts = openAccounts(p);
  const now = tickToDate(p.clock.startAt, p.clock.tick);
  const [kind, setKind] = useState<ScheduledTransfer['kind']>('internal');
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '');
  const [toId, setToId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [counterparty, setCounterparty] = useState('');
  const [iban, setIban] = useState('');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [start, setStart] = useState(toDateInput(now));
  const [end, setEnd] = useState('');
  const [occurrences, setOccurrences] = useState('');
  const [category, setCategory] = useState<Category>('transfers');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();

  const submit = () => {
    setError(null);
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return setError('Introduce un importe válido.');
    const occ = occurrences.trim() ? Number(occurrences) : undefined;
    if (occ !== undefined && (!Number.isInteger(occ) || occ < 1)) return setError('Número de repeticiones no válido.');
    const r = run(
      'schedule/create',
      {
        kind,
        fromAccountId: kind !== 'income' ? fromId : undefined,
        toAccountId: kind !== 'external' ? toId : undefined,
        counterparty: kind !== 'internal' ? counterparty : undefined,
        counterpartyIban: kind === 'external' ? iban : undefined,
        amount: cents,
        concept: concept || undefined,
        category: kind === 'income' ? (category === 'transfers' ? 'salary' : category) : category,
        frequency,
        startDate: start,
        endDate: end || undefined,
        occurrences: occ,
      },
      { success: 'Programación creada' },
    );
    if (r.ok) onClose();
    else setError(r.message);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva transferencia programada"
      subtitle="Puntual o periódica. Se ejecuta automáticamente en la fecha simulada."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            Programar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'internal', label: 'Traspaso' }, { value: 'external', label: 'A terceros' }, { value: 'income', label: 'Ingreso (nómina)' }]} className="w-full" />
        {kind !== 'income' && <Field label="Cuenta de origen">{(id) => <AccountSelect id={id} accounts={accounts} value={fromId} onChange={setFromId} hideBalances={p.settings.hideBalances} />}</Field>}
        {kind === 'internal' && <Field label="Cuenta de destino">{(id) => <AccountSelect id={id} accounts={accounts} value={toId} onChange={setToId} exclude={fromId} hideBalances={p.settings.hideBalances} />}</Field>}
        {kind === 'income' && <Field label="Cuenta de abono">{(id) => <AccountSelect id={id} accounts={accounts} value={toId} onChange={setToId} hideBalances={p.settings.hideBalances} />}</Field>}
        {kind !== 'internal' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={kind === 'income' ? 'Pagador' : 'Beneficiario'}>{(id) => <Input id={id} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} maxLength={80} placeholder={kind === 'income' ? 'Empresa Ficticia S.A.' : 'Nombre'} />}</Field>
            {kind === 'external' && <Field label="IBAN">{(id) => <Input id={id} value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="ES00…" />}</Field>}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={p.profile.baseCurrency} />}</Field>
          <Field label="Frecuencia">
            {(id) => (
              <Select id={id} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                {(Object.keys(FREQ_LABELS) as Frequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQ_LABELS[f]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Primera ejecución">{(id) => <Input id={id} type="date" value={start} min={toDateInput(now)} onChange={(e) => setStart(e.target.value)} />}</Field>
          {frequency !== 'once' && <Field label="Fecha de fin (opcional)">{(id) => <Input id={id} type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />}</Field>}
          {frequency !== 'once' && <Field label="Nº de repeticiones (opcional)">{(id) => <Input id={id} value={occurrences} onChange={(e) => setOccurrences(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Sin límite" />}</Field>}
          <Field label="Categoría">
            {(id) => (
              <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {(['transfers', 'salary', 'income', 'savings', 'investments', 'housing', 'utilities', 'subscriptions', 'other'] as Category[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Concepto (opcional)">{(id) => <Input id={id} value={concept} onChange={(e) => setConcept(e.target.value)} maxLength={140} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

function ContactDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [iban, setIban] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const r = run('contact/create', { name, iban }, { success: 'Contacto guardado' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Nuevo contacto" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={pending}>Guardar</Button></>}>
      <div className="space-y-4">
        <Field label="Nombre">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}</Field>
        <Field label="IBAN (ficticio)">{(id) => <Input id={id} value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="ES00…" />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export default function OperationsPage() {
  const p = useProfile();
  const fmt = useMoney();
  const [scheduling, setScheduling] = useState(false);
  const [contact, setContact] = useState(false);
  const accName = (id?: string) => p.accounts.find((a) => a.id === id)?.name ?? '—';
  const actions = [
    { l: 'Ingresar', i: Banknote, m: 'deposit' as const },
    { l: 'Retirar', i: ArrowUpRight, m: 'withdraw' as const },
    { l: 'Traspasar', i: ArrowLeftRight, m: 'transfer' as const },
    { l: 'Enviar', i: ArrowUpRight, m: 'send' as const },
    { l: 'Recibir', i: ArrowDownLeft, m: 'receive' as const },
    { l: 'Pagar', i: ShoppingBag, m: 'pay' as const },
    { l: 'Solicitar', i: HandCoins, m: 'request' as const },
  ];
  const scheduled = [...p.scheduled].sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1));

  return (
    <div>
      <PageHeader title="Operaciones" subtitle="Mueve dinero, programa transferencias y gestiona solicitudes y contactos." actions={<Button icon={<CalendarClock className="size-4" />} onClick={() => setScheduling(true)} disabled={!p.accounts.some((a) => a.status === 'open')}>Programar</Button>} />
      <div className="mb-5 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {actions.map((a) => (
          <button key={a.l} type="button" onClick={() => openMoneyDialog(a.m)} className="nx-card flex flex-col items-center gap-2 py-4 text-[12.5px] font-medium text-muted hover:text-fg">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-accent/12 text-accent">
              <a.i className="size-5" />
            </span>
            {a.l}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Transferencias programadas y periódicas" subtitle="Incluye ingresos recurrentes como la nómina" action={<Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setScheduling(true)}>Nueva</Button>}>
          {scheduled.length === 0 ? (
            <EmptyState icon={<CalendarClock className="size-5" />} title="Sin programaciones" body="Programa traspasos, pagos a terceros o una nómina mensual." />
          ) : (
            <ul className="divide-y divide-line">
              {scheduled.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-fg">{s.concept}</span>
                      <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-muted">
                      {SCH_KIND[s.kind]} · {FREQ_LABELS[s.frequency]} ·{' '}
                      {s.kind === 'internal' ? `${accName(s.fromAccountId)} → ${accName(s.toAccountId)}` : s.kind === 'external' ? `${accName(s.fromAccountId)} → ${s.counterparty}` : `${s.counterparty} → ${accName(s.toAccountId)}`}
                    </div>
                    <div className="mt-0.5 text-[12px] text-subtle">
                      {s.status === 'active' || s.status === 'paused' ? `Próxima: ${formatDate(s.nextAt)}` : s.lastRunAt ? `Última: ${formatDate(s.lastRunAt)}` : ''} · {s.executions} ejecutadas{s.failures ? ` · ${s.failures} fallidas` : ''}
                    </div>
                  </div>
                  <span className="tabular text-sm font-semibold text-fg">{fmt(s.amount)}</span>
                  {(s.status === 'active' || s.status === 'paused') && (
                    <div className="flex">
                      <IconButton label={s.status === 'active' ? 'Pausar' : 'Reanudar'} onClick={() => { const r = dispatch('schedule/status', { scheduleId: s.id, status: s.status === 'active' ? 'paused' : 'active' }); if (!r.ok) toast.error(r.error.message); }}>
                        {s.status === 'active' ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </IconButton>
                      <IconButton
                        label="Cancelar programación"
                        onClick={async () => {
                          if (await confirm({ title: 'Cancelar programación', body: s.concept, tone: 'danger', confirmLabel: 'Cancelar programación' })) {
                            dispatch('schedule/status', { scheduleId: s.id, status: 'cancelled' });
                            toast.success('Programación cancelada');
                          }
                        }}
                      >
                        <X className="size-4" />
                      </IconButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4 sm:space-y-5">
          <Card title="Solicitudes de dinero" action={<Button size="sm" variant="secondary" onClick={() => openMoneyDialog('request')}>Solicitar</Button>}>
            {p.requests.length === 0 ? (
              <p className="text-sm text-muted">Pide dinero a tus contactos ficticios; responderán en unas horas simuladas.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.requests.slice(0, 12).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{r.contactName}</div>
                      <div className="truncate text-[12px] text-muted">{r.concept} · {formatDateTime(r.createdAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="tabular text-sm font-semibold text-fg">{formatMoney(r.amount, p.accounts.find((a) => a.id === r.toAccountId)?.currency ?? p.profile.baseCurrency)}</div>
                      <Badge tone={r.status === 'paid' ? 'pos' : r.status === 'pending' ? 'warn' : 'neg'}>{r.status === 'paid' ? 'Pagada' : r.status === 'pending' ? 'Pendiente' : r.status === 'declined' ? 'Rechazada' : 'Cancelada'}</Badge>
                    </div>
                    {r.status === 'pending' && (
                      <IconButton label="Cancelar solicitud" onClick={() => dispatch('request/cancel', { requestId: r.id })}>
                        <X className="size-4" />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Contactos" action={<Button size="sm" variant="secondary" icon={<UserPlus className="size-4" />} onClick={() => setContact(true)}>Añadir</Button>}>
            {p.contacts.length === 0 ? (
              <EmptyState icon={<Users className="size-5" />} title="Sin contactos" body="Guarda beneficiarios ficticios para enviar dinero más rápido." />
            ) : (
              <ul className="divide-y divide-line">
                {p.contacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-fg">{c.name.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{c.name}</div>
                      <div className="tabular truncate text-[12px] text-muted">{formatIban(c.iban)}</div>
                    </div>
                    <IconButton label="Eliminar contacto" onClick={async () => { if (await confirm({ title: `Eliminar a ${c.name}`, tone: 'danger', confirmLabel: 'Eliminar' })) dispatch('contact/delete', { contactId: c.id }); }}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {scheduling && <ScheduleDialog onClose={() => setScheduling(false)} />}
      {contact && <ContactDialog onClose={() => setContact(false)} />}
    </div>
  );
}
