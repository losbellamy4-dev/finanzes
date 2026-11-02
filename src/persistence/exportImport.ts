/**
 * Exportación e importación de perfiles en ficheros JSON firmados con una
 * suma de verificación. La importación aplica migraciones y valida cada
 * campo con Zod antes de aceptar los datos.
 */
import { ProfileStateSchema, SCHEMA_VERSION, type ProfileState } from '@/core/schema';
import { hashString } from '@/core/random';
import { migrate, MigrationError } from './migrations';

export const EXPORT_FORMAT = 'nexus-finance-profile';
export const MAX_IMPORT_BYTES = 40 * 1024 * 1024;

export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT;
  app: 'NEXUS FINANCE';
  schemaVersion: number;
  exportedAt: string;
  checksum: string;
  data: unknown;
}

export class ImportError extends Error {}

export function checksumOf(data: unknown): string {
  return hashString(JSON.stringify(data)).toString(16).padStart(8, '0');
}

export function serializeProfile(state: ProfileState, exportedAt = new Date()): string {
  const env: ExportEnvelope = {
    format: EXPORT_FORMAT,
    app: 'NEXUS FINANCE',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    checksum: checksumOf(state),
    data: state,
  };
  return JSON.stringify(env);
}

/** Valida un objeto de estado (tras migrar) y devuelve el estado tipado. */
export function validateState(raw: unknown): ProfileState {
  let migrated: Record<string, unknown>;
  try {
    migrated = migrate(raw);
  } catch (e) {
    throw new ImportError(e instanceof MigrationError ? e.message : 'No se pudo migrar el perfil.');
  }
  const res = ProfileStateSchema.safeParse(migrated);
  if (!res.success) {
    const first = res.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`);
    throw new ImportError(`Los datos del perfil no son válidos. ${first.join(' · ')}`);
  }
  return res.data;
}

export function parseProfileFile(text: string): ProfileState {
  if (typeof text !== 'string' || text.length === 0) throw new ImportError('El fichero está vacío.');
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError('El fichero es demasiado grande.');
  let env: Partial<ExportEnvelope>;
  try {
    env = JSON.parse(text);
  } catch {
    throw new ImportError('El fichero no es un JSON válido.');
  }
  if (!env || typeof env !== 'object' || env.format !== EXPORT_FORMAT) {
    throw new ImportError('El fichero no es una exportación de NEXUS FINANCE.');
  }
  if (typeof env.checksum !== 'string' || checksumOf(env.data) !== env.checksum) {
    throw new ImportError('La suma de verificación no coincide: el fichero está dañado o ha sido modificado.');
  }
  return validateState(env.data);
}

export function exportFileName(state: ProfileState, at = new Date()): string {
  const slug = state.profile.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `nexus-${slug || 'perfil'}-${at.toISOString().slice(0, 10)}.json`;
}
