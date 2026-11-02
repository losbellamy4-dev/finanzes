# NEXUS FINANCE

Simulador bancario, financiero, bursátil e inmobiliario de alta fidelidad. Construye y gestiona un patrimonio virtual desde cero: cuentas, tarjetas, bolsa, criptomonedas simuladas, derivados, ahorro, préstamos, seguros, inmuebles en alquiler, credit score y control total del mercado.

> **Exclusivamente un simulador.** No se conecta con bancos, no ejecuta operaciones reales, no solicita credenciales y no genera tarjetas utilizables. Todo el dinero, las empresas, los inmuebles y las personas son ficticios. Todas las funciones están desbloqueadas: sin suscripciones, compras integradas ni anuncios.

## Puesta en marcha

Requisitos: Node.js 20+ y npm.

```bash
npm install          # .npmrc activa legacy-peer-deps (evita un fallo de npm con peers opcionales)
npm run dev          # http://localhost:5173
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Comprobación de tipos + build de producción en `dist/`. |
| `npm run preview` | Sirve el build. |
| `npm run build:html` | Genera `release/nexus-finance.html`: la app completa en un solo archivo que se abre con doble clic en Chrome (sin servidor). |
| `npm test` | Pruebas unitarias e integración (Vitest). |
| `npm run test:e2e` | Pruebas de interfaz con Playwright (escritorio y móvil). En local, la primera vez: `npx playwright install chromium`. |
| `npm run test:all` | Tipos + unitarias + build + E2E. |

## Qué incluye

* **Dashboard**: patrimonio neto y su evolución, saldos, disponible, invertido, inmuebles, deudas, ingresos y gastos del mes, beneficios/pérdidas, actividad reciente, cuentas favoritas, posiciones, notificaciones y productos contratados.
* **Banca**: cuentas ilimitadas (corriente, ahorro, inversión, empresarial) con IBAN ficticio; ingresos, retiradas, traspasos, transferencias externas, cobros, pagos, solicitudes de dinero y transferencias programadas/periódicas (nóminas incluidas).
* **Tarjetas** débito, crédito y prepago con diseño personalizable, límites, congelación, ciclo de facturación, intereses, comisiones y pago automático.
* **Inversión**: 35 activos ficticios (acciones, ETF, índices, cripto, bonos, fondos), gráficas por periodo, favoritos, compra/venta por importe o cantidad, cartera con rentabilidad y distribución, dividendos y cupones, opciones (Black-Scholes) y futuros apalancados.
* **Control de mercado**: regímenes (alcista, bajista, lateral, crisis, recuperación), tendencias globales y por categoría, precios manuales, activos y empresas personalizadas, escenarios, semilla y velocidad de simulación.
* **Productos**: cuenta remunerada, depósitos fijos y estructurados, huchas, objetivos con hitos, préstamos personales, hipotecas, líneas de crédito, financiación empresarial, cinco seguros, asesor patrimonial, caja fuerte digital, planificación y donaciones — con ficha, costes y simulador.
* **Inmobiliario**: mercado con filtros, ilustraciones originales, compra al contado o con hipoteca, revalorización, alquileres con inquilinos ficticios, impagos, reparaciones, rentabilidad y venta.
* **Credit score** simulado con factores, historial y simulador de decisiones.
* **Perfiles** independientes, exportación/importación validada, copias de seguridad, tema claro/oscuro y funcionamiento sin conexión.

## Documentación

* [Arquitectura técnica](docs/ARCHITECTURE.md)
* [Estado del proyecto](PROJECT_STATUS.md)

## Tecnología

TypeScript · React 19 · Vite · Tailwind CSS 4 · Immer · Zod · Recharts · IndexedDB · Vitest · Playwright.
