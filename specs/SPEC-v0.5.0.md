# SPEC v0.5.0 — Portal del Inquilino

## Objetivo
Dar transparencia al inquilino: puede autenticarse y ver su situación de arriendo, el historial de pagos registrados por el admin y descargar su contrato. Reduce las consultas directas al propietario y es la base del rol diferenciado dentro de la app.

---

## Qué hereda de versiones anteriores

- `units` con `tenantEmail`, `rentPrice`, `status`, `contract` (v0.1.0 y v0.3.0).
- `payments` con `unitId`, `amount`, `date` de v0.1.0.
- Firebase Auth ya configurado — se extiende para manejar roles.
- `authGuard` de v0.1.0 — se crea `tenantGuard` y `ownerGuard` como variantes.
- Lógica de "pago del mes" de v0.2.0 (comparar `rentPrice` vs suma de pagos del mes).

---

## Funcionalidades

### 1. Login del inquilino
- Usa el mismo flujo de Firebase Auth (Google o email/password, el que esté habilitado).
- Al autenticarse por primera vez, el `AuthService` busca una `unit` con `tenantEmail === currentUser.email`.
  - Si la encuentra: actualiza `units/{unitId}.tenantUid = currentUser.uid` y redirige a `/tenant`.
  - Si no la encuentra: muestra mensaje "Tu correo no está registrado como inquilino. Contacta a tu arrendador."
- En logins posteriores: si `users/{uid}.role === 'tenant'`, redirige automáticamente a `/tenant`.

### 2. Vista "Mi Arriendo" (`/tenant`)
Información de la unidad asignada al inquilino:
- Nombre del inmueble, dirección, número de unidad.
- Precio mensual de renta.
- Estado del pago del mes actual:
  - `totalPaid = sum(payments where unitId == myUnit && date in currentMonth)`
  - Si `totalPaid >= rentPrice` → "Al día" (chip verde).
  - Si `totalPaid > 0 && totalPaid < rentPrice` → "Pago parcial: $X de $Y" (chip amarillo).
  - Si `totalPaid === 0` → "Pendiente: $rentPrice" (chip rojo).

### 3. Historial de pagos (`/tenant/payments`)
- Tabla con columnas: Fecha · Monto · Nota.
- Ordenada por fecha descendente.
- Solo los pagos de su `unitId`.
- Sin paginación en v0.5.0 — muestra todos.

### 4. Descarga de contrato
- En la vista "Mi Arriendo", si `units/{unitId}.contract` existe: botón "Ver contrato" que abre en nueva pestaña.
- Si no hay contrato: texto "Sin contrato disponible".

### 5. Guards de rol
```typescript
// tenant.guard.ts — permite acceso solo si role === 'tenant'
// owner.guard.ts  — permite acceso solo si role === 'owner' | 'admin'
```
`authGuard` de v0.1.0 se convierte en el guard base; los nuevos guards extienden la lógica de rol.

---

## Modelo de Datos (Firestore)

```
users/{userId}
  + role: 'owner' | 'tenant'        — campo de rol (default 'owner' al crear con Google)
  + unitId: string | null           — para tenants: ref a su unidad asignada

units/{unitId}
  + tenantUid: string | null        — uid de Firebase Auth del inquilino
```

**Cómo se asigna `tenantUid`:** el `AuthService` ejecuta client-side al hacer login:
```typescript
// En AuthService.handlePostLogin()
const unitSnap = await getDocs(
  query(collection(db, 'units'), where('tenantEmail', '==', user.email), limit(1))
)
if (!unitSnap.empty) {
  const unitId = unitSnap.docs[0].id
  await updateDoc(doc(db, 'units', unitId), { tenantUid: user.uid })
  await setDoc(doc(db, 'users', user.uid), { role: 'tenant', unitId }, { merge: true })
}
```

**Firestore Security Rules (actualización):**
```
match /payments/{paymentId} {
  allow read: if request.auth.uid == resource.data.ownerId
              || request.auth.uid == get(/databases/$(database)/documents/units/$(resource.data.unitId)).data.tenantUid;
}
match /units/{unitId} {
  allow read: if request.auth.uid == resource.data.ownerId
              || request.auth.uid == resource.data.tenantUid;
}
```

---

## Arquitectura Angular

```
src/app/
  core/
    auth/
      auth.service.ts          # Extender handlePostLogin para asignar rol y tenantUid
      auth.guard.ts            # Guard base (ya existe)
      tenant.guard.ts          # Nuevo: redirige a /tenant si role !== 'tenant'
      owner.guard.ts           # Nuevo: redirige a /dashboard si role !== 'owner'

  features/
    tenant-portal/
      tenant-portal.routes.ts
      my-lease/
        my-lease.component.ts           # Vista principal: datos unidad + estado pago
        payment-status-badge/
          payment-status-badge.component.ts  # Chip con estado del mes (al día / parcial / pendiente)
      payment-history/
        payment-history.component.ts    # Tabla de pagos de la unidad
```

---

## UX y Diseño

**Vista "Mi Arriendo" (mobile-first, 375px):**
```
┌──────────────────────────────────────────┐
│  Hola, Juan Pérez                        │
│  Tu arriendo                             │
├──────────────────────────────────────────┤
│  Edificio Los Robles                     │
│  Calle 72 #45-30, Barranquilla           │
│  Unidad: 302                             │
├──────────────────────────────────────────┤
│  Pago de Febrero 2026                    │
│  ┌──────────────────────────────────┐    │
│  │  Pendiente: $1.200.000  [rojo]   │    │
│  └──────────────────────────────────┘    │
│  Precio mensual: $1.200.000              │
├──────────────────────────────────────────┤
│  Contrato de arriendo                    │
│  [Ver contrato ↗]                        │
├──────────────────────────────────────────┤
│  [Ver historial de pagos →]              │
└──────────────────────────────────────────┘
```

**Historial de pagos:**
```
┌──────────────────────────────────────────────────┐
│  ← Volver    Historial de pagos                  │
├───────────────┬──────────────┬───────────────────┤
│  Fecha        │  Monto       │  Nota             │
├───────────────┼──────────────┼───────────────────┤
│  15 feb 2026  │  $1.200.000  │  Pago febrero     │
│  12 ene 2026  │  $1.200.000  │  —                │
└───────────────┴──────────────┴───────────────────┘
```

**Navegación del inquilino:** sidebar simplificado con solo "Mi Arriendo" y "Pagos". Sin acceso a propiedades, unidades ni finanzas.

---

## Rutas

```
/tenant               → MyLeaseComponent (canActivate: [tenantGuard])
/tenant/payments      → PaymentHistoryComponent (canActivate: [tenantGuard])
```

`AuthService` actualiza el flujo post-login:
- Si `role === 'tenant'` → redirigir a `/tenant`.
- Si `role === 'owner'` → redirigir a `/dashboard` (comportamiento actual).

---

## Criterios de Aceptación

1. Un email registrado como `tenantEmail` en una unidad puede autenticarse y ver `/tenant`.
2. Al primer login, `tenantUid` se escribe en la unidad y `role: 'tenant'` se escribe en `users/{uid}`.
3. El chip de estado del pago refleja el mes actual comparando pagos registrados vs `rentPrice`.
4. Un usuario con `role: 'owner'` que intente acceder a `/tenant` es redirigido a `/dashboard`.
5. El inquilino solo ve pagos de su propia unidad; no puede acceder a `/properties` ni `/finances`.
6. El botón "Ver contrato" aparece solo si `units/{unitId}.contract` no es null.
7. Si el email del inquilino no está asignado a ninguna unidad, se muestra mensaje de error y no se crea el usuario como tenant.
8. Las Firestore Security Rules impiden que el inquilino lea pagos de unidades que no son la suya.
9. La vista es completamente funcional en mobile (375px): el tenant típicamente accede desde su teléfono.
10. Al cerrar sesión, el inquilino es redirigido a `/login`.

---

## Dependencias

Sin nuevas dependencias. Extiende Firebase Auth ya configurado.

---

## Bloquea

- **v0.6.0** (Tickets) requiere el portal del inquilino para el formulario de solicitud de mantenimiento.
- **v0.8.0** (Notificaciones) necesita `tenantUid` para enviar emails de recordatorio de pago.
