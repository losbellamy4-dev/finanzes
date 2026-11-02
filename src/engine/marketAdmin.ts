/**
 * CONTROL AVANZADO DEL MERCADO: regímenes, tendencias, precios manuales,
 * activos y empresas personalizadas, escenarios y velocidad de simulación.
 * Todas las funciones están disponibles sin restricciones.
 */
import type { AssetType, Regime, Scenario } from '@/core/schema';
import { AssetTypeSchema, RegimeSchema } from '@/core/schema';
import { formatPrice } from '@/core/money';
import { HOURS_PER_DAY } from '@/core/time';
import { assertText, base, fail, findById, nextId, notify, nowISO, type S } from './context';
import { assetById, createAssetObject, REGIMES, simulateHistory } from './market';
import { ASSET_TYPE_SINGULAR } from '@/data/assets';

export const SPEED_PRESETS = [
  { value: 0, label: 'Pausa' },
  { value: 0.25, label: '1 h / 4 s' },
  { value: 1, label: '1 h / s' },
  { value: 6, label: '6 h / s' },
  { value: 24, label: '1 día / s' },
] as const;

function logEvent(s: S, message: string): void {
  s.market.events.unshift({ at: nowISO(s), message });
  if (s.market.events.length > 100) s.market.events.length = 100;
}

function finite(v: number, min: number, max: number, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail('INVALID_INPUT', `${label} fuera de rango (${min} a ${max}).`);
  return v;
}

export function setRegime(s: S, p: { regime: Regime }): void {
  if (!RegimeSchema.safeParse(p.regime).success) fail('INVALID_INPUT', 'Régimen no válido.');
  s.market.regime = p.regime;
  logEvent(s, `Régimen de mercado: ${REGIMES[p.regime].label}`);
  notify(s, 'info', 'Régimen de mercado actualizado', `${REGIMES[p.regime].label}: ${REGIMES[p.regime].description}`, '/market-control');
}

export function setGlobalTrend(s: S, p: { value: number }): void {
  s.market.globalTrend = finite(p.value, -2, 2, 'La tendencia global');
  logEvent(s, `Tendencia global ajustada a ${(p.value * 100).toFixed(0)} % anual`);
}

export function setCategoryTrend(s: S, p: { type: AssetType; drift: number; volMultiplier: number }): void {
  if (!AssetTypeSchema.safeParse(p.type).success) fail('INVALID_INPUT', 'Categoría no válida.');
  s.market.categoryTrends[p.type] = {
    drift: finite(p.drift, -3, 3, 'La tendencia'),
    volMultiplier: finite(p.volMultiplier, 0.1, 10, 'El multiplicador de volatilidad'),
  };
  logEvent(s, `Mercado ${p.type}: tendencia ${(p.drift * 100).toFixed(0)} %, volatilidad x${p.volMultiplier.toFixed(1)}`);
}

export function setRealEstateTrend(s: S, p: { value: number }): void {
  s.market.realEstateTrend = finite(p.value, -0.5, 0.5, 'La tendencia inmobiliaria');
  logEvent(s, `Tendencia inmobiliaria ajustada a ${(p.value * 100).toFixed(1)} % anual`);
}

export function setFeeRate(s: S, p: { rate: number }): void {
  s.market.feeRate = finite(p.rate, 0, 0.05, 'La comisión');
}

export function setSpeed(s: S, p: { speed: number }): void {
  s.clock.speed = finite(p.speed, 0, 240, 'La velocidad');
}

export function reseed(s: S, p: { seed: number }): void {
  if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 4294967295) fail('INVALID_INPUT', 'La semilla debe ser un entero entre 0 y 4294967295.');
  s.market.seed = p.seed;
  logEvent(s, `Semilla de simulación cambiada a ${p.seed}`);
}

export function setAssetParams(s: S, p: { assetId: string; drift: number | null; volatility: number | null }): void {
  const a = assetById(s.market, p.assetId);
  if (!a) fail('ASSET_NOT_FOUND', 'Activo no encontrado.');
  a.driftOverride = p.drift === null ? null : finite(p.drift, -3, 3, 'La tendencia');
  a.volOverride = p.volatility === null ? null : finite(p.volatility, 0, 4, 'La volatilidad');
  logEvent(s, `${a.symbol}: parámetros ${p.drift === null && p.volatility === null ? 'restablecidos' : 'ajustados manualmente'}`);
}

export function setAssetPrice(s: S, p: { assetId: string; price: number }): void {
  const a = assetById(s.market, p.assetId);
  if (!a) fail('ASSET_NOT_FOUND', 'Activo no encontrado.');
  finite(p.price, 1e-8, 1e12, 'El precio');
  if (p.price <= 0) fail('INVALID_INPUT', 'El precio debe ser positivo.');
  const old = a.price;
  a.price = p.price;
  a.dayHigh = Math.max(a.dayHigh, p.price);
  a.dayLow = Math.min(a.dayLow, p.price);
  a.intraday.push({ t: s.clock.tick, p: p.price });
  logEvent(s, `${a.symbol}: precio fijado manualmente de ${formatPrice(old, base(s))} a ${formatPrice(p.price, base(s))}`);
}

export interface CreateAssetInput {
  symbol: string;
  name: string;
  type: AssetType;
  sector?: string;
  price: number;
  drift: number;
  volatility: number;
  beta?: number;
  yield?: number;
  description?: string;
  company?: { country: string; employees: number; founded: number; ceo: string };
  historyDays?: number;
}

export function createAsset(s: S, p: CreateAssetInput): string {
  const symbol = assertText(p.symbol, 'El símbolo', 10).toUpperCase();
  if (!/^[A-Z0-9.]{1,10}$/.test(symbol)) fail('INVALID_INPUT', 'El símbolo solo admite letras, números y punto.');
  if (s.market.assets.some((a) => a.symbol === symbol)) fail('DUPLICATE', `Ya existe un activo con el símbolo ${symbol}.`);
  const name = assertText(p.name, 'El nombre', 80);
  if (!AssetTypeSchema.safeParse(p.type).success) fail('INVALID_INPUT', 'Tipo de activo no válido.');
  const price = finite(p.price, 1e-6, 1e9, 'El precio');
  const drift = finite(p.drift, -3, 3, 'La tendencia');
  const volatility = finite(p.volatility, 0, 4, 'La volatilidad');
  const beta = p.beta === undefined ? 1 : finite(p.beta, -3, 5, 'La beta');
  const yld = p.yield === undefined ? 0 : finite(p.yield, 0, 0.5, 'La rentabilidad por dividendo');
  const id = nextId(s, 'cus');
  const sector = (p.sector ?? '').trim() || ASSET_TYPE_SINGULAR[p.type];
  const asset = createAssetObject(
    id,
    {
      symbol,
      name,
      type: p.type,
      sector,
      price,
      drift,
      volatility,
      beta,
      yield: yld,
      baseVolume: Math.round(1_000_000 / Math.max(1, Math.sqrt(price))),
      description: (p.description ?? '').trim().slice(0, 600) || `Activo personalizado creado en el panel de control.`,
      company: p.company && p.type === 'stock'
        ? {
            sector,
            country: p.company.country.slice(0, 60),
            employees: Math.max(0, Math.round(p.company.employees)),
            founded: Math.round(p.company.founded),
            ceo: p.company.ceo.slice(0, 80),
          }
        : undefined,
    },
    true,
  );
  // Historial previo generado con el mismo modelo y reescalado al precio indicado.
  const days = Math.min(365, Math.max(0, Math.round(p.historyDays ?? 90)));
  if (days > 0) {
    const to = s.clock.tick;
    simulateHistory(s.market, [asset], to - days * HOURS_PER_DAY, to);
    const k = price / asset.price;
    for (const c of asset.daily) {
      c.o *= k;
      c.h *= k;
      c.l *= k;
      c.c *= k;
    }
    for (const pt of asset.intraday) pt.p *= k;
    asset.price = price;
    asset.prevClose *= k;
    asset.dayOpen *= k;
    asset.dayHigh = Math.max(asset.dayHigh * k, price);
    asset.dayLow = Math.min(asset.dayLow * k, price);
  }
  s.market.assets.push(asset);
  logEvent(s, `Nuevo activo listado: ${name} (${symbol})`);
  return id;
}

export function deleteAsset(s: S, p: { assetId: string }): void {
  const a = assetById(s.market, p.assetId);
  if (!a) fail('ASSET_NOT_FOUND', 'Activo no encontrado.');
  if (!a.custom) fail('INVALID_STATE', 'Solo se pueden eliminar activos personalizados.');
  if (s.portfolio.positions.some((x) => x.assetId === a.id)) fail('IN_USE', 'Tienes posiciones abiertas en este activo.');
  if (s.portfolio.derivatives.some((x) => x.underlyingId === a.id && x.status === 'open')) fail('IN_USE', 'Hay derivados abiertos sobre este activo.');
  if (s.deposits.some((x) => x.underlyingId === a.id && x.status === 'active')) fail('IN_USE', 'Hay depósitos estructurados ligados a este activo.');
  s.market.assets = s.market.assets.filter((x) => x.id !== a.id);
  s.portfolio.watchlist = s.portfolio.watchlist.filter((x) => x !== a.id);
  logEvent(s, `Activo excluido de cotización: ${a.symbol}`);
}

export interface CreateScenarioInput {
  name: string;
  kind: Scenario['kind'];
  drift: number;
  volMultiplier: number;
  durationDays: number;
  targets: Scenario['targets'];
  description?: string;
}

export function createScenario(s: S, p: CreateScenarioInput): string {
  const name = assertText(p.name, 'El nombre', 60);
  if (!['crisis', 'recovery', 'custom'].includes(p.kind)) fail('INVALID_INPUT', 'Tipo de escenario no válido.');
  const id = nextId(s, 'scn');
  s.market.scenarios.push({
    id,
    name,
    kind: p.kind,
    drift: finite(p.drift, -3, 3, 'La tendencia'),
    volMultiplier: finite(p.volMultiplier, 0.1, 10, 'La volatilidad'),
    durationDays: Math.round(finite(p.durationDays, 1, 3650, 'La duración')),
    targets: Array.isArray(p.targets) ? p.targets.filter((t) => t === 'real_estate' || AssetTypeSchema.safeParse(t).success) : [],
    description: (p.description ?? '').slice(0, 300),
  });
  return id;
}

export function deleteScenario(s: S, p: { scenarioId: string }): void {
  findById(s.market.scenarios, p.scenarioId, 'Escenario');
  if (s.market.activeScenario?.scenarioId === p.scenarioId) s.market.activeScenario = null;
  s.market.scenarios = s.market.scenarios.filter((x) => x.id !== p.scenarioId);
}

export function activateScenario(s: S, p: { scenarioId: string }): void {
  const sc = findById(s.market.scenarios, p.scenarioId, 'Escenario');
  s.market.activeScenario = {
    scenarioId: sc.id,
    name: sc.name,
    endsAtTick: s.clock.tick + sc.durationDays * HOURS_PER_DAY,
    previousRegime: s.market.regime,
  };
  logEvent(s, `Escenario activado: ${sc.name} (${sc.durationDays} días)`);
  notify(s, sc.kind === 'crisis' ? 'warning' : 'info', `Escenario «${sc.name}» activado`, sc.description || 'El mercado reaccionará durante el periodo configurado.', '/market-control');
}

export function stopScenario(s: S): void {
  if (!s.market.activeScenario) fail('INVALID_STATE', 'No hay ningún escenario activo.');
  logEvent(s, `Escenario finalizado: ${s.market.activeScenario.name}`);
  s.market.activeScenario = null;
}

export function checkScenarioExpiry(s: S): void {
  const a = s.market.activeScenario;
  if (a && s.clock.tick >= a.endsAtTick) {
    logEvent(s, `Escenario finalizado: ${a.name}`);
    notify(s, 'info', 'Escenario finalizado', `«${a.name}» ha terminado. El mercado vuelve a su régimen habitual.`, '/market-control');
    s.market.activeScenario = null;
  }
}

export const DEFAULT_SCENARIOS: Omit<Scenario, 'id'>[] = [
  { name: 'Crisis financiera global', kind: 'crisis', drift: -0.9, volMultiplier: 2.4, durationDays: 60, targets: [], description: 'Colapso del crédito: caídas generalizadas y volatilidad extrema en todos los mercados.' },
  { name: 'Invierno cripto', kind: 'crisis', drift: -1.6, volMultiplier: 1.8, durationDays: 45, targets: ['crypto'], description: 'Desplome prolongado de las criptomonedas simuladas.' },
  { name: 'Pinchazo inmobiliario', kind: 'crisis', drift: -0.35, volMultiplier: 2, durationDays: 365, targets: ['real_estate', 'fund'], description: 'Caída del precio de la vivienda y de los fondos inmobiliarios.' },
  { name: 'Recuperación en V', kind: 'recovery', drift: 0.8, volMultiplier: 1.3, durationDays: 90, targets: [], description: 'Fuerte rebote de los activos de riesgo tras la crisis.' },
  { name: 'Boom tecnológico', kind: 'recovery', drift: 0.9, volMultiplier: 1.4, durationDays: 120, targets: ['stock', 'etf', 'index'], description: 'Euforia en renta variable impulsada por la tecnología.' },
];
