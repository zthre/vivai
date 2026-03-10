# SPEC v0.3.0 — Gestión Documental

## Objetivo
Digitalizar la operación eliminando el papel. El propietario adjunta fotos a cada inmueble y sube contratos PDF a cada unidad, con todo almacenado en Firebase Storage y referenciado desde Firestore. Primer módulo con subida de archivos en la app.

---

## Qué hereda de v0.1.0

- `PropertyDetailComponent` — se le agrega la sección de galería de fotos.
- `UnitDetailComponent` — se le agrega la sección de contrato.
- `ConfirmDialogComponent` — reutilizado para confirmar eliminación de fotos/contratos.
- `app.config.ts` — agregar `provideStorage(() => getStorage())`.
- `StorageService` (nuevo aquí) será reutilizado por v0.6.0 para fotos de tickets.

---

## Funcionalidades

### 1. Galería de fotos por inmueble
- Sección "Fotos" al final de `PropertyDetailComponent`.
- Grid de thumbnails 3 columnas (desktop) / 2 columnas (mobile).
- Botón "Agregar fotos" abre el `<input type="file" accept="image/*" multiple>` nativo.
- Progreso de carga: barra por archivo usando `UploadTask.percentageChanges()`.
- **Límite**: máximo 10 fotos por inmueble. Al alcanzarlo, el botón se deshabilita con tooltip.
- **Tamaño máximo por foto**: 5 MB — validación client-side antes de iniciar el upload.
- Al eliminar: confirm dialog → borrar archivo en Storage → quitar URL del array en Firestore (operación `updateDoc` atómica).

### 2. Contrato PDF por unidad
- Sección "Contrato" en `UnitDetailComponent`.
- **Sin contrato**: estado vacío + botón "Subir Contrato".
- **Con contrato**: nombre del archivo, fecha de subida, tamaño, botón "Ver" (nueva pestaña) y botón "Eliminar".
- Un solo contrato activo por unidad; subir uno nuevo elimina el anterior de Storage antes de subir.
- **Tamaño máximo**: 20 MB — validación client-side.

---

## Modelo de Datos (Firestore)

```
properties/{propertyId}
  + photos: PhotoItem[]            — array desnormalizado (máx 10)

PhotoItem:
  - url: string                   — URL pública de Storage
  - storagePath: string           — path en Storage para poder borrar
  - filename: string
  - uploadedAt: Timestamp

units/{unitId}
  + contract: ContractFile | null

ContractFile:
  - url: string
  - storagePath: string
  - filename: string
  - sizeBytes: number
  - uploadedAt: Timestamp
```

**Storage paths:**
```
owners/{ownerId}/properties/{propertyId}/photos/{timestamp}_{filename}
owners/{ownerId}/units/{unitId}/contracts/{timestamp}_{filename}
```
El prefijo `{timestamp}_` evita colisiones de nombre al resubir archivos con el mismo nombre.

---

## Arquitectura Angular

```
src/app/
  core/
    services/
      storage.service.ts              # uploadFile, deleteFile, getDownloadURL

  features/
    properties/
      property-detail/
        photo-gallery/
          photo-gallery.component.ts  # Grid + botón agregar + delete individual
          photo-upload.component.ts   # Input file + barra de progreso por archivo

    units/
      unit-detail/
        contract-section/
          contract-section.component.ts  # Estado vacío | contrato cargado + acciones
```

---

## Estado con Angular Signals

`PhotoGalleryComponent`:
```typescript
photos       = input<PhotoItem[]>([])        // pasado desde PropertyDetailComponent
uploadQueue  = signal<UploadItem[]>([])      // { file, progress: signal<number> }[]
isUploading  = computed(() => this.uploadQueue().some(u => u.progress() < 100))
canAddMore   = computed(() => this.photos().length < 10 && !this.isUploading())
```

`StorageService.uploadFile` devuelve progreso real:
```typescript
uploadFile(storagePath: string, file: File): Observable<number> {
  const ref = storageRef(this.storage, storagePath)
  const task = uploadBytesResumable(ref, file)
  return new Observable(obs =>
    task.on('state_changed',
      snap => obs.next((snap.bytesTransferred / snap.totalBytes) * 100),
      err  => obs.error(err),
      ()   => obs.complete()
    )
  )
}
```

---

## UX y Diseño

**Galería en property-detail (desktop):**
```
┌──────────────────────────────────────────────────────────┐
│  Fotos (3/10)                          [Agregar fotos]   │
├──────────────┬───────────────┬──────────────────────────┤
│  [img]  [x]  │  [img]   [x]  │  [img]  [x]              │
│  [img]  [x]  │  ...          │                          │
└──────────────────────────────────────────────────────────┘
```
- Thumbnails: 160×160px, `object-fit: cover`, bordes redondeados 8px.
- Botón `[x]` visible en hover (desktop) / siempre visible (mobile).

**Durante upload:**
```
  Subiendo foto_exterior.jpg  ████████░░  80%
  Subiendo foto_sala.jpg      ██░░░░░░░░  22%
```

**Sección contrato en unit-detail:**
```
  Contrato de arriendo
  ┌──────────────────────────────────────────────────────┐
  │  contrato_inquilino.pdf    15 ene 2026  │  2.4 MB    │
  │  [Ver contrato ↗]   [Eliminar]                       │
  └──────────────────────────────────────────────────────┘
```

**Sin contrato (empty state):**
```
  Contrato de arriendo
  ┌──────────────────────────────────────────────────────┐
  │  Sin contrato cargado                                │
  │  [Subir Contrato PDF]                                │
  └──────────────────────────────────────────────────────┘
```

---

## Rutas

Sin rutas nuevas. Las funcionalidades se integran en `property-detail` y `unit-detail`.

---

## Criterios de Aceptación

1. Una foto > 5 MB muestra `MatSnackBar` de error **antes** de iniciar la subida; Storage no es llamado.
2. Al alcanzar 10 fotos, el botón "Agregar fotos" se deshabilita y muestra tooltip "Límite de 10 fotos alcanzado".
3. La barra de progreso refleja el porcentaje real de bytes transferidos (no indeterminado).
4. Al eliminar una foto: el archivo desaparece de Storage **y** la URL del array de Firestore en la misma operación `updateDoc`; no quedan referencias huérfanas.
5. El contrato PDF se abre en nueva pestaña (`target="_blank"`); no se fuerza descarga.
6. Subir un nuevo contrato cuando ya existe uno: (a) elimina el viejo de Storage, (b) sube el nuevo, (c) actualiza `contract` en Firestore.
7. Un PDF > 20 MB muestra error antes de iniciar la subida.
8. Las Storage Security Rules solo permiten lectura/escritura cuando `request.auth.uid` coincide con el `ownerId` del path (`owners/{ownerId}/...`).
9. Si el upload falla (red cortada), se muestra `MatSnackBar` con opción de reintentar; el estado `uploadQueue` se limpia correctamente.
10. Galería funcional en 375px: grid de 2 columnas, botón eliminar siempre visible (sin depender de hover).

---

## Dependencias

Firebase service: **Storage** (`provideStorage(() => getStorage())`).
Sin nuevas dependencias npm.

---

## Bloquea

- **v0.5.0** (Portal Inquilino) necesita `contract.url` en units para que el inquilino descargue su contrato.
- **v0.6.0** (Tickets) reutiliza `StorageService` para adjuntar fotos a tickets de mantenimiento.
