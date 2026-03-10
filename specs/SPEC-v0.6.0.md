# SPEC v0.6.0 — Mantenimiento y Tickets

## Objetivo
Centralizar las solicitudes de reparación y quejas eliminando el caos de WhatsApp. El inquilino crea tickets desde su portal y el admin gestiona el ciclo de vida desde un tablero Kanban, con fotos adjuntas y notificación in-app de nuevos tickets.

---

## Qué hereda de versiones anteriores

- `TenantPortalComponent` (v0.5.0) — se agrega la opción "Reportar problema" en la navegación del inquilino.
- `StorageService` (v0.3.0) — reutilizado para subir fotos de tickets (mismo patrón de upload con progreso).
- `ConfirmDialogComponent` (v0.1.0) — reutilizado para confirmar cierre de tickets.
- `ShellComponent` — agregar badge de contador en el ítem "Tickets" del sidenav del admin.

---

## Funcionalidades

### 1. Formulario de ticket (inquilino)
- Ruta `/tenant/tickets/new` — solo accesible con `tenantGuard`.
- Campos: título (requerido, máx 100 chars), descripción (requerido, máx 500 chars), categoría (select), fotos (opcional, máx 3).
- Fotos: reutiliza `photo-upload.component.ts` de v0.3.0, máx 2 MB por foto.
- Al enviar: el ticket aparece en "Mis tickets" del inquilino con estado "Pendiente".

### 2. Mis tickets (inquilino)
- Ruta `/tenant/tickets` — lista de tickets del inquilino, ordenada por fecha descendente.
- Cada fila muestra: título, categoría, fecha, estado (chip con color).
- El inquilino puede ver los detalles de un ticket pero no puede cambiar su estado.

### 3. Tablero Kanban (admin) — `/tickets`
- Tres columnas: **Pendiente** | **En Proceso** | **Resuelto**.
- Cada columna lista las ticket-cards de esa fase.
- **Drag & Drop** con `@angular/cdk/drag-drop` (`CdkDragDrop`): arrastrar una card entre columnas actualiza `status` en Firestore.
- Filtro por propiedad: dropdown en la toolbar del tablero.
- Contador de tickets en la columna "Pendiente" visible como badge en el sidenav.

### 4. Card de ticket (admin)
Muestra: título, unidad/inmueble, nombre del inquilino, categoría (chip), fecha de creación.
- Botón "Ver detalles" navega al detalle del ticket.
- En la columna "Resuelto": chip verde + fecha de resolución.

### 5. Detalle de ticket (admin y inquilino)
- Descripción completa del problema.
- Galería de fotos adjuntas (read-only para ambos).
- Historial de cambios de estado (log simple de timestamps).
- Admin: selector de estado + botón "Guardar".

### 6. Badge de notificación in-app
- El ítem "Tickets" en el sidenav del admin muestra un badge numérico con el conteo de tickets `status: 'pendiente'`.
- Implementado con `toSignal()` sobre una query Firestore en tiempo real.

---

## Modelo de Datos (Firestore)

```
tickets/{ticketId}
  - unitId: string
  - unitNumber: string          — desnormalizado para display
  - propertyId: string          — desnormalizado
  - propertyName: string        — desnormalizado
  - ownerId: string
  - tenantUid: string
  - tenantName: string | null   — desnormalizado de units.tenantName
  - title: string
  - description: string
  - category: 'plomeria' | 'electricidad' | 'estructura' | 'otro'
  - status: 'pendiente' | 'en_proceso' | 'resuelto'
  - photos: string[]            — URLs de Storage (máx 3)
  - statusHistory: StatusChange[]  — array de cambios de estado
  - createdAt: Timestamp
  - updatedAt: Timestamp
  - resolvedAt: Timestamp | null

StatusChange:
  - status: string
  - changedAt: Timestamp
  - changedBy: string           — uid del admin
```

**Storage paths:**
```
owners/{ownerId}/tickets/{ticketId}/photos/{timestamp}_{filename}
```

**Index compuesto necesario:**
```
tickets: ownerId (==) + status (==) + createdAt (desc)
tickets: tenantUid (==) + createdAt (desc)
```

---

## Arquitectura Angular

```
src/app/
  core/
    services/
      ticket.service.ts         # CRUD + queries Firestore

  features/
    tickets/
      tickets.routes.ts
      ticket-form/
        ticket-form.component.ts        # Formulario inquilino
      my-tickets/
        my-tickets.component.ts         # Lista tickets del inquilino
      tickets-board/
        tickets-board.component.ts      # Kanban admin + filtros
        ticket-card/
          ticket-card.component.ts      # Card draggable
      ticket-detail/
        ticket-detail.component.ts      # Vista detalle (admin + inquilino)

    layout/
      shell/
        shell.component.ts              # Agregar badge a nav item "Tickets"
```

**Dependencia CDK:**
```typescript
import { DragDropModule } from '@angular/cdk/drag-drop'
// CdkDragDrop, moveItemInArray, transferArrayItem
```

---

## Estado con Angular Signals

`TicketsBoardComponent`:
```typescript
allTickets     = toSignal(ticketService.getTickets$(ownerId, selectedPropertyId), { initialValue: [] })
selectedProp   = signal<string | null>(null)

pending        = computed(() => allTickets().filter(t => t.status === 'pendiente'))
inProgress     = computed(() => allTickets().filter(t => t.status === 'en_proceso'))
resolved       = computed(() => allTickets().filter(t => t.status === 'resuelto'))
```

`ShellComponent` (badge):
```typescript
pendingCount = toSignal(
  ticketService.getPendingCount$(currentUser.uid),
  { initialValue: 0 }
)
```

---

## UX y Diseño

**Tablero Kanban (desktop):**
```
┌──────────────────────────────────────────────────────────────────┐
│  Tickets de Mantenimiento         [Todas las propiedades ▾]      │
├──────────────────┬───────────────────┬───────────────────────────┤
│  Pendiente (3)   │  En Proceso (1)   │  Resuelto (5)             │
├──────────────────┼───────────────────┼───────────────────────────┤
│  ┌────────────┐  │  ┌────────────┐   │  ┌────────────┐           │
│  │ Fuga agua  │  │  │ Puerta rota│   │  │ Luz apagada│           │
│  │ Unid 101   │  │  │ Unid 204   │   │  │ Unid 302   │           │
│  │ Plomería   │  │  │ Estructura │   │  │ ✓ 10 feb   │           │
│  │ [Ver →]    │  │  │ [Ver →]    │   │  │ [Ver →]    │           │
│  └────────────┘  │  └────────────┘   │  └────────────┘           │
│  (arrastrable)   │  (arrastrable)    │                           │
└──────────────────┴───────────────────┴───────────────────────────┘
```

**Chips de categoría:**
- `plomeria` → chip azul
- `electricidad` → chip amarillo
- `estructura` → chip naranja
- `otro` → chip gris

**Chips de estado:**
- `pendiente` → chip rojo
- `en_proceso` → chip ámbar
- `resuelto` → chip verde

**Badge en sidenav:**
```
  [ ] Tickets   [3]   ← badge rojo con conteo
```

**Mobile:** El tablero Kanban colapsa a una lista única con filtro de estado (tab bar: Pendiente | En Proceso | Resuelto). Drag & drop desactivado en mobile — el estado se cambia desde el detalle del ticket.

---

## Rutas

```
/tenant/tickets/new     → TicketFormComponent (canActivate: [tenantGuard])
/tenant/tickets         → MyTicketsComponent (canActivate: [tenantGuard])
/tickets                → TicketsBoardComponent (canActivate: [ownerGuard])
/tickets/:id            → TicketDetailComponent (canActivate: [authGuard])
```

---

## Criterios de Aceptación

1. El inquilino solo puede crear tickets asociados a su propia unidad; `unitId` se toma del `users/{uid}.unitId`, no de un campo libre.
2. Cada foto adjunta al ticket valida tamaño < 2 MB antes de hacer upload.
3. El admin ve todos los tickets de sus propiedades, filtrados por propiedad si aplica.
4. Arrastrar una card al tablero Kanban actualiza `status` y agrega una entrada a `statusHistory` en Firestore.
5. Al pasar a "Resuelto", se registra `resolvedAt` con timestamp del momento del cambio.
6. El badge del sidenav se actualiza en tiempo real al llegar un nuevo ticket pendiente (sin recargar la página).
7. El inquilino puede ver el estado actual de sus tickets pero no tiene controles para cambiarlo.
8. En mobile, el estado del ticket se cambia desde el detalle usando un selector (no drag & drop).
9. Las fotos se almacenan bajo `owners/{ownerId}/tickets/{ticketId}/` con las Storage Rules correspondientes.
10. Las Security Rules permiten al inquilino crear tickets solo si `request.auth.uid == request.resource.data.tenantUid` y leer solo tickets propios.

---

## Dependencias

```json
{
  "@angular/cdk": "^17.x"  // DragDropModule (probablemente ya instalado con Angular Material)
}
```
Sin dependencias npm nuevas relevantes.

---

## Bloquea

- **v0.8.0** (Notificaciones) puede extender tickets para enviar emails al inquilino cuando cambia el estado (`onTicketStatusChange` Cloud Function).
