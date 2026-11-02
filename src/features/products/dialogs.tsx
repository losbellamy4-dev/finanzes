import { useMemo, useState } from 'react';
import type { InsuranceType, Loan, LoanFrequency, LoanKind, SavingsGoal, VaultItem } from '@/core/schema';
import { formatMoney, formatPct, parseMoney } from '@/core/money';
import { addMonthsUTC, tickToDate, toDateInput } from '@/core/time';
import { FREQUENCY_LABELS, LOAN_KIND_LABELS, OPENING_FEE, loanSummary, suggestedRate } from '@/engine/products/loans';
import { suggestedDepositRate } from '@/engine/products/deposits';
import { INSURANCE_PRODUCTS, quoteInsurance } from '@/engine/products/insurance';
import { CHARITIES, VAULT_CATEGORIES } from '@/engine/products/wealth';
import { computeCreditScore } from '@/engine/creditScore';
import { PERIODS_PER_YEAR } from '@/core/time';
import { useOperation, useProfile } from '@/store/hooks';
import { confirm } from '@/store/toast';
import { navigate } from '@/app/router';
import { AccountSelect, openAccounts } from '@/ui/domain';
import { Modal } from '@/ui/overlays';
import { Button, cx, Field, FormError, Input, KeyValue, MoneyInput, Segmented, Select, Textarea } from '@/ui/primitives';

const toCentsInput = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const pctIn = (s: string) => Number(s.replace(',', '.')) / 100;

function Footer({ onClose, onSubmit, label, pending, disabled }: { onClose: () => void; onSubmit: () => void; label: string; pending: boolean; disabled?: boolean }) {
  return (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
      <Button onClick={onSubmit} loading={pending} disabled={disabled}>
        {label}
      </Button>
    </>
  );
}

function useAccounts() {
  const p = useProfile();
  const accounts = openAccounts(p);
  return { p, accounts, hide: p.settings.hideBalances, cur: p.profile.baseCurrency };
}

/* ------------------------------ Ahorro ------------------------------ */

export function GoalDialog({ kind, onClose }: { kind: SavingsGoal['kind']; onClose: () => void }) {
  const { p, accounts, hide, cur } = useAccounts();
  const now = tickToDate(p.clock.startAt, p.clock.tick);
  const [name, setName] = useState(kind === 'pot' ? 'Hucha' : '');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState(toDateInput(addMonthsUTC(now, 12)));
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [initial, setInitial] = useState('');
  const [autoAmount, setAutoAmount] = useState('');
  const [freq, setFreq] = useState<'weekly' | 'monthly'>('monthly');
  const [rate, setRate] = useState('1,5');
  const [color, setColor] = useState('#24C78A');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    setError(null);
    const t = target.trim() ? parseMoney(target) : 0;
    if (t === null || (kind === 'goal' && !t)) return setError('Indica una cantidad objetivo válida.');
    const init = initial.trim() ? parseMoney(initial) : 0;
    if (init === null) return setError('Aportación inicial no válida.');
    const auto = autoAmount.trim() ? parseMoney(autoAmount) : 0;
    if (auto === null) return setError('Aportación periódica no válida.');
    const r = run(
      'goal/create',
      {
        kind,
        name,
        target: t || undefined,
        targetDate: kind === 'goal' ? date : undefined,
        accountId,
        interestRate: pctIn(rate),
        initialAmount: init || undefined,
        auto: auto ? { amount: auto, frequency: freq } : null,
        color,
      },
      { success: kind === 'goal' ? 'Objetivo de ahorro creado' : 'Hucha creada' },
    );
    if (r.ok) {
      onClose();
      navigate('/products/savings');
    } else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title={kind === 'goal' ? 'Nuevo objetivo de ahorro' : 'Nueva hucha digital'} footer={<Footer onClose={onClose} onSubmit={submit} label="Crear" pending={pending} disabled={!accounts.length} />}>
      <div className="space-y-4">
        <Field label="Nombre">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={kind === 'goal' ? 'p. ej. Coche nuevo' : 'p. ej. Caprichos'} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={kind === 'goal' ? 'Cantidad objetivo' : 'Objetivo (opcional)'}>{(id) => <MoneyInput id={id} value={target} onChange={setTarget} currency={cur} />}</Field>
          {kind === 'goal' && <Field label="Fecha objetivo">{(id) => <Input id={id} type="date" value={date} min={toDateInput(now)} onChange={(e) => setDate(e.target.value)} />}</Field>}
          <Field label="Interés anual (%)">{(id) => <Input id={id} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />}</Field>
          <Field label="Aportación inicial">{(id) => <MoneyInput id={id} value={initial} onChange={setInitial} currency={cur} />}</Field>
        </div>
        <Field label="Cuenta de origen">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={hide} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Aportación periódica">{(id) => <MoneyInput id={id} value={autoAmount} onChange={setAutoAmount} currency={cur} />}</Field>
          <Field label="Frecuencia">
            {(id) => (
              <Select id={id} value={freq} onChange={(e) => setFreq(e.target.value as 'weekly' | 'monthly')}>
                <option value="monthly">Mensual</option>
                <option value="weekly">Semanal</option>
              </Select>
            )}
          </Field>
        </div>
        <div className="flex gap-2">
          {['#24C78A', '#5488F5', '#A78BFA', '#F5A524', '#F05B65', '#22B8CF'].map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cx('size-7 rounded-full', color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-[var(--nx-surface)]')} style={{ background: c }} />
          ))}
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function GoalMoneyDialog({ goal, mode, onClose }: { goal: SavingsGoal; mode: 'contribute' | 'withdraw'; onClose: () => void }) {
  const { accounts, hide, cur } = useAccounts();
  const [accountId, setAccountId] = useState(goal.accountId && accounts.some((a) => a.id === goal.accountId) ? goal.accountId : (accounts[0]?.id ?? ''));
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = parseMoney(amount);
    if (!c || c <= 0) return setError('Importe no válido.');
    const r = mode === 'contribute' ? run('goal/contribute', { goalId: goal.id, accountId, amount: c }, { success: 'Aportación realizada' }) : run('goal/withdraw', { goalId: goal.id, accountId, amount: c }, { success: 'Retirada realizada' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title={mode === 'contribute' ? `Aportar a «${goal.name}»` : `Retirar de «${goal.name}»`} footer={<Footer onClose={onClose} onSubmit={submit} label={mode === 'contribute' ? 'Aportar' : 'Retirar'} pending={pending} />}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Saldo ahorrado: <strong className="text-fg">{formatMoney(goal.balance, cur)}</strong></p>
        <Field label={mode === 'contribute' ? 'Desde la cuenta' : 'A la cuenta'}>{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={hide} />}</Field>
        <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} autoFocus />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function DepositDialog({ kind, onClose }: { kind: 'fixed' | 'structured'; onClose: () => void }) {
  const { p, accounts, hide, cur } = useAccounts();
  const indices = p.market.assets.filter((a) => a.type === 'index' || a.type === 'etf');
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type === 'savings')?.id ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState('12');
  const [rate, setRate] = useState(String(suggestedDepositRate(12) * 100).replace('.', ','));
  const [underlying, setUnderlying] = useState(indices[0]?.id ?? '');
  const [participation, setParticipation] = useState('70');
  const [cap, setCap] = useState('25');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const m = Number(months) || 0;
  const c = parseMoney(amount) ?? 0;
  const interest = kind === 'fixed' ? Math.round((c * pctIn(rate) * m) / 12) : 0;
  const submit = async () => {
    if (!c) return setError('Importe no válido.');
    if (!(await confirm({ title: 'Contratar depósito', details: [{ label: 'Capital', value: formatMoney(c, cur) }, { label: 'Plazo', value: `${m} meses` }, ...(kind === 'fixed' ? [{ label: 'Intereses al vencimiento', value: formatMoney(interest, cur) }] : [{ label: 'Rentabilidad', value: `${participation} % del índice, tope ${cap} %` }])], body: 'La cancelación anticipada penaliza el 50 % de los intereses devengados.', confirmLabel: 'Contratar' }))) return;
    const r = run(
      'deposit/open',
      kind === 'fixed'
        ? { kind, accountId, amount: c, termMonths: m, rate: pctIn(rate) }
        : { kind, accountId, amount: c, termMonths: m, underlyingId: underlying, participation: pctIn(participation), cap: pctIn(cap) },
      { success: 'Depósito contratado' },
    );
    if (r.ok) {
      onClose();
      navigate('/products/savings');
    } else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title={kind === 'fixed' ? 'Depósito a plazo fijo' : 'Depósito estructurado'} subtitle={kind === 'structured' ? 'Capital garantizado; rentabilidad ligada a un índice simulado' : undefined} footer={<Footer onClose={onClose} onSubmit={submit} label="Contratar" pending={pending} />}>
      <div className="space-y-4">
        <Field label="Cuenta de cargo">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={hide} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Capital">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} />}</Field>
          <Field label="Plazo">
            {(id) => (
              <Select id={id} value={months} onChange={(e) => { setMonths(e.target.value); if (kind === 'fixed') setRate(String(suggestedDepositRate(Number(e.target.value)) * 100).replace('.', ',')); }}>
                {[3, 6, 12, 18, 24, 36, 60].map((x) => (
                  <option key={x} value={x}>
                    {x} meses
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {kind === 'fixed' ? (
          <Field label="TIN anual (%)">{(id) => <Input id={id} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />}</Field>
        ) : (
          <>
            <Field label="Índice de referencia">
              {(id) => (
                <Select id={id} value={underlying} onChange={(e) => setUnderlying(e.target.value)}>
                  {indices.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.symbol} · {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Participación (%)">{(id) => <Input id={id} value={participation} onChange={(e) => setParticipation(e.target.value)} inputMode="decimal" />}</Field>
              <Field label="Tope de rentabilidad (%)">{(id) => <Input id={id} value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" />}</Field>
            </div>
          </>
        )}
        {kind === 'fixed' && <KeyValue items={[{ label: 'Intereses estimados', value: formatMoney(interest, cur), tone: 'pos' }, { label: 'Total al vencimiento', value: formatMoney(c + interest, cur) }]} />}
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function SavingsAccountDialog({ onClose }: { onClose: () => void }) {
  const { accounts, hide, cur } = useAccounts();
  const [name, setName] = useState('Cuenta remunerada');
  const [rate, setRate] = useState('2,5');
  const [from, setFrom] = useState(accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = amount.trim() ? parseMoney(amount) : 0;
    if (c === null) return setError('Importe no válido.');
    const r = run('account/create', { name, type: 'savings', interestRate: pctIn(rate) }, { success: 'Cuenta remunerada abierta' });
    if (!r.ok) return setError(r.message);
    if (c && from) {
      const t = run('bank/transfer', { fromId: from, toId: r.result, amount: c, concept: 'Aportación inicial a cuenta remunerada' });
      if (!t.ok) return setError(`Cuenta abierta, pero el traspaso falló: ${t.message}`);
    }
    onClose();
    navigate(`/accounts/${r.result}`);
  };
  return (
    <Modal open onClose={onClose} title="Abrir cuenta remunerada" footer={<Footer onClose={onClose} onSubmit={submit} label="Abrir cuenta" pending={pending} />}>
      <div className="space-y-4">
        <Field label="Nombre">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
        <Field label="TIN anual (%)" hint="Los intereses se abonan el día 1 de cada mes.">{(id) => <Input id={id} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />}</Field>
        {accounts.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Traspasar desde (opcional)">{(id) => <AccountSelect id={id} accounts={accounts} value={from} onChange={setFrom} hideBalances={hide} />}</Field>
            <Field label="Importe inicial">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} />}</Field>
          </div>
        )}
        <FormError message={error} />
      </div>
    </Modal>
  );
}

/* ---------------------------- Financiación ---------------------------- */

export function LoanDialog({ kind: initialKind, onClose }: { kind: LoanKind; onClose: () => void }) {
  const { p, accounts, hide, cur } = useAccounts();
  const score = useMemo(() => computeCreditScore(p).score, [p]);
  const [kind, setKind] = useState<LoanKind>(initialKind);
  const [principal, setPrincipal] = useState(initialKind === 'mortgage' ? '150.000' : initialKind === 'business' ? '50.000' : '10.000');
  const [rate, setRate] = useState(String(Math.round(suggestedRate(initialKind, score) * 10000) / 100).replace('.', ','));
  const [years, setYears] = useState(initialKind === 'mortgage' ? '25' : '5');
  const [freq, setFreq] = useState<LoanFrequency>('monthly');
  const [accountId, setAccountId] = useState(accounts.find((a) => (initialKind === 'business' ? a.type === 'business' : a.type === 'checking'))?.id ?? accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const c = parseMoney(principal) ?? 0;
  const r = pctIn(rate);
  const y = Number(years.replace(',', '.')) || 0;
  const periods = Math.max(1, Math.round(y * PERIODS_PER_YEAR[freq]));
  const sum = c > 0 && Number.isFinite(r) ? loanSummary(c, r, periods, freq) : null;
  const fee = Math.round(c * OPENING_FEE[kind]);
  const submit = async () => {
    setError(null);
    if (!c) return setError('Capital no válido.');
    if (!sum) return setError('Condiciones no válidas.');
    if (!(await confirm({ title: `Contratar ${LOAN_KIND_LABELS[kind].toLowerCase()}`, details: [{ label: 'Capital', value: formatMoney(c, cur) }, { label: 'Cuota', value: `${formatMoney(sum.installment, cur)} · ${FREQUENCY_LABELS[freq].toLowerCase()}` }, { label: 'Intereses totales', value: formatMoney(sum.totalInterest, cur) }, { label: 'Comisión de apertura', value: formatMoney(fee, cur) }], body: 'Las cuotas se cargarán automáticamente en la cuenta seleccionada.', confirmLabel: 'Firmar préstamo' }))) return;
    const res = run('loan/create', { kind, principal: c, rate: r, termPeriods: periods, frequency: freq, accountId }, { success: 'Préstamo concedido y desembolsado' });
    if (res.ok) {
      onClose();
      navigate(`/products/loans/${res.result}`);
    } else setError(res.message);
  };
  return (
    <Modal open onClose={onClose} title="Simular y contratar financiación" size="lg" footer={<Footer onClose={onClose} onSubmit={submit} label="Contratar" pending={pending} disabled={!accounts.length} />}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <Segmented value={kind} onChange={(k) => { setKind(k); setRate(String(Math.round(suggestedRate(k, score) * 10000) / 100).replace('.', ',')); }} className="w-full" size="sm" options={(Object.keys(LOAN_KIND_LABELS) as LoanKind[]).map((k) => ({ value: k, label: LOAN_KIND_LABELS[k] }))} />
          <Field label="Capital solicitado">{(id) => <MoneyInput id={id} value={principal} onChange={setPrincipal} currency={cur} />}</Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Interés anual (TIN %)" hint={`Orientativo para tu score (${score}): ${formatPct(suggestedRate(kind, score), 2, false)}`}>{(id) => <Input id={id} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />}</Field>
            <Field label="Duración (años)">{(id) => <Input id={id} value={years} onChange={(e) => setYears(e.target.value)} inputMode="decimal" />}</Field>
          </div>
          <Field label="Frecuencia de pago">
            {(id) => (
              <Select id={id} value={freq} onChange={(e) => setFreq(e.target.value as LoanFrequency)}>
                {(Object.keys(FREQUENCY_LABELS) as LoanFrequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Cuenta de abono y cargo de cuotas">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={hide} />}</Field>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
          <div className="text-[13px] text-muted">Cuota {FREQUENCY_LABELS[freq].toLowerCase()}</div>
          <div className="tabular mt-1 text-[30px] font-semibold text-fg">{sum ? formatMoney(sum.installment, cur) : '—'}</div>
          <KeyValue
            className="mt-3"
            items={[
              { label: 'Número de cuotas', value: String(periods) },
              { label: 'Intereses totales', value: sum ? formatMoney(sum.totalInterest, cur) : '—', tone: 'neg' },
              { label: 'Total a devolver', value: sum ? formatMoney(sum.totalPaid, cur) : '—' },
              { label: `Comisión de apertura (${formatPct(OPENING_FEE[kind], 1, false)})`, value: formatMoney(fee, cur) },
              { label: 'Coste total', value: sum ? formatMoney(sum.totalInterest + fee, cur) : '—' },
            ]}
          />
          <p className="mt-3 text-[11.5px] text-subtle">Sistema de amortización francés. Simulación sin validez contractual.</p>
        </div>
      </div>
      <FormError message={error} />
    </Modal>
  );
}

export function PrepayDialog({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const { accounts, hide, cur } = useAccounts();
  const debt = loan.outstanding + loan.overdue;
  const [accountId, setAccountId] = useState(loan.accountId);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = async (full: boolean) => {
    const c = full ? debt : parseMoney(amount);
    if (!c) return setError('Importe no válido.');
    if (!(await confirm({ title: full ? 'Cancelar el préstamo' : 'Amortización anticipada', details: [{ label: 'Importe', value: formatMoney(c, cur) }], confirmLabel: 'Confirmar' }))) return;
    const r = run('loan/prepay', full ? { loanId: loan.id, accountId, full: true } : { loanId: loan.id, accountId, amount: c }, { success: full ? 'Préstamo liquidado' : 'Amortización realizada: cuota recalculada' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Amortizar préstamo" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="outline" onClick={() => submit(true)} disabled={pending}>Liquidar todo ({formatMoney(debt, cur)})</Button><Button onClick={() => submit(false)} loading={pending}>Amortizar</Button></>}>
      <div className="space-y-4">
        <KeyValue items={[{ label: 'Capital pendiente', value: formatMoney(loan.outstanding, cur) }, { label: 'Deuda vencida', value: formatMoney(loan.overdue, cur), tone: loan.overdue ? 'neg' : undefined }]} />
        <Field label="Desde la cuenta">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={hide} />}</Field>
        <Field label="Importe a amortizar" hint="Primero se cubre la deuda vencida; el resto reduce el capital y la cuota.">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function CreditLineDialog({ onClose }: { onClose: () => void }) {
  const { accounts, hide, cur } = useAccounts();
  const [limit, setLimit] = useState('10.000');
  const [rate, setRate] = useState('9,5');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = parseMoney(limit);
    if (!c) return setError('Límite no válido.');
    const r = run('creditline/open', { limit: c, rate: pctIn(rate), accountId }, { success: 'Línea de crédito abierta' });
    if (r.ok) {
      onClose();
      navigate('/products/loans');
    } else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Abrir línea de crédito" subtitle="Dispón cuando quieras; solo pagas intereses por lo dispuesto" footer={<Footer onClose={onClose} onSubmit={submit} label="Abrir línea" pending={pending} />}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Límite">{(id) => <MoneyInput id={id} value={limit} onChange={setLimit} currency={cur} />}</Field>
          <Field label="Interés anual (%)">{(id) => <Input id={id} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />}</Field>
        </div>
        <Field label="Cuenta asociada">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={hide} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function CreditLineOpDialog({ lineId, mode, onClose }: { lineId: string; mode: 'draw' | 'repay'; onClose: () => void }) {
  const { p, accounts, hide, cur } = useAccounts();
  const line = p.creditLines.find((l) => l.id === lineId)!;
  const [accountId, setAccountId] = useState(line.accountId);
  const [amount, setAmount] = useState(mode === 'repay' ? toCentsInput(line.drawn) : '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = parseMoney(amount);
    if (!c) return setError('Importe no válido.');
    const r = run(mode === 'draw' ? 'creditline/draw' : 'creditline/repay', { lineId, amount: c, accountId }, { success: mode === 'draw' ? 'Disposición realizada' : 'Devolución realizada' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title={mode === 'draw' ? 'Disponer de la línea' : 'Devolver saldo dispuesto'} footer={<Footer onClose={onClose} onSubmit={submit} label={mode === 'draw' ? 'Disponer' : 'Devolver'} pending={pending} />}>
      <div className="space-y-4">
        <KeyValue items={[{ label: 'Dispuesto', value: formatMoney(line.drawn, cur) }, { label: 'Disponible', value: formatMoney(Math.max(0, line.limit - line.drawn), cur) }]} />
        <Field label={mode === 'draw' ? 'Abonar en' : 'Pagar desde'}>{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={hide} />}</Field>
        <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

/* ------------------------------ Seguros ------------------------------ */

export function InsuranceDialog({ type: initialType, onClose }: { type: InsuranceType; onClose: () => void }) {
  const { accounts, hide, cur } = useAccounts();
  const [type, setType] = useState<InsuranceType>(initialType);
  const def = INSURANCE_PRODUCTS[type];
  const [coverage, setCoverage] = useState(toCentsInput(def.defaultCoverage));
  const [item, setItem] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const c = parseMoney(coverage) ?? 0;
  const q = c > 0 ? quoteInsurance(type, c) : null;
  const submit = async () => {
    if (!c) return setError('Cobertura no válida.');
    if (!(await confirm({ title: `Contratar ${def.name}`, details: [{ label: 'Cobertura', value: formatMoney(c, cur) }, { label: 'Prima mensual', value: formatMoney(q!.monthlyPremium, cur) }, { label: 'Franquicia', value: formatMoney(q!.deductible, cur) }], body: 'La primera prima se cobra hoy y las siguientes cada mes.', confirmLabel: 'Contratar' }))) return;
    const r = run('insurance/contract', { type, coverage: c, accountId, insuredItem: item }, { success: 'Póliza contratada' });
    if (r.ok) {
      onClose();
      navigate('/products/insurance');
    } else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Contratar seguro" footer={<Footer onClose={onClose} onSubmit={submit} label="Contratar" pending={pending} disabled={!accounts.length} />}>
      <div className="space-y-4">
        <Field label="Tipo de seguro">
          {(id) => (
            <Select id={id} value={type} onChange={(e) => { const t = e.target.value as InsuranceType; setType(t); setCoverage(toCentsInput(INSURANCE_PRODUCTS[t].defaultCoverage)); }}>
              {(Object.keys(INSURANCE_PRODUCTS) as InsuranceType[]).map((t) => (
                <option key={t} value={t}>
                  {INSURANCE_PRODUCTS[t].name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="text-[13px] text-muted">{def.description}</p>
        <Field label={def.itemLabel}>{(id) => <Input id={id} value={item} onChange={(e) => setItem(e.target.value)} maxLength={120} />}</Field>
        <Field label="Capital asegurado">{(id) => <MoneyInput id={id} value={coverage} onChange={setCoverage} currency={cur} />}</Field>
        <Field label="Cuenta de cargo">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={hide} />}</Field>
        {q && <KeyValue items={[{ label: 'Prima mensual', value: formatMoney(q.monthlyPremium, cur) }, { label: 'Prima anual', value: formatMoney(q.monthlyPremium * 12, cur) }, { label: 'Franquicia por siniestro', value: formatMoney(q.deductible, cur) }]} />}
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function ClaimDialog({ policyId, onClose }: { policyId: string; onClose: () => void }) {
  const { p, cur } = useAccounts();
  const pol = p.insurance.find((x) => x.id === policyId)!;
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = parseMoney(amount);
    if (!c) return setError('Importe no válido.');
    const r = run('insurance/claim', { policyId, description, amount: c }, { success: (v) => (v > 0 ? `Indemnización de ${formatMoney(v, cur)} abonada` : 'Siniestro registrado sin indemnización (franquicia)') });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title={`Declarar siniestro · ${pol.name}`} footer={<Footer onClose={onClose} onSubmit={submit} label="Declarar" pending={pending} />}>
      <div className="space-y-4">
        <KeyValue items={[{ label: 'Cobertura', value: formatMoney(pol.coverage, cur) }, { label: 'Franquicia', value: formatMoney(pol.deductible, cur) }]} />
        <Field label="¿Qué ha ocurrido?">{(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Describe el siniestro (ficticio)" />}</Field>
        <Field label="Importe de los daños">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

/* ----------------------------- Patrimonio ----------------------------- */

export function DonateDialog({ onClose }: { onClose: () => void }) {
  const { accounts, hide, cur } = useAccounts();
  const [charity, setCharity] = useState<string>(CHARITIES[0].id);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = parseMoney(amount);
    if (!c) return setError('Importe no válido.');
    const r = run('wealth/donate', { charityId: charity, accountId, amount: c }, { success: '¡Gracias! Donación simulada realizada' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Hacer una donación" subtitle="Entidades benéficas ficticias" footer={<Footer onClose={onClose} onSubmit={submit} label="Donar" pending={pending} />}>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {CHARITIES.map((c) => (
            <button key={c.id} type="button" aria-pressed={charity === c.id} onClick={() => setCharity(c.id)} className={cx('rounded-xl border p-3 text-left', charity === c.id ? 'border-accent bg-accent/10' : 'border-line bg-surface-2')}>
              <div className="flex items-center gap-2 text-sm font-medium text-fg">
                <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                {c.name}
              </div>
              <div className="mt-0.5 text-[12px] text-muted">{c.cause}</div>
            </button>
          ))}
        </div>
        <Field label="Desde la cuenta">{(id) => <AccountSelect id={id} accounts={accounts} value={accountId} onChange={setAccountId} hideBalances={hide} />}</Field>
        <Field label="Importe">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} currency={cur} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function VaultDialog({ item, onClose }: { item?: VaultItem; onClose: () => void }) {
  const { cur } = useAccounts();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<VaultItem['category']>(item?.category ?? 'jewelry');
  const [value, setValue] = useState(item ? toCentsInput(item.value) : '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const c = value.trim() ? parseMoney(value) : 0;
    if (c === null) return setError('Valor no válido.');
    const r = item ? run('vault/update', { itemId: item.id, name, value: c, notes }, { success: 'Elemento actualizado' }) : run('vault/add', { name, category, value: c, notes }, { success: 'Guardado en la caja fuerte' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title={item ? 'Editar elemento' : 'Añadir a la caja fuerte'} footer={<Footer onClose={onClose} onSubmit={submit} label="Guardar" pending={pending} />}>
      <div className="space-y-4">
        <Field label="Nombre">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}</Field>
        {!item && (
          <Field label="Categoría">
            {(id) => (
              <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as VaultItem['category'])}>
                {(Object.keys(VAULT_CATEGORIES) as VaultItem['category'][]).map((c) => (
                  <option key={c} value={c}>
                    {VAULT_CATEGORIES[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Valor estimado" hint="Cuenta como patrimonio (otros activos).">{(id) => <MoneyInput id={id} value={value} onChange={setValue} currency={cur} />}</Field>
        <Field label="Notas">{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={400} />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function BeneficiaryDialog({ onClose }: { onClose: () => void }) {
  const { p } = useAccounts();
  const used = p.beneficiaries.reduce((a, b) => a + b.share, 0);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [share, setShare] = useState(String(Math.max(0, 100 - used)));
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useOperation();
  const submit = () => {
    const r = run('beneficiary/add', { name, relation, share: Number(share.replace(',', '.')) }, { success: 'Beneficiario añadido' });
    if (r.ok) onClose();
    else setError(r.message);
  };
  return (
    <Modal open onClose={onClose} title="Añadir beneficiario" footer={<Footer onClose={onClose} onSubmit={submit} label="Añadir" pending={pending} />}>
      <div className="space-y-4">
        <Field label="Nombre">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}</Field>
        <Field label="Relación">{(id) => <Input id={id} value={relation} onChange={(e) => setRelation(e.target.value)} maxLength={40} placeholder="Familiar, amistad, entidad…" />}</Field>
        <Field label={`Porcentaje (${100 - used} % disponible)`}>{(id) => <Input id={id} value={share} onChange={(e) => setShare(e.target.value)} inputMode="decimal" />}</Field>
        <FormError message={error} />
      </div>
    </Modal>
  );
}
