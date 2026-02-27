# SPEC v0.4.0 — Marketplace Público

## Objetivo
Convertir vivai en canal de captación de inquilinos y compradores. Una ruta pública muestra los inmuebles disponibles sin necesidad de autenticación, con filtros básicos y un CTA directo a WhatsApp.

## Funcionalidades

- **Ruta pública `/inmuebles`**: Accesible sin login. Lista cards de unidades disponibles.
- **Filtro por estado**: `disponible_renta` o `disponible_venta` (nuevo campo en units).
- **Card de unidad**: Foto principal del inmueble, número de unidad, precio, tipo y dirección.
- **Botón "Contactar por WhatsApp"**: Genera un link `https://wa.me/{phone}?text=...` con datos de la unidad.
- **Campo de contacto en propiedad**: El propietario agrega su número de WhatsApp en la configuración del inmueble.

## Modelo de Datos (Firestore)

```
properties/{propertyId}
  + whatsappPhone: string | null    — número con código de país, ej: "573001234567"
  + isPublic: boolean               — si aparece en el marketplace

units/{unitId}
  + status: 'ocupado' | 'disponible_renta' | 'disponible_venta'
    (reemplaza el anterior 'disponible')
  + publicDescription: string | null  — descripción visible en el marketplace
```

## Arquitectura Angular

```
features/
  marketplace/
    marketplace.routes.ts           # Rutas públicas (sin auth guard)
    listings/
      listings.component.ts         # Listado público con filtros
      listing-card/
        listing-card.component.ts   # Card individual de unidad
    listing-detail/
      listing-detail.component.ts   # Detalle público + botón WhatsApp
```

## Rutas

```
/inmuebles                   → ListingsComponent (pública, sin guard)
/inmuebles/:unitId           → ListingDetailComponent (pública)
```

## Criterios de Aceptación

1. `/inmuebles` es accesible sin sesión activa; el auth guard no aplica a este módulo.
2. Solo aparecen unidades cuya propiedad tiene `isPublic: true` y la unidad tiene status `disponible_renta` o `disponible_venta`.
3. El filtro por tipo (renta/venta) actualiza la lista de forma reactiva sin recarga.
4. El botón de WhatsApp abre `wa.me` con un mensaje predefinido que incluye el nombre de la unidad y la dirección.
5. Si la propiedad no tiene `whatsappPhone`, el botón de WhatsApp no se muestra.
6. Las Firestore Security Rules permiten `read` en `properties` e `units` donde `isPublic == true` a usuarios no autenticados.

## Dependencias

Sin nuevas dependencias de npm.

## Bloquea
- v0.5.0 requiere las rutas públicas para el acceso del inquilino.
