/**
 * MOTOR DE MERCADO.
 *
 * Cada activo sigue un movimiento browniano geométrico discretizado por
 * horas simuladas:  P(t+1) = P(t) · exp((μ − σ²/2)·dt + σ·√dt·Z)
 *
 * Z se obtiene de forma determinista a partir de (semilla, activo, tick), de
 * modo que con la misma semilla y los mismos parámetros la evolución es
 * idéntica y reproducible. Nunca se generan precios al renderizar.
 *
 * μ y σ dependen de:
 *  - los parámetros propios del activo (o los ajustes manuales del usuario),
 *  - el régimen global (normal, alcista, bajista, lateral, crisis, recuperación),
 *  - la tendencia global configurada,
 *  - la tendencia por categoría de mercado,
 *  - el escenario activo (crisis/recuperación personalizada).
 */
import type { Asset, AssetType, Market, Regime } from '@/core/schema';
import { gaussianAt } from '@/core/random';
import { HOURS_PER_DAY, HOURS_PER_YEAR } from '@/core/time';

export const REGIMES: Record<Regime, { label: string; drift: number; vol: number; driftScale: number; description: string }> = {
  normal: { label: 'Normal', drift: 0, vol: 1, driftScale: 1, description: 'Cada activo evoluciona según sus fundamentales simulados.' },
  bull: { label: 'Alcista', drift: 0.3, vol: 0.85, driftScale: 1, description: 'Optimismo generalizado: subidas sostenidas y menor volatilidad.' },
  bear: { label: 'Bajista', drift: -0.25, vol: 1.25, driftScale: 1, description: 'Pesimismo: caídas graduales y mayor volatilidad.' },
  sideways: { label: 'Lateral', drift: 0, vol: 0.6, driftScale: 0.1, description: 'Sin tendencia clara: los precios oscilan en rango.' },
  crisis: { label: 'Crisis', drift: -0.85, vol: 2.4, driftScale: 0.5, description: 'Pánico vendedor: desplomes bruscos y volatilidad extrema.' },
  recovery: { label: 'Recuperación', drift: 0.45, vol: 1.3, driftScale: 1, description: 'Rebote tras una crisis: fuertes subidas con volatilidad elevada.' },
};

export const INTRADAY_POINTS = 24 * 7;
export const DAILY_POINTS = 1100;
const DT = 1 / HOURS_PER_YEAR;
const SQRT_DT = Math.sqrt(DT);

export interface EffectiveParams {
  mu: number;
  sigma: number;
}

export function scenarioAdjustment(m: Market, target: AssetType | 'real_estate'): { drift: number; vol: number } {
  if (!m.activeScenario) return { drift: 0, vol: 1 };
  const sc = m.scenarios.find((x) => x.id === m.activeScenario!.scenarioId);
  if (!sc) return { drift: 0, vol: 1 };
  if (sc.targets.length > 0 && !sc.targets.includes(target)) return { drift: 0, vol: 1 };
  return { drift: sc.drift, vol: sc.volMultiplier };
}

export function effectiveParams(m: Market, a: Asset): EffectiveParams {
  const reg = REGIMES[m.regime];
  const cat = m.categoryTrends[a.type] ?? { drift: 0, volMultiplier: 1 };
  const sc = scenarioAdjustment(m, a.type);
  const own = a.driftOverride ?? a.drift;
  const beta = a.beta;
  const mu = own * reg.driftScale + (reg.drift + m.globalTrend + sc.drift) * beta + cat.drift;
  const sigma = (a.volOverride ?? a.volatility) * reg.vol * cat.volMultiplier * sc.vol;
  return { mu, sigma: Math.max(0, sigma) };
}

function roundPrice(p: number): number {
  if (p >= 1) return Math.round(p * 10000) / 10000;
  return Number(p.toPrecision(6));
}

/** Avanza un activo un tick (una hora simulada). */
export function stepAsset(m: Market, a: Asset, tick: number, recordIntraday = true): void {
  const { mu, sigma } = effectiveParams(m, a);
  const z = gaussianAt(m.seed, a.id, tick);
  const ret = (mu - 0.5 * sigma * sigma) * DT + sigma * SQRT_DT * z;
  let p = a.price * Math.exp(ret);
  if (!Number.isFinite(p) || p <= 0) p = a.price;
  p = Math.min(Math.max(roundPrice(p), 1e-8), 1e12);
  a.price = p;
  if (p > a.dayHigh) a.dayHigh = p;
  if (p < a.dayLow) a.dayLow = p;
  const baseSigma = a.volOverride ?? a.volatility;
  const activity = baseSigma > 0 ? Math.min(4, sigma / baseSigma) : 1;
  a.dayVolume += (a.baseVolume / HOURS_PER_DAY) * (0.45 + Math.abs(z) * 0.75) * activity;
  if (recordIntraday) {
    a.intraday.push({ t: tick, p });
    if (a.intraday.length > INTRADAY_POINTS) a.intraday.splice(0, a.intraday.length - INTRADAY_POINTS);
  }
}

/** Cierra la vela diaria del activo y abre la siguiente. */
export function closeAssetDay(a: Asset, day: number): void {
  a.daily.push({ d: day, o: a.dayOpen, h: a.dayHigh, l: a.dayLow, c: a.price, v: Math.round(a.dayVolume) });
  if (a.daily.length > DAILY_POINTS) a.daily.splice(0, a.daily.length - DAILY_POINTS);
  a.prevClose = a.price;
  a.dayOpen = a.price;
  a.dayHigh = a.price;
  a.dayLow = a.price;
  a.dayVolume = 0;
}

/** Avanza todo el mercado hasta `tick` (inclusive) desde el tick actual. */
export function stepMarketTick(m: Market, tick: number, recordIntraday = true): void {
  for (const a of m.assets) stepAsset(m, a, tick, recordIntraday);
  if (tick % HOURS_PER_DAY === 0) {
    const day = tick / HOURS_PER_DAY - 1;
    for (const a of m.assets) closeAssetDay(a, day);
  }
}

/**
 * Genera el historial de un activo simulando hacia delante entre dos ticks.
 * Se usa al crear perfiles o activos personalizados.
 */
export function simulateHistory(m: Market, assets: Asset[], fromTick: number, toTick: number): void {
  const intradayFrom = toTick - INTRADAY_POINTS;
  for (let t = fromTick + 1; t <= toTick; t++) {
    const rec = t > intradayFrom;
    for (const a of assets) stepAsset(m, a, t, rec);
    if (t % HOURS_PER_DAY === 0) {
      const day = t / HOURS_PER_DAY - 1;
      for (const a of assets) closeAssetDay(a, day);
    }
  }
}

/**
 * Copia mutable del mercado para la simulación intensiva. Evita el coste de
 * los proxies de Immer al avanzar muchas horas: los arrays de historial se
 * copian (punteros) y los objetos existentes nunca se mutan.
 */
export function thawMarket(m: Market): Market {
  return {
    ...m,
    categoryTrends: { ...m.categoryTrends },
    activeScenario: m.activeScenario ? { ...m.activeScenario } : null,
    events: m.events.slice(),
    assets: m.assets.map((a) => ({ ...a, intraday: a.intraday.slice(), daily: a.daily.slice() })),
  };
}

export function dailyChange(a: Asset): number {
  return a.prevClose > 0 ? a.price / a.prevClose - 1 : 0;
}

export function assetById(m: Market, id: string): Asset | undefined {
  return m.assets.find((a) => a.id === id);
}

/** Rentabilidad entre hace N días y ahora, a partir del historial diario. */
export function changeOverDays(a: Asset, days: number): number {
  if (a.daily.length === 0) return 0;
  const idx = Math.max(0, a.daily.length - days);
  const ref = a.daily[idx].c;
  return ref > 0 ? a.price / ref - 1 : 0;
}

/** Volatilidad anualizada realizada en los últimos N días. */
export function realizedVolatility(a: Asset, days = 30): number {
  const d = a.daily.slice(-days - 1);
  if (d.length < 3) return a.volatility;
  const rets: number[] = [];
  for (let i = 1; i < d.length; i++) rets.push(Math.log(d[i].c / d[i - 1].c));
  const mean = rets.reduce((x, y) => x + y, 0) / rets.length;
  const variance = rets.reduce((x, y) => x + (y - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance * 365);
}

export function trendLabel(a: Asset): 'alcista' | 'bajista' | 'lateral' {
  const ch = changeOverDays(a, 30);
  if (ch > 0.03) return 'alcista';
  if (ch < -0.03) return 'bajista';
  return 'lateral';
}

export function createAssetObject(
  id: string,
  seed: {
    symbol: string;
    name: string;
    type: AssetType;
    sector: string;
    price: number;
    drift: number;
    volatility: number;
    beta: number;
    yield: number;
    baseVolume: number;
    description: string;
    company?: Asset['company'];
  },
  custom: boolean,
): Asset {
  const p = seed.price;
  return {
    id,
    symbol: seed.symbol.toUpperCase(),
    name: seed.name,
    type: seed.type,
    sector: seed.sector,
    description: seed.description,
    price: p,
    prevClose: p,
    dayOpen: p,
    dayHigh: p,
    dayLow: p,
    dayVolume: 0,
    baseVolume: seed.baseVolume,
    drift: seed.drift,
    volatility: seed.volatility,
    beta: seed.beta,
    yield: seed.yield,
    driftOverride: null,
    volOverride: null,
    intraday: [],
    daily: [],
    custom,
    ...(seed.company ? { company: seed.company } : {}),
  };
}
