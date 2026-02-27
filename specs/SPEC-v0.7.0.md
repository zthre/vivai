# SPEC v0.7.0 — Multi-Administrador (RBAC)

## Objetivo
Permitir que el propietario delegue la gestión diaria a administradores secundarios. Un Admin puede registrar pagos y actualizar estados pero no puede borrar inmuebles ni ver reportes financieros completos.

## Funcionalidades

- **Invitación de Admin**: El Owner envía una invitación por email. El Admin acepta y su cuenta queda vinculada a las propiedades asignadas.
- **Roles**: `owner` (acceso total), `admin` (acceso restringido por propiedad).
- **Permisos por propiedad**: El Owner asigna qué propiedades puede gestionar cada Admin.
- **Firestore Security Rules**: Reglas que refuerzan RBAC a nivel de base de datos.

## Modelo de Datos (Firestore)

```
users/{userId}
  + role: 'owner' | 'admin' | 'tenant'
  + ownerId: string | null          — para admins: uid del owner que los invitó

invitations/{invitationId}
  - email: string
  - ownerId: string
  - propertyIds: string[]           — propiedades asignadas
  - status: 'pending' | 'accepted' | 'expired'
  - createdAt: Timestamp
  - expiresAt: Timestamp

adminAccess/{accessId}
  - adminUid: string
  - ownerId: string
  - propertyIds: string[]           — propiedades a las que tiene acceso
  - permissions: AdminPermissions

AdminPermissions:
  - canRegisterPayments: boolean
  - canEditUnits: boolean
  - canDeleteUnits: boolean         — false por defecto para admins
  - canViewFinances: boolean
```

## Arquitectura Angular

```
features/
  settings/
    team/
      team.component.ts             # Lista de admins + botón invitar
      invite-form/
        invite-form.component.ts
core/
  auth/
    rbac.service.ts                 # Verifica permisos antes de mostrar acciones
  guards/
    owner-only.guard.ts             # Solo role: owner
```

## Rutas

```
/settings/team               → TeamComponent (role: owner)
/settings/team/invite        → InviteFormComponent (role: owner)
```

## Criterios de Aceptación

1. Solo un `owner` puede invitar admins; el botón no existe para rol `admin`.
2. Un admin solo ve las propiedades listadas en su `adminAccess.propertyIds`.
3. Un admin no puede eliminar inmuebles ni unidades (botón oculto + Firestore Rule).
4. Las Security Rules validan que `request.auth.uid` esté en `adminAccess` con `canRegisterPayments: true` antes de permitir escritura en `payments`.
5. Una invitación expira a los 7 días; el link de aceptación devuelve error si `expiresAt < now()`.

## Dependencias

Sin nuevas dependencias. Lógica de invitación vía Firebase Auth + Firestore.

## Bloquea
- v0.8.0 requiere roles para determinar a quién notificar.
