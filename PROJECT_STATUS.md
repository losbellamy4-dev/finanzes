# PROJECT_STATUS — NEXUS FINANCE

Última actualización: versión 0.1.0 (primera versión funcional).

## Contexto de partida

* El repositorio estaba vacío: se eligió la pila recomendada (TypeScript, React, Vite, Tailwind, IndexedDB, Recharts, Zod) más Immer para la atomicidad de comandos.
* **La web de referencia (bankaccountsimulator.com) no se pudo consultar**: el dominio está bloqueado por la política de red de este entorno. La especificación del prompt se ha usado como referencia funcional y no se han añadido funciones fuera de ella. Si se habilita el dominio, conviene revisar el catálogo para detectar diferencias.

## Funciones terminadas

### Fase 1 — Arquitectura
- [x] Modelo de datos Zod como fuente única de tipos (`src/core/schema.ts`).
- [x] Dinero en céntimos, divisas con tipos simulados, PRNG determinista, reloj simulado.
- [x] Motor de comandos atómico (Immer) con control de duplicados por `opId`.
- [x] Documentación de arquitectura (`docs/ARCHITECTURE.md`).

### Fase 2 — Interfaz
- [x] Layout responsive: barra lateral (escritorio), barra inferior + hoja «Más» (móvil), barra superior con reloj simulado (pausa, velocidad, +1 día/semana/mes).
- [x] Dashboard completo (patrimonio, KPIs, gráficas, actividad, favoritas, posiciones, notificaciones, productos).
- [x] Sistema de temas (oscuro con la paleta indicada, claro, sistema) y paleta de gráficas validada para daltonismo.
- [x] Componentes: botones, campos, modales/hojas, confirmaciones, avisos, gráficas, tarjeta bancaria, ilustraciones de inmuebles.

### Fase 3 — Banca
- [x] Cuentas ilimitadas (4 tipos) con IBAN/número ficticios, edición, favoritas y cierre con traspaso del saldo.
- [x] Ingresar, retirar, traspasar, transferencia externa (pendiente 24 h simuladas), recibir, pagar, solicitudes de dinero, contactos.
- [x] Transferencias programadas y periódicas (diaria … anual, fin por fecha o repeticiones, pausa/reanudación, fallos auditados).
- [x] Tarjetas débito/crédito/prepago: creación, edición, diseños, congelar, cancelar, límites diario/mensual/crédito, movimientos, extractos, pago mínimo, intereses, comisión por impago, pago automático, recarga/descarga.

### Fase 4 — Inversiones
- [x] Mercado con 35 activos ficticios (acciones, ETF, índices, cripto, bonos, fondos), búsqueda, filtros y favoritos.
- [x] Ficha con gráfica 1D/1S/1M/3M/1A/Todo, estadísticas, empresa ficticia.
- [x] Compra/venta por importe o cantidad, venta total, comisión configurable, historial de operaciones.
- [x] Cartera: valor, capital invertido, beneficio realizado/no realizado, rentabilidad, distribución por activo y categoría, dividendos y cupones.
- [x] Opciones europeas (Black-Scholes) y futuros con apalancamiento y liquidación por margen.
- [x] Motor de mercado reproducible por semilla con regímenes y escenarios.

### Fase 5 — Productos
- [x] Catálogo por categorías con ficha (condiciones, costes, intereses, duración), simulador y contratación.
- [x] Cuenta remunerada, depósito a plazo fijo, depósito estructurado, huchas, objetivos con avisos al 25/50/75/100 %.
- [x] Préstamo personal, hipoteca, financiación empresarial (cuota, intereses, calendario, cargo automático, impagos, amortización anticipada) y líneas de crédito.
- [x] Seguros de hogar, vida, viaje, dispositivos y bienes de valor (primas, siniestros con franquicia, suspensión/reactivación).
- [x] Patrimonio: asesor simulado por reglas, caja fuerte digital, planificación (proyección + beneficiarios), donaciones.

### Fase 6 — Inmobiliario
- [x] Mercado ficticio (6 tipos, 12 ciudades), filtros, ilustraciones procedurales (fachada, atardecer, interior), evolución del valor.
- [x] Compra al contado o con hipoteca (gastos configurables), venta (cancela la hipoteca), gastos/reparaciones.
- [x] Alquileres: inquilinos ficticios con fiabilidad, contrato, fianza, cobro mensual, impagos (automáticos y manuales), cobro de atrasos, fin de contrato, rentabilidad.

### Fase 7 — Funciones avanzadas
- [x] Credit score simulado (factores, historial, eventos, simulador de decisiones) con aviso de no oficialidad.
- [x] Perfiles múltiples independientes (crear, cambiar, duplicar, eliminar).
- [x] Panel de control de mercado completo sin restricciones.
- [x] Exportación/importación validada (checksum + Zod + migraciones), copias de seguridad automáticas y manuales, CSV de movimientos.
- [x] Ajustes: tema, ocultar saldos, datos del perfil, costes inmobiliarios, almacenamiento.
- [x] PWA mínima (manifest + service worker) para uso sin conexión.

### Fase 8 — QA
- [x] 55 pruebas unitarias/integración (Vitest).
- [x] 4 pruebas E2E (Playwright, escritorio y móvil).

## Pruebas realizadas

| Batería | Resultado |
|---|---|
| `npm run typecheck` (TS estricto) | OK |
| `npm test` — 55 pruebas: TEST 1–9, motor de transacciones (importes, cuentas cerradas, divisas, descubierto, externas), mercado (reproducibilidad, regímenes, velas, activos, escenarios), tarjetas (Luhn inválido, límites, congelación, extractos/intereses/comisión, prepago), préstamos (cuota, calendario, impago y regularización, amortización), ahorro, depósitos, seguros, líneas de crédito, inmobiliario (contado, hipoteca, alquiler, impago), credit score, programadas, derivados (paridad put-call, liquidación), atomicidad, export/import (manipulación, validación), migraciones, copias, perfil demo | OK |
| `npm run test:e2e` — TEST 1–9 en navegador real (incluye recarga de página y cambio de perfil) + recorrido de todas las secciones del perfil demo y avance de 1 mes, en escritorio y Pixel 7 | OK |
| `npm run build` | OK |
| Revisión visual con capturas (escritorio, móvil, tema claro) | Sin desbordamientos horizontales tras la corrección de la barra superior móvil |

## Errores conocidos y limitaciones

- El tiempo simulado solo avanza con la aplicación abierta (decisión de diseño).
- Los activos e inmuebles cotizan en la divisa base del perfil; no hay activos en otras divisas.
- Opciones: solo compra (largo); no se pueden emitir opciones. Futuros liquidados por diferencias.
- Intereses de tarjeta calculados sobre el saldo de extracto impagado (sin saldo medio diario).
- Los siniestros se aprueban automáticamente salvo franquicia, cobertura agotada o póliza inactiva.
- La primera carga sin conexión requiere haber abierto la app al menos una vez con conexión.
- Paquete principal ~154 kB gzip + gráficas ~108 kB gzip (mejorable con más división de código).
- No hay ESLint/Prettier configurados (solo TypeScript estricto).
- El escaneo DAST de HawkScan no se ha ejecutado: requiere `HAWK_API_KEY`, no disponible en este entorno.
- La web de referencia no se ha podido revisar (ver «Contexto de partida»).

## Próximas tareas sugeridas

1. Revisar bankaccountsimulator.com/es/funciones cuando el dominio esté accesible y cerrar diferencias.
2. Configurar ESLint + Prettier y CI (typecheck, unit, e2e).
3. Pruebas de componentes (React Testing Library) para formularios complejos.
4. Auditoría de accesibilidad (lectores de pantalla, contraste en tema claro) y modo de alto contraste.
5. Reducir el tamaño del paquete (carga diferida de Recharts por pantalla).
6. Ejecutar HawkScan con una clave de API y corregir hallazgos.
