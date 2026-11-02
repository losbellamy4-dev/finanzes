/**
 * MOTOR DE TRANSACCIONES (libro mayor).
 *
 * Es el único punto del sistema que modifica saldos de cuentas bancarias.
 * Toda operación con dinero (ingresos, pagos, compras de activos, cuotas,
 * rentas...) se registra aquí como un movimiento auditable.
 *
 * Garantías:
 *  - Validación de importes (enteros positivos en céntimos, con máximo).
 *  - Validación de cuentas (existentes y abiertas) y de saldo disponible.
 *  - Toda la validación ocurre ANTES de mutar el estado, por lo que una
 *    operación rechazada nunca deja cambios parciales. Además el despachador
 *    ejecuta cada comando dentro de un borrador Immer: si algo falla, el
 *    borrador se descarta completo (atomicidad).
 *  - Conversión de divisas con tipos simulados.
 *  - Registro del saldo resultante de cada cuenta implicada.
 */
import type { Category, Currency, Endpoint, Flow, Transaction, TxKind, TxStatus } from '@/core/schema';
import { convert, formatMoney, fxRate } from '@/core/money';
import { assertAmount, base, fail, nextId, nowISO, openAccount, type S } from './context';

export interface PostSpec {
  kind: TxKind;
  flow: Flow;
  category: Category;
  concept: string;
  amount: number;
  from: Endpoint;
  to: Endpoint;
  /** Divisa en la que se expresa `amount` cuando el origen no es una cuenta. */
  currency?: Currency;
  /** Divisa del destino cuando no es una cuenta (por defecto, la base). */
  toCurrency?: Currency;
  /** Si es 'to', `amount` se expresa en la divisa de destino. */
  amountIn?: 'from' | 'to';
  status?: TxStatus;
  cardId?: string;
  refId?: string;
  opId?: string;
  failureReason?: string;
}

function sourceCurrency(s: S, spec: PostSpec, fromAcc?: { currency: Currency }, toAcc?: { currency: Currency }): Currency {
  if (fromAcc) return fromAcc.currency;
  if (spec.currency) return spec.currency;
  if ((spec.from.type === 'external' || spec.from.type === 'cash') && toAcc) return toAcc.currency;
  return base(s);
}

function destinationCurrency(s: S, spec: PostSpec, fromCur: Currency, toAcc?: { currency: Currency }): Currency {
  if (toAcc) return toAcc.currency;
  if (spec.toCurrency) return spec.toCurrency;
  if (spec.to.type === 'external' || spec.to.type === 'cash') return fromCur;
  return base(s);
}

/**
 * Registra un movimiento y actualiza los saldos de las cuentas implicadas.
 * Lanza DomainError (sin modificar nada) si la operación no es válida.
 */
export function post(s: S, spec: PostSpec): Transaction {
  assertAmount(spec.amount);
  if (spec.from.type === 'account' && spec.to.type === 'account' && spec.from.id === spec.to.id) {
    fail('SAME_ACCOUNT', 'La cuenta de origen y destino no pueden ser la misma.');
  }

  const status: TxStatus = spec.status ?? 'completed';
  const fromAcc = spec.from.type === 'account' ? openAccount(s, spec.from.id) : undefined;
  const toAcc = spec.to.type === 'account' ? openAccount(s, spec.to.id) : undefined;

  const fromCur = sourceCurrency(s, spec, fromAcc, toAcc);
  const destCur = destinationCurrency(s, spec, fromCur, toAcc);

  let fromAmount: number;
  let toAmount: number;
  if (spec.amountIn === 'to') {
    toAmount = spec.amount;
    fromAmount = convert(spec.amount, destCur, fromCur, 'ceil');
  } else {
    fromAmount = spec.amount;
    toAmount = convert(spec.amount, fromCur, destCur);
  }
  if (toAmount <= 0) fail('INVALID_AMOUNT', 'El importe es demasiado pequeño tras la conversión de divisa.');

  if (status === 'completed' || status === 'pending') {
    if (fromAcc) {
      const available = fromAcc.balance + fromAcc.overdraftLimit;
      if (fromAmount > available) {
        fail(
          'INSUFFICIENT_FUNDS',
          `Saldo insuficiente en «${fromAcc.name}». Disponible: ${formatMoney(available, fromAcc.currency)}.`,
        );
      }
    }
  }

  // --- A partir de aquí no se lanza ningún error: se aplican los cambios. ---
  const applyBalances = status === 'completed' || status === 'pending';
  if (applyBalances && fromAcc) fromAcc.balance -= fromAmount;
  if (applyBalances && toAcc) toAcc.balance += toAmount;

  const tx: Transaction = {
    id: nextId(s, 'tx'),
    at: nowISO(s),
    kind: spec.kind,
    flow: spec.flow,
    status,
    amount: fromAmount,
    currency: fromCur,
    from: { ...spec.from },
    to: { ...spec.to },
    concept: spec.concept.slice(0, 160),
    category: spec.category,
  };
  if (destCur !== fromCur || toAmount !== fromAmount) {
    tx.toAmount = toAmount;
    tx.toCurrency = destCur;
    tx.fxRate = fxRate(fromCur, destCur);
  }
  if (fromAcc) tx.fromBalanceAfter = fromAcc.balance;
  if (toAcc) tx.toBalanceAfter = toAcc.balance;
  if (spec.cardId) tx.cardId = spec.cardId;
  if (spec.refId) tx.refId = spec.refId;
  if (spec.opId) tx.opId = spec.opId;
  if (spec.failureReason) tx.failureReason = spec.failureReason.slice(0, 200);

  s.transactions.push(tx);
  return tx;
}

/** Registra un intento fallido (sin mover dinero) para que quede auditado. */
export function postFailed(s: S, spec: PostSpec, reason: string): Transaction | null {
  try {
    return post(s, { ...spec, status: 'failed', failureReason: reason });
  } catch {
    return null;
  }
}

/** Importe recibido por el destino de un movimiento. */
export function receivedAmount(tx: Transaction): number {
  return tx.toAmount ?? tx.amount;
}

export const accountEndpoint = (s: S, id: string): Endpoint => {
  const acc = openAccount(s, id);
  return { type: 'account', id: acc.id, label: acc.name };
};

export function txTouchesAccount(tx: Transaction, accountId: string): boolean {
  return (tx.from.type === 'account' && tx.from.id === accountId) || (tx.to.type === 'account' && tx.to.id === accountId);
}

/** Importe con signo de un movimiento desde el punto de vista de una cuenta. */
export function signedForAccount(tx: Transaction, accountId: string): number {
  if (tx.status === 'failed' || tx.status === 'cancelled') return 0;
  if (tx.to.type === 'account' && tx.to.id === accountId) return receivedAmount(tx);
  if (tx.from.type === 'account' && tx.from.id === accountId) return -tx.amount;
  return 0;
}
