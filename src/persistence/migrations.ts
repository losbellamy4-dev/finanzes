/**
 * MIGRACIONES DE ESQUEMA.
 *
 * Cada entrada transforma datos de la versión N a la N+1. Al cargar un perfil
 * (desde IndexedDB o desde un fichero importado) se aplican en cadena hasta
 * la versión actual y después se valida con Zod.
 *
 * Para añadir una migración al cambiar el modelo:
 *   1. Incrementa SCHEMA_VERSION en src/core/schema.ts.
 *   2. Añade aquí `MIGRATIONS[versiónAnterior] = (d) => ({ ...d, nuevoCampo: ... })`.
 *   3. Añade una prueba en migrations.test.ts.
 */
import { SCHEMA_VERSION } from '@/core/schema';

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {
  // v1 es la primera versión publicada; aún no hay migraciones.
};

export class MigrationError extends Error {}

export function migrate(input: unknown, registry: Record<number, Migration> = MIGRATIONS, target: number = SCHEMA_VERSION): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MigrationError('Los datos no tienen un formato de perfil válido.');
  let data = { ...(input as Record<string, unknown>) };
  let version = data.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new MigrationError('No se reconoce la versión del esquema de datos.');
  }
  if (version > target) {
    throw new MigrationError(`Los datos se crearon con una versión más reciente de la aplicación (esquema v${version}).`);
  }
  while (version < target) {
    const step = registry[version];
    if (!step) throw new MigrationError(`No existe migración desde el esquema v${version}.`);
    data = step(data);
    version += 1;
    data.schemaVersion = version;
  }
  return data;
}
