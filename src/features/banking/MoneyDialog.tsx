import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Category } from '@/core/schema';
import { formatMoney, parseMoney } from '@/core/money';
import { CATEGORY_LABELS, SPENDING_CATEGORIES } from '@/data/labels';
import { formatIban } from '@/engine/banking';
import { useOperation, useProfile } from '@/store/hooks';
import { confirm } from '@/store/toast';
import { Button, Field, FormError, Input, MoneyInput, Segmented, Select } from '@/ui/primitives';
import { AccountSelect, openAccounts } from '@/ui/domain';
import { Modal } from '@/ui/overlays';

export type MoneyMode = 'deposit' | 'withdraw' | 'transfer' | 'send' | 'receive' | 'pay' | 'request';

const TITLES: Record<MoneyMode, string> = {
  deposit: 'Ingresar dinero',
  withdraw: 'Retirar dinero',
  transfer: 'Transferir entre cuentas',
  send: 'Enviar dinero',
  receive: 'Recibir dinero',
  pay: 'Realizar un pago',
  request: 'Solicitar dinero',
};

const SUBMIT: Record<MoneyMode, string> = {
  deposit: 'Ingresar',
  withdraw: 'Retirar',
  transfer: 'Transferir',
  send: 'Enviar',
  receive: 'Registrar cobro',
  pay: 'Pagar',
  request: 'Enviar solicitud',
};

/* Estado global para abrir el diálogo desde cualquier pantalla. */
let current: { mode: MoneyMode; accountId?: string } | null = null;
const subs = new Set<() => void>();
export function openMoneyDialog(mode: MoneyMode, accountId?: string) {
  current = { mode, accountId };
  subs.forEach((l) => l());
}
function closeMoneyDialog() {
  current = null;
  subs.forEach((l) => l());
}

export function MoneyDialogHost() {
  const req = useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    () => current,
  );
  if (!req) return null;
  return <MoneyDialog key={`${req.mode}-${req.accountId}`} initialMode={req.mode} initialAccount={req.accountId} onClose={closeMoneyDialog} />;
}

const BIG_OPERATION = 100_000;

function MoneyDialog({ initialMode, initialAccount, onClose }: { initialMode: MoneyMode; initialAccount?: string; onClose: () => void }) {
  const p = useProfile();
  const accounts = openAccounts(p);
  const hide = p.settings.hideBalances;
  const [mode, setMode] = useState<MoneyMode>(initialMode);
  const [accountId, setAccountId] = useState(initialAccount ?? accounts[0]?.id ?? '');
  const [toId, setToId] = useState(accounts.find((a) => a.id !== (initialAccount ?? accounts[0]?.id))?.id ?? '');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [name, setName] = useState('');
  const [iban, setIban] = useState('');
  const [contactId, setContactId] = useState('');
  const [saveContact, setSaveContact] = useState(true);
  const [category, setCategory] = useState<Category>('groceries');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();

  const account = accounts.find((a) => a.id === accountId);
  const cur = account?.currency ?? p.profile.baseCurrency;

  useEffect(() => {
    if (toId === accountId) setToId(accounts.find((a) => a.id !== accountId)?.id ?? '');
  }, [accountId, toId, accounts]);

  useEffect(() => {
    const c = p.contacts.find((x) => x.id === contactId);
    if (c) {
      setName(c.name);
      setIban(c.iban);
    }
  }, [contactId, p.contacts]);

  const modes = useMemo(
    () =>
      [
        { value: 'deposit', label: 'Ingresar' },
        { value: 'withdraw', label: 'Retirar' },
        { value: 'transfer', label: 'Traspaso' },
        { value: 'send', label: 'Enviar' },
        { value: 'receive', label: 'Recibir' },
        { value: 'pay', label: 'Pagar' },
        { value: 'request', label: 'Solicitar' },
      ] as { value: MoneyMode; label: string }[],
    [],
  );

  if (accounts.length === 0) {
    return (
      <Modal open onClose={onClose} title={TITLES[mode]}>
        <p className="text-sm text-muted">Primero necesitas abrir una cuenta bancaria simulada.</p>
      </Modal>
    );
  }

  const submit = async () => {
    setError(null);
    const cents = parseMoney(amount);
    if (cents === null || cents <= 0) {
      setError('Introduce un importe válido mayor que cero.');
      return;
    }
    if (mode === 'transfer' && !toId) {
      setError('Necesitas otra cuenta abierta para hacer un traspaso.');
      return;
    }
    const needsConfirm = mode === 'send' || (cents >= BIG_OPERATION && ['withdraw', 'transfer', 'pay'].includes(mode));
    if (needsConfirm) {
      const ok = await confirm({
        title: `Confirmar: ${TITLES[mode].toLowerCase()}`,
        details: [
          { label: 'Importe', value: formatMoney(cents, cur) },
          { label: 'Desde', value: account?.name ?? '' },
          ...(mode === 'transfer' ? [{ label: 'Hacia', value: accounts.find((a) => a.id === toId)?.name ?? '' }] : []),
          ...(mode === 'send' ? [{ label: 'Beneficiario', value: `${name} · ${formatIban(iban.replace(/\s/g, ''))}` }] : []),
        ],
        confirmLabel: SUBMIT[mode],
      });
      if (!ok) return;
    }
    const c = concept.trim() || undefined;
    const r =
      mode === 'deposit'
        ? run('bank/deposit', { accountId, amount: cents, concept: c }, { success: `Ingreso de ${formatMoney(cents, cur)} realizado` })
        : mode === 'withdraw'
          ? run('bank/withdraw', { accountId, amount: cents, concept: c }, { success: `Retirada de ${formatMoney(cents, cur)} realizada` })
          : mode === 'transfer'
            ? run('bank/transfer', { fromId: accountId, toId, amount: cents, concept: c }, { success: 'Traspaso completado' })
            : mode === 'send'
              ? run('bank/send', { fromId: accountId, name, iban, amount: cents, concept: c, saveContact }, { success: 'Transferencia enviada (se liquidará en 24 h simuladas)' })
              : mode === 'receive'
                ? run('bank/receive', { toId: accountId, name, amount: cents, concept: c }, { success: `Has recibido ${formatMoney(cents, cur)}` })
                : mode === 'pay'
                  ? run('bank/pay', { accountId, merchant: name, amount: cents, category, concept: c }, { success: 'Pago realizado' })
                  : run('request/create', { contactName: name, amount: cents, concept: c, toAccountId: accountId }, { success: 'Solicitud enviada' });
    if (r.ok) onClose();
    else setError(r.message);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={TITLES[mode]}
      subtitle="Operación simulada con dinero ficticio"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending} disabled={pending}>
            {SUBMIT[mode]}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Segmented value={mode} onChange={(m) => { setMode(m); setError(null); }} options={modes} size="sm" ariaLabel="Tipo de operación" className="w-full" />
        <Field label={mode === 'deposit' || mode === 'receive' || mode === 'request' ? 'Cuenta de destino' : 'Cuenta de origen'}>
          {(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={hide} />}
        </Field>
        {mode === 'transfer' && (
          <Field label="Cuenta de destino">
            {(id) =>
              accounts.length > 1 ? (
                <AccountSelect id={id} accounts={accounts} value={toId} onChange={setToId} exclude={accountId} hideBalances={hide} />
              ) : (
                <p className="text-sm text-muted">Abre otra cuenta para poder hacer traspasos.</p>
              )
            }
          </Field>
        )}
        {mode === 'send' && (
          <>
            {p.contacts.length > 0 && (
              <Field label="Contacto guardado">
                {(id) => (
                  <Select id={id} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                    <option value="">Nuevo beneficiario…</option>
                    {p.contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.iban.slice(-4)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Beneficiario">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" maxLength={80} />}</Field>
              <Field label="IBAN de destino" hint="Ficticio, p. ej. ES00 1234 …">
                {(id) => <Input id={id} value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="ES00…" maxLength={42} />}
              </Field>
            </div>
            {!contactId && (
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={saveContact} onChange={(e) => setSaveContact(e.target.checked)} className="size-4 accent-[var(--nx-accent)]" />
                Guardar como contacto
              </label>
            )}
          </>
        )}
        {(mode === 'receive' || mode === 'request') && (
          <Field label={mode === 'receive' ? 'Ordenante' : 'Solicitar a'}>
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la persona o empresa" maxLength={80} />}
          </Field>
        )}
        {mode === 'pay' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Comercio o beneficiario">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Mercado Verde" maxLength={80} />}</Field>
            <Field label="Categoría">
              {(id) => (
                <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                  {SPENDING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        )}
        <Field label="Importe" hint={account && ['withdraw', 'transfer', 'send', 'pay'].includes(mode) ? `Disponible: ${formatMoney(account.balance + account.overdraftLimit, cur, { hide })}` : undefined}>
          {(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} autoFocus />}
        </Field>
        <Field label="Concepto (opcional)">{(id) => <Input id={id} value={concept} onChange={(e) => setConcept(e.target.value)} maxLength={140} placeholder="Descripción del movimiento" />}</Field>
        <FormError message={error} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
