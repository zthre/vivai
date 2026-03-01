# SPEC v0.7.0 — Multi-Administrador (RBAC)

## Objetivo
Permitir que el propietario delegue la gestión diaria a administradores secundarios. Un Admin puede registrar pagos y actualizar estados pero no puede borrar inmuebles ni ver reportes financieros completos. Primera versión con control de acceso basado en roles granular.

---

## Qué hereda de versiones anteriores

- `users/{userId}` con `role: 'owner' | 'tenant'` de v0.5.0 — se agrega el rol `'admin'`.
- `owner.guard.ts` y `tenant.guard.ts` de v0.5.0 — se reemplaza `owner.guard` por guards más granulares.
- `ShellComponent` — agregar ítem "Equipo" en Settings del sidenav (solo visible para `owner`).
- Todas las acciones destructivas (eliminar inmueble, unidad) ya tienen `ConfirmDialog` — se refuerzan con verificación de permisos.

---

## Funcionalidades

### 1. Invitación de administrador
- El owner va a `/settings/team` y hace clic en "Invitar Admin".
- Ingresa el email del admin y selecciona las propiedades a las que tendrá acceso.
- Se crea un documento en `invitations` y se muestra un **link de invitación** copiable.
  - El link tiene el formato: `/accept-invite?token={invitationId}`.
  - El owner comparte el link por cualquier medio (WhatsApp, email manual, etc.).
- El link expira en 7 días (`expiresAt`).

### 2. Flujo de aceptación
- El admin recibe el link y navega a `/accept-invite?token=...`.
- Si no tiene cuenta: se le presenta login con Google.
- Al autenticarse: el sistema verifica que `invitation.status === 'pending'` y `expiresAt > now()`.
- Si es válida: crea/actualiza `users/{uid}` con `role: 'admin'`, `ownerId` del owner y escribe `adminAccess`.
- Si expiró: muestra mensaje de error y el owner debe re-invitar.

### 3. Panel de equipo (`/settings/team`)
- Lista de admins activos con nombre, email y propiedades asignadas.
- Botón "Revocar acceso" elimina el documento `adminAccess` y cambia `users/{uid}.role` a `null`.
- Invitaciones pendientes con opción de copiar link o cancelar.

### 4. Restricciones de rol en la UI
El `RbacService` provee un método `hasPermission(permission: AdminPermission): boolean` basado en el `adminAccess` del usuario actual. Los componentes usan este servicio para mostrar/ocultar acciones:

| Acción | Owner | Admin (default) |
|---|---|---|
| Ver propiedades | ✓ | ✓ (solo las asignadas) |
| Crear/editar inmueble | ✓ | ✗ |
| Eliminar inmueble | ✓ | ✗ |
| Crear/editar unidad | ✓ | configurable |
| Eliminar unidad | ✓ | ✗ |
| Registrar pago | ✓ | ✓ (configurable) |
| Ver finanzas | ✓ | configurable |
| Invitar admins | ✓ | ✗ |

### 5. Firestore Security Rules con RBAC
Las reglas verifican los permisos del admin antes de permitir escritura en `payments`, `units`, etc.

---

## Modelo de Datos (Firestore)

```
users/{userId}
  + role: 'owner' | 'admin' | 'tenant'
  + ownerId: string | null       — para admins: uid del owner que los invitó

invitations/{invitationId}
  - email: string                — email del admin invitado
  - ownerId: string
  - propertyIds: string[]        — propiedades asignadas
  - status: 'pending' | 'accepted' | 'expired' | 'revoked'
  - createdAt: Timestamp
  - expiresAt: Timestamp         — createdAt + 7 días

adminAccess/{accessId}
  - adminUid: string
  - ownerId: string
  - propertyIds: string[]
  - permissions: AdminPermissions

AdminPermissions:
  - canRegisterPayments: boolean  — default true
  - canEditUnits: boolean         — default true
  - canDeleteUnits: boolean       — default false
  - canViewFinances: boolean      — default false
```

---

## Arquitectura Angular

```
src/app/
  core/
    auth/
      rbac.service.ts             # hasPermission(), currentAdminAccess signal, filterPropertiesByAccess()
      owner-only.guard.ts         # Solo role === 'owner' (reemplaza owner.guard genérico)

  features/
    settings/
      settings.routes.ts
      team/
        team.component.ts              # Lista admins activos + invitaciones pendientes
        invite-form/
          invite-form.component.ts     # Modal: email + selección de propiedades + permisos
        accept-invite/
          accept-invite.component.ts   # Ruta pública: valida token + completa registro del admin
```

---

## Estado con Angular Signals

`RbacService`:
```typescript
currentAccess = toSignal(
  adminAccessQuery$(currentUser.uid),
  { initialValue: null }
)

hasPermission(p: keyof AdminPermissions): boolean {
  const role = this.authService.currentUser()?.role
  if (role === 'owner') return true
  return this.currentAccess()?.permissions[p] ?? false
}

// Filtrado de propiedades visibles para el admin
visiblePropertyIds = computed(() => {
  const role = this.authService.currentUser()?.role
  if (role === 'owner') return null // null = todas
  return this.currentAccess()?.propertyIds ?? []
})
```

Los componentes que listan propiedades filtran con `visiblePropertyIds`:
```typescript
filteredProperties = computed(() => {
  const ids = this.rbac.visiblePropertyIds()
  return ids === null ? this.allProperties() : this.allProperties().filter(p => ids.includes(p.id))
})
```

---

## UX y Diseño

**Panel de equipo (`/settings/team`):**
```
┌──────────────────────────────────────────────────────────┐
│  Equipo                              [Invitar Admin]      │
├──────────────────────────────────────────────────────────┤
│  Admins activos (2)                                      │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Maria García    maria@email.com                 │    │
│  │  Acceso: Edif. Robles, Torre Norte               │    │
│  │  Puede: pagos, editar unidades                   │    │
│  │  [Editar permisos]  [Revocar]                    │    │
│  └──────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────┤
│  Invitaciones pendientes (1)                             │
│  carlos@email.com — expira 5 mar 2026                    │
│  [Copiar link]  [Cancelar]                               │
└──────────────────────────────────────────────────────────┘
```

**Modal "Invitar Admin":**
```
  Email del administrador
  [maria@empresa.com                    ]

  Propiedades con acceso
  [x] Edificio Los Robles
  [x] Torre Norte
  [ ] Casa Bello Horizonte

  Permisos
  [x] Registrar pagos
  [x] Editar unidades
  [ ] Eliminar unidades
  [ ] Ver finanzas

  [Cancelar]  [Generar link de invitación]
```

---

## Rutas

```
/settings/team                → TeamComponent (canActivate: [ownerOnlyGuard])
/accept-invite                → AcceptInviteComponent (pública, sin guard)
```

---

## Criterios de Aceptación

1. Solo un `owner` puede acceder a `/settings/team`; los roles `admin` y `tenant` son redirigidos.
2. Un admin solo ve en su listado las propiedades incluidas en `adminAccess.propertyIds`.
3. Los botones de eliminar inmuebles/unidades no se renderizan para admins con `canDeleteUnits: false`.
4. Las Firestore Security Rules bloquean la escritura en `payments` si el admin no tiene `canRegisterPayments: true` en su `adminAccess`.
5. Un link de invitación navegado después de `expiresAt` muestra "Invitación expirada. Solicita una nueva al propietario."
6. Al aceptar una invitación, el documento de invitación pasa a `status: 'accepted'` y no puede reutilizarse.
7. Revocar acceso elimina el documento `adminAccess` y el admin pierde acceso en el próximo refresh (el guard re-evalúa el `RbacService`).
8. El `RbacService.hasPermission()` siempre retorna `true` para el rol `owner`, sin consultar `adminAccess`.
9. El panel de equipo está vacío con empty state "No tienes administradores aún" si no hay admins activos.

---

## Dependencias

Sin nuevas dependencias npm. Lógica de invitación vía Firestore + link personalizado.

---

## Bloquea

- **v0.8.0** requiere los roles aquí definidos para determinar a quién notificar (owner vs admin).
