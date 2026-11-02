/**
 * Creación del estado inicial de un perfil financiero.
 */
import type { AssetType, Currency, ProfileState } from '@/core/schema';
import { SCHEMA_VERSION } from '@/core/schema';
import { FX_RATES } from '@/core/money';
import { HOURS_PER_DAY, startOfUTCDay, tickToISO } from '@/core/time';
import { ASSET_SEEDS } from '@/data/assets';
import { generateProperty, generateTenants } from '@/data/realestate';
import { createAssetObject, simulateHistory } from './market';
import { DEFAULT_SCENARIOS } from './marketAdmin';
import { recordCreditScore } from './creditScore';

export interface NewProfileOptions {
  id: string;
  name: string;
  ownerName: string;
  baseCurrency: Currency;
  country: string;
  seed: number;
  now: Date;
  color?: string;
  historyDays?: number;
  listings?: number;
}

const ASSET_TYPES: AssetType[] = ['stock', 'etf', 'index', 'crypto', 'bond', 'fund'];

export function createProfileState(o: NewProfileOptions): ProfileState {
  const startAt = startOfUTCDay(o.now).toISOString();
  const tick = o.now.getUTCHours();
  const fx = FX_RATES[o.baseCurrency];
  const assets = ASSET_SEEDS.map((seed) =>
    createAssetObject(`ast_${seed.symbol.toLowerCase()}`, { ...seed, price: seed.price * fx }, false),
  );
  const s: ProfileState = {
    schemaVersion: SCHEMA_VERSION,
    profile: {
      id: o.id,
      name: o.name.trim().slice(0, 60) || 'Mi perfil',
      ownerName: o.ownerName.trim().slice(0, 80) || 'Titular',
      baseCurrency: o.baseCurrency,
      country: o.country.toUpperCase().slice(0, 2),
      createdAt: o.now.toISOString(),
      color: o.color ?? '#5488F5',
    },
    clock: { startAt, tick, speed: 0.25 },
    seq: 0,
    accounts: [],
    transactions: [],
    contacts: [],
    scheduled: [],
    requests: [],
    cards: [],
    market: {
      seed: o.seed >>> 0,
      regime: 'normal',
      globalTrend: 0,
      categoryTrends: Object.fromEntries(ASSET_TYPES.map((t) => [t, { drift: 0, volMultiplier: 1 }])),
      realEstateTrend: 0,
      feeRate: 0,
      activeScenario: null,
      scenarios: DEFAULT_SCENARIOS.map((sc, i) => ({ ...sc, id: `scn_def${i + 1}` })),
      events: [],
      assets,
    },
    portfolio: { positions: [], trades: [], derivatives: [], watchlist: ['ast_aurx', 'ast_nxc', 'ast_nxwd'], realizedPnL: 0, incomeReceived: 0 },
    goals: [],
    deposits: [],
    loans: [],
    creditLines: [],
    insurance: [],
    vault: [],
    beneficiaries: [],
    donations: [],
    properties: [],
    tenants: [],
    rentals: [],
    creditEvents: [],
    creditHistory: [],
    netWorthHistory: [],
    notifications: [],
    settings: {
      hideBalances: false,
      propertyPurchaseCostRate: 0.08,
      propertySaleCostRate: 0.03,
      dashboardAccounts: [],
    },
    processedOps: [],
  };
  // Historial de mercado del último año simulado con el propio motor.
  const days = o.historyDays ?? 365;
  simulateHistory(s.market, s.market.assets, tick - days * HOURS_PER_DAY, tick);
  s.market.events.push({ at: tickToISO(startAt, tick), message: 'Apertura del mercado simulado NEXUS' });

  const listings = o.listings ?? 18;
  const nowISO = tickToISO(startAt, tick);
  for (let i = 0; i < listings; i++) {
    s.seq += 1;
    s.properties.push(generateProperty(s.market.seed, i, `prop_${s.seq.toString(36).padStart(5, '0')}`, fx, nowISO));
  }
  s.tenants = generateTenants(s.market.seed, 16, fx, 1);
  recordCreditScore(s);
  s.netWorthHistory.push({ at: nowISO, v: 0 });
  return s;
}
