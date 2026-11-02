/**
 * Generación pseudoaleatoria determinista.
 *
 * El motor de mercado nunca usa Math.random(): cada número se deriva de
 * (semilla, clave, índice). Así una misma semilla reproduce exactamente la
 * misma evolución de precios, independientemente del orden de renderizado.
 */

/** Hash FNV-1a de 32 bits para cadenas. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mezcla de enteros (finalizador de murmur3). */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function combine(seed: number, key: number, index: number): number {
  let h = fmix32((seed ^ 0x9e3779b9) >>> 0);
  h = fmix32((h ^ key) >>> 0);
  // El índice puede ser negativo (historial previo) o superar 2^32 en teoría.
  const lo = index | 0;
  const hi = Math.floor(index / 4294967296) | 0;
  h = fmix32((h ^ lo) >>> 0);
  h = fmix32((h ^ hi ^ 0x27d4eb2f) >>> 0);
  return h;
}

/** Generador mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniforme en [0,1) determinista para (seed, key, index). */
export function uniformAt(seed: number, key: string | number, index: number): number {
  const k = typeof key === 'number' ? key >>> 0 : hashString(key);
  return mulberry32(combine(seed, k, index))();
}

/** Normal estándar determinista (Box-Muller) para (seed, key, index). */
export function gaussianAt(seed: number, key: string | number, index: number): number {
  const k = typeof key === 'number' ? key >>> 0 : hashString(key);
  const rng = mulberry32(combine(seed, k, index));
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Generador secuencial con semilla para construir datos iniciales. */
export function createRng(seed: number) {
  const next = mulberry32(seed);
  return {
    next,
    int(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    float(min: number, max: number): number {
      return next() * (max - min) + min;
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    bool(p = 0.5): boolean {
      return next() < p;
    },
  };
}

export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4294967296);
}
