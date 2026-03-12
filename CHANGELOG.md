# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

---

## [v1.1.1] — Gestión de Inquilinos

### Nuevo
- **Sección de inquilino en detalle de propiedad**: card dedicada para ver, agregar y quitar inquilinos directamente desde `/properties/:id`.
- `PropertyService.assignTenant()`: asigna inquilino a una propiedad. Si el email coincide con un usuario existente, lo vincula automáticamente (setea `tenantUid`, agrega `propertyId` y rol `tenant`).
- `PropertyService.removeTenant()`: remueve inquilino de la propiedad y limpia el documento del usuario — quita `propertyId` de `propertyIds` y elimina el rol `tenant` si no tiene más propiedades.
- Badge "Vinculado" en la card de inquilino cuando el tenant tiene cuenta activa.
- Formulario inline para agregar inquilino (nombre, celular, email, renta, personas) con feedback de vinculación.

### Fix
- **Inquilino no desaparecía al quitar email**: Al desmarcar "Ocupado" en el formulario, `tenantUid` no se limpiaba y el documento del usuario inquilino no se actualizaba — seguía con rol `tenant` y acceso a la propiedad. Ahora el formulario llama `removeTenant()` que limpia ambos lados.
- Confirmación antes de quitar inquilino con mensaje claro sobre remoción de permisos.

---

## [v1.1.0] — Modulo de Servicios

### Nuevo
- Modulo de Servicios (`/services`): crear, editar y gestionar servicios (agua, luz, gas, etc.).
- Asignacion de servicios a multiples propiedades con distribucion por cantidad de personas, partes iguales o manual.
- Generacion de recibos mensuales por propiedad con calculo automatico.
- Recibos editables: ajustar monto, marcar como pagado, agregar notas.
- Campo `residentCount` en Property para registrar cantidad de personas.
- Permiso `servicios` en ColaboradorPermission para control de acceso.
- Navegacion "Servicios" en sidebar para owner y colaborador.
- Reglas Firestore para `services`, `serviceAssignments`, `serviceReceipts`.

### Archivos nuevos
- Modelos: `service.model.ts`, `service-assignment.model.ts`, `service-receipt.model.ts`
- Servicios: `utility-service.service.ts`, `service-assignment.service.ts`, `service-receipt.service.ts`
- Componentes: `service-list`, `service-form`, `service-detail`, `service-receipts`
- Rutas: `services.routes.ts`

---

## [v1.0.3] — Permisos Granulares por Propiedad

### Nuevo
- **Toggle de acceso por propiedad**: En la pagina de Colaboradores, cada propiedad del owner aparece como chip toggleable (on/off) para cada colaborador.
- **Agregar/quitar todas**: Botones "Agregar todas" y "Quitar todas" para asignar o revocar acceso masivo a todas las propiedades.
- `PropertyService.addColaboradorToProperty()` — agrega un colaborador existente a una propiedad especifica con permisos por defecto.
- `PropertyService.removeColaboradorFromProperty()` — quita el acceso de un colaborador a una propiedad especifica.

### Cambios
- Las propiedades nuevas ya no heredan colaboradores automaticamente — el owner decide manualmente a quien dar acceso.

---

## [v1.0.2] — Mejoras Colaborador + Marketplace Landing

### Nuevo
- **Marketplace como landing**: La raiz (`/`) carga el marketplace publico directamente (`pathMatch: 'full'`). Detalle de inmueble movido a `/inmueble/:id`.
- **Tags en info basica**: Los tags se movieron de la seccion Marketplace a la seccion de propiedad. Siempre visibles al crear/editar, independiente de si se publica en marketplace.
- **Tags en cards**: Los tags aparecen como pills en las cards del listado de propiedades.
- **Tickets para colaboradores**: Nuevo metodo `getByPropertyIds$()` en `TicketService` que consulta tickets por propertyIds con batching de 30 para el limite de Firestore `in`.

### Fix
- **Tickets no cargaban para colaboradores**: La query solo buscaba por `ownerId == uid`, lo cual excluia colaboradores. Ahora usa `getByPropertyIds$` con las propiedades accesibles.
- **Filtro de tickets por propiedad**: El dropdown no filtraba porque `selectedPropertyId` era una variable plana. Convertido a signal reactivo.
- **Carga de tickets al refrescar**: Corregido race condition donde `uid` y `activeRole` eran `null` al inicializar. Se agregaron `filter()` en los observables para esperar valores reales.
- **Badge de tickets pendientes en sidebar**: Ahora funciona correctamente para colaboradores consultando por propertyIds.

### Cambios
- Eliminada seccion "Contrato de arriendo" del portal del tenant.
- AuthGuard redirige a `/` (marketplace) cuando el usuario no esta autenticado.

---

## [v1.0.1] — Marketplace como Página Principal

### Cambios
- La ruta raíz `/` ahora carga el marketplace de inmuebles (antes redirigía a `/dashboard`).
- El botón "Iniciar sesión" en el marketplace abre el popup de Google directamente (ya no navega a `/login`).
- Cuando el usuario está autenticado, el header del marketplace muestra su foto de perfil y un enlace "Ir al dashboard".
- El auth guard redirige a `/` (marketplace) en lugar de `/login` cuando no hay sesión.
- Logout navega a `/` en lugar de `/login`.
- Shell: versión actualizada a v1.0.1.

---

## [v1.0.0] — Inteligencia de Negocio y Reportes

### Nuevo
- Dashboard de Analytics (`/analytics`): 4 KPI cards anuales, gráfica de ocupación mensual (barras CSS), gráfica de ingresos vs gastos (SVG líneas), tabla de rentabilidad por inmueble con ROI%, calculadora de retorno de inversión (ROI).
- Filtros de Analytics: por año y por propiedad; botón "Regenerar" snapshots manualmente.
- Exportación de reportes (`/analytics/reports`): CSV client-side (sin dependencias) + Excel `.xlsx` via Cloud Function. Filtros por rango de meses y propiedad.
- `purchasePrice` y `purchaseDate` en modelo `Property`; sección "Inversión" en `PropertyFormComponent` para habilitar cálculo de ROI.
- `MonthlySnapshot` model + `SnapshotService` que consulta colección `monthlySnapshots`.
- Shell: enlace "Analytics" en navegación del owner.
- Cloud Functions: `generateMonthlySnapshot` (cron primer día de cada mes), `generateMonthlySnapshotManual` (callable para regeneración manual), `exportReport` (callable, devuelve URL firmada de Storage).
- `provideFunctions` añadido a `app.config.ts`.

---

## [v0.9.0] — Automatización de Pagos (Gateway)

### Nuevo
- `Payment.source?: 'manual' | 'gateway'`, `gatewayTransactionId`, `paymentLinkId` en modelo.
- `PaymentLink` model para colección `paymentLinks` (status: active/paid/expired, Stripe session ID, URL).
- `/properties/:id/units/:unitId/payment-link` → `PaymentLinkGeneratorComponent`: owner genera link de Stripe, copia y comparte.
- `/tenant/pay` → `PaymentStatusComponent`: inquilino ve link activo del mes y paga con tarjeta.
- `/tenant/pay/success` → `PaymentSuccessComponent`: polling en tiempo real hasta confirmar webhook.
- Tenant nav: enlace "Pagar arriendo".
- Cloud Functions: `createPaymentLink` (callable, crea Checkout Session en Stripe), `stripeWebhook` (HTTP, valida firma, escribe payment + envía recibo), `expirePaymentLinks` (cron diario).
- Requiere: cuenta Stripe, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`.

---

## [v0.8.0] — Notificaciones Automáticas

### Nuevo
- `Unit.paymentDueDay?: number | null` y `notificationsEnabled?: boolean` — configuración por unidad.
- `UnitFormComponent`: sección "Notificaciones automáticas" con día de vencimiento y toggle.
- `AppNotification` model + `NotificationService` (read, getRecent, getUnreadCount, markAllRead).
- Shell header: campana con badge de no leídas en tiempo real, dropdown con últimas 5 notificaciones, link a historial completo.
- `/notifications` → `NotificationsListComponent`: historial con filtros por propiedad y mes, marcar todo como leído.
- `/settings/notifications` → `NotificationSettingsComponent`: toggles por unidad para activar/desactivar recordatorios.
- Shell nav owner: enlace "Notificaciones".
- Cloud Functions: `scheduledPaymentReminder` (cron diario 9 AM, detecta vencimientos y mora), `onTicketStatusChange` (trigger Firestore, notifica inquilino al cambiar estado de ticket).
- Email transaccional via Firebase Extension "Trigger Email" + SMTP (SendGrid/Gmail).

---

## [v0.8.0-collab] — Permisos Globales de Colaborador

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
