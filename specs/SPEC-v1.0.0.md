# SPEC v1.0.0 — Inteligencia de Negocio y Reportes

## Objetivo
Dar al propietario una visión estratégica de su patrimonio: ocupación histórica, rentabilidad real por inmueble, proyección de retorno de inversión y exportación de reportes para contabilidad o impuestos.

## Funcionalidades

- **Dashboard avanzado**: Gráficas de ocupación mensual/anual, ingresos vs gastos por propiedad.
- **Rentabilidad por inmueble**: Ingreso total acumulado − Gastos acumulados = ROI actual.
- **Módulo de Proyección**: Dado el precio de compra del inmueble y los ingresos anuales, calcula el retorno estimado en N años.
- **Exportación Excel/CSV**: Reporte de pagos, gastos e ingresos filtrado por rango de fechas y propiedad.
- **Ocupación histórica**: Gráfica de % de unidades ocupadas por mes durante el año.

## Modelo de Datos (Firestore)

```
properties/{propertyId}
  + purchasePrice: number | null    — precio de compra (para cálculo ROI)
  + purchaseDate: Timestamp | null

monthlySnapshots/{snapshotId}
  - propertyId: string
  - ownerId: string
  - month: string                   — "YYYY-MM"
  - totalCollected: number
  - totalExpenses: number
  - occupancyRate: number           — 0-100, % de unidades ocupadas
  - occupiedUnits: number
  - totalUnits: number
  - createdAt: Timestamp
```
Los snapshots se generan via Cloud Function al cierre de cada mes.

## Arquitectura Angular

```
features/
  analytics/
    analytics.routes.ts
    analytics-dashboard/
      analytics-dashboard.component.ts    # Gráficas principales
      occupancy-chart/
        occupancy-chart.component.ts      # Chart.js — barras por mes
      revenue-chart/
        revenue-chart.component.ts        # Chart.js — línea ingresos vs gastos
      roi-calculator/
        roi-calculator.component.ts       # Calculadora de proyección
    reports/
      reports.component.ts               # Filtros + botón exportar
```

Cloud Functions:
```
functions/
  src/
    generateMonthlySnapshot.ts     # Cron: primer día de cada mes
    exportReport.ts                # Callable: genera CSV/Excel y retorna URL temporal
```

## Rutas

```
/analytics                   → AnalyticsDashboardComponent (role: owner)
/analytics/reports           → ReportsComponent (role: owner)
```

## Criterios de Aceptación

1. El gráfico de ocupación muestra los últimos 12 meses con porcentaje de unidades ocupadas.
2. El cálculo de ROI muestra: `(ingresos_anuales / precio_compra) * 100 = % rendimiento anual`.
3. La exportación CSV incluye columnas: fecha, inmueble, unidad, concepto, monto, fuente (manual/gateway).
4. La proyección calcula cuántos meses faltan para recuperar la inversión basándose en el promedio mensual actual.
5. Los snapshots mensuales se generan automáticamente; si fallan, pueden regenerarse manualmente desde el dashboard.
6. Solo el `owner` tiene acceso al módulo de analytics; el rol `admin` no puede verlo.

## Dependencias

```json
{
  "chart.js": "^4.x",
  "ng2-charts": "^6.x",
  "xlsx": "^0.18.x"
}
```

## Bloquea
Esta es la versión final del roadmap (v1.0.0). No bloquea versiones futuras del roadmap actual.
