# NEXUS FINANCE — Arquitectura técnica

## 1. Visión general

Aplicación web 100 % cliente (SPA) que funciona sin servidor ni conexión una vez cargada. Todo el estado financiero de cada perfil vive en el navegador (IndexedDB) y se modifica **exclusivamente** a través de un motor de comandos puro, sin dependencias de React.

```
┌──────────────────────── Interfaz (React + Tailwind) ────────────────────────┐
│  features/*  (pantallas)     ui/*  (componentes)     app/*  (layout, router) │
│        │  useOperation() genera un opId por intento y muestra avisos         │
└────────┼─────────────────────────────────────────────────────────────────────┘
         ▼
┌──────────────── store/appStore.ts ────────────────┐
│ dispatch(type, payload, opId)                      │  reloj en tiempo real (ticker)
│ autoguardado (120 ms tras operación, 4 s en ticks) │  perfiles · export/import · copias
└────────┼───────────────────────────────────────────┘
         ▼
┌──────────────── engine/commands.ts ───────────────┐
│ execute(): control de duplicados + produce(Immer)  │  ← atomicidad: si el manejador lanza,
│ handlers: banca, tarjetas, inversión, productos…   │    el borrador se descarta entero
└────────┼───────────────────────────────────────────┘
         ▼
┌──────────────── engine/ledger.ts ─────────────────┐
│ post(): ÚNICO punto que modifica saldos bancarios  │  validación → mutación → asiento
└────────────────────────────────────────────────────┘
         ▼
┌──────────────── persistence/* ────────────────────┐
│ IndexedDB (meta, profiles, backups) · migraciones  │  validación Zod en carga e importación
└────────────────────────────────────────────────────┘
```

## 2. Estructura de carpetas

| Carpeta | Responsabilidad |
|---|---|
| `src/core/` | Modelo de datos Zod (`schema.ts`, fuente única de tipos), dinero en céntimos y divisas (`money.ts`), PRNG determinista (`random.ts`), reloj simulado (`time.ts`). |
| `src/engine/` | Lógica financiera pura: libro mayor, banca, tarjetas, mercado, cartera, derivados, control de mercado, inmobiliario, credit score, planificador temporal, selectores, fábrica de perfiles y demo. |
| `src/engine/products/` | Ahorro (objetivos/huchas), depósitos, préstamos y líneas de crédito, seguros, patrimonio. |
| `src/data/` | Catálogos ficticios: activos, ciudades/inmuebles/inquilinos, etiquetas. |
| `src/persistence/` | IndexedDB sin dependencias, repositorio, exportación/importación con checksum, migraciones. |
| `src/store/` | Store de la app (perfil activo, despacho, autoguardado, ticker), hooks y avisos. |
| `src/ui/` | Componentes reutilizables: primitivas, modales, gráficas, tarjeta bancaria, ilustraciones de inmuebles. |
| `src/features/` | Pantallas por módulo (dashboard, cuentas, operaciones, tarjetas, inversión, control de mercado, productos, inmobiliario, crédito, actividad, perfiles, ajustes). |
| `src/test/` | Pruebas unitarias e integración (Vitest + fake-indexeddb). |
| `e2e/` | Pruebas de interfaz en navegador real (Playwright, escritorio y móvil). |

Añadir un módulo nuevo = un fichero en `engine/` con sus funciones `(state, payload) => resultado`, registrarlas en `engine/commands.ts`, ampliar `core/schema.ts` (y una migración si cambia el esquema persistido) y crear su pantalla en `features/`.

## 3. Modelo de datos

`ProfileState` (ver `src/core/schema.ts`) agrupa todo lo de un perfil: `profile`, `clock`, `accounts`, `transactions`, `contacts`, `scheduled`, `requests`, `cards`, `market` (activos con historial, régimen, tendencias, escenarios), `portfolio` (posiciones, operaciones, derivados, favoritos), `goals`, `deposits`, `loans`, `creditLines`, `insurance`, `vault`, `beneficiaries`, `donations`, `properties`, `tenants`, `rentals`, `creditEvents`, `creditHistory`, `netWorthHistory`, `notifications`, `settings`, `processedOps`.

* **Importes**: enteros en céntimos. Los precios de activos son números en unidades mayores y se liquidan a céntimos al operar.
* **Divisas**: cada cuenta tiene su moneda; los activos e inmuebles cotizan en la divisa base del perfil. Las conversiones usan tipos simulados fijos (`FX_RATES`).
* **Identificadores**: deterministas (`prefijo_contador`) para que las pruebas sean reproducibles.
* **Movimientos**: cada `Transaction` guarda id, fecha simulada, importe (y destino convertido), origen, destino, concepto, categoría, flujo (ingreso/gasto/interno/inversión/financiación), estado y saldo resultante de cada cuenta implicada.

## 4. Motor de transacciones

`engine/ledger.ts → post()`:

1. Valida el importe (entero > 0, ≤ 1.000 millones), las cuentas (existen y abiertas) y el saldo disponible (saldo + descubierto autorizado; por defecto 0).
2. Solo después aplica los cambios y registra el asiento con los saldos resultantes.

`engine/commands.ts → execute()`:

* Rechaza un `opId` ya procesado (doble clic, reintento). La interfaz genera un `opId` por intento y además deshabilita el botón.
* Ejecuta el manejador dentro de `produce` (Immer). Si cualquier paso falla, no hay estado nuevo: la operación no se ejecuta parcialmente.
* Los componentes visuales nunca modifican saldos: solo llaman a `dispatch`.

## 5. Motor de mercado

Movimiento browniano geométrico por hora simulada:

`P(t+1) = P(t) · exp((μ − σ²/2)·dt + σ·√dt·Z)`, con `dt = 1/8760`.

* `Z = gaussianAt(semilla, idActivo, tick)` — derivado por hash, independiente del orden y del renderizado: misma semilla + mismos parámetros ⇒ misma evolución (probado).
* `μ = deriva propia·escala_régimen + (deriva_régimen + tendencia_global + escenario)·beta + tendencia_categoría`.
* `σ = volatilidad propia·mult_régimen·mult_categoría·mult_escenario`.
* Regímenes: normal, alcista, bajista, lateral, crisis, recuperación. Escenarios con duración y mercados objetivo (incluido el inmobiliario).
* Historial: 7 días horarios + ~3 años de velas diarias. El año previo a la creación del perfil se genera con el mismo motor.
* Para avanzar muchas horas el planificador trabaja sobre una copia mutable del mercado (`thawMarket`) y evita la sobrecarga de los proxies de Immer (de ~110 s a ~3 s en la batería de pruebas).

## 6. Planificador temporal

El reloj cuenta horas simuladas desde la medianoche UTC de creación del perfil. Avanza con el ticker (velocidad configurable, por defecto 1 h cada 4 s) o con los botones +1 día/semana/mes. En cada tick: precios, vencimientos de escenarios y liquidación de futuros. En cada cambio de día (`processDay`):

1. Liquidación de transferencias externas pendientes.
2. Transferencias programadas y periódicas (incluidas nóminas).
3. Aportaciones automáticas a objetivos.
4. Cuotas de préstamos (impagos, comisiones y regularización).
5. Ciclo de tarjetas de crédito (cierre de extracto, vencimiento, pago automático, intereses y comisiones).
6. Vencimiento de depósitos.
7. Primas de seguros (suspensión si no hay saldo).
8. Rentas de alquiler (pago o impago según la fiabilidad del inquilino, determinista) y fin de contratos.
9. Respuesta a solicitudes de dinero.
10. Día 1 de mes: intereses de cuentas y objetivos, intereses de líneas de crédito, dividendos/cupones, revalorización inmobiliaria.
11. Registro del credit score y del patrimonio neto.

El tiempo simulado solo avanza con la aplicación abierta (decisión de diseño para que la simulación sea predecible).

## 7. Persistencia

* IndexedDB `nexus-finance` con almacenes `meta`, `profiles` (uno por perfil) y `backups` (índice por perfil, máx. 10).
* Guardado automático tras cada operación y periódicamente durante la simulación; volcado al ocultar/cerrar la pestaña.
* Carga: migraciones en cadena (`persistence/migrations.ts`) + validación Zod completa.
* Exportación: JSON con formato, versión de esquema, fecha y checksum. Importación: límite de tamaño, verificación de checksum, migración y validación; si el id existe, se importa como perfil nuevo.
* Copia automática diaria (por dispositivo) y copias manuales restaurables.
* Service worker propio (`public/sw.js`) para uso sin conexión tras la primera carga.

## 8. Seguridad y transparencia

* Sin red: no hay llamadas a servicios externos ni credenciales.
* IBAN con dígitos de control `00` (inválidos según ISO 13616). Tarjetas con prefijo `0` y dígito Luhn inválido: no utilizables.
* Todas las entidades (empresas, índices, criptomonedas, inmuebles, inquilinos, ONG) son ficticias. Marca y logotipo originales.
* Insignia «Simulación» permanente y avisos en confirmaciones.
* Importación tratada como entrada no confiable (tamaño, checksum, esquema estricto).

## 9. Dependencias

| Paquete | Motivo |
|---|---|
| react, react-dom | Interfaz. |
| immer | Atomicidad de comandos y estado inmutable con compartición estructural. |
| zod | Esquema único: tipos, validación de carga/importación y migraciones. |
| recharts (+ react-is, peer) | Gráficas interactivas. |
| lucide-react | Iconografía coherente (tree-shakeable). |
| tailwindcss, @tailwindcss/vite, vite, typescript | Build y estilos. |
| vitest, fake-indexeddb | Pruebas unitarias e integración (IndexedDB simulado en Node). |
| @playwright/test | Pruebas de interfaz en navegador real. |

Router, almacenamiento IndexedDB, PRNG y service worker están implementados sin dependencias.
