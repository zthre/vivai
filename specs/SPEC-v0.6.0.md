# SPEC v0.6.0 — Mantenimiento y Tickets

## Objetivo
Centralizar las solicitudes de reparación y quejas. El inquilino crea tickets desde su portal y el admin gestiona el estado desde su dashboard, eliminando el caos de WhatsApp para reportes de mantenimiento.

## Funcionalidades

- **Creación de ticket por inquilino**: Formulario con título, descripción y categoría.
- **Adjuntar foto al ticket**: Opcional, máximo 3 fotos del problema.
- **Tablero de tickets para el admin**: Vista Kanban o tabla con columnas Pendiente → En Proceso → Resuelto.
- **Cambio de estado**: El admin arrastra o cambia el estado del ticket.
- **Notificación in-app**: Badge en el nav del admin cuando hay tickets nuevos.

## Modelo de Datos (Firestore)

```
tickets/{ticketId}
  - unitId: string
  - propertyId: string — desnormalizado
  - ownerId: string
  - tenantUid: string
  - title: string
  - description: string
  - category: 'plomeria' | 'electricidad' | 'estructura' | 'otro'
  - status: 'pendiente' | 'en_proceso' | 'resuelto'
  - photos: string[]             — URLs de Storage (máx 3)
  - createdAt: Timestamp
  - updatedAt: Timestamp
  - resolvedAt: Timestamp | null
```

## Arquitectura Angular

```
features/
  tickets/
    tickets.routes.ts
    ticket-form/
      ticket-form.component.ts      # Formulario inquilino (portal)
    tickets-board/
      tickets-board.component.ts    # Tablero admin con filtros por propiedad
      ticket-card/
        ticket-card.component.ts    # Card individual con selector de estado
core/
  services/
    ticket.service.ts
```

## Rutas

```
/tenant/tickets/new          → TicketFormComponent (role: tenant)
/tickets                     → TicketsBoardComponent (role: owner)
/tickets/:id                 → TicketDetailComponent
```

## Criterios de Aceptación

1. Un inquilino solo puede crear tickets asociados a su propia unidad.
2. El admin ve todos los tickets de todas sus propiedades con filtro por propiedad y estado.
3. Al cambiar el estado a "Resuelto", se registra `resolvedAt` con el timestamp actual.
4. El badge de notificación en el nav muestra el conteo de tickets con `status: 'pendiente'`.
5. El inquilino puede ver el estado actual de sus tickets pero no puede cambiarlo.
6. Las fotos del ticket se almacenan en `owners/{ownerId}/tickets/{ticketId}/`.

## Dependencias

Sin nuevas dependencias de npm.

## Bloquea
- v0.8.0 puede extender tickets para enviar emails al inquilino cuando cambia el estado.
