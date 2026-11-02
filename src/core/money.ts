/**
 * Utilidades monetarias.
 *
 * Todos los importes se almacenan como enteros en céntimos (unidades menores)
 * para evitar errores de coma flotante. Los precios de activos de mercado se
 * guardan como números en unidades mayores (pueden tener muchos decimales) y
 * se convierten a céntimos en el momento de liquidar una operación.
 */

export type Cents = number;

export const CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'MXN', 'CAD', 'AUD'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** Tipos de cambio simulados respecto al euro (1 EUR = rate unidades). */
export const FX_RATES: Record<CurrencyCode, number> = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.85,
  CHF: 0.94,
  JPY: 162,
  MXN: 19.8,
  CAD: 1.47,
  AUD: 1.64,
};

export const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  EUR: 'Euro',
  USD: 'Dólar estadounidense',
  GBP: 'Libra esterlina',
  CHF: 'Franco suizo',
  JPY: 'Yen japonés',
  MXN: 'Peso mexicano',
  CAD: 'Dólar canadiense',
  AUD: 'Dólar australiano',
};

/** Máximo importe admitido en una sola operación (1.000 millones). */
export const MAX_OPERATION_CENTS: Cents = 100_000_000_000;

export function toCents(major: number): Cents {
  return Math.round(major * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

export function fxRate(from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return 1;
  return FX_RATES[to] / FX_RATES[from];
}

/** Convierte un importe en céntimos entre divisas usando los tipos simulados. */
export function convert(cents: Cents, from: CurrencyCode, to: CurrencyCode, mode: 'round' | 'ceil' = 'round'): Cents {
  if (from === to) return cents;
  const raw = cents * fxRate(from, to);
  return mode === 'ceil' ? Math.ceil(raw - 1e-9) : Math.round(raw);
}

/**
 * Interpreta un importe escrito por el usuario. Admite formatos españoles
 * ("1.234,56") e internacionales ("1,234.56" o "1234.56").
 * Devuelve céntimos o null si no es un número válido.
 */
export function parseMoney(input: string): Cents | null {
  if (typeof input !== 'string') return null;
  let s = input.replace(/[\s€$£¥]|EUR|USD|GBP|CHF|JPY|MXN|CAD|AUD/gi, '').trim();
  if (!s) return null;
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalized = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) normalized = `${parts[0]}.${parts[1]}`;
    else if (parts.slice(1).every((p) => p.length === 3)) normalized = parts.join('');
    else return null;
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && parts[0].length <= 3 && parts[0] !== '0') {
      normalized = parts.join('');
    } else if (parts.length === 2) {
      normalized = s;
    } else return null;
  } else {
    normalized = s;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [intPart, decPart = ''] = normalized.split('.');
  if (decPart.length > 2) return null;
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'));
  if (!Number.isFinite(cents) || !Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(key: string, factory: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = formatterCache.get(key);
  if (!f) {
    f = factory();
    formatterCache.set(key, f);
  }
  return f;
}

export interface FormatMoneyOptions {
  sign?: boolean;
  compact?: boolean;
  hide?: boolean;
  decimals?: number;
}

export function formatMoney(cents: Cents, currency: CurrencyCode = 'EUR', opts: FormatMoneyOptions = {}): string {
  if (opts.hide) return '•••••';
  const major = cents / 100;
  const compact = opts.compact && Math.abs(major) >= 100_000;
  const decimals = opts.decimals ?? (currency === 'JPY' ? 0 : 2);
  const key = `m:${currency}:${compact}:${decimals}:${opts.sign}`;
  const f = getFormatter(key, () =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      minimumFractionDigits: compact ? 0 : decimals,
      maximumFractionDigits: compact ? 1 : decimals,
      signDisplay: opts.sign ? 'exceptZero' : 'auto',
      useGrouping: 'always',
    } as unknown as Intl.NumberFormatOptions),
  );
  return f.format(major);
}

/** Formatea el precio de un activo con decimales adaptados a su magnitud. */
export function formatPrice(price: number, currency: CurrencyCode = 'EUR'): string {
  const abs = Math.abs(price);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  const key = `p:${currency}:${decimals}`;
  const f = getFormatter(key, () =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: 'always',
    } as unknown as Intl.NumberFormatOptions),
  );
  return f.format(price);
}

export function formatPct(ratio: number, digits = 2, sign = true): string {
  const key = `pct:${digits}:${sign}`;
  const f = getFormatter(key, () =>
    new Intl.NumberFormat('es-ES', {
      style: 'percent',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: sign ? 'exceptZero' : 'auto',
    }),
  );
  return f.format(Number.isFinite(ratio) ? ratio : 0);
}

export function formatNumber(n: number, maxDecimals = 2): string {
  const key = `n:${maxDecimals}`;
  const f = getFormatter(key, () =>
    new Intl.NumberFormat('es-ES', { maximumFractionDigits: maxDecimals, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions),
  );
  return f.format(n);
}

export function formatQty(q: number): string {
  const abs = Math.abs(q);
  return formatNumber(q, abs >= 100 ? 2 : abs >= 1 ? 4 : 8);
}

/** Redondea cantidades fraccionarias de activos a 8 decimales. */
export function roundQty(q: number): number {
  return Math.round(q * 1e8) / 1e8;
}
