# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server
npx ng serve                      # localhost:4200

# Build
npx ng build                      # production
npx ng build --configuration development

# Commit (pre-commit hook requires this prefix)
PRE_COMMIT_ALLOW_NO_CONFIG=1 git commit -m "..."
```

No unit tests are configured (Karma is present but unused). There is no linter configured.

## Stack

- **Angular 17** — standalone components only, no NgModules. All state via Signals + `toSignal`/`toObservable`.
- **Firebase**: `@angular/fire@17` + `firebase@10` (must stay on v10, not v12+)
  - Auth: Google Sign-In via `signInWithPopup` (not redirect — redirect fails on dev without `/__/firebase/init.json`)
  - Firestore, Storage, Functions all provided in `src/app/app.config.ts`
- **Tailwind CSS v3** (not v4) + **Angular Material v17** + `@angular/cdk@17`
- Single environment file: `src/environments/environment.ts` (no prod variant). Firebase project: `vivai-now`.

## Tailwind Custom Colors

`tailwind.config.js` defines two custom palettes used everywhere:
- `primary` — orange (`primary-500` = `#f97316`)
- `warm` — stone (`warm-900` = dark sidebar, `warm-50` = page background)

Material theme (in `src/styles.scss`) uses orange primary + brown accent.

## Architecture

### Auth & Roles

`AuthService` (`src/app/core/auth/auth.service.ts`) is the central auth source of truth:
- `currentUser` — Firebase `User` signal
- `userRoles: Signal<UserRole[]>` — array, supports multi-role
- `activeRole: Signal<UserRole | null>` — the currently selected role, persisted to `localStorage('vivai_active_role')`
- `setActiveRole(role)` — switches active role
- `userRole` / `tenantPropertyId` — backwards-compat aliases

Roles: `'owner' | 'tenant' | 'colaborador'`. Old documents may have singular `role` field — auth service migrates on login.

Guards in `src/app/core/auth/`:
- `authGuard` — any authenticated user
- `ownerGuard` — `rolesGuard(['owner', 'colaborador'])` alias
- `tenantGuard` — `rolesGuard(['tenant'])` alias
- `rolesGuard(allowedRoles[])` — factory, reads Firestore `users/{uid}` for authoritative role check

### Firestore Data Model

All docs owned by a user have `ownerId = uid`. Key collections:

| Collection | Key fields |
|---|---|
| `users` | `roles[]`, `propertyIds[]`, `collaboratingPropertyIds[]` |
| `properties` | `ownerId`, `collaboratorUids[]`, `pendingCollaboratorEmails[]`, `collaboratorPermissions: {uid: ColaboradorPermission}`, `status: 'ocupado'\|'disponible'`, `isForRent`, `isForSale`, `isListed`, `isPublic`, `publishedAt?`, `listingExpiresAt?`, `listingExpiredAt?`, `tenantUid?`, `paymentFree?`, `paymentDueDay?`, `notificationsEnabled?`, `purchasePrice?`, `purchaseDate?` |
| `payments` | `ownerId`, `propertyId`, `date: Timestamp`, `source?: 'manual'\|'gateway'` |
| `expenses` | `ownerId`, `propertyId`, `date: Timestamp`, `category: 'reparacion'\|'impuesto'\|'servicio'\|'otro'` |
| `tickets` | `ownerId`, `tenantUid`, `propertyId`, `status` |
| `notifications` | `ownerId`, `type: 'payment_reminder'\|'payment_overdue'\|'ticket_update'`, `viewedByOwner` |
| `paymentLinks` | `propertyId`, `month: 'YYYY-MM'`, `status: 'active'\|'paid'\|'expired'`, `externalId` (Stripe session) |
| `serviceAssignments` | `ownerId`, `serviceId`, `serviceName`, `code?`, `description?`, `propertyIds[]`, `distributionMethod` |
| `serviceReceipts` | `ownerId`, `serviceId`, `assignmentId?` (null en manuales), `assignmentCode?`, `propertyId`, `propertyName?`, `month: 'YYYY-MM'`, `origin: 'manual'\|'distribucion'`, `totalAmount`, `propertyAmount`, `isPaid`, `paidAt?`, `expenseId?` |
| `monthlySnapshots` | `ownerId`, `propertyId`, `month: 'YYYY-MM'`, aggregated financials |
| `mail` | Written by Cloud Functions; consumed by Firebase "Trigger Email" extension |

Firestore rules are in `firestore.rules` y **se despliegan solas**: `.github/workflows/firebase-hosting-merge.yml` corre `firebase deploy --only firestore:rules` en cada push a `main`, antes del hosting. No hay que pegarlas a mano en la consola, y lo pegado a mano se sobrescribe en el siguiente merge a `main`. Fuera de ese flujo: `npx firebase-tools@13 deploy --only firestore:rules --project vivai-now`.

Marketplace items are publicly readable when `isPublic == true` on property.

**Gotcha de reglas**: `get()` sobre un path con ID vacío (p. ej. `properties/$(resource.data.get('campoInexistente',''))`) es un path inválido y hace fallar la evaluación, lo que **deniega** — y un `allow` posterior más permisivo no lo rescata. En consultas de listado basta un documento que caiga en esa rama para tumbar el listado entero con `Missing or insufficient permissions`. Evita `get()` en reglas de **lectura** de colecciones que se consultan en lote (hay un tope de accesos a documentos por consulta); úsalo en create/update/delete, que son por documento.

### Colaborador Permission System

`ColaboradorPermission` (on `property.collaboratorPermissions[uid]`):
```typescript
{ inmueblesPagos?, inmueblesMedia?, gastos?, tickets? }
```
`undefined` field = `true` (backwards compat). Check pattern: `!perms || perms.field !== false`.

Colaboradores are added globally (all owner's properties at once) via `PropertyService.addGlobalColaborador()`. Per-property methods also exist for legacy use.

### Reactive Data Pattern

Standard pattern for month/filter-reactive Firestore queries:
```typescript
selectedMonth = signal<Date>(startOfMonth(new Date()));
private month$ = toObservable(this.selectedMonth);
data = toSignal(
  this.month$.pipe(switchMap(m => this.service.getByMonth(start(m), end(m)))),
  { initialValue: [] }
);
filteredData = computed(() => pid ? data().filter(d => d.propertyId === pid) : data());
```

### Feature Structure

```
src/app/
  core/
    auth/           auth.service.ts, auth.guard.ts, owner.guard.ts, tenant.guard.ts, roles.guard.ts
    models/         property, payment, expense, ticket, user-profile,
                    notification, payment-link, monthly-snapshot
    services/       property, payment, expense, ticket, storage,
                    marketplace, notification, snapshot
  features/
    auth/login/
    dashboard/
    properties/     properties-list, property-detail, property-form
    payments/       payment-form, payment-link-generator
    finances/       finances-dashboard (+ sub-components: month-selector, kpi-card, payment-list, expense-list, expense-form)
    analytics/      analytics-dashboard, reports
    tickets/        tickets-board (kanban CDK), ticket-detail
    tenant-portal/  my-lease, payment-history, my-tickets, ticket-form, payment-status, payment-success
    notifications/  notifications-list, notification-settings
    colaboradores/  colaboradores-page (global collaborator management)
    services/       service-list, service-detail (tabs: recibos del mes / distribución),
                    service-form, service-receipts, month-settlement (diálogo arriendo+servicios),
                    register-service (diálogo de registro manual)
    marketplace/    listings, listing-detail, listing-card (public, no auth)
  layout/shell/     ShellComponent — sidebar nav, role selector, notification bell
  shared/           confirm-dialog
```

### Shell & Navigation

`ShellComponent` owns the sidebar. `navItems` is a `computed()` that returns different arrays based on `activeRole()`:
- `owner` → Dashboard, Inmuebles, Finanzas, Analytics, Colaboradores, Notificaciones, Marketplace, Tickets
- `colaborador` → same minus Colaboradores and Notificaciones
- `tenant` → Mi Arriendo, Mis Pagos, Pagar arriendo, Soporte

Role selector dropdown appears in sidebar when `effectiveRoles().length > 1`.

### Cloud Functions

Located in `functions/` (TypeScript, Firebase Functions v2):
- `scheduledPaymentReminder` — cron daily, sends payment reminders/overdue alerts via `mail` collection
- `onTicketStatusChange` — Firestore trigger, notifies tenant on ticket status change
- `createPaymentLink` — callable, creates Stripe Checkout Session
- `stripeWebhook` — HTTP, validates Stripe signature, writes payment on `checkout.session.completed`
- `expirePaymentLinks` — cron daily, marks stale links as `expired`
- `generateMonthlySnapshot` — cron 1st of month + `generateMonthlySnapshotManual` callable
- `exportReport` — callable, generates CSV/XLSX and returns signed Storage URL
- `expireListings` — cron diario 3:00 (America/Bogota), apaga `isPublic`/`isListed` de las publicaciones vencidas + `expireListingsManual` callable

Deploy: `cd functions && npm install && cd .. && firebase deploy --only functions`

Required env vars for functions: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL` (Stripe); Firebase "Trigger Email" extension must be installed for email delivery.

### Key Patterns & Gotchas

- **`effect()` with signal writes** requires `{ allowSignalWrites: true }` option.
- **Template literals** in inline TypeScript templates: use `&#36;{{ }}` instead of `${{ }}` to avoid interpolation conflicts.
- **Marketplace Firestore query** uses `where('isListed', '==', true)` — old properties need re-save to appear.
- **`PropertyService.getAll()`** does `combineLatest` of owned + collaborated properties, deduplicating by id.
- **`rolesGuard`** reads Firestore directly (not just the AuthService signal) to avoid race conditions on first load.
- **Compound Firestore queries** with `ownerId + array-contains` require a composite index — avoid them in global collaborator methods; use single-field `ownerId` filter instead.
- **`canWrite` input pattern** on child components (`photo-gallery`, `contract-section`, `expense-list`): `canWrite = input<boolean>(true)` to propagate permission down.
- **`paymentFree` flag on Property**: when `true`, hides all payment CTAs ("Registrar", "Pagar") in dashboard, properties-list and property-detail, and counts the property as "al día" in the paid-this-month stat. Check `!prop.paymentFree` before showing any payment action.
- **Service multi-code pattern**: a single `Service` can have multiple `ServiceAssignment` docs, each with its own `code`, `description`, `propertyIds[]` and `distributionMethod`. Receipts are generated per assignment (not per service). `ServiceReceipt` stores `assignmentCode` denormalized for display. Use `getByAssignmentAndMonth(assignmentId, month)` to query per-code receipts. Desde v1.3.0 la distribución es el **modo avanzado** (pestaña «Códigos de distribución» en `service-detail`); el camino principal es el registro manual.
- **Recibos manuales (v1.3.0)**: `ServiceReceiptService.createManual()` crea un `ServiceReceipt` con `origin: 'manual'` y `assignmentId: null`, sin necesidad de códigos. `deleteByMonth(assignmentId, …)` filtra por `assignmentId`, así que regenerar una distribución **nunca** borra los manuales.
- **Recibo pagado ⇒ gasto**: `setPaid(receipt, true)` crea un `Expense` de `category: 'servicio'` y guarda su id en `receipt.expenseId`; desmarcarlo lo elimina. La fecha del gasto es hoy si el recibo es del mes en curso, o el último día del mes del recibo en caso contrario. Nunca duplica: si `expenseId` ya existe, no crea otro.
- **Atribución al dueño**: `PaymentService.create`, `ExpenseService.create` y los recibos de servicio resuelven `ownerId` desde `properties/{id}.ownerId`, no desde el uid de quien ejecuta la acción — si no, lo creado por un colaborador quedaría invisible para el dueño.
- **Liquidación mensual**: `MonthSettlementDialogComponent` (`features/services/month-settlement/`) reúne arriendo + servicios de una propiedad en un mes. Se abre desde dashboard, `properties-list` y `property-detail`. «Pagar todo» registra el pago de arriendo y marca todos los recibos pendientes.
- **Vigencia de publicaciones (30 días)**: `listing.util.ts` define `LISTING_DURATION_DAYS`, `isListingActive()` y `listingState()`. Una publicación sin `listingExpiresAt` se considera **vencida** (regla aplicada a las publicaciones anteriores a v1.3.0). Al publicar se sella `publishedAt` + `listingExpiresAt`; editar una publicación viva no extiende la vigencia — hay que usar `PropertyService.republishListing()`. El marketplace filtra en memoria (evita índice compuesto) y la Cloud Function `expireListings` (cron diario 3:00 America/Bogota) apaga `isPublic`, lo que además corta la lectura pública en las reglas.
- **Analytics Top 5**: `profitabilityRows` is capped at 5, sorted by balance desc.
