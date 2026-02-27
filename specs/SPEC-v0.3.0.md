# SPEC v0.3.0 — Gestión Documental

## Objetivo
Digitalizar la operación eliminando el papel. El propietario puede adjuntar fotos a cada inmueble y subir contratos PDF a cada unidad, con todo almacenado en Firebase Storage y referenciado desde Firestore.

## Funcionalidades

- **Galería de fotos por inmueble**: Subida múltiple de imágenes. Vista de galería en el detalle del inmueble.
- **Contrato PDF por unidad**: Subida de un PDF de contrato asociado a la unidad activa.
- **Eliminación de archivos**: Borrar foto o contrato elimina el archivo de Storage y la referencia en Firestore.
- **Preview**: Las imágenes se muestran como thumbnails. El PDF tiene botón de "Ver" y "Descargar".

## Modelo de Datos (Firestore)

```
properties/{propertyId}
  + photos: PhotoItem[]            — array desnormalizado (máx 10)

PhotoItem (subcampo en array):
  - url: string                   — URL pública de Storage
  - storagePath: string           — path en Storage para poder borrar
  - uploadedAt: Timestamp

units/{unitId}
  + contract: ContractFile | null

ContractFile (subcampo en objeto):
  - url: string
  - storagePath: string
  - filename: string
  - uploadedAt: Timestamp
```

Storage paths:
```
owners/{ownerId}/properties/{propertyId}/photos/{filename}
owners/{ownerId}/units/{unitId}/contracts/{filename}
```

## Arquitectura Angular

```
features/
  properties/
    property-detail/
      photo-gallery/
        photo-gallery.component.ts    # Muestra fotos + botón subir
        photo-upload.component.ts     # Input file + progress bar
  units/
    unit-detail/
      contract-upload/
        contract-upload.component.ts  # Subida PDF + preview link
core/
  services/
    storage.service.ts               # Wrapper Firebase Storage (upload, delete, getURL)
```

## Rutas

Sin rutas nuevas. Las funcionalidades se integran en los componentes existentes de `property-detail` y `unit-detail`.

## Criterios de Aceptación

1. El admin puede subir hasta 10 fotos por inmueble; al exceder el límite se muestra un error.
2. La barra de progreso de carga muestra el porcentaje real del upload a Storage.
3. Al eliminar una foto, el archivo se borra de Storage Y la URL desaparece de Firestore de forma atómica (batch write).
4. El contrato PDF se puede previsualizar en una nueva pestaña sin descargarlo.
5. Si la unidad ya tiene contrato, subir uno nuevo reemplaza el anterior (borra el viejo de Storage).
6. Las Storage Security Rules solo permiten lectura/escritura al `ownerId` correspondiente.

## Dependencias

Firebase service: **Storage**

## Bloquea
- v0.5.0 (Portal Inquilino) necesita los contratos de esta versión para que el inquilino los descargue.
