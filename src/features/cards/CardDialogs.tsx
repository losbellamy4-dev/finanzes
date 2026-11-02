import { useState } from 'react';
import type { Card, CardType, Category } from '@/core/schema';
import { formatMoney, parseMoney } from '@/core/money';
import { CATEGORY_LABELS, SPENDING_CATEGORIES } from '@/data/labels';
import { CARD_PATTERNS, CARD_THEMES, CARD_TYPE_LABELS } from '@/engine/cards';
import { useOperation, useProfile } from '@/store/hooks';
import { navigate } from '@/app/router';
import { AccountSelect, openAccounts } from '@/ui/domain';
import { BankCardVisual } from '@/ui/BankCard';
import { Modal } from '@/ui/overlays';
import { Button, cx, Field, FormError, Input, MoneyInput, Segmented, Select } from '@/ui/primitives';

function DesignPicker({ theme, pattern, onTheme, onPattern }: { theme: string; pattern: string; onTheme: (t: string) => void; onPattern: (p: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Diseño">
        {CARD_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme === t.id}
            title={t.name}
            aria-label={t.name}
            onClick={() => onTheme(t.id)}
            className={cx('h-9 w-14 rounded-lg ring-offset-2 ring-offset-[var(--nx-surface)]', theme === t.id && 'ring-2 ring-fg')}
            style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
          />
        ))}
      </div>
      <Segmented value={pattern} onChange={onPattern} size="sm" options={CARD_PATTERNS.map((p) => ({ value: p.id, label: p.name }))} ariaLabel="Patrón" />
    </div>
  );
}

export function NewCardDialog({ onClose }: { onClose: () => void }) {
  const p = useProfile();
  const accounts = openAccounts(p);
  const [type, setType] = useState<CardType>('debit');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<string>('midnight');
  const [pattern, setPattern] = useState<string>('waves');
  const [limit, setLimit] = useState('3.000');
  const [apr, setApr] = useState('19,9');
  const [closingDay, setClosingDay] = useState('1');
  const [daily, setDaily] = useState('1.000');
  const [monthly, setMonthly] = useState('5.000');
  const [load, setLoad] = useState('');
  const [autopay, setAutopay] = useState<Card['autopay']>('full');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const cur = accounts.find((a) => a.id === accountId)?.currency ?? p.profile.baseCurrency;

  const submit = () => {
    setError(null);
    const dl = parseMoney(daily);
    const ml = parseMoney(monthly);
    if (!dl || !ml) return setError('Límites no válidos.');
    let creditLimit: number | undefined;
    let aprN: number | undefined;
    let cd: number | undefined;
    if (type === 'credit') {
      creditLimit = parseMoney(limit) ?? undefined;
      if (!creditLimit) return setError('Límite de crédito no válido.');
      aprN = Number(apr.replace(',', '.')) / 100;
      cd = Number(closingDay);
      if (!Number.isFinite(aprN)) return setError('TAE no válida.');
    }
    const initialLoad = type === 'prepaid' && load.trim() ? (parseMoney(load) ?? -1) : undefined;
    if (initialLoad !== undefined && initialLoad <= 0) return setError('Recarga inicial no válida.');
    const r = run(
      'card/create',
      { type, accountId, name: name || undefined, theme, pattern, creditLimit, apr: aprN, closingDay: cd, dailyLimit: dl, monthlyLimit: ml, autopay, initialLoad },
      { success: 'Tarjeta virtual creada' },
    );
    if (r.ok) {
      onClose();
      navigate(`/cards/${r.result}`);
    } else setError(r.message);
  };

  const preview = {
    type,
    name: name || `Tarjeta ${CARD_TYPE_LABELS[type]}`,
    holder: (accounts.find((a) => a.id === accountId)?.holder ?? p.profile.ownerName).toUpperCase(),
    number: '0000000000000000',
    expMonth: 12,
    expYear: 2030,
    status: 'active' as const,
    design: { theme, pattern },
    cvv: '000',
  };

  return (
    <Modal open onClose={onClose} title="Nueva tarjeta virtual" subtitle="Numeración ficticia, no válida para pagos reales" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={pending} disabled={!accounts.length}>Crear tarjeta</Button></>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <BankCardVisual card={preview} />
          <DesignPicker theme={theme} pattern={pattern} onTheme={setTheme} onPattern={setPattern} />
        </div>
        <div className="space-y-4">
          <Segmented value={type} onChange={setType} options={(Object.keys(CARD_TYPE_LABELS) as CardType[]).map((t) => ({ value: t, label: CARD_TYPE_LABELS[t] }))} className="w-full" />
          <Field label={type === 'debit' ? 'Cuenta de cargo' : type === 'credit' ? 'Cuenta para pagar la deuda' : 'Cuenta de recarga'}>
            {(id) => (accounts.length ? <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={p.settings.hideBalances} /> : <p className="text-sm text-neg">Abre primero una cuenta.</p>)}
          </Field>
          <Field label="Nombre de la tarjeta">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={`Tarjeta ${CARD_TYPE_LABELS[type]}`} />}</Field>
          {type === 'credit' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Límite de crédito">{(id) => <MoneyInput id={id} value={limit} onChange={setLimit} currency={cur} />}</Field>
              <Field label="TAE (%)">{(id) => <Input id={id} value={apr} onChange={(e) => setApr(e.target.value)} inputMode="decimal" />}</Field>
              <Field label="Día de cierre">{(id) => <Input id={id} value={closingDay} onChange={(e) => setClosingDay(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />}</Field>
              <Field label="Pago automático">
                {(id) => (
                  <Select id={id} value={autopay} onChange={(e) => setAutopay(e.target.value as Card['autopay'])}>
                    <option value="full">Total</option>
                    <option value="minimum">Mínimo</option>
                    <option value="none">Manual</option>
                  </Select>
                )}
              </Field>
            </div>
          )}
          {type === 'prepaid' && <Field label="Recarga inicial (opcional)">{(id) => <MoneyInput id={id} value={load} onChange={setLoad} currency={cur} />}</Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Límite diario">{(id) => <MoneyInput id={id} value={daily} onChange={setDaily} currency={cur} />}</Field>
            <Field label="Límite mensual">{(id) => <MoneyInput id={id} value={monthly} onChange={setMonthly} currency={cur} />}</Field>
          </div>
          <FormError message={error} />
        </div>
      </div>
    </Modal>
  );
}

export function PurchaseDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const p = useProfile();
  const cur = p.accounts.find((a) => a.id === card.accountId)?.currency ?? p.profile.baseCurrency;
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('shopping');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = parseMoney(amount);
    if (!c || c <= 0) return setError('Importe no válido.');
    const r = run('card/purchase', { cardId: card.id, amount: c, merchant, category }, { success: `Compra de ${formatMoney(c, cur)} aprobada` });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Simular compra con tarjeta" subtitle={`${card.name} · •••• ${card.number.slice(-4)}`} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={pending}>Pagar con tarjeta</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Comercio">{(id) => <Input id={id} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="p. ej. Café Aurora" maxLength={80} />}</Field>
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
        <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} autoFocus />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function PayCardDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const p = useProfile();
  const accounts = openAccounts(p);
  const cur = p.accounts.find((a) => a.id === card.accountId)?.currency ?? p.profile.baseCurrency;
  const [accountId, setAccountId] = useState(card.accountId);
  const pendingStatement = Math.max(0, Math.min(card.balance, card.statementBalance - card.paidSinceStatement));
  const [amount, setAmount] = useState(((pendingStatement || card.balance) / 100).toFixed(2).replace('.', ','));
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = parseMoney(amount);
    if (!c || c <= 0) return setError('Importe no válido.');
    const r = run('card/pay', { cardId: card.id, amount: c, accountId }, { success: 'Pago de tarjeta realizado' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Pagar deuda de la tarjeta" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={pending}>Pagar</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: 'Mínimo', v: Math.max(0, card.minimumDue - card.paidSinceStatement) },
            { l: 'Extracto', v: pendingStatement },
            { l: 'Total', v: card.balance },
          ].map((o) => (
            <button key={o.l} type="button" onClick={() => setAmount((o.v / 100).toFixed(2).replace('.', ','))} className="rounded-xl border border-line bg-surface-2 p-2.5 text-left hover:border-accent/50">
              <div className="text-[11px] text-muted">{o.l}</div>
              <div className="tabular text-sm font-semibold text-fg">{formatMoney(o.v, cur)}</div>
            </button>
          ))}
        </div>
        <Field label="Desde la cuenta">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={p.settings.hideBalances} />}</Field>
        <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function LoadCardDialog({ card, mode, onClose }: { card: Card; mode: 'load' | 'unload'; onClose: () => void }) {
  const p = useProfile();
  const cur = p.accounts.find((a) => a.id === card.accountId)?.currency ?? p.profile.baseCurrency;
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = parseMoney(amount);
    if (!c || c <= 0) return setError('Importe no válido.');
    const r = run(mode === 'load' ? 'card/load' : 'card/unload', { cardId: card.id, amount: c }, { success: mode === 'load' ? 'Tarjeta recargada' : 'Saldo devuelto a la cuenta' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title={mode === 'load' ? 'Recargar tarjeta prepago' : 'Descargar saldo a la cuenta'} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={pending}>{mode === 'load' ? 'Recargar' : 'Descargar'}</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Saldo de la tarjeta: <strong className="text-fg">{formatMoney(card.balance, cur)}</strong></p>
        <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} autoFocus />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function LimitsDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const p = useProfile();
  const cur = p.accounts.find((a) => a.id === card.accountId)?.currency ?? p.profile.baseCurrency;
  const f = (c: number) => (c / 100).toFixed(2).replace('.', ',');
  const [daily, setDaily] = useState(f(card.dailyLimit));
  const [monthly, setMonthly] = useState(f(card.monthlyLimit));
  const [credit, setCredit] = useState(f(card.creditLimit));
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const d = parseMoney(daily);
    const m = parseMoney(monthly);
    const c = card.type === 'credit' ? parseMoney(credit) : undefined;
    if (!d || !m || c === null) return setError('Valores no válidos.');
    const r = run('card/limits', { cardId: card.id, dailyLimit: d, monthlyLimit: m, creditLimit: c }, { success: 'Límites actualizados' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Cambiar límites" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={pending}>Guardar</Button></>}>
      <div className="space-y-4">
        <Field label="Límite diario de compras">{(id) => <MoneyInput id={id} value={daily} onChange={setDaily} currency={cur} />}</Field>
        <Field label="Límite mensual de compras">{(id) => <MoneyInput id={id} value={monthly} onChange={setMonthly} currency={cur} />}</Field>
        {card.type === 'credit' && <Field label="Límite de crédito">{(id) => <MoneyInput id={id} value={credit} onChange={setCredit} currency={cur} />}</Field>}
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function EditCardDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const [name, setName] = useState(card.name);
  const [theme, setTheme] = useState(card.design.theme);
  const [pattern, setPattern] = useState(card.design.pattern);
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const r = run('card/update', { cardId: card.id, name, theme, pattern }, { success: 'Tarjeta actualizada' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Personalizar tarjeta" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={pending}>Guardar</Button></>}>
      <div className="space-y-4">
        <BankCardVisual card={{ ...card, name, design: { theme, pattern } }} />
        <Field label="Nombre">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />}</Field>
        <DesignPicker theme={theme} pattern={pattern} onTheme={setTheme} onPattern={setPattern} />
        <FormError message={error} />
      </div>
    </Modal>
  );
}
