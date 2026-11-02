/** Componentes de dominio reutilizables: selectores de cuenta, filas de movimientos... */
import type { ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CreditCard,
  Gift,
  HandCoins,
  Landmark,
  LineChart,
  PiggyBank,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import type { Account, ProfileState, Transaction } from '@/core/schema';
import { formatMoney } from '@/core/money';
import { formatDateTime } from '@/core/time';
import { CATEGORY_LABELS, KIND_LABELS, STATUS_LABELS } from '@/data/labels';
import { ACCOUNT_TYPE_LABELS } from '@/engine/banking';
import { Badge, cx, Select } from './primitives';

export function AccountSelect({
  id,
  accounts,
  value,
  onChange,
  hideBalances,
  exclude,
  placeholder,
}: {
  id?: string;
  accounts: Account[];
  value: string;
  onChange: (v: string) => void;
  hideBalances?: boolean;
  exclude?: string;
  placeholder?: string;
}) {
  const list = accounts.filter((a) => a.status === 'open' && a.id !== exclude);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {hideBalances ? '•••••' : formatMoney(a.balance, a.currency)}
        </option>
      ))}
    </Select>
  );
}

export function openAccounts(p: ProfileState): Account[] {
  return p.accounts.filter((a) => a.status === 'open');
}

const KIND_ICON: Partial<Record<Transaction['kind'], ReactNode>> = {
  deposit: <Banknote className="size-4" />,
  withdrawal: <Banknote className="size-4" />,
  transfer_internal: <ArrowLeftRight className="size-4" />,
  transfer_external_out: <ArrowUpRight className="size-4" />,
  transfer_external_in: <ArrowDownLeft className="size-4" />,
  request_payment: <ArrowDownLeft className="size-4" />,
  payment: <ShoppingBag className="size-4" />,
  card_purchase: <CreditCard className="size-4" />,
  card_payment: <CreditCard className="size-4" />,
  card_load: <CreditCard className="size-4" />,
  card_unload: <CreditCard className="size-4" />,
  trade_buy: <LineChart className="size-4" />,
  trade_sell: <LineChart className="size-4" />,
  dividend: <HandCoins className="size-4" />,
  derivative_open: <LineChart className="size-4" />,
  derivative_close: <LineChart className="size-4" />,
  loan_disbursement: <Landmark className="size-4" />,
  loan_payment: <Landmark className="size-4" />,
  credit_line_draw: <Landmark className="size-4" />,
  credit_line_repayment: <Landmark className="size-4" />,
  savings_in: <PiggyBank className="size-4" />,
  savings_out: <PiggyBank className="size-4" />,
  deposit_open: <PiggyBank className="size-4" />,
  deposit_close: <PiggyBank className="size-4" />,
  interest_earned: <HandCoins className="size-4" />,
  insurance_premium: <ShieldCheck className="size-4" />,
  insurance_claim: <ShieldCheck className="size-4" />,
  property_buy: <Building2 className="size-4" />,
  property_sell: <Building2 className="size-4" />,
  rent_income: <Building2 className="size-4" />,
  rent_deposit_in: <Building2 className="size-4" />,
  rent_deposit_out: <Building2 className="size-4" />,
  property_expense: <Building2 className="size-4" />,
  donation: <Gift className="size-4" />,
  fee: <Receipt className="size-4" />,
  interest_charged: <Receipt className="size-4" />,
};

/** Importe con signo para listados generales (sin cuenta de referencia). */
export function txSignedGeneral(tx: Transaction): { amount: number; currency: Transaction['currency']; sign: 1 | -1 | 0 } {
  if (tx.flow === 'income') return { amount: tx.toAmount ?? tx.amount, currency: tx.toCurrency ?? tx.currency, sign: 1 };
  if (tx.flow === 'expense') return { amount: tx.amount, currency: tx.currency, sign: -1 };
  if (tx.to.type === 'account' && tx.from.type !== 'account') return { amount: tx.toAmount ?? tx.amount, currency: tx.toCurrency ?? tx.currency, sign: 1 };
  if (tx.from.type === 'account' && tx.to.type !== 'account') return { amount: tx.amount, currency: tx.currency, sign: -1 };
  return { amount: tx.amount, currency: tx.currency, sign: 0 };
}

export function TxRow({
  tx,
  signed,
  currency,
  hide,
  onClick,
}: {
  tx: Transaction;
  signed?: number;
  currency?: Transaction['currency'];
  hide?: boolean;
  onClick?: () => void;
}) {
  const g = txSignedGeneral(tx);
  const neutral = signed === undefined && g.sign === 0;
  const value = signed ?? (neutral ? g.amount : g.amount * g.sign);
  const cur = currency ?? g.currency;
  const failed = tx.status === 'failed' || tx.status === 'cancelled';
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx('flex w-full items-center gap-3 py-3 text-left', onClick && 'rounded-xl px-2 -mx-2 hover:bg-surface-2')}
    >
      <div
        className={cx(
          'flex size-9 shrink-0 items-center justify-center rounded-xl',
          failed ? 'bg-neg/10 text-neg' : neutral ? 'bg-accent/12 text-accent' : value > 0 ? 'bg-pos/12 text-pos' : value < 0 ? 'bg-surface-2 text-muted' : 'bg-accent/12 text-accent',
        )}
      >
        {KIND_ICON[tx.kind] ?? <Wallet className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{tx.concept}</div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-muted">
          <span className="truncate">{KIND_LABELS[tx.kind]}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{formatDateTime(tx.at)}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={cx('tabular text-sm font-semibold', failed ? 'text-subtle line-through' : neutral ? 'text-muted' : value > 0 ? 'text-pos' : 'text-fg')}>
          {formatMoney(value, cur, { sign: !neutral && value !== 0, hide })}
        </div>
        {tx.status !== 'completed' ? (
          <Badge tone={tx.status === 'pending' ? 'warn' : 'neg'} className="mt-1">
            {STATUS_LABELS[tx.status]}
          </Badge>
        ) : (
          <div className="mt-0.5 text-[11px] text-subtle">{CATEGORY_LABELS[tx.category]}</div>
        )}
      </div>
    </Comp>
  );
}

export function AccountTypeLabel({ type }: { type: Account['type'] }) {
  return <>{ACCOUNT_TYPE_LABELS[type]}</>;
}
