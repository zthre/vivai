# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

---

## [v0.8.0] — Permisos Globales de Colaborador

### Nuevo
- Página `/colaboradores` (`ColaboradoresPageComponent`) para gestión centralizada de colaboradores — solo accesible para owners.
- `PropertyService`: métodos globales `addGlobalColaborador`, `removeGlobalColaborador`, `removePendingGlobalColaborador`, `updateGlobalCollaboradorPermissions` que aplican cambios a **todos** los inmuebles del owner simultáneamente.
- Shell: enlace "Colaboradores" en el nav del owner; `colaboradorNavItems` sin ese enlace para colaboradores.

### Cambios
- `PermisoColaboradorDialogComponent`: `PermisoDialogData` simplificado — solo recibe `collaborator` (sin `propertyId`/`propertyName`); guarda permisos vía `updateGlobalCollaboradorPermissions`.
- `ColaboradoresComponent` desmontado del template de `property-detail` (archivo conservado).
- `canWriteFinances`: colaborador tiene acceso si al menos **una** propiedad del owner no tiene `gastos: false`.

### Fix
- Permisos de colaborador ahora son consistentes en finanzas y tickets al aplicarse a todas las propiedades del owner a la vez.
- Queries globales usan un solo filtro `ownerId` — evita requerir índice compuesto en Firestore para `ownerId + array-contains`.

---

## [v0.7.0] — Multi-Rol + Colaborador

### Nuevo
- `UserProfile.roles: UserRole[]` — array de roles (reemplaza campo `role` singular).
- `UserProfile.collaboratingPropertyIds: string[]` — propiedades a las que el colaborador tiene acceso.
- `Property.collaboratorUids?: string[]` + `pendingCollaboratorEmails?: string[]`.
- `AuthService`: signals `userRoles` (array) y `activeRole` (rol seleccionado); `setActiveRole()` persiste en `localStorage`.
- Migración automática: campos `role`/`unitId` legacy se convierten a `roles[]`/`unitIds[]` en el primer login.
- `roles.guard.ts`: guard factory `rolesGuard(allowedRoles[])` — reemplaza los guards anteriores de owner/tenant.
- `PropertyService.getAll()`: combina query de propiedades propias + propiedades colaboradas con `combineLatest`.
- `ColaboradoresComponent` en `property-detail`: el owner puede invitar/remover colaboradores y abrir `PermisoColaboradorDialogComponent` (MatDialog) para gestionar permisos por sección.
- Permisos granulares por colaborador: `ColaboradorPermission { inmueblesUnidades?, inmueblesPagos?, inmueblesMedia?, gastos?, tickets? }` — `undefined` equivale a `true` (retrocompatibilidad).
- Signals de permisos en contexto: `canWriteUnidades`, `canWritePagos`, `canWriteMedia`, `canWriteFinances`, `canWriteTickets`.
- `canWrite = input<boolean>(true)` en componentes hijos: `photo-gallery`, `unit-photo-gallery`, `contract-section`, `expense-list`.
- Ruta `/properties/new` restringida a `rolesGuard(['owner'])` — colaboradores no pueden crear inmuebles.
- Shell: botón `cycleRole` para cambiar de rol activo cuando el usuario tiene más de uno; navegación adaptada por rol.

---

## [v0.6.0] — Portal del Inquilino + Sistema de Tickets

### Nuevo
- **Portal del inquilino** (`/tenant`): secciones `my-lease`, `payment-history`, `my-tickets`, `ticket-form`.
- **Sistema de tickets de mantenimiento**: `ticket.model.ts`, `TicketService` (`src/app/core/services/ticket.service.ts`).
- **Tablero kanban** de tickets para el owner (`/tickets`) usando `@angular/cdk/drag-drop`.
- `ticket-detail`: vista de detalle y actualización de estado de un ticket.
- `AuthService`: detección de rol al login — busca `tenantEmail` en units para asignar `role='tenant'`; signals `userRole` y `tenantUnitId`.
- `user-profile.model.ts` con campo `tenantUid` en `Unit`.
- Guards: `tenant.guard.ts` (redirige a `/dashboard` si no es tenant), `owner.guard.ts` (redirige a `/tenant` si es tenant).
- Shell: navegación diferenciada por rol; badge con contador de tickets pendientes para el owner.
- Reglas Firestore: tenant lee su propia unit y pagos; crea y lee sus tickets; owner puede actualizar cualquier ticket.

---

## [v0.5.2] — Multi-Estado de Unidades + Fotos en Unidades

### Nuevo
- Refactor de estado de unidad: `status: 'disponible' | 'ocupado'` + flags independientes `isForRent: boolean`, `isForSale: boolean`, `isListed: boolean` (computed).
- Unidades pueden estar ocupadas y en venta simultáneamente.
- `UnitPhotoGalleryComponent` en `unit-detail` para gestionar fotos de unidades (Firebase Storage).
- Badges duales en marketplace (renta / venta) según flags de la unidad.

### Cambios
- Marketplace query: `where('isListed', '==', true)` — unidades antiguas requieren re-guardado para aparecer.

---

## [v0.5.1] — Propiedad en Renta Directa sin Unidades

### Nuevo
- Campos `isForRent: boolean` y `rentPrice: number` directamente en el modelo `Property`.
- `property-form`: checkboxes independientes para renta y venta a nivel de propiedad.
- Marketplace y `property-listing-detail` actualizados para mostrar propiedades en renta directa.

---

## [v0.5.0] — Portal del Inquilino (base) + Contacto por WhatsApp

### Nuevo
- `tenantPhone` (celular) como campo principal de contacto del inquilino — aparece antes que el email.
- Botones de acción rápida en `unit-detail`: WhatsApp, Llamar, Email.
- Email del inquilino marcado como "(opcional)" en el formulario.

---

## [v0.4.0] — Marketplace Público

### Nuevo
- Ruta pública `/inmuebles` (`ListingsComponent`) y `/inmuebles/:unitId` (`ListingDetailComponent`) — sin `authGuard`.
- `MarketplaceService` (`src/app/core/services/marketplace.service.ts`) — agnóstico de auth, join propiedades + unidades.
- `ListingCardComponent` reutilizable.
- Campos nuevos en `Property`: `isPublic: boolean`, `whatsappPhone: string | null`.
- Campos nuevos en `Unit`: `publicDescription: string | null`.
- Reglas Firestore: lectura pública cuando `isPublic == true`.
- Versión visible en el sidebar del shell.

---

## [v0.3.0] — Gestión Documental

### Nuevo
- Subida y visualización de contratos en Firebase Storage.
- Galería de fotos en `property-detail` (`photo-gallery` component).

---

## [v0.2.0] — Dashboard de Finanzas

### Nuevo
- Ruta `/finances` con `FinancesDashboardComponent`.
- Selector de mes con sincronización por `queryParams`.
- 4 tarjetas KPI: ingresos, gastos, balance, ocupación.
- Lista de pagos con join de propiedades (client-side).
- CRUD de gastos con modal: `expense.model.ts`, `ExpenseService`.
- Patrón reactivo mes-señal: `selectedMonth` signal → `toObservable` → `switchMap` query Firestore.

---

## [v0.1.0] — Base

### Nuevo
- Autenticación con Google (`signInWithPopup`).
- CRUD de propiedades (`/properties`).
- CRUD de unidades por propiedad (`/properties/:id`).
- Registro de pagos por unidad.
- Dashboard resumen (`/dashboard`).
- Shell con sidebar, `authGuard`, navegación base.
