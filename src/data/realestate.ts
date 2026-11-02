/**
 * Generadores deterministas del mercado inmobiliario ficticio y de los
 * inquilinos. Direcciones, barrios y personas son inventados.
 */
import type { Property, PropertyType, Tenant } from '@/core/schema';
import { createRng, gaussianAt } from '@/core/random';
import { addMonthsUTC } from '@/core/time';

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: 'Apartamento',
  house: 'Casa',
  villa: 'Villa',
  commercial: 'Local comercial',
  office: 'Oficina',
  building: 'Edificio',
};

export const CONDITION_LABELS: Record<Property['condition'], string> = {
  new: 'Obra nueva',
  good: 'Buen estado',
  renovate: 'A reformar',
};

interface CityDef {
  city: string;
  country: string;
  ppm2: number;
  growth: number;
  rentYield: number;
  vol: number;
  coastal: boolean;
}

export const CITIES: CityDef[] = [
  { city: 'Madrid', country: 'España', ppm2: 5200, growth: 0.045, rentYield: 0.042, vol: 0.05, coastal: false },
  { city: 'Barcelona', country: 'España', ppm2: 4900, growth: 0.04, rentYield: 0.043, vol: 0.055, coastal: true },
  { city: 'Valencia', country: 'España', ppm2: 2600, growth: 0.055, rentYield: 0.052, vol: 0.05, coastal: true },
  { city: 'Málaga', country: 'España', ppm2: 3400, growth: 0.06, rentYield: 0.05, vol: 0.06, coastal: true },
  { city: 'Lisboa', country: 'Portugal', ppm2: 4600, growth: 0.05, rentYield: 0.045, vol: 0.055, coastal: true },
  { city: 'Oporto', country: 'Portugal', ppm2: 3100, growth: 0.055, rentYield: 0.05, vol: 0.05, coastal: true },
  { city: 'París', country: 'Francia', ppm2: 10200, growth: 0.02, rentYield: 0.033, vol: 0.04, coastal: false },
  { city: 'Berlín', country: 'Alemania', ppm2: 5600, growth: 0.025, rentYield: 0.036, vol: 0.045, coastal: false },
  { city: 'Milán', country: 'Italia', ppm2: 5100, growth: 0.03, rentYield: 0.04, vol: 0.045, coastal: false },
  { city: 'Ámsterdam', country: 'Países Bajos', ppm2: 6800, growth: 0.03, rentYield: 0.038, vol: 0.05, coastal: false },
  { city: 'Miami', country: 'Estados Unidos', ppm2: 5900, growth: 0.045, rentYield: 0.05, vol: 0.07, coastal: true },
  { city: 'Ciudad de México', country: 'México', ppm2: 2100, growth: 0.06, rentYield: 0.065, vol: 0.07, coastal: false },
];

const TYPE_DEFS: Record<PropertyType, { area: [number, number]; rooms: [number, number]; mult: number; yieldAdj: number; weight: number }> = {
  apartment: { area: [42, 135], rooms: [1, 4], mult: 1, yieldAdj: 0, weight: 5 },
  house: { area: [110, 260], rooms: [3, 5], mult: 0.85, yieldAdj: -0.003, weight: 3 },
  villa: { area: [220, 620], rooms: [4, 8], mult: 1.25, yieldAdj: -0.008, weight: 2 },
  commercial: { area: [60, 420], rooms: [0, 2], mult: 0.8, yieldAdj: 0.015, weight: 2 },
  office: { area: [80, 900], rooms: [1, 12], mult: 0.9, yieldAdj: 0.01, weight: 2 },
  building: { area: [650, 2600], rooms: [8, 32], mult: 0.72, yieldAdj: 0.005, weight: 1 },
};

const NEIGHBORHOODS = ['el centro histórico', 'la zona norte', 'el distrito financiero', 'el barrio universitario', 'la zona residencial', 'el ensanche', 'el barrio de las artes', 'la ribera'];
const COASTAL = ['primera línea de playa', 'el paseo marítimo', 'el puerto deportivo'];
const STREETS = ['Calle de la Aurora', 'Avenida del Olivo', 'Calle de los Tilos', 'Paseo del Mirador', 'Calle de la Brisa', 'Avenida de las Acacias', 'Calle del Faro', 'Plaza de la Luna', 'Calle de la Ribera', 'Avenida del Horizonte', 'Calle del Cedro', 'Ronda de los Almendros'];
const FEATURES = ['Ascensor', 'Terraza', 'Piscina', 'Garaje', 'Aire acondicionado', 'Trastero', 'Jardín', 'Vistas despejadas', 'Portería', 'Calefacción central', 'Domótica', 'Gimnasio', 'Exterior', 'Eficiencia energética A'];

const TITLES: Record<PropertyType, string[]> = {
  apartment: ['Piso luminoso en {n}', 'Ático con terraza en {n}', 'Apartamento reformado en {n}', 'Estudio moderno en {n}'],
  house: ['Casa adosada en {n}', 'Casa familiar con jardín en {n}', 'Chalet pareado en {n}'],
  villa: ['Villa con piscina en {n}', 'Villa de diseño en {n}', 'Gran villa con vistas en {n}'],
  commercial: ['Local comercial a pie de calle en {n}', 'Local en esquina en {n}', 'Bajo comercial en {n}'],
  office: ['Oficina diáfana en {n}', 'Planta de oficinas en {n}', 'Oficina representativa en {n}'],
  building: ['Edificio residencial en {n}', 'Edificio de viviendas en {n}', 'Edificio para rehabilitar en {n}'],
};

function weightedType(r: () => number): PropertyType {
  const entries = Object.entries(TYPE_DEFS) as [PropertyType, (typeof TYPE_DEFS)[PropertyType]][];
  const total = entries.reduce((a, [, d]) => a + d.weight, 0);
  let x = r() * total;
  for (const [t, d] of entries) {
    x -= d.weight;
    if (x <= 0) return t;
  }
  return 'apartment';
}

export function generateProperty(seed: number, index: number, id: string, fxRate: number, nowISO: string): Property {
  const rng = createRng((seed ^ Math.imul(index + 1, 2654435761)) >>> 0);
  const c = rng.pick(CITIES);
  const type = weightedType(rng.next);
  const def = TYPE_DEFS[type];
  const area = Math.round(rng.float(def.area[0], def.area[1]));
  const rooms = rng.int(def.rooms[0], def.rooms[1]);
  const baths = type === 'commercial' ? rng.int(1, 2) : Math.max(1, Math.min(rooms, Math.round(rooms * rng.float(0.5, 0.9))));
  const condition = rng.pick(['new', 'good', 'good', 'good', 'renovate'] as const);
  const condMult = condition === 'new' ? 1.12 : condition === 'renovate' ? 0.78 : 1;
  const priceEUR = c.ppm2 * area * def.mult * condMult * rng.float(0.88, 1.15);
  const value = Math.round((priceEUR * fxRate) / 1000) * 1000 * 100;
  const hood = c.coastal && rng.bool(0.3) ? rng.pick(COASTAL) : rng.pick(NEIGHBORHOODS);
  const title = rng.pick(TITLES[type]).replace('{n}', hood);
  const features = [...FEATURES].sort(() => rng.next() - 0.5).slice(0, rng.int(3, 5));
  const yearBuilt = condition === 'new' ? rng.int(2022, 2026) : rng.int(1925, 2018);
  const growth = c.growth + rng.float(-0.015, 0.015);
  const rentYield = Math.max(0.025, c.rentYield + def.yieldAdj + rng.float(-0.006, 0.006));
  const p: Property = {
    id,
    type,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    description: `${PROPERTY_TYPE_LABELS[type]} de ${area} m² en ${hood}, ${c.city}. ${CONDITION_LABELS[condition]}, construido en ${yearBuilt}. Inmueble ficticio generado por el simulador.`,
    country: c.country,
    city: c.city,
    address: `${rng.pick(STREETS)}, ${rng.int(1, 180)}`,
    area,
    rooms,
    baths,
    condition,
    yearBuilt,
    features,
    value,
    growth,
    volatility: c.vol,
    imageSeed: rng.int(1, 1_000_000),
    valueHistory: [],
    owned: false,
    listed: true,
    expenses: [],
    rentCollected: 0,
    marketRent: Math.round((value * rentYield) / 12 / 100) * 100,
  };
  // Historial de 24 meses generado con el mismo modelo que la evolución futura.
  const now = new Date(nowISO);
  let v = value;
  const back: { at: string; v: number }[] = [{ at: now.toISOString(), v }];
  for (let m = 1; m <= 24; m++) {
    const z = gaussianAt(seed, id, -m);
    const ret = (growth - (c.vol * c.vol) / 2) / 12 + (c.vol / Math.sqrt(12)) * z;
    v = Math.round(v / Math.exp(ret));
    back.push({ at: addMonthsUTC(now, -m).toISOString(), v });
  }
  p.valueHistory = back.reverse();
  return p;
}

const FIRST = ['Lucía', 'Mateo', 'Sofía', 'Hugo', 'Valeria', 'Leo', 'Martina', 'Daniel', 'Julia', 'Pablo', 'Noa', 'Álvaro', 'Emma', 'Adrián', 'Carla', 'Iker', 'Olivia', 'Bruno', 'Aitana', 'Marco'];
const LAST = ['Ferrer', 'Navarro', 'Ibáñez', 'Solís', 'Montero', 'Castell', 'Rivas', 'Quintana', 'Lozano', 'Arranz', 'Vidal', 'Peralta', 'Benet', 'Salazar', 'Ortega', 'Campos'];
const JOBS = ['Ingeniera de software', 'Enfermero', 'Profesora', 'Diseñador gráfico', 'Médica residente', 'Arquitecto', 'Abogada', 'Chef', 'Investigadora', 'Fotógrafo', 'Contable', 'Fisioterapeuta', 'Piloto', 'Estudiante de máster', 'Empresaria', 'Músico'];

export function generateTenants(seed: number, count: number, fxRate: number, startSeq: number): Tenant[] {
  const rng = createRng((seed ^ 0xa5a5a5a5) >>> 0);
  const out: Tenant[] = [];
  for (let i = 0; i < count; i++) {
    const reliability = Math.round(rng.float(0.62, 0.995) * 1000) / 1000;
    const income = Math.round(rng.float(1400, 6500) * fxRate) * 100;
    const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    const job = rng.pick(JOBS);
    out.push({
      id: `ten_${(startSeq + i).toString(36).padStart(5, '0')}`,
      name,
      profession: job,
      age: rng.int(22, 68),
      monthlyIncome: income,
      reliability,
      household: rng.int(1, 5),
      pets: rng.bool(0.3),
      bio:
        reliability > 0.93
          ? 'Historial de alquiler impecable y referencias excelentes.'
          : reliability > 0.82
            ? 'Buenas referencias; algún retraso puntual en el pasado.'
            : 'Ingresos variables; historial con varios retrasos.',
    });
  }
  return out;
}
