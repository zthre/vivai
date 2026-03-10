# SPEC v0.4.0 — Marketplace Público

## Objetivo
Convertir vivai en canal de captación de inquilinos y compradores. Una ruta pública muestra las unidades disponibles sin autenticación, con filtros básicos y un CTA directo a WhatsApp. Primera ruta completamente pública de la app.

---

## Qué hereda de versiones anteriores

- `units` con `status`, `rentPrice`, `tenantEmail` de v0.1.0. **Esta versión migra `status`** (ver nota abajo).
- `properties` con `name`, `address`, `type` de v0.1.0.
- `photos: PhotoItem[]` en `properties` de v0.3.0 — la foto principal del inmueble se usa en la listing card.
- `PropertyFormComponent` — se le agrega la sección de configuración del marketplace.

**Migración de campo `status` en `units`:**
El valor `'disponible'` de v0.1.0 se reemplaza por `'disponible_renta' | 'disponible_venta'`. La migración se realiza con un script de Cloud Firestore Admin que convierte todos los documentos con `status: 'disponible'` a `status: 'disponible_renta'`. El enum del modelo se actualiza en v0.4.0 y `UnitFormComponent` refleja las nuevas opciones.

---

## Funcionalidades

### 1. Configuración del marketplace en propiedades (admin)
- Nueva sección en `PropertyFormComponent`: "Marketplace".
- Toggle `isPublic: boolean` — activa/desactiva la aparición en el marketplace.
- Campo `whatsappPhone: string` — número con código de país (ej: `573001234567`). Requerido si `isPublic: true`.
- Estos campos se guardan en el documento de la propiedad.

### 2. Ruta pública `/inmuebles`
- Accesible sin sesión; no aplica `authGuard`.
- Muestra cards de unidades cuya propiedad tiene `isPublic: true` y status `disponible_renta` o `disponible_venta`.
- Filtro por tipo: "En renta" | "En venta" | "Todos".
- Ordenar por precio: "Menor a mayor" | "Mayor a menor".
- Paginación: 12 cards por página (navegación con botones anterior/siguiente).
- **Empty state**: "No hay unidades disponibles en este momento."

### 3. Listing Card
Cada card muestra:
- Foto principal del inmueble (primera de `photos[]`) o placeholder si no hay fotos.
- Nombre del inmueble y dirección.
- Número/identificador de unidad.
- Tipo de propiedad (`apartamento`, `casa`, `local`, `bodega`).
- Precio de renta/venta formateado con moneda local.
- Badge de estado: "En renta" (azul) | "En venta" (verde).
- Botón "Contactar por WhatsApp" (si `whatsappPhone` existe).

### 4. Detalle público de unidad `/inmuebles/:unitId`
- Descripción larga (`publicDescription`).
- Galería de fotos del inmueble (read-only).
- Botón "Contactar por WhatsApp" con mensaje predefinido.
- Botón "← Volver al listado".

### 5. Botón WhatsApp
Genera el link:
```
https://wa.me/{whatsappPhone}?text=Hola,%20me%20interesa%20la%20unidad%20{unitNumber}%20en%20{propertyName}%20(%20{address}%20)
```

---

## Modelo de Datos (Firestore)

```
properties/{propertyId}
  + whatsappPhone: string | null   — número con código de país
  + isPublic: boolean              — default false

units/{unitId}
  status: 'ocupado' | 'disponible_renta' | 'disponible_venta'
    (reemplaza 'disponible' de v0.1.0)
  + publicDescription: string | null  — descripción visible en marketplace
```

**Firestore Security Rules (actualización):**
Permitir `read` en `properties` e `units` a usuarios no autenticados cuando `isPublic == true`:
```
match /properties/{propertyId} {
  allow read: if resource.data.isPublic == true || request.auth != null;
}
match /units/{unitId} {
  allow read: if get(/databases/$(database)/documents/properties/$(resource.data.propertyId)).data.isPublic == true
              || request.auth != null;
}
```

---

## Arquitectura Angular

```
src/app/
  features/
    marketplace/
      marketplace.routes.ts            # Sin authGuard — acceso público
      listings/
        listings.component.ts          # Listado con filtros + paginación
        listing-card/
          listing-card.component.ts    # Card individual
      listing-detail/
        listing-detail.component.ts    # Detalle + galería + CTA WhatsApp

    properties/
      property-form/
        property-form.component.ts     # Agregar sección Marketplace al formulario existente

    units/
      unit-form/
        unit-form.component.ts         # Actualizar opciones de status + campo publicDescription
```

---

## UX y Diseño

**Página de listado (desktop):**
```
┌──────────────────────────────────────────────────────────────┐
│  vivai │ Inmuebles disponibles                    [Iniciar sesión] │
├──────────────────────────────────────────────────────────────┤
│  [Todos ▾]  [En renta]  [En venta]    Ordenar: [Precio ▾]   │
├────────────────┬────────────────┬─────────────────────────── │
│  [foto]        │  [foto]        │  [foto]                    │
│  Apto 101      │  Local 2       │  Casa Principal            │
│  Edif. Robles  │  C. Córdoba    │  Vía 40                   │
│  $1.200.000/m  │  $800.000/m    │  $2.500.000/m              │
│  [En renta]    │  [En renta]    │  [En venta]                │
│  [WhatsApp ↗]  │  [WhatsApp ↗]  │  [WhatsApp ↗]             │
└────────────────┴────────────────┴───────────────────────────┘
│  < 1  2  3 >                                                 │
└──────────────────────────────────────────────────────────────┘
```

**Mobile (375px):** grid de 1 columna, cards apiladas verticalmente.

**Sección marketplace en PropertyForm:**
```
  ── Marketplace ──────────────────────────────────────
  [ ] Publicar esta propiedad en el marketplace

  Número de WhatsApp (con código de país)
  [+57 300 123 4567                        ]
  ─────────────────────────────────────────────────────
```

---

## Rutas

```
/inmuebles               → ListingsComponent (pública, sin guard)
/inmuebles/:unitId       → ListingDetailComponent (pública, sin guard)
```

Actualización en `app.routes.ts`:
```typescript
{
  path: 'inmuebles',
  loadChildren: () => import('./features/marketplace/marketplace.routes')
    .then(m => m.MARKETPLACE_ROUTES)
  // Sin canActivate
}
```

---

## Criterios de Aceptación

1. `/inmuebles` es accesible sin sesión activa; el `authGuard` no se aplica a este módulo.
2. Solo aparecen unidades cuya propiedad tiene `isPublic: true` **y** cuyo `status` es `disponible_renta` o `disponible_venta`.
3. El filtro por tipo (renta/venta/todos) actualiza la lista reactivamente sin recarga de página.
4. Ordenar por precio reordena las cards instantáneamente en el cliente (sin nueva query).
5. El botón WhatsApp genera el link con mensaje predefinido que incluye número de unidad, nombre del inmueble y dirección.
6. Si `whatsappPhone` es null o vacío, el botón WhatsApp no se renderiza.
7. La paginación muestra máximo 12 cards; si hay más unidades, aparecen los controles de página.
8. El `UnitFormComponent` muestra las nuevas opciones: "Ocupado", "Disponible (renta)", "Disponible (venta)".
9. Activar `isPublic: true` sin `whatsappPhone` muestra error de validación en el formulario.
10. Las Firestore Security Rules permiten lectura pública de `properties` e `units` solo cuando `isPublic == true`; el resto requiere auth.
11. Empty state: si no hay unidades disponibles, se muestra el mensaje correspondiente (no una lista vacía).
12. El script de migración de `status: 'disponible'` → `'disponible_renta'` está documentado y se ejecuta antes del deploy.

---

## Dependencias

Sin nuevas dependencias npm.

---

## Bloquea

- **v0.5.0** (Portal Inquilino) usa las rutas públicas y el campo `isPublic` establecidos aquí para el acceso del inquilino al marketplace.
