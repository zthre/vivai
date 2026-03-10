# SPEC: Eliminar concepto de Unidades — Inmueble sin sub-unidades

## Contexto

Actualmente un `Property` puede tener N `Unit`s. Se quiere eliminar el concepto de unidad por completo: **un inmueble ES la unidad arrendable directamente**. Todos los campos que hoy viven en `Unit` (inquilino, precio renta, fotos, contrato, estado, marketplace, etc.) pasan a vivir en `Property`.

---

## Fase 0 — Preparación

- [ ] Crear branch `feature/remove-units`
- [ ] Backup de Firestore (export) antes de migrar datos

---

## Fase 1 — Modelo: Absorber campos de Unit en Property

**Archivo**: `src/app/core/models/property.model.ts`

Agregar/confirmar estos campos en `Property` (muchos ya existen parcialmente):

```typescript
// Inquilino (ya existen algunos)
tenantName?: string | null;
tenantPhone?: string | null;
tenantEmail?: string | null;
tenantUid?: string | null;
tenantRentPrice?: number | null;

// Estado y marketplace (algunos ya existen)
status: 'ocupado' | 'disponible';
isForRent: boolean;
isForSale: boolean;
isListed: boolean;
rentPrice?: number | null;
salePrice?: number | null;
publicDescription?: string | null;
photos?: PhotoItem[];

// Contrato
contract?: ContractFile | null;

// Notificaciones
paymentDueDay?: number | null;
notificationsEnabled?: boolean;
```

**Archivo**: `src/app/core/models/unit.model.ts` → **ELIMINAR**

---

## Fase 2 — Modelos dependientes: Quitar `unitId`

| Modelo | Cambio |
|--------|--------|
| `payment.model.ts` | Eliminar `unitId`. Pagos se ligan solo por `propertyId`. |
| `expense.model.ts` | Eliminar `unitId`, `unitNumber`. Gastos solo por `propertyId`. |
| `ticket.model.ts` | Eliminar `unitId`, `unitNumber`. Tickets por `propertyId`. Mantener `tenantUid`, `tenantName`. |
| `notification.model.ts` | Eliminar `unitId`. Reemplazar `metadata.unitNumber` por `metadata.propertyName`. |
| `payment-link.model.ts` | Eliminar `unitId`, `unitNumber`. Llave: `propertyId` + `month`. |
| `user-profile.model.ts` | Eliminar `unitIds[]` y `unitId` (compat). Reemplazar por `propertyIds: string[]` (propiedades donde es inquilino). |
| `monthly-snapshot.model.ts` | Revisar si tiene refs a units; limpiar. |

---

## Fase 3 — Servicios

### 3.1 Eliminar completamente
- [ ] `src/app/core/services/unit.service.ts` → **ELIMINAR**

### 3.2 Editar servicios existentes

**`property.service.ts`**:
- Eliminar `incrementUnitCount()`.
- Absorber métodos de UnitService que apliquen: `setContract()`, `addPhoto()`, `removePhoto()` → ahora operan sobre `properties/{id}`.
- `getAll()` sigue igual (owned + collab).

**`payment.service.ts`**:
- `getByUnit(unitId)` → **ELIMINAR**.
- `getByProperty(propertyId)` ya existe, se convierte en el método principal.
- `create()`: quitar param `unitId`.

**`ticket.service.ts`**:
- `create()`: quitar `unitId`, `unitNumber`. Usar `propertyId` + `propertyName`.
- Queries: filtrar por `propertyId` en vez de `unitId`.

**`marketplace.service.ts`**:
- Eliminar `UnitListing` interface.
- `getListings()` → query `properties` con `where('isListed', '==', true)` en vez de `units`.
- `getUnitById()` → renombrar a `getPropertyById()` o eliminar.
- Helper functions `listingPrice()`, `listingStatus()` → adaptar a Property.

**`notification.service.ts`**:
- Queries ya usan `ownerId`; solo limpiar refs a `unitId` en tipos.

**`snapshot.service.ts`**:
- Revisar si referencia units; limpiar.

### 3.3 Auth Service

**`src/app/core/auth/auth.service.ts`**:
- `_tenantUnitIds` → renombrar a `_tenantPropertyIds`.
- `tenantUnitId` computed → `tenantPropertyId`.
- `handlePostLogin()`: buscar en `properties` por `tenantEmail` en vez de `units`.
- Actualizar `tenantUid` en `properties/{id}` en vez de `units/{id}`.
- `unitIds` signal → `propertyIds` signal.
- Actualizar `UserProfile` con `propertyIds[]` en vez de `unitIds[]`.

---

## Fase 4 — Componentes: Eliminar

Eliminar el directorio completo:

```
src/app/features/units/                          # directorio completo
  ├── unit-detail/
  │   ├── unit-detail.component.ts
  │   ├── unit-photo-gallery/
  │   │   └── unit-photo-gallery.component.ts
  │   └── contract-section/
  │       └── contract-section.component.ts
  └── unit-form/
      └── unit-form.component.ts
```

---

## Fase 5 — Componentes: Editar

### 5.1 `property-detail.component.ts`
- **Eliminar**: grid/listado de unidades, botón "Nueva unidad", links a unit-detail/unit-form.
- **Agregar/mover aquí**: info de inquilino (nombre, teléfono, email, botones WhatsApp/Llamar/Email), estado ocupado/disponible, sección de fotos (`PhotoGalleryComponent` directo), sección de contrato (`ContractSectionComponent` adaptado a property), configuración de notificaciones (día de pago, toggle).
- **Mantener**: datos del inmueble, finanzas, colaboradores, marketplace toggle.

### 5.2 `property-form.component.ts`
- **Agregar**: campos de inquilino, estado, precio renta/venta, día de pago, notificaciones — todo lo que estaba en unit-form.
- **Eliminar**: cualquier referencia a "unidades".

### 5.3 `dashboard.component.ts`
- **Reemplazar KPIs**: "Unidades ocupadas" → "Inmuebles ocupados", "Disponibles" → "Inmuebles disponibles".
- Queries: usar `propertyService` en vez de `unitService.getAllOccupied()`.

### 5.4 `payment-form.component.ts`
- **Eliminar**: campo/param `unitId` del dialog data.
- **Mantener**: `propertyId`, `rentPrice` (ahora viene de Property).

### 5.5 `payment-link-generator.component.ts`
- **Cambiar**: route param de `unitId` a `propertyId`.
- Cargar datos de `Property` en vez de `Unit`.
- Crear `PaymentLink` con `propertyId` sin `unitId`.

### 5.6 Tenant Portal

**`my-lease.component.ts`**:
- Cargar `Property` en vez de `Unit`.
- Contrato: `property.contract` en vez de `unit.contract`.
- Pagos: filtrar por `propertyId`.

**`ticket-form.component.ts`**:
- Crear ticket con `propertyId` + `propertyName` en vez de `unitId` + `unitNumber`.

**`payment-status.component.ts`**:
- Query payment links por `propertyId` en vez de `unitId`.

**`payment-history.component.ts`**:
- Query payments por `propertyId`.

### 5.7 Marketplace

**`listings.component.ts`**:
- Listar `Property` directamente en vez de `Unit`.

**`listing-detail.component.ts`**:
- Route: `/inmuebles/:propertyId` en vez de `/inmuebles/:unitId`.
- Mostrar datos de Property (fotos, descripción, precio).

**`listing-card.component.ts`**:
- Input: `Property` en vez de `UnitListing`.

### 5.8 Finances

**`finances-dashboard.component.ts`** — eliminar cualquier filtro por unidad.
**`expense-form.component.ts`** — eliminar campos `unitId`, `unitNumber`.
**`payment-list.component.ts`** — eliminar columna/referencia a unidad.

### 5.9 Notifications

**`notification-settings.component.ts`** — listar propiedades ocupadas en vez de unidades; toggle sobre Property.
**`notifications-list.component.ts`** — eliminar display de `unitNumber`.

### 5.10 Tickets

**`tickets-board.component.ts`** — mostrar `propertyName` en vez de `unitNumber`.
**`ticket-detail.component.ts`** — eliminar `unitNumber`, mostrar `propertyName`.

### 5.11 Reminders

**`reminders.component.ts`** — listar propiedades ocupadas en vez de unidades.

---

## Fase 6 — Rutas

**`src/app/app.routes.ts`**:

| Eliminar | Nota |
|----------|------|
| `/properties/:propertyId/units/new` | Ya no hay unidades |
| `/properties/:propertyId/units/:unitId/edit` | Ya no hay unidades |
| `/properties/:propertyId/units/:unitId` | Ya no hay unidades |
| `/properties/:id/units/:unitId/payment-link` | Mover a `/properties/:id/payment-link` |

| Cambiar | Nuevo |
|---------|-------|
| `/inmuebles/:unitId` (marketplace) | `/inmuebles/:propertyId` |

---

## Fase 7 — Firestore Rules

**`firestore.rules`**:

- [ ] **Eliminar** toda la sección `match /units/{unitId}`.
- [ ] Mover reglas de tenant a `properties`: tenant puede leer property donde `tenantUid == request.auth.uid`.
- [ ] `payments`: cambiar ref `get(.../units/...)` → `get(.../properties/...)`.
- [ ] `paymentLinks`: igual, cambiar ref de units a properties.
- [ ] `tickets`: cambiar validación de tenant access de unit a property.

---

## Fase 8 — Cloud Functions

### 8.1 `createPaymentLink.ts`
- Input: `propertyId` + `month` (sin `unitId`).
- Fetch `properties/{propertyId}` en vez de `units/{unitId}`.
- Leer `tenantRentPrice`, `tenantEmail`, `name` de property.

### 8.2 `scheduledPaymentReminder.ts`
- Query `properties` con `status == 'ocupado'` y `notificationsEnabled == true`.
- Leer `paymentDueDay`, `tenantEmail`, `tenantRentPrice` de property.

### 8.3 `stripeWebhook.ts`
- `PaymentLink` ya no tiene `unitId`; ajustar lectura.

### 8.4 `onTicketStatusChange.ts`
- Ticket ya no tiene `unitId`; leer `propertyId` para datos del owner.

### 8.5 `expirePaymentLinks.ts`
- Limpiar tipos si referencia `unitId`.

### 8.6 `generateMonthlySnapshot.ts`
- Contar propiedades en vez de unidades para ocupación.

### 8.7 `exportReport.ts`
- Reemplazar datos de unit por property en reportes.

---

## Fase 9 — Migración de datos en Firestore

Script o función manual:

1. **Properties**: Para cada `Unit`, copiar campos de inquilino/estado/precios/fotos/contrato al `Property` padre.
2. **Payments**: Verificar `propertyId` correcto; eliminar campo `unitId`.
3. **Expenses**: Eliminar `unitId`, `unitNumber`.
4. **Tickets**: Eliminar `unitId`, `unitNumber`; agregar `propertyName`.
5. **PaymentLinks**: Eliminar `unitId`, `unitNumber`.
6. **Notifications**: Eliminar `unitId`; actualizar `metadata`.
7. **UserProfiles**: Renombrar `unitIds` → `propertyIds`.
8. **Eliminar colección `units`** (después de verificar migración).

---

## Fase 10 — Limpieza final

- [ ] Eliminar imports muertos de `Unit`, `UnitService` en toda la app.
- [ ] Buscar strings "unidad", "unit" en templates y reemplazar por "inmueble"/"property".
- [ ] Verificar `ng build` compila sin errores.
- [ ] Verificar `ng serve` funciona.
- [ ] Actualizar `CLAUDE.md` (quitar refs a units).
- [ ] Actualizar `firestore.rules` en Firebase Console.
- [ ] Deploy Cloud Functions.

---

## Resumen de impacto

| Acción | Archivos |
|--------|----------|
| **Eliminar completos** | 5 archivos + directorio `features/units/` |
| **Editar modelos** | 7 |
| **Editar servicios** | 5 + auth.service |
| **Editar componentes** | ~18 |
| **Editar rutas** | 1 |
| **Editar infra** | `firestore.rules` + 6 Cloud Functions |
| **Total** | ~39 archivos |

## Orden de ejecución recomendado

1. Modelos (Fase 1-2)
2. Servicios (Fase 3)
3. Auth (Fase 3.3)
4. Componentes: eliminar (Fase 4)
5. Componentes: editar (Fase 5)
6. Rutas (Fase 6)
7. Build & fix errores
8. Firestore Rules (Fase 7)
9. Cloud Functions (Fase 8)
10. Migración datos (Fase 9)
11. Limpieza (Fase 10)
