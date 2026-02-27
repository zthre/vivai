# SPEC v0.5.0 — Portal del Inquilino

## Objetivo
Dar transparencia al inquilino: puede autenticarse y ver su situación de arriendo, historial de pagos registrados por el admin y descargar su contrato. Reduce las consultas directas al propietario.

## Funcionalidades

- **Registro/Login de Inquilino**: Firebase Auth habilitado para el email del inquilino.
- **Vista "Mi Arriendo"**: El inquilino ve la unidad asociada a su email, saldo pendiente del mes actual y el historial de pagos.
- **Descarga de Contrato**: Si la unidad tiene contrato PDF (v0.3.0), aparece el botón de descarga.
- **Rol diferenciado**: El inquilino SOLO ve su propia información. No puede ver otros inmuebles ni unidades.

## Modelo de Datos (Firestore)

```
users/{userId}
  + role: 'owner' | 'tenant'       — campo de rol
  + unitId: string | null          — referencia a la unidad asignada (solo para tenants)

units/{unitId}
  + tenantUid: string | null       — uid de Firebase Auth del inquilino (además del email)
```

El campo `tenantUid` se actualiza cuando el inquilino completa el registro por primera vez.

## Arquitectura Angular

```
features/
  tenant-portal/
    tenant-portal.routes.ts
    my-lease/
      my-lease.component.ts         # Vista principal del inquilino
      payment-history/
        payment-history.component.ts
      balance-summary/
        balance-summary.component.ts
core/
  auth/
    auth.service.ts                  # Extender para manejar roles
    tenant.guard.ts                  # Guard: solo role === 'tenant'
    owner.guard.ts                   # Guard: solo role === 'owner'
```

## Rutas

```
/tenant                      → MyLeaseComponent (solo role: tenant)
/tenant/payments             → PaymentHistoryComponent
```

## Criterios de Aceptación

1. Al hacer login con un email registrado como inquilino, se redirige a `/tenant` (no a `/dashboard`).
2. El inquilino solo ve pagos donde `unitId` coincide con su unidad asignada.
3. Si el admin no ha registrado ningún pago ese mes, se muestra el monto pendiente (`rentPrice`) como deuda.
4. Un usuario con `role: 'owner'` que intente acceder a `/tenant` es redirigido a `/dashboard`.
5. Las Firestore Security Rules permiten que un tenant lea solo `payments` y `units` donde `tenantUid == request.auth.uid`.
6. El botón de descarga del contrato solo aparece si `units/{unitId}.contract` existe.

## Dependencias

Sin nuevas dependencias. Extiende Firebase Auth ya configurado.

## Bloquea
- v0.6.0 (Tickets) requiere el portal del inquilino para el formulario de soporte.
- v0.8.0 (Notificaciones) necesita el `tenantUid` para enviar emails.
