# SPEC v0.8.0 — Notificaciones y Triggers

## Objetivo
Reducir la mora automatizando recordatorios de pago. El sistema detecta unidades con pago pendiente próximo y envía alertas por email al inquilino y al administrador sin intervención manual.

## Funcionalidades

- **Detección de pagos próximos**: Cloud Function (Scheduled) que corre diario y busca unidades con pago vencido en los próximos 5 días.
- **Alerta al inquilino**: Email automático recordando el monto y fecha de vencimiento.
- **Alerta al admin**: Email o notificación in-app con lista de unidades en mora o próximas a vencer.
- **Historial de notificaciones**: Log de notificaciones enviadas por unidad.
- **Preferencias**: El owner puede activar/desactivar notificaciones por propiedad.

## Modelo de Datos (Firestore)

```
units/{unitId}
  + paymentDueDay: number           — día del mes en que vence el pago (ej: 5)
  + notificationsEnabled: boolean

notifications/{notificationId}
  - unitId: string
  - tenantUid: string
  - ownerId: string
  - type: 'payment_reminder' | 'overdue' | 'ticket_update'
  - channel: 'email' | 'in_app'
  - status: 'sent' | 'failed'
  - sentAt: Timestamp
  - metadata: object               — datos adicionales (monto, días restantes, etc.)
```

## Arquitectura Angular

```
features/
  notifications/
    notifications-list/
      notifications-list.component.ts   # Vista admin: historial de alerts enviadas
    notification-settings/
      notification-settings.component.ts # Toggle por propiedad
```

Cloud Functions (Firebase):
```
functions/
  src/
    scheduledPaymentReminder.ts   # Cron diario: detecta vencimientos y dispara emails
    onTicketStatusChange.ts       # Trigger: email al inquilino cuando cambia estado del ticket
```

## Rutas

```
/settings/notifications      → NotificationSettingsComponent (role: owner)
/notifications               → NotificationsListComponent (role: owner/admin)
```

## Criterios de Aceptación

1. La Cloud Function corre cada día a las 9:00 AM (hora local del servidor).
2. Si una unidad tiene `paymentDueDay` en 5 días o menos y no hay pago registrado ese mes, se envía email al `tenantEmail`.
3. El email contiene el monto (`rentPrice`), la fecha exacta de vencimiento y el nombre del inmueble.
4. Si `notificationsEnabled: false` en la unidad, no se envía ninguna alerta.
5. Cada notificación enviada queda registrada en la colección `notifications` con `status: 'sent'` o `'failed'`.
6. El admin puede ver el historial de notificaciones filtrado por propiedad.

## Dependencias

```json
{
  "firebase-functions": "^4.x",
  "firebase-admin": "^12.x"
}
```
Firebase service: **Cloud Functions**, **Firebase Extensions (Trigger Email)** o **SendGrid**.

## Bloquea
- v0.9.0 extiende el sistema de notificaciones para confirmar pagos automáticos.
