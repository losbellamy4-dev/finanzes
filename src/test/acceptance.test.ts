/**
 * Criterios de aceptación obligatorios (sección 22 de la especificación).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { Sim, newState } from './helpers';
import { Repository } from '@/persistence/repository';
import { DomainError } from '@/engine/context';

describe('Criterios de aceptación', () => {
  let sim: Sim;
  let main: string;
  let second: string;

  beforeEach(() => {
    sim = new Sim();
    // TEST 1: crear una cuenta con 1.000 €
    main = sim.run('account/create', { name: 'Principal', type: 'checking', initialBalance: 100_000 }) as string;
    second = sim.run('account/create', { name: 'Ahorro', type: 'savings', interestRate: 0 }) as string;
  });

  it('TEST 1: crear una cuenta con 1.000 €', () => {
    expect(sim.balance(main)).toBe(100_000);
    const acc = sim.account(main);
    expect(acc.currency).toBe('EUR');
    expect(acc.iban).toMatch(/^ES00NXFS\d{16}$/);
    expect(sim.state.transactions.filter((t) => t.to.id === main)).toHaveLength(1);
  });

  it('TEST 2 y 3: ingresar 500 € → 1.500 €; gastar 200 € → 1.300 €', () => {
    sim.run('bank/deposit', { accountId: main, amount: 50_000 });
    expect(sim.balance(main)).toBe(150_000);
    sim.run('bank/pay', { accountId: main, merchant: 'Supermercado', amount: 20_000, category: 'groceries' });
    expect(sim.balance(main)).toBe(130_000);
  });

  it('TEST 4: transferir 300 € a otra cuenta → origen 1.000 €, destino 300 €', () => {
    sim.run('bank/deposit', { accountId: main, amount: 50_000 });
    sim.run('bank/pay', { accountId: main, merchant: 'Supermercado', amount: 20_000 });
    sim.run('bank/transfer', { fromId: main, toId: second, amount: 30_000 });
    expect(sim.balance(main)).toBe(100_000);
    expect(sim.balance(second)).toBe(30_000);
    const tx = sim.state.transactions.at(-1)!;
    expect(tx.kind).toBe('transfer_internal');
    expect(tx.fromBalanceAfter).toBe(100_000);
    expect(tx.toBalanceAfter).toBe(30_000);
  });

  it('TEST 5 y 6: comprar 200 € en activos y venderlos', () => {
    const assetId = 'ast_aurx';
    sim.run('invest/buy', { assetId, accountId: main, amount: 20_000 });
    expect(sim.balance(main)).toBe(80_000);
    const pos = sim.state.portfolio.positions.find((p) => p.assetId === assetId)!;
    expect(pos).toBeDefined();
    expect(pos.costBasis).toBe(20_000);
    const asset = sim.state.market.assets.find((a) => a.id === assetId)!;
    expect(Math.abs(pos.quantity * asset.price * 100 - 20_000)).toBeLessThan(1);

    // El mercado se mueve antes de vender.
    sim.run('clock/advance', { hours: 48 });
    const price = sim.state.market.assets.find((a) => a.id === assetId)!.price;
    const expected = Math.round(pos.quantity * price * 100);
    sim.run('invest/sell', { assetId, accountId: main, all: true });
    expect(sim.state.portfolio.positions.find((p) => p.assetId === assetId)).toBeUndefined();
    expect(sim.balance(main)).toBe(80_000 + expected);
    const trades = sim.state.portfolio.trades;
    expect(trades.map((t) => t.side)).toEqual(['buy', 'sell']);
    expect(trades[1].realizedPnL).toBe(expected - 20_000);
    expect(sim.state.portfolio.realizedPnL).toBe(expected - 20_000);
  });

  it('TEST 6b: venta parcial reduce la posición proporcionalmente', () => {
    sim.run('invest/buy', { assetId: 'ast_vrda', accountId: main, amount: 20_000 });
    const q = sim.state.portfolio.positions[0].quantity;
    sim.run('invest/sell', { assetId: 'ast_vrda', accountId: main, quantity: q / 2 });
    const pos = sim.state.portfolio.positions[0];
    expect(pos.quantity).toBeCloseTo(q / 2, 6);
    expect(pos.costBasis).toBe(10_000);
  });

  it('TEST 9: gastar más de lo disponible se rechaza sin alterar balances', () => {
    const before = sim.state;
    expect(() => sim.run('bank/pay', { accountId: main, merchant: 'Joyería', amount: 100_001 })).toThrowError(DomainError);
    expect(() => sim.run('bank/withdraw', { accountId: main, amount: 500_000 })).toThrow(/Saldo insuficiente/);
    expect(() => sim.run('bank/transfer', { fromId: main, toId: second, amount: 200_000 })).toThrow(/Saldo insuficiente/);
    expect(() => sim.run('invest/buy', { assetId: 'ast_aurx', accountId: main, amount: 200_000 })).toThrow(/Saldo insuficiente/);
    // El estado es exactamente el mismo objeto: nada se ha modificado.
    expect(sim.state).toBe(before);
    expect(sim.balance(main)).toBe(100_000);
    expect(sim.balance(second)).toBe(0);
  });

  it('Control de duplicados: el mismo opId no se procesa dos veces', () => {
    sim.run('bank/deposit', { accountId: main, amount: 5_000 }, 'op-123');
    expect(() => sim.run('bank/deposit', { accountId: main, amount: 5_000 }, 'op-123')).toThrow(/ya se ha procesado/);
    expect(sim.balance(main)).toBe(105_000);
  });
});

describe('TEST 7 y 8: persistencia y perfiles', () => {
  it('TEST 7: cerrar y volver a abrir la aplicación conserva todos los datos', async () => {
    const dbName = `nexus-test-${Math.random()}`;
    const sim = new Sim(newState({ id: 'p_persist' }));
    const acc = sim.run('account/create', { name: 'Cuenta', type: 'checking', initialBalance: 100_000 }) as string;
    sim.run('bank/deposit', { accountId: acc, amount: 50_000 });
    sim.run('invest/buy', { assetId: 'ast_nxwd', accountId: acc, amount: 20_000 });
    sim.run('card/create', { type: 'credit', accountId: acc, creditLimit: 200_000 });

    const repo1 = new Repository(dbName);
    await repo1.saveProfile(sim.state);
    await repo1.setActiveProfileId('p_persist');
    await repo1.close(); // "cerrar la aplicación"

    const repo2 = new Repository(dbName); // "volver a abrir"
    expect(await repo2.getActiveProfileId()).toBe('p_persist');
    const loaded = await repo2.loadProfile('p_persist');
    expect(loaded).not.toBeNull();
    expect(loaded!.accounts[0].balance).toBe(130_000);
    expect(loaded!.portfolio.positions).toHaveLength(1);
    expect(loaded!.cards).toHaveLength(1);
    expect(loaded!.transactions.length).toBe(sim.state.transactions.length);
    expect(loaded).toEqual(JSON.parse(JSON.stringify(sim.state)));
    await repo2.close();
  });

  it('TEST 8: los datos de cada perfil permanecen independientes', async () => {
    const dbName = `nexus-test-${Math.random()}`;
    const a = new Sim(newState({ id: 'p_a', name: 'Perfil A' }));
    const b = new Sim(newState({ id: 'p_b', name: 'Perfil B', seed: 999 }));
    const accA = a.run('account/create', { name: 'Cuenta A', type: 'checking', initialBalance: 100_000 }) as string;
    b.run('account/create', { name: 'Cuenta B', type: 'business', initialBalance: 777_700 });
    b.run('account/create', { name: 'Cuenta B2', type: 'savings' });

    const repo = new Repository(dbName);
    await repo.saveProfile(a.state);
    await repo.saveProfile(b.state);

    // Operar en A no afecta a B.
    a.run('bank/pay', { accountId: accA, merchant: 'Tienda', amount: 10_000 });
    await repo.saveProfile(a.state);

    const la = await repo.loadProfile('p_a');
    const lb = await repo.loadProfile('p_b');
    expect(la!.accounts.map((x) => x.name)).toEqual(['Cuenta A']);
    expect(la!.accounts[0].balance).toBe(90_000);
    expect(lb!.accounts.map((x) => x.name)).toEqual(['Cuenta B', 'Cuenta B2']);
    expect(lb!.accounts[0].balance).toBe(777_700);
    expect(lb!.market.seed).toBe(999);
    const list = await repo.listProfiles();
    expect(list.map((p) => p.name).sort()).toEqual(['Perfil A', 'Perfil B']);

    await repo.deleteProfile('p_a');
    expect(await repo.loadProfile('p_a')).toBeNull();
    expect(await repo.loadProfile('p_b')).not.toBeNull();
    await repo.close();
  });
});
