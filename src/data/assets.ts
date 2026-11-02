/**
 * Catálogo inicial de activos. Todas las empresas, fondos, índices y
 * criptomonedas son ficticios y no representan entidades reales.
 */
import type { AssetType } from '@/core/schema';

export interface AssetSeed {
  symbol: string;
  name: string;
  type: AssetType;
  sector: string;
  price: number;
  drift: number;
  volatility: number;
  beta: number;
  yield: number;
  baseVolume: number;
  description: string;
  company?: { sector: string; country: string; employees: number; founded: number; ceo: string };
}

export const ASSET_SEEDS: AssetSeed[] = [
  // ---------------- Acciones ----------------
  {
    symbol: 'AURX', name: 'Aurora Robotics', type: 'stock', sector: 'Tecnología', price: 182.4, drift: 0.12, volatility: 0.38, beta: 1.3, yield: 0, baseVolume: 4_200_000,
    description: 'Fabricante ficticio de robots colaborativos para logística y fabricación avanzada.',
    company: { sector: 'Tecnología', country: 'España', employees: 18400, founded: 2009, ceo: 'Lucía Ferrán' },
  },
  {
    symbol: 'QNTM', name: 'Quantum Leaf Computing', type: 'stock', sector: 'Tecnología', price: 96.2, drift: 0.15, volatility: 0.52, beta: 1.6, yield: 0, baseVolume: 6_900_000,
    description: 'Desarrolla procesadores cuánticos experimentales y servicios de computación en la nube.',
    company: { sector: 'Tecnología', country: 'Países Bajos', employees: 5200, founded: 2016, ceo: 'Daan Verhoef' },
  },
  {
    symbol: 'HLX', name: 'Helios Renewables', type: 'stock', sector: 'Energía', price: 44.8, drift: 0.08, volatility: 0.31, beta: 0.9, yield: 0.021, baseVolume: 3_100_000,
    description: 'Operador ficticio de parques solares y eólicos en el sur de Europa.',
    company: { sector: 'Energía', country: 'Portugal', employees: 7600, founded: 2004, ceo: 'Inês Carvalho' },
  },
  {
    symbol: 'VRDA', name: 'Verdana Foods', type: 'stock', sector: 'Consumo básico', price: 63.1, drift: 0.05, volatility: 0.18, beta: 0.6, yield: 0.034, baseVolume: 2_400_000,
    description: 'Grupo alimentario con marcas de producto fresco, conservas y bebidas vegetales.',
    company: { sector: 'Consumo básico', country: 'Italia', employees: 31200, founded: 1962, ceo: 'Marco Bellini' },
  },
  {
    symbol: 'MDCR', name: 'Medicore Biotech', type: 'stock', sector: 'Salud', price: 128.9, drift: 0.09, volatility: 0.42, beta: 0.8, yield: 0, baseVolume: 2_900_000,
    description: 'Biotecnológica centrada en terapias génicas y diagnóstico temprano.',
    company: { sector: 'Salud', country: 'Suiza', employees: 9800, founded: 1998, ceo: 'Annika Brunner' },
  },
  {
    symbol: 'ORBT', name: 'Orbital Freight', type: 'stock', sector: 'Industria', price: 74.3, drift: 0.1, volatility: 0.45, beta: 1.4, yield: 0, baseVolume: 3_800_000,
    description: 'Lanzadores reutilizables y logística de satélites de órbita baja.',
    company: { sector: 'Aeroespacial', country: 'Francia', employees: 6100, founded: 2012, ceo: 'Claire Dumont' },
  },
  {
    symbol: 'CRST', name: 'Crestline Bank', type: 'stock', sector: 'Finanzas', price: 38.6, drift: 0.06, volatility: 0.27, beta: 1.2, yield: 0.048, baseVolume: 5_300_000,
    description: 'Banco minorista ficticio con presencia en doce países.',
    company: { sector: 'Finanzas', country: 'Irlanda', employees: 42800, founded: 1931, ceo: 'Ciarán Walsh' },
  },
  {
    symbol: 'NOVA', name: 'Nova Retail Group', type: 'stock', sector: 'Consumo discrecional', price: 52.7, drift: 0.07, volatility: 0.29, beta: 1.1, yield: 0.018, baseVolume: 3_600_000,
    description: 'Cadena de moda y hogar con fuerte crecimiento en comercio electrónico.',
    company: { sector: 'Distribución', country: 'España', employees: 56000, founded: 1985, ceo: 'Elena Robles' },
  },
  {
    symbol: 'TERR', name: 'Terraforma Materials', type: 'stock', sector: 'Materiales', price: 27.4, drift: 0.05, volatility: 0.33, beta: 1.0, yield: 0.026, baseVolume: 2_100_000,
    description: 'Cementos de bajas emisiones y materiales de construcción reciclados.',
    company: { sector: 'Materiales', country: 'Alemania', employees: 22400, founded: 1951, ceo: 'Jonas Albrecht' },
  },
  {
    symbol: 'PXLS', name: 'Pixelstream Media', type: 'stock', sector: 'Comunicación', price: 211.5, drift: 0.11, volatility: 0.36, beta: 1.2, yield: 0, baseVolume: 4_700_000,
    description: 'Plataforma de streaming, videojuegos en la nube y publicidad digital.',
    company: { sector: 'Medios', country: 'Suecia', employees: 12900, founded: 2007, ceo: 'Freja Lindqvist' },
  },
  {
    symbol: 'AQUA', name: 'Aquilon Water', type: 'stock', sector: 'Utilities', price: 33.9, drift: 0.04, volatility: 0.15, beta: 0.4, yield: 0.041, baseVolume: 1_500_000,
    description: 'Gestión de redes de agua potable y plantas desaladoras.',
    company: { sector: 'Utilities', country: 'España', employees: 8700, founded: 1972, ceo: 'Andrés Ibarra' },
  },
  {
    symbol: 'SKYW', name: 'Skyward Airlines', type: 'stock', sector: 'Transporte', price: 18.75, drift: 0.03, volatility: 0.48, beta: 1.5, yield: 0, baseVolume: 7_800_000,
    description: 'Aerolínea de bajo coste con base en tres hubs europeos.',
    company: { sector: 'Transporte', country: 'Austria', employees: 15300, founded: 1994, ceo: 'Lukas Gruber' },
  },
  // ---------------- ETF ----------------
  { symbol: 'NXWD', name: 'Nexus World Equity ETF', type: 'etf', sector: 'Renta variable global', price: 88.4, drift: 0.07, volatility: 0.16, beta: 1.0, yield: 0.017, baseVolume: 2_600_000, description: 'Replica un índice ficticio de 1.500 compañías de mercados desarrollados.' },
  { symbol: 'NXTC', name: 'Nexus Tech Leaders ETF', type: 'etf', sector: 'Tecnología', price: 142.1, drift: 0.11, volatility: 0.25, beta: 1.3, yield: 0.006, baseVolume: 3_400_000, description: 'Exposición a las 50 mayores tecnológicas del mercado simulado.' },
  { symbol: 'NXDV', name: 'Nexus Dividend Aristocrats', type: 'etf', sector: 'Dividendos', price: 54.3, drift: 0.05, volatility: 0.13, beta: 0.7, yield: 0.039, baseVolume: 1_200_000, description: 'Empresas con más de 20 años de dividendos crecientes.' },
  { symbol: 'NXGR', name: 'Nexus Green Energy ETF', type: 'etf', sector: 'Energías limpias', price: 31.2, drift: 0.08, volatility: 0.29, beta: 1.1, yield: 0.011, baseVolume: 1_900_000, description: 'Cesta de productores de energía renovable y almacenamiento.' },
  { symbol: 'NXEM', name: 'Nexus Emerging Markets', type: 'etf', sector: 'Emergentes', price: 41.8, drift: 0.07, volatility: 0.22, beta: 1.15, yield: 0.024, baseVolume: 2_200_000, description: 'Renta variable de economías emergentes simuladas.' },
  // ---------------- Índices ----------------
  { symbol: 'NX100', name: 'Índice Nexus 100', type: 'index', sector: 'Índice', price: 15240, drift: 0.08, volatility: 0.18, beta: 1.1, yield: 0, baseVolume: 0, description: 'Índice de referencia con las 100 mayores empresas del mercado simulado.' },
  { symbol: 'EUSIM50', name: 'Índice Euro Sim 50', type: 'index', sector: 'Índice', price: 4870, drift: 0.06, volatility: 0.17, beta: 1.0, yield: 0, baseVolume: 0, description: 'Las 50 mayores compañías europeas ficticias por capitalización.' },
  { symbol: 'GLB500', name: 'Índice Global 500', type: 'index', sector: 'Índice', price: 5320, drift: 0.07, volatility: 0.15, beta: 1.0, yield: 0, baseVolume: 0, description: 'Índice amplio de 500 compañías de todo el mundo simulado.' },
  { symbol: 'TECH30', name: 'Índice Tech 30', type: 'index', sector: 'Índice', price: 18400, drift: 0.12, volatility: 0.26, beta: 1.35, yield: 0, baseVolume: 0, description: 'Treinta valores tecnológicos de alta capitalización.' },
  // ---------------- Criptomonedas ----------------
  { symbol: 'NXC', name: 'NexCoin', type: 'crypto', sector: 'Criptomoneda', price: 61250, drift: 0.2, volatility: 0.65, beta: 1.8, yield: 0, baseVolume: 28_000, description: 'Criptomoneda simulada de oferta limitada. Sin valor real.' },
  { symbol: 'AETH', name: 'Aether', type: 'crypto', sector: 'Contratos inteligentes', price: 3120, drift: 0.22, volatility: 0.75, beta: 1.9, yield: 0, baseVolume: 310_000, description: 'Red ficticia de contratos inteligentes y finanzas descentralizadas.' },
  { symbol: 'SLC', name: 'Solace', type: 'crypto', sector: 'Contratos inteligentes', price: 142, drift: 0.25, volatility: 0.9, beta: 2.1, yield: 0, baseVolume: 2_400_000, description: 'Cadena de bloques simulada de alta velocidad.' },
  { symbol: 'KAI', name: 'Kairo', type: 'crypto', sector: 'Pagos', price: 6.4, drift: 0.15, volatility: 0.85, beta: 2.0, yield: 0, baseVolume: 18_000_000, description: 'Token ficticio para pagos internacionales instantáneos.' },
  { symbol: 'LUM', name: 'Lumen', type: 'crypto', sector: 'Infraestructura', price: 0.82, drift: 0.18, volatility: 0.95, beta: 2.2, yield: 0, baseVolume: 95_000_000, description: 'Token de una red simulada de almacenamiento distribuido.' },
  { symbol: 'PAW', name: 'Moonpaw', type: 'crypto', sector: 'Meme', price: 0.000214, drift: 0.1, volatility: 1.6, beta: 2.8, yield: 0, baseVolume: 900_000_000_000, description: 'Criptomoneda «meme» ficticia de altísima volatilidad.' },
  // ---------------- Bonos ----------------
  { symbol: 'BG10', name: 'Bono Gobierno Sim 10 años', type: 'bond', sector: 'Deuda pública', price: 98.4, drift: 0.005, volatility: 0.06, beta: -0.2, yield: 0.031, baseVolume: 900_000, description: 'Bono soberano ficticio a 10 años con cupón mensual simulado.' },
  { symbol: 'BG2', name: 'Letra Gobierno Sim 2 años', type: 'bond', sector: 'Deuda pública', price: 99.6, drift: 0.002, volatility: 0.02, beta: -0.05, yield: 0.026, baseVolume: 600_000, description: 'Deuda pública ficticia a corto plazo, muy baja volatilidad.' },
  { symbol: 'BCORP', name: 'Bono Corporativo Grado Inversión', type: 'bond', sector: 'Deuda corporativa', price: 101.2, drift: 0.006, volatility: 0.07, beta: 0.15, yield: 0.042, baseVolume: 450_000, description: 'Cesta de bonos corporativos ficticios con calificación alta.' },
  { symbol: 'BHY', name: 'Bono High Yield', type: 'bond', sector: 'Alto rendimiento', price: 94.7, drift: 0.01, volatility: 0.12, beta: 0.5, yield: 0.068, baseVolume: 380_000, description: 'Deuda de alto rendimiento simulada: más cupón, más riesgo.' },
  // ---------------- Fondos ----------------
  { symbol: 'FMIX', name: 'Fondo Mixto Equilibrado', type: 'fund', sector: 'Mixto', price: 12.84, drift: 0.045, volatility: 0.09, beta: 0.6, yield: 0, baseVolume: 0, description: '50 % renta variable global y 50 % renta fija simulada.' },
  { symbol: 'FGLB', name: 'Fondo Renta Variable Global', type: 'fund', sector: 'Renta variable', price: 24.1, drift: 0.07, volatility: 0.15, beta: 1.0, yield: 0, baseVolume: 0, description: 'Fondo de gestión activa ficticio en acciones globales.' },
  { symbol: 'FMON', name: 'Fondo Monetario Nexus', type: 'fund', sector: 'Monetario', price: 10.02, drift: 0.0, volatility: 0.004, beta: 0, yield: 0.028, baseVolume: 0, description: 'Liquidez a corto plazo con rentabilidad mensual simulada.' },
  { symbol: 'FREIT', name: 'Fondo Inmobiliario REIT', type: 'fund', sector: 'Inmobiliario', price: 18.6, drift: 0.04, volatility: 0.17, beta: 0.8, yield: 0.045, baseVolume: 0, description: 'Cartera ficticia de oficinas, logística y residencial en alquiler.' },
];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: 'Acciones',
  etf: 'ETF',
  index: 'Índices',
  crypto: 'Cripto',
  bond: 'Bonos',
  fund: 'Fondos',
};

export const ASSET_TYPE_SINGULAR: Record<AssetType, string> = {
  stock: 'Acción',
  etf: 'ETF',
  index: 'Índice',
  crypto: 'Criptomoneda',
  bond: 'Bono',
  fund: 'Fondo',
};
