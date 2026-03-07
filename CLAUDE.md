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
- `userRole` / `tenantUnitId` — backwards-compat aliases

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
| `users` | `roles[]`, `unitIds[]`, `collaboratingPropertyIds[]` |
| `properties` | `ownerId`, `collaboratorUids[]`, `pendingCollaboratorEmails[]`, `collaboratorPermissions: {uid: ColaboradorPermission}`, `purchasePrice?`, `purchaseDate?` |
| `units` | `ownerId`, `propertyId`, `status: 'ocupado'\|'disponible'`, `isForRent`, `isForSale`, `isListed`, `tenantUid?`, `paymentDueDay?`, `notificationsEnabled?` |
| `payments` | `ownerId`, `unitId`, `propertyId`, `date: Timestamp`, `source?: 'manual'\|'gateway'` |
| `expenses` | `ownerId`, `propertyId`, `date: Timestamp`, `category: 'reparacion'\|'impuesto'\|'servicio'\|'otro'` |
| `tickets` | `ownerId`, `tenantUid`, `propertyId`, `unitId`, `status` |
| `notifications` | `ownerId`, `type: 'payment_reminder'\|'payment_overdue'\|'ticket_update'`, `viewedByOwner` |
| `paymentLinks` | `unitId`, `month: 'YYYY-MM'`, `status: 'active'\|'paid'\|'expired'`, `externalId` (Stripe session) |
| `monthlySnapshots` | `ownerId`, `propertyId`, `month: 'YYYY-MM'`, aggregated financials |
| `mail` | Written by Cloud Functions; consumed by Firebase "Trigger Email" extension |

Firestore rules are in `firestore.rules` — **must be manually pasted in Firebase Console** (no CLI deployment configured). Marketplace items are publicly readable when `isPublic == true` on property.

### Colaborador Permission System

`ColaboradorPermission` (on `property.collaboratorPermissions[uid]`):
```typescript
{ inmueblesUnidades?, inmueblesPagos?, inmueblesMedia?, gastos?, tickets? }
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
    models/         property, unit, payment, expense, ticket, user-profile,
                    notification, payment-link, monthly-snapshot
    services/       property, unit, payment, expense, ticket, storage,
                    marketplace, notification, snapshot
  features/
    auth/login/
    dashboard/
    properties/     properties-list, property-detail, property-form
    units/          unit-detail, unit-form
    payments/       payment-form, payment-link-generator
    finances/       finances-dashboard (+ sub-components: month-selector, kpi-card, payment-list, expense-list, expense-form)
    analytics/      analytics-dashboard, reports
    tickets/        tickets-board (kanban CDK), ticket-detail
    tenant-portal/  my-lease, payment-history, my-tickets, ticket-form, payment-status, payment-success
    notifications/  notifications-list, notification-settings
    colaboradores/  colaboradores-page (global collaborator management)
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

Deploy: `cd functions && npm install && cd .. && firebase deploy --only functions`

Required env vars for functions: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL` (Stripe); Firebase "Trigger Email" extension must be installed for email delivery.

### Key Patterns & Gotchas

- **`effect()` with signal writes** requires `{ allowSignalWrites: true }` option.
- **Template literals** in inline TypeScript templates: use `&#36;{{ }}` instead of `${{ }}` to avoid interpolation conflicts.
- **Marketplace Firestore query** uses `where('isListed', '==', true)` — old units need re-save to appear.
- **`PropertyService.getAll()`** does `combineLatest` of owned + collaborated properties, deduplicating by id.
- **`rolesGuard`** reads Firestore directly (not just the AuthService signal) to avoid race conditions on first load.
- **Compound Firestore queries** with `ownerId + array-contains` require a composite index — avoid them in global collaborator methods; use single-field `ownerId` filter instead.
- **`canWrite` input pattern** on child components (`photo-gallery`, `unit-photo-gallery`, `contract-section`, `expense-list`): `canWrite = input<boolean>(true)` to propagate permission down.
