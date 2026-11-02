import { useState } from 'react';
import type { Account, AccountType, Currency } from '@/core/schema';
import { CURRENCY_CODES, CURRENCY_NAMES, formatMoney, parseMoney } from '@/core/money';
import { COUNTRIES } from '@/data/labels';
import { ACCOUNT_TYPE_LABELS } from '@/engine/banking';
import { useOperation, useProfile } from '@/store/hooks';
import { confirm } from '@/store/toast';
import { navigate } from '@/app/router';
import { AccountSelect } from '@/ui/domain';
import { Modal } from '@/ui/overlays';
import { Button, cx, Field, FormError, Input, MoneyInput, Select } from '@/ui/primitives';

const COLORS = ['#5488F5', '#24C78A', '#A78BFA', '#F5A524', '#F05B65', '#22B8CF', '#E879F9', '#94A3B8'];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className={cx('size-8 rounded-full ring-offset-2 ring-offset-[var(--nx-surface)] transition', value === c && 'ring-2 ring-fg')}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

export function NewAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = useProfile();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [currency, setCurrency] = useState<Currency>(p.profile.baseCurrency);
  const [country, setCountry] = useState(p.profile.country);
  const [holder, setHolder] = useState(p.profile.ownerName);
  const [initial, setInitial] = useState('');
  const [rate, setRate] = useState('2');
  const [overdraft, setOverdraft] = useState('');
  const [color, setColor] = useState(COLORS[p.accounts.length % COLORS.length]);
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();

  const submit = () => {
    setError(null);
    const init = initial.trim() ? parseMoney(initial) : 0;
    if (init === null || init < 0) return setError('Saldo inicial no válido.');
    const r = type === 'savings' ? Number(rate.replace(',', '.')) / 100 : 0;
    if (!Number.isFinite(r) || r < 0 || r > 0.5) return setError('Interés no válido (0–50 %).');
    const od = type === 'business' && overdraft.trim() ? parseMoney(overdraft) : 0;
    if (od === null || od < 0) return setError('Descubierto no válido.');
    const res = run(
      'account/create',
      { name: name.trim() || ACCOUNT_TYPE_LABELS[type], type, currency, country, holder, initialBalance: init || undefined, interestRate: r, overdraftLimit: od, color },
      { success: 'Cuenta abierta' },
    );
    if (res.ok) {
      onClose();
      navigate(`/accounts/${res.result}`);
    } else setError(res.message);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Abrir nueva cuenta"
      subtitle="IBAN y número de cuenta ficticios"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            Abrir cuenta
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={cx('rounded-xl border px-3 py-2.5 text-left text-sm font-medium', type === t ? 'border-accent bg-accent/10 text-fg' : 'border-line bg-surface-2 text-muted')}
            >
              {ACCOUNT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <Field label="Nombre de la cuenta">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={ACCOUNT_TYPE_LABELS[type]} maxLength={60} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titular">{(id) => <Input id={id} value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={80} />}</Field>
          <Field label="País">
            {(id) => (
              <Select id={id} value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Moneda">
            {(id) => (
              <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c} · {CURRENCY_NAMES[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Saldo inicial (opcional)">{(id) => <MoneyInput id={id} value={initial} onChange={setInitial} currency={currency} />}</Field>
          {type === 'savings' && <Field label="Interés anual (TIN %)">{(id) => <Input id={id} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />}</Field>}
          {type === 'business' && <Field label="Descubierto autorizado" hint="Permite saldo negativo hasta este límite.">{(id) => <MoneyInput id={id} value={overdraft} onChange={setOverdraft} currency={currency} />}</Field>}
        </div>
        <Field label="Color">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
        <FormError message={error} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function EditAccountDialog({ account, open, onClose }: { account: Account; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(account.name);
  const [holder, setHolder] = useState(account.holder);
  const [color, setColor] = useState(account.color);
  const [rate, setRate] = useState(String(Math.round(account.interestRate * 10000) / 100));
  const [overdraft, setOverdraft] = useState(account.overdraftLimit ? String(account.overdraftLimit / 100) : '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const r = Number(rate.replace(',', '.')) / 100;
    if (!Number.isFinite(r)) return setError('Interés no válido.');
    const od = account.type === 'business' ? (overdraft.trim() ? parseMoney(overdraft) : 0) : undefined;
    if (od === null) return setError('Descubierto no válido.');
    const res = run('account/update', { accountId: account.id, name, holder, color, interestRate: r, overdraftLimit: od }, { success: 'Cuenta actualizada' });
    if (res.ok) onClose();
    else setError(res.message);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar cuenta"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
        <Field label="Titular">{(id) => <Input id={id} value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={80} />}</Field>
        <Field label="Interés anual (TIN %)">{(id) => <Input id={id} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />}</Field>
        {account.type === 'business' && <Field label="Descubierto autorizado">{(id) => <MoneyInput id={id} value={overdraft} onChange={setOverdraft} currency={account.currency} />}</Field>}
        <Field label="Color">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function CloseAccountDialog({ account, open, onClose }: { account: Account; open: boolean; onClose: () => void }) {
  const p = useProfile();
  const others = p.accounts.filter((a) => a.status === 'open' && a.id !== account.id);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = async () => {
    const ok = await confirm({ title: `¿Cerrar «${account.name}»?`, body: 'La cuenta quedará cerrada y no admitirá nuevas operaciones. Su historial se conserva.', tone: 'danger', confirmLabel: 'Cerrar cuenta' });
    if (!ok) return;
    const res = run('account/close', { accountId: account.id, transferToId: account.balance > 0 ? target : undefined }, { success: 'Cuenta cerrada' });
    if (res.ok) {
      onClose();
      navigate('/accounts');
    } else setError(res.message);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cerrar cuenta"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={submit} loading={pending}>
            Cerrar cuenta
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Saldo actual: <strong className="text-fg">{formatMoney(account.balance, account.currency)}</strong>
        </p>
        {account.balance > 0 && (
          <Field label="Traspasar el saldo restante a">
            {(id) => (others.length ? <AccountSelect id={id} accounts={others} value={target} onChange={setTarget} /> : <p className="text-sm text-neg">Necesitas otra cuenta abierta para recibir el saldo.</p>)}
          </Field>
        )}
        <FormError message={error} />
      </div>
    </Modal>
  );
}
