import { describe, expect, it } from 'vitest';
import { Sim, newState } from './helpers';
import { parseProfileFile, serializeProfile, ImportError, validateState } from '@/persistence/exportImport';
import { migrate, MigrationError } from '@/persistence/migrations';
import { Repository, MAX_BACKUPS_PER_PROFILE } from '@/persistence/repository';

describe('Exportación e importación', () => {
  it('exporta e importa un perfil sin pérdida de datos', () => {
    const sim = new Sim();
    const acc = sim.run('account/create', { name: 'Cuenta', type: 'checking', initialBalance: 123_456 }) as string;
    sim.run('card/create', { type: 'debit', accountId: acc });
    sim.run('invest/buy', { assetId: 'ast_nxc', accountId: acc, amount: 10_000 });
    const text = serializeProfile(sim.state);
    const imported = parseProfileFile(text);
    expect(imported.accounts[0].balance).toBe(113_456);
    expect(imported.portfolio.positions).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(imported))).toEqual(JSON.parse(JSON.stringify(sim.state)));
  });

  it('rechaza ficheros manipulados, dañados o ajenos', () => {
    const sim = new Sim();
    sim.run('account/create', { name: 'Cuenta', type: 'checking', initialBalance: 1_000 });
    const text = serializeProfile(sim.state);
    const tampered = text.replace('"balance":1000', '"balance":99999999');
    expect(() => parseProfileFile(tampered)).toThrow(/suma de verificación/);
    expect(() => parseProfileFile('{no json')).toThrow(ImportError);
    expect(() => parseProfileFile(JSON.stringify({ hello: 'world' }))).toThrow(/no es una exportación/);
    expect(() => parseProfileFile('')).toThrow(/vacío/);
  });

  it('valida el contenido campo a campo', () => {
    const s = JSON.parse(JSON.stringify(newState()));
    s.accounts.push({ id: 'x', name: '', balance: 'mucho' });
    expect(() => validateState(s)).toThrow(/no son válidos/);
  });

  it('completa colecciones opcionales ausentes con valores por defecto', () => {
    const s = JSON.parse(JSON.stringify(newState()));
    delete s.vault;
    delete s.beneficiaries;
    const v = validateState(s);
    expect(v.vault).toEqual([]);
    expect(v.beneficiaries).toEqual([]);
  });
});

describe('Migraciones de esquema', () => {
  it('aplica migraciones en cadena hasta la versión objetivo', () => {
    const registry = {
      1: (d: Record<string, unknown>) => ({ ...d, a: 1 }),
      2: (d: Record<string, unknown>) => ({ ...d, b: (d.a as number) + 1 }),
    };
    const out = migrate({ schemaVersion: 1 }, registry, 3);
    expect(out).toEqual({ schemaVersion: 3, a: 1, b: 2 });
  });

  it('rechaza versiones futuras o desconocidas', () => {
    expect(() => migrate({ schemaVersion: 99 }, {}, 1)).toThrow(MigrationError);
    expect(() => migrate({ schemaVersion: 'x' }, {}, 1)).toThrow(MigrationError);
    expect(() => migrate({ schemaVersion: 1 }, {}, 2)).toThrow(/No existe migración/);
  });
});

describe('Copias de seguridad', () => {
  it('crea, lista, restaura y rota copias', async () => {
    const repo = new Repository(`nexus-bkp-${Math.random()}`);
    const sim = new Sim(newState({ id: 'p_bkp' }));
    const acc = sim.run('account/create', { name: 'Cuenta', type: 'checking', initialBalance: 10_000 }) as string;
    await repo.saveProfile(sim.state);
    const b = await repo.createBackup(sim.state, 'manual');
    sim.run('bank/pay', { accountId: acc, merchant: 'Tienda', amount: 9_000 });
    await repo.saveProfile(sim.state);
    const restored = await repo.readBackup(b.id);
    expect(restored.accounts[0].balance).toBe(10_000);
    for (let i = 0; i < MAX_BACKUPS_PER_PROFILE + 3; i++) await repo.createBackup(sim.state, 'auto');
    expect((await repo.listBackups('p_bkp')).length).toBe(MAX_BACKUPS_PER_PROFILE);
    await repo.close();
  });
});

describe('Perfil de demostración', () => {
  it('se construye con comandos reales y supera la validación del esquema', async () => {
    const { seedDemo } = await import('@/engine/demo');
    const { computeOverview } = await import('@/engine/selectors');
    const { ProfileStateSchema } = await import('@/core/schema');
    const demo = seedDemo(newState({ listings: 18 }));
    expect(ProfileStateSchema.safeParse(JSON.parse(JSON.stringify(demo))).success).toBe(true);
    expect(demo.accounts.length).toBe(4);
    expect(demo.properties.some((p) => p.owned)).toBe(true);
    expect(demo.rentals).toHaveLength(1);
    expect(demo.loans[0].kind).toBe('mortgage');
    const ov = computeOverview(demo);
    expect(ov.netWorth).toBeGreaterThan(0);
    // Ningún saldo bancario queda en negativo fuera del descubierto autorizado.
    for (const a of demo.accounts) expect(a.balance + a.overdraftLimit).toBeGreaterThanOrEqual(0);
  });
});
