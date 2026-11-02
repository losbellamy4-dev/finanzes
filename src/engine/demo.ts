/**
 * Perfil de demostración: se construye ejecutando comandos reales del motor,
 * por lo que todos los saldos y movimientos son coherentes y auditables.
 */
import type { ProfileState } from '@/core/schema';
import { FX_RATES } from '@/core/money';
import { addMonthsUTC, toDateInput } from '@/core/time';
import { execute, type CommandType, type PayloadOf } from './commands';
import { nowDate, nowISO } from './context';

export function seedDemo(initial: ProfileState): ProfileState {
  let s = initial;
  const run = <K extends CommandType>(type: K, payload: PayloadOf<K>) => {
    const r = execute(s, type, payload);
    s = r.state;
    return r.result as unknown as string;
  };
  const fx = FX_RATES[s.profile.baseCurrency];
  const m = (eur: number) => Math.round(eur * fx * 100);

  const cheapest = [...s.properties].filter((p) => p.type === 'apartment' || p.type === 'house').sort((a, b) => a.value - b.value)[0];
  const propertyNeeds = cheapest ? Math.round(cheapest.value * 0.2) + Math.round(cheapest.value * s.settings.propertyPurchaseCostRate) : 0;

  const main = run('account/create', { name: 'Cuenta Nexus', type: 'checking', initialBalance: m(6400) });
  const savings = run('account/create', { name: 'Ahorro Plus', type: 'savings', initialBalance: m(24000) + propertyNeeds, interestRate: 0.025 });
  const broker = run('account/create', { name: 'Broker', type: 'investment', initialBalance: m(12000) });
  run('account/create', { name: 'Mi Estudio S.L.', type: 'business', initialBalance: m(9500), overdraftLimit: m(3000) });

  const debit = run('card/create', { type: 'debit', accountId: main, name: 'Débito Nexus', theme: 'midnight', pattern: 'waves' });
  const credit = run('card/create', { type: 'credit', accountId: main, name: 'Nexus Gold', creditLimit: m(4000), autopay: 'full', theme: 'gold', pattern: 'lines' });
  run('card/create', { type: 'prepaid', accountId: main, name: 'Compras online', initialLoad: m(150), theme: 'violet', pattern: 'circles' });

  run('card/purchase', { cardId: debit, amount: m(86.4), merchant: 'Mercado Verde', category: 'groceries' });
  run('card/purchase', { cardId: debit, amount: m(4.8), merchant: 'Café Aurora', category: 'restaurants' });
  run('card/purchase', { cardId: credit, amount: m(64.5), merchant: 'Trattoria Luna', category: 'restaurants' });
  run('card/purchase', { cardId: credit, amount: m(349), merchant: 'ElectroNova', category: 'shopping' });
  run('bank/pay', { accountId: main, merchant: 'Energía del Sur', amount: m(72.35), category: 'utilities' });
  run('bank/pay', { accountId: main, merchant: 'StreamPlus', amount: m(12.99), category: 'subscriptions' });

  const now = nowDate(s);
  const payday = now.getUTCDate() < 28 ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 28)) : addMonthsUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 28)), 1, 28);
  run('schedule/create', { kind: 'income', toAccountId: main, counterparty: 'Empresa Ficticia S.A.', amount: m(2650), frequency: 'monthly', startDate: toDateInput(payday), concept: 'Nómina', category: 'salary' });
  const firstNext = addMonthsUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), 1, 1);
  run('schedule/create', { kind: 'internal', fromAccountId: main, toAccountId: broker, amount: m(300), frequency: 'monthly', startDate: toDateInput(firstNext), concept: 'Aportación mensual a inversión', category: 'investments' });

  run('contact/create', { name: 'Laura Méndez', iban: 'ES0012345678901234567890' });
  run('contact/create', { name: 'Diego Ortiz', iban: 'PT0098765432109876543210' });

  run('invest/buy', { assetId: 'ast_nxwd', accountId: broker, amount: m(4000) });
  run('invest/buy', { assetId: 'ast_aurx', accountId: broker, amount: m(1500) });
  run('invest/buy', { assetId: 'ast_nxc', accountId: broker, amount: m(1200) });
  run('invest/buy', { assetId: 'ast_bg10', accountId: broker, amount: m(1500) });
  run('invest/buy', { assetId: 'ast_fmix', accountId: broker, amount: m(1000) });

  const goal = run('goal/create', {
    kind: 'goal',
    name: 'Viaje a Japón',
    icon: 'plane',
    color: '#5488F5',
    target: m(4500),
    targetDate: toDateInput(addMonthsUTC(now, 10)),
    accountId: savings,
    initialAmount: m(1350),
  });
  run('goal/auto', { goalId: goal, amount: m(250), frequency: 'monthly', accountId: main });
  run('goal/create', { kind: 'pot', name: 'Fondo de emergencia', icon: 'shield', color: '#24C78A', accountId: savings, initialAmount: m(3000) });
  run('deposit/open', { kind: 'fixed', accountId: savings, amount: m(5000), termMonths: 12 });
  run('insurance/contract', { type: 'device', coverage: m(1400), accountId: main, insuredItem: 'Portátil de trabajo' });

  if (cheapest) {
    run('property/buy', {
      propertyId: cheapest.id,
      accountId: savings,
      financing: { downPayment: Math.round(cheapest.value * 0.2), rate: 0.031, years: 25 },
    });
    const tenant = [...s.tenants].sort((a, b) => b.reliability - a.reliability)[0];
    run('rental/create', {
      propertyId: cheapest.id,
      tenantId: tenant.id,
      monthlyRent: Math.max(m(500), cheapest.marketRent),
      months: 24,
      dueDay: 5,
      accountId: savings,
    });
    run('insurance/contract', { type: 'home', coverage: Math.round(cheapest.value * 0.6), accountId: savings, insuredItem: cheapest.title });
  }
  run('vault/add', { name: 'Reloj automático', category: 'jewelry', value: m(3200), notes: 'Regalo de graduación (valor estimado).' });
  run('beneficiary/add', { name: 'Marta (hermana)', relation: 'Familiar', share: 100 });

  // Limpia notificaciones generadas durante la preparación y da la bienvenida.
  return {
    ...s,
    notifications: [
      {
        id: `ntf_demo_${s.seq}`,
        at: nowISO(s),
        level: 'info',
        title: 'Bienvenido a NEXUS FINANCE',
        body: 'Este perfil de demostración incluye cuentas, tarjetas, inversiones, ahorro, un inmueble alquilado y una hipoteca. Todo es simulado.',
        read: false,
        link: '/',
      },
    ],
    seq: s.seq + 1,
  };
}
