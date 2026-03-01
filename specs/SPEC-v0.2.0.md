# SPEC v0.2.0 — Control Financiero Básico

## Objetivo
Dar al propietario visibilidad del flujo de caja mensual sobre los datos ya registrados en v0.1.0: cuánto se esperaba recaudar, cuánto se recaudó realmente, qué gastos ocurrieron y cuál es el balance neto. Primera capa de inteligencia financiera sin depender de ninguna librería externa nueva.

---

## Qué hereda de v0.1.0

- Colección `payments` con `amount`, `date`, `unitId`, `propertyId`, `ownerId`.
- Colección `units` con `rentPrice`, `status: 'ocupado' | 'disponible'`, `tenantName`.
- Colección `properties` con `name`.
- `ShellComponent` con sidebar de navegación — solo agregar entrada "Finanzas".
- `AuthGuard` — todas las rutas de esta versión son protegidas.

---

## Funcionalidades

### 1. Finance Dashboard (`/finances`)
Vista principal con barra de filtros, 4 KPI cards y dos listas.

### 2. Filtro mes + propiedad
- Selector de mes con flechas `< [Febrero 2026] >` (mes anterior / mes siguiente).
- Dropdown de propiedad: "Todas las propiedades" + lista de propiedades del owner.
- Estado del filtro se persiste en `queryParams` de la URL (`?month=2026-02&propertyId=abc123`) para que sea compartible/bookmarkable.
- Por defecto carga el mes actual con todas las propiedades.

### 3. KPI Cards
Cuatro tarjetas en la parte superior del dashboard:

| Card | Descripción | Color |
|---|---|---|
| Total Esperado | Suma de `rentPrice` de unidades `status: 'ocupado'` dentro del filtro de propiedad | Neutro |
| Total Recaudado | Suma de `amount` de pagos del mes filtrado | Neutro |
| Total Gastos | Suma de `amount` de gastos del mes filtrado | Neutro |
| Balance Neto | Recaudado − Gastos | Verde si > 0, Rojo si < 0, Gris si = 0 |

### 4. Lista de Pagos del Mes
Tabla con columnas: Fecha · Inmueble · Unidad · Inquilino · Monto.
- Ordenada por fecha descendente.
- Muestra nombre del inmueble y número de unidad (join client-side desde signals de properties/units ya cargados).
- Total al pie de la columna de monto.
- Empty state: "No hay pagos registrados en [Mes Año]".
- Cada fila tiene link al `unit-detail` de esa unidad.

### 5. Lista de Gastos del Mes
Tabla con columnas: Fecha · Categoría (chip) · Descripción · Inmueble · Unidad (si aplica) · Monto · Acciones.
- Acciones: editar (abre modal) y eliminar (confirm dialog heredado de v0.1.0).
- Ordenada por fecha descendente.
- Total al pie de la columna de monto.
- Empty state: "No hay gastos registrados en [Mes Año]".
- Botón "Registrar Gasto" flotante (FAB en mobile, botón en toolbar en desktop).

### 6. Formulario de Gasto (Modal `MatDialog`)
No tiene ruta propia — siempre se abre como diálogo encima del Finance Dashboard para no perder el contexto del filtro activo.

Campos:
- `amount` — number, requerido, > 0.
- `date` — date picker, requerido, por defecto hoy.
- `category` — select: `reparacion` · `impuesto` · `servicio` · `otro`. Requerido.
- `description` — text, requerido, máx 200 caracteres (contador visible).
- `propertyId` — select con las propiedades del owner. Requerido.
- `unitId` — select con las unidades de la propiedad seleccionada. Opcional.
- `notes` — textarea, opcional.

Al guardar: cierra el modal, el gasto aparece en la lista inmediatamente (sin recargar), KPI cards se recalculan.

---

## Modelo de Datos (Firestore)

```
expenses/{expenseId}
  - ownerId: string           — uid del propietario (Security Rules)
  - propertyId: string        — ref a properties (requerido)
  - propertyName: string      — desnormalizado para display sin join
  - unitId: string | null     — ref a units (opcional)
  - unitNumber: string | null — desnormalizado para display
  - category: 'reparacion' | 'impuesto' | 'servicio' | 'otro'
  - description: string
  - amount: number
  - date: Timestamp           — fecha del gasto (no createdAt)
  - notes: string | null
  - createdAt: Timestamp
  - createdBy: string         — uid del admin
```

**Indexes compuestos necesarios en Firestore:**
```
expenses:  ownerId (==) + date (range) + __name__
payments:  ownerId (==) + date (range) + __name__   ← confirmar si ya existe de v0.1.0
```

---

## Arquitectura Angular

```
src/app/
  core/
    models/
      expense.model.ts          # Expense, ExpenseCreate interfaces
    services/
      expense.service.ts        # CRUD + query Firestore (getExpenses$, create, update, delete)
      finance.service.ts        # Solo cálculos con computed() signals — sin llamadas a Firestore

  features/
    finances/
      finances.routes.ts        # lazy-loaded desde app.routes.ts
      finances-dashboard/
        finances-dashboard.component.ts   # Layout, filtros, orquesta subcomponentes
        month-selector/
          month-selector.component.ts     # < [Mes Año] > con flechas, emite monthChange: Date
        kpi-card/
          kpi-card.component.ts           # @Input: label, amount, variant: 'neutral'|'positive'|'negative'
        payment-list/
          payment-list.component.ts       # @Input: payments, properties, units signals
        expense-list/
          expense-list.component.ts       # @Input: expenses signal; emite edit/delete
        expense-form/
          expense-form.component.ts       # Standalone, abre como MatDialog

  layout/
    shell/
      shell.component.ts        # Agregar ítem "Finanzas" al sidenav (ícono: bar_chart)
```

---

## Estado con Angular Signals

`FinancesDashboardComponent` maneja el estado local con signals:

```typescript
// Filtros (sincronizados con queryParams)
selectedMonth = signal<Date>(startOfMonth(new Date()))
selectedPropertyId = signal<string | null>(null)

// Datos de Firestore (cargados como Observables → toSignal)
paymentsInMonth   = toSignal(paymentsQuery$, { initialValue: [] })
expensesInMonth   = toSignal(expensesQuery$, { initialValue: [] })
occupiedUnits     = toSignal(unitsQuery$, { initialValue: [] })  // status: 'ocupado'
properties        = toSignal(propertiesQuery$, { initialValue: [] })
```

`FinanceService` expone solo `computed()` puros (sin efectos secundarios):

```typescript
totalExpected  = computed(() => filteredUnits().reduce((s, u) => s + u.rentPrice, 0))
totalCollected = computed(() => paymentsInMonth().reduce((s, p) => s + p.amount, 0))
totalExpenses  = computed(() => expensesInMonth().reduce((s, e) => s + e.amount, 0))
netBalance     = computed(() => this.totalCollected() - this.totalExpenses())
balanceVariant = computed(() =>
  this.netBalance() > 0 ? 'positive' : this.netBalance() < 0 ? 'negative' : 'neutral'
)
```

---

## UX y Diseño

**Layout desktop (≥ 1024px):**
```
┌─────────────────────────────────────────────────────┐
│  Finanzas          [< Feb 2026 >]  [Todas props ▾]  │
├──────────┬──────────┬──────────┬────────────────────┤
│ Esperado │ Recaudado│  Gastos  │   Balance Neto     │
│  $X,XXX  │  $X,XXX  │  $X,XXX  │  +$X,XXX  (verde) │
├──────────┴──────────┴──────────┴────────────────────┤
│  Pagos del mes               │  Gastos del mes      │
│  Fecha · Inm · Unid · Monto  │  Fecha · Cat · Monto │
│  ...                         │  ...                 │
│                    Total: $X │              Total $X│
└──────────────────────────────┴──────────────────────┘
```

**Layout mobile (< 768px):**
- KPI cards en grilla 2×2.
- Pagos y gastos apilados verticalmente, tablas con scroll horizontal.
- FAB "+" en esquina inferior derecha para registrar gasto.

**Chips de categoría:**
- `reparacion` → chip ámbar
- `impuesto` → chip rojo claro
- `servicio` → chip azul claro
- `otro` → chip gris

**Transiciones:**
- Al cambiar mes o propiedad: skeleton loader de 200ms antes de mostrar nuevos datos.
- KPI cards hacen flip/fade suave al actualizarse (Angular animations, opcional si el tiempo lo permite).

---

## Rutas

```
/finances          → FinancesDashboardComponent (lazy, protegida con AuthGuard)
```

El formulario de gasto es un `MatDialog`, no tiene ruta propia. Las rutas `/finances/expenses/new` y `/finances/expenses/:id/edit` del borrador anterior se eliminan.

Actualización en `app.routes.ts`:
```typescript
{
  path: 'finances',
  loadComponent: () => import('./features/finances/finances-dashboard/finances-dashboard.component')
    .then(m => m.FinancesDashboardComponent),
  canActivate: [authGuard]
}
```

---

## Criterios de Aceptación

1. **Filtro por defecto**: Al navegar a `/finances`, se carga el mes actual y "Todas las propiedades"; los queryParams `?month=YYYY-MM` se escriben en la URL.
2. **Navegación de mes**: Las flechas `<` y `>` avanzan/retroceden un mes; la URL se actualiza y los datos se recargan.
3. **Filtro por propiedad**: Al seleccionar una propiedad, los 4 KPI cards se recalculan instantáneamente con los datos de esa propiedad.
4. **Total Esperado**: Suma de `rentPrice` de unidades `status: 'ocupado'` del owner, filtradas por `propertyId` si hay filtro activo. No depende del mes — refleja la situación actual.
5. **Total Recaudado**: Suma de `amount` de pagos cuyo campo `date` cae dentro del primer y último día del mes seleccionado, filtrados por `propertyId` si aplica.
6. **Total Gastos**: Suma de `amount` de gastos cuyo campo `date` cae dentro del mes seleccionado.
7. **Balance Neto**: `totalCollected − totalExpenses`. Color verde si > 0, rojo si < 0, gris si = 0.
8. **Lista de pagos**: Muestra nombre del inmueble y número de unidad de cada pago (join client-side). Cada fila navega a `/properties/:id/units/:unitId`.
9. **Crear gasto**: El formulario modal valida todos los campos requeridos antes de habilitar el botón "Guardar". Al guardar, el gasto aparece en la lista y los KPI se actualizan sin recargar la página.
10. **Editar gasto**: Abrir el modal con datos pre-cargados, guardar actualiza el documento en Firestore y refleja el cambio reactivamente.
11. **Eliminar gasto**: Muestra el `ConfirmDialogComponent` de v0.1.0. Al confirmar, el gasto desaparece de la lista y los KPI se recalculan.
12. **Security Rules**: Las reglas de Firestore para `expenses` solo permiten leer/escribir si `request.auth.uid == resource.data.ownerId`.
13. **Responsive**: La vista es funcional en 375px (mobile) y 1280px+ (desktop).
14. **Empty states**: Mes sin pagos o sin gastos muestra un mensaje descriptivo (no una tabla vacía).

---

## Dependencias

Sin nuevas dependencias npm. Usa:
- **Firestore** queries con `where`, `orderBy`, `limit`.
- **Angular Material**: `MatDialog`, `MatSelect`, `MatDatepicker`, `MatChipsModule`, `MatTableModule`.
- **Angular Signals + `toSignal()`** para reactividad.

---

## Bloquea

- **v0.4.0** (Notificaciones y Alertas) usa el `netBalance` calculado aquí para emitir alertas cuando el balance es negativo.
- **v1.0.0** (BI y Reportes) extiende el modelo `expenses` para reportes históricos multi-mes.
