/**
 * Modelo de datos de NEXUS FINANCE.
 *
 * Los esquemas Zod son la fuente única de verdad: los tipos TypeScript se
 * derivan de ellos y se reutilizan para validar datos importados y para
 * aplicar migraciones de esquema.
 */
import { z } from 'zod';
import { CURRENCY_CODES } from './money';

export const SCHEMA_VERSION = 1;

const Id = z.string().min(1).max(80);
const Cents = z.number().int().safe();
const PosCents = Cents.min(0);
const ISO = z.string().min(10).max(40);
const Rate = z.number().min(-1).max(10);
const Text = (max = 200) => z.string().max(max);

export const CurrencySchema = z.enum(CURRENCY_CODES);
export type Currency = z.infer<typeof CurrencySchema>;

export const FrequencySchema = z.enum(['once', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']);

/* ------------------------------------------------------------------ */
/* Perfil y reloj                                                      */
/* ------------------------------------------------------------------ */

export const ProfileInfoSchema = z.object({
  id: Id,
  name: Text(60).min(1),
  ownerName: Text(80).min(1),
  baseCurrency: CurrencySchema,
  country: z.string().length(2),
  createdAt: ISO,
  color: Text(20),
});
export type ProfileInfo = z.infer<typeof ProfileInfoSchema>;

export const ClockSchema = z.object({
  startAt: ISO,
  tick: z.number().int(),
  /** Horas simuladas por segundo real (0 = pausa). */
  speed: z.number().min(0).max(240),
});

/* ------------------------------------------------------------------ */
/* Banca                                                               */
/* ------------------------------------------------------------------ */

export const AccountTypeSchema = z.enum(['checking', 'savings', 'investment', 'business']);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const AccountSchema = z.object({
  id: Id,
  name: Text(60).min(1),
  holder: Text(80).min(1),
  country: z.string().length(2),
  currency: CurrencySchema,
  iban: Text(40),
  number: Text(30),
  balance: Cents,
  openedAt: ISO,
  type: AccountTypeSchema,
  status: z.enum(['open', 'closed']),
  closedAt: ISO.optional(),
  favorite: z.boolean(),
  color: Text(20),
  /** Interés nominal anual (0.02 = 2 %). */
  interestRate: Rate,
  overdraftLimit: PosCents,
});
export type Account = z.infer<typeof AccountSchema>;

export const CATEGORY_IDS = [
  'salary',
  'income',
  'groceries',
  'restaurants',
  'transport',
  'shopping',
  'utilities',
  'housing',
  'entertainment',
  'health',
  'travel',
  'education',
  'subscriptions',
  'transfers',
  'investments',
  'loans',
  'cards',
  'insurance',
  'savings',
  'fees',
  'interest',
  'taxes',
  'donations',
  'real_estate',
  'cash',
  'other',
] as const;
export const CategorySchema = z.enum(CATEGORY_IDS);
export type Category = z.infer<typeof CategorySchema>;

export const TxKindSchema = z.enum([
  'deposit',
  'withdrawal',
  'transfer_internal',
  'transfer_external_out',
  'transfer_external_in',
  'payment',
  'card_purchase',
  'card_payment',
  'card_load',
  'card_unload',
  'fee',
  'interest_earned',
  'interest_charged',
  'trade_buy',
  'trade_sell',
  'dividend',
  'derivative_open',
  'derivative_close',
  'loan_disbursement',
  'loan_payment',
  'credit_line_draw',
  'credit_line_repayment',
  'savings_in',
  'savings_out',
  'deposit_open',
  'deposit_close',
  'insurance_premium',
  'insurance_claim',
  'property_buy',
  'property_sell',
  'rent_income',
  'rent_deposit_in',
  'rent_deposit_out',
  'property_expense',
  'donation',
  'request_payment',
]);
export type TxKind = z.infer<typeof TxKindSchema>;

export const FlowSchema = z.enum(['income', 'expense', 'internal', 'investment', 'financing']);
export type Flow = z.infer<typeof FlowSchema>;

export const EndpointTypeSchema = z.enum([
  'account',
  'card',
  'external',
  'cash',
  'portfolio',
  'goal',
  'deposit',
  'loan',
  'creditLine',
  'property',
  'insurance',
  'system',
]);
export const EndpointSchema = z.object({
  type: EndpointTypeSchema,
  id: Id.optional(),
  label: Text(120),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

export const TxStatusSchema = z.enum(['completed', 'pending', 'failed', 'cancelled']);
export type TxStatus = z.infer<typeof TxStatusSchema>;

export const TransactionSchema = z.object({
  id: Id,
  opId: Text(80).optional(),
  at: ISO,
  kind: TxKindSchema,
  flow: FlowSchema,
  status: TxStatusSchema,
  /** Importe en la divisa de origen. */
  amount: PosCents,
  currency: CurrencySchema,
  /** Importe recibido en la divisa de destino (si difiere). */
  toAmount: PosCents.optional(),
  toCurrency: CurrencySchema.optional(),
  fxRate: z.number().positive().optional(),
  from: EndpointSchema,
  to: EndpointSchema,
  fromBalanceAfter: Cents.optional(),
  toBalanceAfter: Cents.optional(),
  cardId: Id.optional(),
  refId: Id.optional(),
  concept: Text(160),
  category: CategorySchema,
  failureReason: Text(200).optional(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const ContactSchema = z.object({
  id: Id,
  name: Text(80).min(1),
  iban: Text(40),
  favorite: z.boolean(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const ScheduledTransferSchema = z.object({
  id: Id,
  kind: z.enum(['internal', 'external', 'income']),
  fromAccountId: Id.optional(),
  toAccountId: Id.optional(),
  counterparty: Text(80).optional(),
  counterpartyIban: Text(40).optional(),
  amount: PosCents,
  concept: Text(160),
  category: CategorySchema,
  frequency: FrequencySchema,
  anchorDay: z.number().int().min(1).max(31),
  nextAt: ISO,
  endAt: ISO.optional(),
  remaining: z.number().int().min(0).optional(),
  status: z.enum(['active', 'paused', 'completed', 'cancelled']),
  executions: z.number().int().min(0),
  failures: z.number().int().min(0),
  createdAt: ISO,
  lastRunAt: ISO.optional(),
  lastResult: z.enum(['ok', 'failed']).optional(),
});
export type ScheduledTransfer = z.infer<typeof ScheduledTransferSchema>;

export const MoneyRequestSchema = z.object({
  id: Id,
  contactName: Text(80).min(1),
  amount: PosCents,
  concept: Text(160),
  toAccountId: Id,
  createdAt: ISO,
  resolveAt: ISO,
  status: z.enum(['pending', 'paid', 'declined', 'cancelled']),
  resolvedAt: ISO.optional(),
});
export type MoneyRequest = z.infer<typeof MoneyRequestSchema>;

/* ------------------------------------------------------------------ */
/* Tarjetas                                                            */
/* ------------------------------------------------------------------ */

export const CardTypeSchema = z.enum(['debit', 'credit', 'prepaid']);
export type CardType = z.infer<typeof CardTypeSchema>;

export const CardDesignSchema = z.object({
  theme: Text(30),
  pattern: Text(30),
});

export const CardSchema = z.object({
  id: Id,
  type: CardTypeSchema,
  name: Text(40).min(1),
  holder: Text(80).min(1),
  /** Cuenta vinculada: cargo (débito), pago de deuda (crédito) o recarga (prepago). */
  accountId: Id,
  number: z.string().regex(/^\d{16}$/),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int(),
  cvv: z.string().regex(/^\d{3}$/),
  pin: z.string().regex(/^\d{4}$/),
  status: z.enum(['active', 'frozen', 'cancelled']),
  design: CardDesignSchema,
  createdAt: ISO,
  dailyLimit: PosCents,
  monthlyLimit: PosCents,
  /** Crédito: límite concedido. */
  creditLimit: PosCents,
  /** Crédito: deuda viva. Prepago: saldo disponible. */
  balance: Cents,
  apr: Rate,
  closingDay: z.number().int().min(1).max(28),
  dueDays: z.number().int().min(5).max(40),
  statementBalance: PosCents,
  minimumDue: PosCents,
  dueAt: ISO.optional(),
  lastStatementAt: ISO.optional(),
  paidSinceStatement: PosCents,
  autopay: z.enum(['none', 'minimum', 'full']),
  latePayments: z.number().int().min(0),
  interestCharged: PosCents,
  feesCharged: PosCents,
  debtHistory: z.array(z.object({ at: ISO, balance: Cents })),
});
export type Card = z.infer<typeof CardSchema>;

/* ------------------------------------------------------------------ */
/* Mercado e inversiones                                               */
/* ------------------------------------------------------------------ */

export const AssetTypeSchema = z.enum(['stock', 'etf', 'index', 'crypto', 'bond', 'fund']);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const CompanySchema = z.object({
  sector: Text(60),
  country: Text(60),
  employees: z.number().int().min(0),
  founded: z.number().int(),
  ceo: Text(80),
});

export const CandleSchema = z.object({
  d: z.number().int(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
});
export type Candle = z.infer<typeof CandleSchema>;

export const AssetSchema = z.object({
  id: Id,
  symbol: Text(12).min(1),
  name: Text(80).min(1),
  type: AssetTypeSchema,
  sector: Text(60),
  description: Text(600),
  price: z.number().positive(),
  prevClose: z.number().positive(),
  dayOpen: z.number().positive(),
  dayHigh: z.number().positive(),
  dayLow: z.number().positive(),
  dayVolume: z.number().min(0),
  baseVolume: z.number().min(0),
  /** Deriva anual propia del activo. */
  drift: z.number().min(-5).max(5),
  /** Volatilidad anual. */
  volatility: z.number().min(0).max(5),
  /** Sensibilidad al régimen global de mercado. */
  beta: z.number().min(-3).max(5),
  /** Rentabilidad por dividendo / cupón anual. */
  yield: z.number().min(0).max(1),
  driftOverride: z.number().min(-5).max(5).nullable(),
  volOverride: z.number().min(0).max(5).nullable(),
  intraday: z.array(z.object({ t: z.number().int(), p: z.number() })),
  daily: z.array(CandleSchema),
  custom: z.boolean(),
  company: CompanySchema.optional(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const RegimeSchema = z.enum(['normal', 'bull', 'bear', 'sideways', 'crisis', 'recovery']);
export type Regime = z.infer<typeof RegimeSchema>;

export const ScenarioSchema = z.object({
  id: Id,
  name: Text(60).min(1),
  kind: z.enum(['crisis', 'recovery', 'custom']),
  /** Deriva anual añadida durante el escenario. */
  drift: z.number().min(-5).max(5),
  volMultiplier: z.number().min(0.1).max(10),
  durationDays: z.number().int().min(1).max(3650),
  targets: z.array(z.union([AssetTypeSchema, z.literal('real_estate')])),
  description: Text(300),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const MarketTrendSchema = z.object({ drift: z.number().min(-5).max(5), volMultiplier: z.number().min(0.1).max(10) });

export const MarketSchema = z.object({
  seed: z.number().int().min(0).max(4294967295),
  regime: RegimeSchema,
  globalTrend: z.number().min(-5).max(5),
  categoryTrends: z.record(z.string(), MarketTrendSchema),
  realEstateTrend: z.number().min(-1).max(1),
  feeRate: z.number().min(0).max(0.1),
  activeScenario: z
    .object({ scenarioId: Id, name: Text(60), endsAtTick: z.number().int(), previousRegime: RegimeSchema })
    .nullable(),
  scenarios: z.array(ScenarioSchema),
  events: z.array(z.object({ at: ISO, message: Text(240) })),
  assets: z.array(AssetSchema),
});
export type Market = z.infer<typeof MarketSchema>;

export const PositionSchema = z.object({
  assetId: Id,
  quantity: z.number().positive(),
  /** Coste total (en divisa base) de las participaciones vivas. */
  costBasis: PosCents,
  openedAt: ISO,
  settlementAccountId: Id,
});
export type Position = z.infer<typeof PositionSchema>;

export const TradeSchema = z.object({
  id: Id,
  at: ISO,
  assetId: Id,
  symbol: Text(12),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().positive(),
  price: z.number().positive(),
  amount: PosCents,
  fee: PosCents,
  realizedPnL: Cents,
  accountId: Id,
});
export type Trade = z.infer<typeof TradeSchema>;

export const DerivativeSchema = z.object({
  id: Id,
  kind: z.enum(['option', 'future']),
  underlyingId: Id,
  symbol: Text(40),
  optionType: z.enum(['call', 'put']).optional(),
  direction: z.enum(['long', 'short']),
  strike: z.number().positive().optional(),
  expiryTick: z.number().int(),
  quantity: z.number().positive(),
  /** Prima pagada por unidad (opciones) o precio de entrada (futuros). */
  entryPrice: z.number().positive(),
  leverage: z.number().min(1).max(100),
  /** Capital comprometido (prima total o margen) en divisa base. */
  margin: PosCents,
  openedAt: ISO,
  accountId: Id,
  status: z.enum(['open', 'closed', 'expired', 'liquidated']),
  closedAt: ISO.optional(),
  closeValue: PosCents.optional(),
  realizedPnL: Cents.optional(),
});
export type Derivative = z.infer<typeof DerivativeSchema>;

export const PortfolioSchema = z.object({
  positions: z.array(PositionSchema),
  trades: z.array(TradeSchema),
  derivatives: z.array(DerivativeSchema),
  watchlist: z.array(Id),
  realizedPnL: Cents,
  incomeReceived: PosCents,
});
export type Portfolio = z.infer<typeof PortfolioSchema>;

/* ------------------------------------------------------------------ */
/* Productos financieros                                               */
/* ------------------------------------------------------------------ */

export const SavingsGoalSchema = z.object({
  id: Id,
  kind: z.enum(['goal', 'pot']),
  name: Text(60).min(1),
  icon: Text(30),
  color: Text(20),
  target: PosCents,
  targetDate: ISO.optional(),
  balance: PosCents,
  interestRate: Rate,
  accountId: Id,
  auto: z
    .object({
      amount: PosCents,
      frequency: z.enum(['weekly', 'monthly']),
      nextAt: ISO,
      accountId: Id,
    })
    .nullable(),
  contributions: z.array(z.object({ at: ISO, amount: Cents, source: z.enum(['manual', 'auto', 'interest', 'withdrawal']) })),
  milestones: z.array(z.number().int()),
  interestEarned: PosCents,
  createdAt: ISO,
  status: z.enum(['active', 'closed']),
});
export type SavingsGoal = z.infer<typeof SavingsGoalSchema>;

export const TermDepositSchema = z.object({
  id: Id,
  kind: z.enum(['fixed', 'structured']),
  name: Text(80),
  principal: PosCents,
  rate: Rate,
  termMonths: z.number().int().min(1).max(600),
  startAt: ISO,
  maturityAt: ISO,
  accountId: Id,
  status: z.enum(['active', 'matured', 'cancelled']),
  payout: PosCents.optional(),
  closedAt: ISO.optional(),
  earlyPenalty: z.number().min(0).max(1),
  underlyingId: Id.optional(),
  initialPrice: z.number().positive().optional(),
  participation: z.number().min(0).max(5).optional(),
  cap: z.number().min(0).max(10).optional(),
});
export type TermDeposit = z.infer<typeof TermDepositSchema>;

export const LoanKindSchema = z.enum(['personal', 'mortgage', 'business']);
export type LoanKind = z.infer<typeof LoanKindSchema>;
export const LoanFrequencySchema = z.enum(['weekly', 'biweekly', 'monthly', 'quarterly']);
export type LoanFrequency = z.infer<typeof LoanFrequencySchema>;

export const LoanPaymentSchema = z.object({
  at: ISO,
  amount: PosCents,
  interest: PosCents,
  principal: PosCents,
  fee: PosCents,
  status: z.enum(['paid', 'missed', 'prepayment', 'late-paid']),
});

export const LoanSchema = z.object({
  id: Id,
  kind: LoanKindSchema,
  name: Text(80),
  principal: PosCents,
  rate: Rate,
  termPeriods: z.number().int().min(1).max(2000),
  frequency: LoanFrequencySchema,
  installment: PosCents,
  outstanding: PosCents,
  accountId: Id,
  startAt: ISO,
  nextDueAt: ISO,
  anchorDay: z.number().int().min(1).max(31),
  periodsPaid: z.number().int().min(0),
  status: z.enum(['active', 'paid']),
  propertyId: Id.optional(),
  totalInterestPaid: PosCents,
  overdue: PosCents,
  missedPayments: z.number().int().min(0),
  lateFees: PosCents,
  openingFee: PosCents,
  payments: z.array(LoanPaymentSchema),
});
export type Loan = z.infer<typeof LoanSchema>;

export const CreditLineSchema = z.object({
  id: Id,
  name: Text(80),
  limit: PosCents,
  drawn: PosCents,
  rate: Rate,
  accountId: Id,
  openedAt: ISO,
  status: z.enum(['active', 'closed']),
  history: z.array(z.object({ at: ISO, type: z.enum(['draw', 'repay', 'interest']), amount: PosCents })),
  interestCharged: PosCents,
});
export type CreditLine = z.infer<typeof CreditLineSchema>;

export const InsuranceTypeSchema = z.enum(['home', 'life', 'travel', 'device', 'valuables']);
export type InsuranceType = z.infer<typeof InsuranceTypeSchema>;

export const InsurancePolicySchema = z.object({
  id: Id,
  type: InsuranceTypeSchema,
  name: Text(80),
  insuredItem: Text(120),
  coverage: PosCents,
  deductible: PosCents,
  monthlyPremium: PosCents,
  accountId: Id,
  startAt: ISO,
  nextPremiumAt: ISO,
  status: z.enum(['active', 'suspended', 'cancelled']),
  premiumsPaid: PosCents,
  claims: z.array(
    z.object({
      id: Id,
      at: ISO,
      description: Text(200),
      amount: PosCents,
      payout: PosCents,
      status: z.enum(['paid', 'rejected']),
      reason: Text(200).optional(),
    }),
  ),
});
export type InsurancePolicy = z.infer<typeof InsurancePolicySchema>;

export const VaultItemSchema = z.object({
  id: Id,
  name: Text(80).min(1),
  category: z.enum(['jewelry', 'art', 'document', 'collectible', 'vehicle', 'other']),
  value: PosCents,
  notes: Text(400),
  addedAt: ISO,
});
export type VaultItem = z.infer<typeof VaultItemSchema>;

export const BeneficiarySchema = z.object({
  id: Id,
  name: Text(80).min(1),
  relation: Text(40),
  share: z.number().min(0).max(100),
});
export type Beneficiary = z.infer<typeof BeneficiarySchema>;

export const DonationSchema = z.object({
  id: Id,
  at: ISO,
  charityId: Id,
  charityName: Text(80),
  amount: PosCents,
  accountId: Id,
});
export type Donation = z.infer<typeof DonationSchema>;

/* ------------------------------------------------------------------ */
/* Inmobiliario                                                        */
/* ------------------------------------------------------------------ */

export const PropertyTypeSchema = z.enum(['apartment', 'house', 'villa', 'commercial', 'office', 'building']);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

export const PropertySchema = z.object({
  id: Id,
  type: PropertyTypeSchema,
  title: Text(100),
  description: Text(600),
  country: Text(60),
  city: Text(60),
  address: Text(120),
  area: z.number().positive(),
  rooms: z.number().int().min(0),
  baths: z.number().int().min(0),
  condition: z.enum(['new', 'good', 'renovate']),
  yearBuilt: z.number().int(),
  features: z.array(Text(40)),
  value: PosCents,
  growth: z.number().min(-1).max(1),
  volatility: z.number().min(0).max(1),
  imageSeed: z.number().int(),
  valueHistory: z.array(z.object({ at: ISO, v: PosCents })),
  owned: z.boolean(),
  listed: z.boolean(),
  purchasePrice: PosCents.optional(),
  purchaseCosts: PosCents.optional(),
  purchasedAt: ISO.optional(),
  mortgageLoanId: Id.optional(),
  expenses: z.array(
    z.object({
      id: Id,
      at: ISO,
      type: z.enum(['repair', 'maintenance', 'tax', 'other']),
      description: Text(160),
      amount: PosCents,
    }),
  ),
  rentCollected: PosCents,
  marketRent: PosCents,
});
export type Property = z.infer<typeof PropertySchema>;

export const TenantSchema = z.object({
  id: Id,
  name: Text(80),
  profession: Text(60),
  age: z.number().int(),
  monthlyIncome: PosCents,
  reliability: z.number().min(0).max(1),
  household: z.number().int().min(1),
  pets: z.boolean(),
  bio: Text(200),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const RentalContractSchema = z.object({
  id: Id,
  propertyId: Id,
  tenantId: Id,
  monthlyRent: PosCents,
  deposit: PosCents,
  startAt: ISO,
  endAt: ISO,
  dueDay: z.number().int().min(1).max(28),
  accountId: Id,
  status: z.enum(['active', 'ended']),
  endedAt: ISO.optional(),
  arrears: PosCents,
  writtenOff: PosCents,
  payments: z.array(
    z.object({
      id: Id,
      period: z.string().regex(/^\d{4}-\d{2}$/),
      at: ISO,
      amount: PosCents,
      status: z.enum(['paid', 'unpaid', 'late-paid']),
    }),
  ),
});
export type RentalContract = z.infer<typeof RentalContractSchema>;

/* ------------------------------------------------------------------ */
/* Credit score, notificaciones, ajustes                               */
/* ------------------------------------------------------------------ */

export const CreditEventSchema = z.object({
  at: ISO,
  type: z.enum(['on_time_payment', 'late_payment', 'missed_payment', 'hard_inquiry', 'debt_paid_off', 'default']),
  description: Text(200),
});
export type CreditEvent = z.infer<typeof CreditEventSchema>;

export const NotificationSchema = z.object({
  id: Id,
  at: ISO,
  level: z.enum(['info', 'success', 'warning', 'danger']),
  title: Text(120),
  body: Text(400),
  read: z.boolean(),
  link: Text(120).optional(),
});
export type AppNotification = z.infer<typeof NotificationSchema>;

export const SettingsSchema = z.object({
  hideBalances: z.boolean(),
  propertyPurchaseCostRate: z.number().min(0).max(0.5),
  propertySaleCostRate: z.number().min(0).max(0.5),
  dashboardAccounts: z.array(Id),
});
export type Settings = z.infer<typeof SettingsSchema>;

/* ------------------------------------------------------------------ */
/* Estado completo de un perfil                                        */
/* ------------------------------------------------------------------ */

export const ProfileStateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  profile: ProfileInfoSchema,
  clock: ClockSchema,
  seq: z.number().int().min(0),
  accounts: z.array(AccountSchema),
  transactions: z.array(TransactionSchema),
  contacts: z.array(ContactSchema).default([]),
  scheduled: z.array(ScheduledTransferSchema).default([]),
  requests: z.array(MoneyRequestSchema).default([]),
  cards: z.array(CardSchema).default([]),
  market: MarketSchema,
  portfolio: PortfolioSchema,
  goals: z.array(SavingsGoalSchema).default([]),
  deposits: z.array(TermDepositSchema).default([]),
  loans: z.array(LoanSchema).default([]),
  creditLines: z.array(CreditLineSchema).default([]),
  insurance: z.array(InsurancePolicySchema).default([]),
  vault: z.array(VaultItemSchema).default([]),
  beneficiaries: z.array(BeneficiarySchema).default([]),
  donations: z.array(DonationSchema).default([]),
  properties: z.array(PropertySchema).default([]),
  tenants: z.array(TenantSchema).default([]),
  rentals: z.array(RentalContractSchema).default([]),
  creditEvents: z.array(CreditEventSchema).default([]),
  creditHistory: z.array(z.object({ at: ISO, score: z.number().int() })).default([]),
  netWorthHistory: z.array(z.object({ at: ISO, v: Cents })).default([]),
  notifications: z.array(NotificationSchema).default([]),
  settings: SettingsSchema,
  processedOps: z.array(Text(80)).default([]),
});
export type ProfileState = z.infer<typeof ProfileStateSchema>;

export interface ProfileMeta {
  id: string;
  name: string;
  ownerName: string;
  baseCurrency: Currency;
  color: string;
  createdAt: string;
  updatedAt: string;
}
