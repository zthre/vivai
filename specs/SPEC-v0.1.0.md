# SPEC v0.1.0 — MVP Core (Administración)

## Objetivo
Permitir al propietario autenticarse y gestionar su portafolio desde cero: registrar inmuebles, crear unidades dentro de ellos, asignar un inquilino por unidad y registrar pagos manualmente. Es la base operacional sobre la que se construyen todas las versiones siguientes.

## Funcionalidades

- **Auth mínima**: Login con google (Firebase Auth). Un solo rol: owner/admin.
- **CRUD Inmuebles**: Crear, listar, editar y eliminar propiedades con nombre, dirección y tipo.
- **CRUD Unidades**: Crear, listar, editar y eliminar unidades dentro de una propiedad. Cada unidad tiene número, precio de renta y estado.
- **Asignación de Inquilino**: Campo `tenantEmail` en la unidad. Sin portal de inquilino aún — solo texto.
- **Registro Manual de Pago**: Botón "Registrar Pago" en el detalle de unidad. Crea un documento en `payments` con monto, fecha y nota opcional.
- **Dashboard mínimo**: Contador de inmuebles, unidades ocupadas/disponibles y últimos pagos.
- **IU**: Diseño simple, responsive y accesible. Usar CSS + Angular Material para componentes básicos.
- **Diseño**: Usar colores cálidos y modernos, con un diseño limpio y profesional. tipo panel de control menú lateral.

## Modelo de Datos (Firestore)

```
users/{userId}
  - email: string
  - displayName: string
  - createdAt: Timestamp

properties/{propertyId}
  - ownerId: string — uid del usuario autenticado
  - name: string — ej: "Edificio Los Robles"
  - address: string — dirección completa
  - type: 'apartamento' | 'casa' | 'local' | 'bodega'
  - unitCount: number — desnormalizado para dashboard
  - createdAt: Timestamp
  - updatedAt: Timestamp

units/{unitId}
  - propertyId: string — ref a properties
  - ownerId: string — uid del propietario (para Security Rules)
  - number: string — ej: "101", "Apto 3B"
  - rentPrice: number — precio mensual en pesos/moneda local
  - status: 'ocupado' | 'disponible'
  - tenantEmail: string | null
  - tenantName: string | null
  - createdAt: Timestamp
  - updatedAt: Timestamp

payments/{paymentId}
  - unitId: string — ref a units
  - propertyId: string — desnormalizado para queries
  - ownerId: string — uid del propietario
  - amount: number
  - date: Timestamp — fecha del pago (no createdAt)
  - notes: string | null
  - createdAt: Timestamp
  - createdBy: string — uid del admin que registró
```

## Arquitectura Angular

```
src/
  app/
    core/
      auth/
        auth.service.ts          # FirebaseAuth wrapper con Signals
        auth.guard.ts
      services/
        property.service.ts      # CRUD properties (Firestore)
        unit.service.ts          # CRUD units
        payment.service.ts       # CRUD payments
      models/
        property.model.ts
        unit.model.ts
        payment.model.ts
    features/
      auth/
        login/
          login.component.ts     # Standalone
      dashboard/
        dashboard.component.ts   # Standalone — vista home
      properties/
        properties-list/
          properties-list.component.ts
        property-form/
          property-form.component.ts   # Crea y edita
        property-detail/
          property-detail.component.ts # Lista unidades de esta propiedad
      units/
        unit-form/
          unit-form.component.ts
        unit-detail/
          unit-detail.component.ts     # Lista pagos + botón registrar pago
      payments/
        payment-form/
          payment-form.component.ts    # Modal/dialog
    shared/
      components/
        confirm-dialog/
        empty-state/
        loading-spinner/
      pipes/
        currency-col.pipe.ts     # Formato moneda local
    app.routes.ts
    app.config.ts                # provideFirebaseApp, provideFirestore, etc.
```

## Rutas

```
/login                             → LoginComponent (pública)
/                                  → redirect a /dashboard
/dashboard                         → DashboardComponent (protegida)
/properties                        → PropertiesListComponent
/properties/new                    → PropertyFormComponent
/properties/:id/edit               → PropertyFormComponent (modo edición)
/properties/:id                    → PropertyDetailComponent (lista unidades)
/properties/:id/units/new          → UnitFormComponent
/properties/:id/units/:unitId/edit → UnitFormComponent (modo edición)
/properties/:id/units/:unitId      → UnitDetailComponent (pagos)
```

## Criterios de Aceptación

1. Un usuario no autenticado que accede a `/dashboard` es redirigido a `/login`.
2. El admin puede crear un inmueble con nombre, dirección y tipo; aparece inmediatamente en la lista (reactivo con Signals).
3. El admin puede eliminar un inmueble solo si no tiene unidades asociadas; si las tiene, se muestra un mensaje de error.
4. Cada unidad muestra su estado (`ocupado` / `disponible`) y cambia visualmente al asignar o quitar `tenantEmail`.
5. El botón "Registrar Pago" abre un formulario modal; al guardar, el pago aparece en el historial de la unidad sin recargar la página.
6. El dashboard muestra el total de inmuebles, unidades ocupadas y el último pago registrado.
7. Las Firestore Security Rules impiden que un usuario lea o escriba documentos cuyo `ownerId` no coincida con su `uid`.
8. La app es funcional en mobile (375px) y desktop (1280px+).

## Dependencias

```json
{
  "@angular/fire": "^17.x",
  "firebase": "^10.x",
  "tailwindcss": "^3.x",
  "@angular/material": "^17.x"
}
```
Firebase services: **Firestore**, **Authentication (email/password)**

## Bloquea
- v0.2.0 (Control Financiero) requiere la colección `payments` de esta versión.
- v0.5.0 (Portal Inquilino) requiere `tenantEmail` en units.
