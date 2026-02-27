# SPEC v0.2.0 — Control Financiero Básico

## Objetivo
Dar al propietario visibilidad del flujo de caja: cuánto se esperaba recaudar, cuánto se recaudó realmente y qué gastos hubo. Primera capa de inteligencia financiera sobre los datos del MVP.

## Funcionalidades

- **Listado de pagos por mes**: Filtro de mes/año sobre la colección `payments`.
- **Total recaudado vs esperado**: Sumar `amount` de pagos del mes vs sumar `rentPrice` de unidades ocupadas.
- **Registro de Gastos**: CRUD de gastos (reparaciones, impuestos, servicios) asociados a un inmueble o unidad.
- **Balance mensual**: Recaudado − Gastos = Balance neto del mes.
- **UI**: Tabla de finanzas con filtros de mes y propiedad.

## Modelo de Datos (Firestore)

```
expenses/{expenseId}
  - propertyId: string — ref a properties
  - unitId: string | null — opcional, si aplica a una unidad específica
  - ownerId: string
  - category: 'reparacion' | 'impuesto' | 'servicio' | 'otro'
  - description: string
  - amount: number
  - date: Timestamp
  - createdAt: Timestamp
  - createdBy: string
```

## Arquitectura Angular

```
features/
  finances/
    finances.routes.ts
    finances-dashboard/
      finances-dashboard.component.ts   # Vista principal con filtros
    payment-list/
      payment-list.component.ts         # Tabla de pagos del mes
    expense-form/
      expense-form.component.ts         # Modal crear/editar gasto
    expense-list/
      expense-list.component.ts
  core/
    services/
      expense.service.ts
      finance.service.ts                # Cálculos de totales (signals computed)
```

## Rutas

```
/finances                    → FinancesDashboardComponent
/finances/expenses/new       → ExpenseFormComponent
/finances/expenses/:id/edit  → ExpenseFormComponent
```

## Criterios de Aceptación

1. Al seleccionar un mes, la tabla muestra únicamente los pagos con `date` dentro de ese rango.
2. El "Total Esperado" se calcula sumando `rentPrice` de todas las unidades con `status: 'ocupado'`.
3. El "Total Recaudado" coincide con la suma de `amount` de pagos del mes filtrado.
4. El balance neto (recaudado − gastos) muestra color verde si es positivo y rojo si es negativo.
5. Un gasto puede asociarse a una propiedad completa o a una unidad específica.
6. Los datos se actualizan reactivamente al registrar un nuevo pago o gasto sin recargar.

## Dependencias

Sin nuevas dependencias. Usa Firestore queries con `where` + `orderBy`.

## Bloquea
- v1.0.0 (BI y Reportes) extiende el modelo de gastos y pagos de esta versión.
