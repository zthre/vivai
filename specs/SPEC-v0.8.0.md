# SPEC v0.8.0 — Notificaciones y Triggers

## Objetivo
Reducir la mora automatizando recordatorios de pago. El sistema detecta unidades con pago vencido o próximo a vencer y envía alertas por email al inquilino y al administrador sin intervención manual. Primera versión con Cloud Functions y lógica backend.

---

## Qué hereda de versiones anteriores

- `units` con `tenantEmail`, `tenantUid`, `rentPrice`, `status` de v0.1.0 y v0.5.0. **Esta versión agrega `paymentDueDay` y `notificationsEnabled`**.
- `payments` de v0.1.0 — la Cloud Function verifica si existe pago del mes antes de enviar alerta.
- `tickets` de v0.6.0 — trigger en cambio de estado para notificar al inquilino.
- `users/{userId}` con roles de v0.5.0 y v0.7.0 — determina a quién enviar notificaciones.
- `UnitFormComponent` — agregar campos `paymentDueDay` y `notificationsEnabled`.

---

## Funcionalidades

### 1. Campos de configuración en unidad
- `paymentDueDay: number` — día del mes en que vence el pago (ej: `5` = el día 5 de cada mes).
- `notificationsEnabled: boolean` — toggle para activar/desactivar alertas de esta unidad.
- Ambos campos se agregan al `UnitFormComponent`.

### 2. Recordatorio automático de pago (Cloud Function Scheduled)
- `scheduledPaymentReminder` — corre **diariamente a las 9:00 AM UTC-5** (America/Bogota).
- Lógica:
  1. Obtiene todas las unidades con `status: 'ocupado'` y `notificationsEnabled: true`.
  2. Para cada unidad, calcula si `paymentDueDay` cae en los próximos **5 días**.
  3. Verifica si ya existe un pago registrado en `payments` para esa unidad en el mes actual.
  4. Si **no hay pago**: crea un documento en `notifications` y envía email al `tenantEmail`.
  5. Si `paymentDueDay` ya pasó y no hay pago: envía alerta de **mora** al owner/admin también.

### 3. Notificación de cambio de estado de ticket (Cloud Function Trigger)
- `onTicketStatusChange` — trigger `onDocumentUpdated` en `tickets/{ticketId}`.
- Cuando `status` cambia, envía email al inquilino (`tenantEmail` de la unidad) informando el nuevo estado.

### 4. Email transaccional
- Proveedor: **Firebase Extension "Trigger Email"** con configuración SMTP (SendGrid free tier o Gmail SMTP).
- Los emails se despachan escribiendo un documento en la colección `mail` (patrón estándar de la extensión).
- Templates de email (texto plano + HTML básico):
  - `payment_reminder`: "Recordatorio: tu pago de $X vence el día {paymentDueDay}."
  - `payment_overdue`: "Tu pago de {mes} está vencido. Monto: $X."
  - `ticket_update`: "Tu solicitud '{título}' cambió a estado: {estado}."

### 5. Historial de notificaciones (admin)
- Vista `/notifications` con tabla: tipo, unidad, inquilino, fecha, estado (enviado/fallido).
- Filtro por propiedad y por mes.

### 6. Preferencias de notificación (owner)
- En `/settings/notifications`: toggle global + toggle por propiedad.
- Los toggles actualizan `notificationsEnabled` en las unidades correspondientes.

### 7. Badge in-app de notificaciones
- Campana en el header del admin con conteo de notificaciones no vistas de las últimas 24h.
- Al hacer clic, despliega panel con las últimas 5 notificaciones.

---

## Modelo de Datos (Firestore)

```
units/{unitId}
  + paymentDueDay: number           — 1-28 (evitar 29-31 por meses cortos)
  + notificationsEnabled: boolean   — default true si tenantEmail está asignado

notifications/{notificationId}
  - unitId: string
  - propertyId: string              — desnormalizado
  - tenantEmail: string             — destinatario
  - ownerId: string
  - type: 'payment_reminder' | 'payment_overdue' | 'ticket_update'
  - channel: 'email'
  - status: 'sent' | 'failed'
  - sentAt: Timestamp
  - viewedByOwner: boolean          — para el badge in-app
  - metadata: {
      amount?: number,
      daysUntilDue?: number,
      ticketTitle?: string,
      ticketStatus?: string
    }

mail/{mailId}                       — colección usada por Firebase Trigger Email Extension
  - to: string[]
  - message: { subject, html, text }
  - createdAt: Timestamp
```

**Index compuesto:**
```
notifications: ownerId (==) + sentAt (desc)
notifications: ownerId (==) + viewedByOwner (==) + sentAt (desc)
```

---

## Arquitectura Angular

```
src/app/
  features/
    notifications/
      notifications-list/
        notifications-list.component.ts   # Tabla admin con filtros
      notification-settings/
        notification-settings.component.ts # Toggles por propiedad

  layout/
    shell/
      notification-bell/
        notification-bell.component.ts    # Campana + panel desplegable

  units/
    unit-form/
      unit-form.component.ts              # Agregar campos paymentDueDay + notificationsEnabled
```

Cloud Functions (nuevo directorio en la raíz del proyecto):
```
functions/
  src/
    scheduledPaymentReminder.ts    # Cron: verifica vencimientos y escribe en 'mail'
    onTicketStatusChange.ts        # onDocumentUpdated trigger en tickets
  package.json
  tsconfig.json
```

---

## Estado con Angular Signals

`NotificationBellComponent`:
```typescript
unreadCount = toSignal(
  notificationService.getUnreadCount$(currentUser.uid),  // query viewedByOwner == false, últimas 24h
  { initialValue: 0 }
)

recentNotifications = toSignal(
  notificationService.getRecent$(currentUser.uid, 5),
  { initialValue: [] }
)
```

---

## UX y Diseño

**Campana en el header (admin):**
```
  [🔔 3]   ← badge rojo si unreadCount > 0
```
Al hacer clic, despliega panel:
```
┌──────────────────────────────────────────────┐
│  Notificaciones recientes                    │
├──────────────────────────────────────────────┤
│  🔴  Pago vencido — Unidad 101               │
│      Edificio Robles · hace 2 horas          │
├──────────────────────────────────────────────┤
│  🟡  Recordatorio enviado — Unidad 204       │
│      Torre Norte · hace 1 día               │
├──────────────────────────────────────────────┤
│  [Ver todas las notificaciones →]            │
└──────────────────────────────────────────────┘
```

**Settings de notificaciones:**
```
┌──────────────────────────────────────────────┐
│  Notificaciones de pago                      │
│                                              │
│  Edificio Los Robles                         │
│  Recordatorios activos  [toggle ON ]         │
│                                              │
│  Torre Norte                                 │
│  Recordatorios activos  [toggle OFF]         │
└──────────────────────────────────────────────┘
```

---

## Rutas

```
/settings/notifications    → NotificationSettingsComponent (canActivate: [ownerOnlyGuard])
/notifications             → NotificationsListComponent (canActivate: [authGuard])
```

---

## Variables de entorno (Cloud Functions)

```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS={sendgrid_api_key}
SMTP_FROM=noreply@vivai.app
```
Configuradas en Firebase Functions environment config: `firebase functions:config:set`.

---

## Criterios de Aceptación

1. La Cloud Function `scheduledPaymentReminder` corre diariamente y solo procesa unidades con `notificationsEnabled: true`.
2. Si una unidad tiene `paymentDueDay = 5` y hoy es día 1 del mes, y no hay pago registrado, se envía el recordatorio y se crea el documento en `notifications`.
3. Si ya existe un pago del mes en `payments` para esa unidad, **no se envía** ninguna alerta.
4. El email de recordatorio contiene: monto (`rentPrice`), fecha exacta de vencimiento y nombre del inmueble.
5. Si `notificationsEnabled: false` en la unidad, no se envía ninguna alerta (verificado en la Cloud Function).
6. `onTicketStatusChange` envía email al inquilino cuando el admin cambia el estado del ticket.
7. Cada notificación enviada queda registrada en `notifications` con `status: 'sent'` o `'failed'`.
8. El badge de la campana muestra el conteo de notificaciones con `viewedByOwner: false` en tiempo real.
9. Al abrir el panel de notificaciones, los documentos vistos se marcan `viewedByOwner: true` (batch update).
10. El admin puede ver el historial completo de notificaciones con filtro por propiedad y mes.

---

## Dependencias

```json
// functions/package.json
{
  "firebase-functions": "^4.x",
  "firebase-admin": "^12.x"
}
```
Firebase services: **Cloud Functions**, **Firebase Extension "Trigger Email"**.
Sin nuevas dependencias en el proyecto Angular.

---

## Bloquea

- **v0.9.0** extiende el sistema de notificaciones para enviar confirmación automática de pago cuando el gateway procesa una transacción.
