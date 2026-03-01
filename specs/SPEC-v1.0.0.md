# SPEC v1.0.0 — Inteligencia de Negocio y Reportes

## Objetivo
Dar al propietario una visión estratégica de su patrimonio: ocupación histórica, rentabilidad real por inmueble, proyección de retorno de inversión y exportación de reportes para contabilidad o impuestos. Versión final del roadmap — convierte los datos operativos acumulados en inteligencia accionable.

---

## Qué hereda de versiones anteriores

- `payments` con `amount`, `date`, `source`, `gatewayTransactionId` de v0.1.0 y v0.9.0.
- `expenses` con `amount`, `date`, `category`, `propertyId` de v0.2.0.
- `units` con `status`, `rentPrice` de v0.1.0 — para calcular ocupación histórica.
- `properties` con `name` de v0.1.0. **Esta versión agrega `purchasePrice` y `purchaseDate`**.
- `monthlySnapshots` (nuevos aquí) consolidan los datos de v0.2.0 y v0.9.0 para queries eficientes en gráficas.
- Cloud Functions de v0.8.0 y v0.9.0 — se agrega `generateMonthlySnapshot` y `exportReport`.

---

## Funcionalidades

### 1. Dashboard de Analytics (`/analytics`)
Vista de inteligencia de negocio con:
- Filtro de año y filtro de propiedad (igual al patrón de v0.2.0).
- **Gráfica de ocupación**: % de unidades ocupadas por mes durante los últimos 12 meses (barras).
- **Gráfica de ingresos vs gastos**: líneas dobles (ingresos azul, gastos rojo) por mes.
- **KPI cards de rendimiento**: ingreso anual total, gasto anual total, balance anual, tasa de ocupación promedio.

### 2. Rentabilidad por inmueble
- Tabla con columnas: Inmueble · Ingresos acumulados · Gastos acumulados · Balance · ROI%.
- `ROI% = (ingresos_acumulados_anuales / purchasePrice) * 100`.
- Si `purchasePrice` no está configurado: la celda ROI muestra "Sin datos — configura precio de compra".
- Clic en fila navega al detalle del inmueble (ya existente).

### 3. Calculadora de proyección (ROI)
- Inputs: precio de compra, ingresos mensuales promedio (pre-llenado con promedio real del último año).
- Output: años estimados para recuperar la inversión + gráfica de proyección lineal.
- Cálculo: `meses_recuperación = purchasePrice / promedioMensualNeto`.

### 4. Exportación de reportes
- Botón "Exportar" en `/analytics/reports` con opciones: **CSV** o **Excel (.xlsx)**.
- Filtros: rango de fechas (mes inicio — mes fin) y propiedad.
- Formato de cada fila: `Fecha | Inmueble | Unidad | Concepto | Categoría | Monto | Fuente (manual/gateway)`.
- La exportación la genera una Cloud Function `exportReport` (callable) que devuelve una URL temporal de Storage con el archivo.
- Timeout del archivo: 1 hora.

### 5. Monthly Snapshots (backend)
- Cloud Function `generateMonthlySnapshot` — cron el **primer día de cada mes a las 01:00 AM UTC-5**.
- Para cada propiedad del owner:
  - Consulta `payments` del mes anterior y suma `amount`.
  - Consulta `expenses` del mes anterior y suma `amount`.
  - Cuenta unidades `status: 'ocupado'` / total unidades.
  - Escribe el documento en `monthlySnapshots`.
- Si la función falla, el admin puede forzar la regeneración desde el dashboard (botón "Regenerar snapshot").

### 6. Precio de compra en propiedades
- Nueva sección "Inversión" en `PropertyFormComponent`:
  - `purchasePrice: number | null`
  - `purchaseDate: Timestamp | null`

---

## Modelo de Datos (Firestore)

```
properties/{propertyId}
  + purchasePrice: number | null    — precio de compra para cálculo ROI
  + purchaseDate: Timestamp | null

monthlySnapshots/{snapshotId}
  - propertyId: string
  - ownerId: string
  - month: string                   — "YYYY-MM"
  - totalCollected: number          — suma de payments del mes
  - totalExpenses: number           — suma de expenses del mes
  - netBalance: number              — totalCollected - totalExpenses
  - occupancyRate: number           — 0-100, % de unidades ocupadas
  - occupiedUnits: number
  - totalUnits: number
  - generatedAt: Timestamp
  - generatedBy: 'cron' | 'manual'
```

**Index compuesto:**
```
monthlySnapshots: ownerId (==) + month (range) + propertyId (==)
```

---

## Arquitectura Angular

```
src/app/
  features/
    analytics/
      analytics.routes.ts
      analytics-dashboard/
        analytics-dashboard.component.ts    # Layout + filtros + KPI anuales
        occupancy-chart/
          occupancy-chart.component.ts      # ng2-charts — barras de ocupación por mes
        revenue-chart/
          revenue-chart.component.ts        # ng2-charts — líneas ingresos vs gastos
        profitability-table/
          profitability-table.component.ts  # Tabla ROI por inmueble
        roi-calculator/
          roi-calculator.component.ts       # Calculadora con inputs + proyección
      reports/
        reports.component.ts               # Filtros + botón exportar + estado de descarga

    properties/
      property-form/
        property-form.component.ts         # Agregar sección "Inversión"
```

Cloud Functions (en `functions/src/`):
```
generateMonthlySnapshot.ts    # Cron: primer día del mes
exportReport.ts               # Callable: genera CSV/Excel y retorna URL Storage temporal
```

---

## Estado con Angular Signals

`AnalyticsDashboardComponent`:
```typescript
selectedYear       = signal<number>(new Date().getFullYear())
selectedPropertyId = signal<string | null>(null)

snapshots = toSignal(
  snapshotService.getSnapshots$(ownerId, selectedYear, selectedPropertyId),
  { initialValue: [] }
)

// Computed para KPI anuales
annualIncome   = computed(() => this.snapshots().reduce((s, m) => s + m.totalCollected, 0))
annualExpenses = computed(() => this.snapshots().reduce((s, m) => s + m.totalExpenses, 0))
annualBalance  = computed(() => this.annualIncome() - this.annualExpenses())
avgOccupancy   = computed(() => {
  const snaps = this.snapshots()
  return snaps.length ? snaps.reduce((s, m) => s + m.occupancyRate, 0) / snaps.length : 0
})

// Datos para Chart.js
occupancyChartData = computed(() => ({
  labels: this.snapshots().map(s => s.month),
  datasets: [{ data: this.snapshots().map(s => s.occupancyRate), label: 'Ocupación %' }]
}))
```

---

## UX y Diseño

**Analytics dashboard (desktop):**
```
┌──────────────────────────────────────────────────────────────┐
│  Analytics            [2026 ▾]    [Todas las propiedades ▾]  │
├──────────┬──────────┬──────────┬───────────────────────────  │
│ Ingresos │  Gastos  │ Balance  │  Ocupación promedio         │
│ $14.4M   │  $2.1M   │ +$12.3M  │  87%                       │
├──────────────────────────────┬───────────────────────────────┤
│  Ocupación mensual (%)       │  Ingresos vs Gastos ($)       │
│  [gráfica barras]            │  [gráfica líneas dobles]      │
│  ene feb mar abr ...         │  ene feb mar abr ...          │
├──────────────────────────────┴───────────────────────────────┤
│  Rentabilidad por inmueble                                   │
│  Inmueble       Ingresos    Gastos   Balance   ROI%          │
│  Edif. Robles   $8.4M       $1.2M    $7.2M     6.2%         │
│  Torre Norte    $6.0M       $0.9M    $5.1M     —            │
└──────────────────────────────────────────────────────────────┘
```

**Calculadora ROI:**
```
  ┌─────────────────────────────────────────────────────┐
  │  Calculadora de retorno de inversión                 │
  │                                                     │
  │  Precio de compra    [$350.000.000               ]  │
  │  Ingreso mensual     [$1.200.000  ] (promedio real) │
  │                                                     │
  │  → Recuperación estimada: 291 meses (24.3 años)    │
  │  → Rendimiento anual: ~4.1%                        │
  └─────────────────────────────────────────────────────┘
```

**Exportar reporte:**
```
  Reporte financiero
  Desde [ene 2026 ▾]  Hasta [dic 2026 ▾]   [Todas props ▾]
  [Exportar CSV]   [Exportar Excel]
  ⟳ Generando reporte...  →  ✓ Listo [Descargar]
```

---

## Rutas

```
/analytics              → AnalyticsDashboardComponent (canActivate: [ownerOnlyGuard])
/analytics/reports      → ReportsComponent (canActivate: [ownerOnlyGuard])
```

---

## Criterios de Aceptación

1. El gráfico de ocupación muestra los últimos 12 snapshots disponibles con porcentaje de unidades ocupadas por mes.
2. El gráfico de ingresos vs gastos usa los datos de `monthlySnapshots` (no queries directas a `payments`/`expenses`).
3. El ROI% por inmueble se calcula como `(ingresos_anuales / purchasePrice) * 100`; si `purchasePrice` es null, la celda muestra "Configurar" con link al formulario de propiedad.
4. La calculadora de proyección pre-llena el campo "Ingreso mensual" con el promedio real del último año de `monthlySnapshots`.
5. La exportación CSV incluye columnas: fecha, inmueble, unidad, concepto, categoría, monto, fuente.
6. La exportación Excel produce un archivo `.xlsx` válido descargable desde la URL temporal de Storage.
7. `generateMonthlySnapshot` corre automáticamente el primer día del mes; el admin puede forzar la regeneración manualmente desde el dashboard.
8. Si un snapshot del mes actual ya existe y se regenera manualmente, se sobreescribe (no se duplica).
9. Solo el rol `owner` puede acceder al módulo de analytics; los roles `admin` y `tenant` son redirigidos.
10. Todos los gráficos muestran un skeleton/spinner mientras los snapshots cargan, y un empty state si no hay datos del año seleccionado.
11. Al filtrar por una propiedad específica, los KPI cards y gráficas se recalculan con solo los snapshots de esa propiedad.

---

## Dependencias

```json
// package.json (Angular)
{
  "chart.js": "^4.x",
  "ng2-charts": "^6.x"
}

// functions/package.json
{
  "xlsx": "^0.18.x"
}
```

---

## Bloquea

Esta es la versión final del roadmap (v1.0.0). No bloquea versiones futuras planificadas.
