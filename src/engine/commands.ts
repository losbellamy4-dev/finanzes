/**
 * DESPACHADOR DE COMANDOS.
 *
 * Toda modificación del estado financiero pasa por `execute()`:
 *  1. Control de duplicados: cada operación de usuario lleva un `opId`
 *     único; si ya se procesó (doble clic, reintento), se rechaza.
 *  2. Atomicidad: el manejador trabaja sobre un borrador Immer. Si lanza un
 *     error, el borrador se descarta y el estado original queda intacto.
 *  3. Inmutabilidad: el resultado es un nuevo estado con compartición
 *     estructural, ideal para React.
 */
import { produce } from 'immer';
import type { ProfileState, Settings } from '@/core/schema';
import { DomainError, assertText, fail, type S } from './context';
import * as banking from './banking';
import * as cards from './cards';
import * as portfolio from './portfolio';
import * as deriv from './derivatives';
import * as admin from './marketAdmin';
import * as savings from './products/savings';
import * as deposits from './products/deposits';
import * as loans from './products/loans';
import * as insurance from './products/insurance';
import * as wealth from './products/wealth';
import * as realestate from './realestate';
import { advanceClock } from './scheduler';

function markNotifications(s: S, p: { ids?: string[]; all?: boolean }): void {
  for (const n of s.notifications) if (p.all || p.ids?.includes(n.id)) n.read = true;
}

function clearNotifications(s: S): void {
  s.notifications = [];
}

function updateSettings(s: S, p: Partial<Settings>): void {
  if (p.hideBalances !== undefined) s.settings.hideBalances = !!p.hideBalances;
  if (p.propertyPurchaseCostRate !== undefined) {
    if (!Number.isFinite(p.propertyPurchaseCostRate) || p.propertyPurchaseCostRate < 0 || p.propertyPurchaseCostRate > 0.3) fail('INVALID_INPUT', 'Coste de compra no válido.');
    s.settings.propertyPurchaseCostRate = p.propertyPurchaseCostRate;
  }
  if (p.propertySaleCostRate !== undefined) {
    if (!Number.isFinite(p.propertySaleCostRate) || p.propertySaleCostRate < 0 || p.propertySaleCostRate > 0.3) fail('INVALID_INPUT', 'Coste de venta no válido.');
    s.settings.propertySaleCostRate = p.propertySaleCostRate;
  }
  if (p.dashboardAccounts !== undefined) s.settings.dashboardAccounts = p.dashboardAccounts.slice(0, 12);
}

function updateProfile(s: S, p: { name?: string; ownerName?: string; color?: string; country?: string }): void {
  if (p.name !== undefined) s.profile.name = assertText(p.name, 'El nombre del perfil', 60);
  if (p.ownerName !== undefined) s.profile.ownerName = assertText(p.ownerName, 'El titular', 80);
  if (p.color !== undefined) s.profile.color = p.color.slice(0, 20);
  if (p.country !== undefined) {
    if (!/^[A-Za-z]{2}$/.test(p.country)) fail('INVALID_INPUT', 'País no válido.');
    s.profile.country = p.country.toUpperCase();
  }
}

export const handlers = {
  // Banca
  'account/create': banking.createAccount,
  'account/update': banking.updateAccount,
  'account/close': banking.closeAccount,
  'bank/deposit': banking.deposit,
  'bank/withdraw': banking.withdraw,
  'bank/transfer': banking.transfer,
  'bank/send': banking.sendExternal,
  'bank/receive': banking.receiveExternal,
  'bank/pay': banking.pay,
  'contact/create': banking.createContact,
  'contact/delete': banking.deleteContact,
  'request/create': banking.createRequest,
  'request/cancel': banking.cancelRequest,
  'schedule/create': banking.createSchedule,
  'schedule/status': banking.setScheduleStatus,
  // Tarjetas
  'card/create': cards.createCard,
  'card/update': cards.updateCard,
  'card/freeze': cards.setCardFrozen,
  'card/cancel': cards.cancelCard,
  'card/limits': cards.setCardLimits,
  'card/autopay': cards.setAutopay,
  'card/purchase': cards.purchase,
  'card/pay': cards.payCard,
  'card/load': cards.loadCard,
  'card/unload': cards.unloadCard,
  // Inversiones
  'invest/buy': portfolio.buy,
  'invest/sell': portfolio.sell,
  'invest/watch': portfolio.toggleWatch,
  'deriv/option': deriv.openOption,
  'deriv/future': deriv.openFuture,
  'deriv/close': deriv.closeDerivative,
  // Control de mercado
  'market/regime': admin.setRegime,
  'market/global-trend': admin.setGlobalTrend,
  'market/category-trend': admin.setCategoryTrend,
  'market/realestate-trend': admin.setRealEstateTrend,
  'market/fee': admin.setFeeRate,
  'market/speed': admin.setSpeed,
  'market/reseed': admin.reseed,
  'market/asset-params': admin.setAssetParams,
  'market/asset-price': admin.setAssetPrice,
  'market/asset-create': admin.createAsset,
  'market/asset-delete': admin.deleteAsset,
  'market/scenario-create': admin.createScenario,
  'market/scenario-delete': admin.deleteScenario,
  'market/scenario-activate': admin.activateScenario,
  'market/scenario-stop': admin.stopScenario,
  // Ahorro
  'goal/create': savings.createGoal,
  'goal/contribute': savings.contribute,
  'goal/withdraw': savings.withdrawFromGoal,
  'goal/auto': savings.setGoalAuto,
  'goal/update': savings.updateGoal,
  'goal/close': savings.closeGoal,
  'deposit/open': deposits.openDeposit,
  'deposit/cancel': deposits.cancelDeposit,
  // Financiación
  'loan/create': loans.createLoan,
  'loan/prepay': loans.prepayLoan,
  'creditline/open': loans.openCreditLine,
  'creditline/draw': loans.drawCreditLine,
  'creditline/repay': loans.repayCreditLine,
  'creditline/close': loans.closeCreditLine,
  // Seguros
  'insurance/contract': insurance.contractInsurance,
  'insurance/claim': insurance.claimInsurance,
  'insurance/cancel': insurance.cancelInsurance,
  'insurance/reactivate': insurance.reactivateInsurance,
  // Patrimonio
  'vault/add': wealth.addVaultItem,
  'vault/update': wealth.updateVaultItem,
  'vault/remove': wealth.removeVaultItem,
  'beneficiary/add': wealth.addBeneficiary,
  'beneficiary/remove': wealth.removeBeneficiary,
  'wealth/donate': wealth.donate,
  // Inmobiliario
  'property/buy': realestate.buyProperty,
  'property/sell': realestate.sellProperty,
  'property/expense': realestate.addPropertyExpense,
  'property/generate': realestate.generateListings,
  'rental/create': realestate.createRental,
  'rental/collect': realestate.collectRent,
  'rental/default': realestate.registerDefault,
  'rental/end': realestate.endRental,
  // Sistema
  'clock/advance': advanceClock,
  'notifications/read': markNotifications,
  'notifications/clear': clearNotifications,
  'settings/update': updateSettings,
  'profile/update': updateProfile,
} as const;

type Handlers = typeof handlers;
export type CommandType = keyof Handlers;
export type PayloadOf<K extends CommandType> = Parameters<Handlers[K]>[1] extends infer P ? (undefined extends P ? Exclude<P, undefined> | void : P) : never;
export type ResultOf<K extends CommandType> = ReturnType<Handlers[K]>;

export interface ExecuteResult<K extends CommandType> {
  state: ProfileState;
  result: ResultOf<K>;
}

const MAX_OPS = 400;

export function execute<K extends CommandType>(state: ProfileState, type: K, payload: PayloadOf<K>, opId?: string): ExecuteResult<K> {
  const handler = handlers[type] as unknown as (s: S, p: unknown) => ResultOf<K>;
  if (!handler) throw new DomainError('UNKNOWN_COMMAND', `Comando desconocido: ${String(type)}`);
  if (opId && state.processedOps.includes(opId)) {
    throw new DomainError('DUPLICATE_OPERATION', 'Esta operación ya se ha procesado.');
  }
  let result: ResultOf<K> | undefined;
  const next = produce(state, (draft) => {
    const p = opId && payload && typeof payload === 'object' ? { ...(payload as object), opId } : payload;
    result = handler(draft as S, p ?? {});
    if (opId) {
      draft.processedOps.push(opId);
      if (draft.processedOps.length > MAX_OPS) draft.processedOps.splice(0, draft.processedOps.length - MAX_OPS);
    }
  });
  return { state: next, result: result as ResultOf<K> };
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
