import { Component, inject, input, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PhotoItem } from '../../../../core/models/property.model';
import { PropertyService } from '../../../../core/services/property.service';
import { StorageService } from '../../../../core/services/storage.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PhotoUploadComponent, UploadItem } from './photo-upload.component';

const MAX_PHOTOS = 10;
const MAX_SIZE_MB = 5;

@Component({
  selector: 'app-photo-gallery',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    PhotoUploadComponent,
  ],
  template: `
    <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
      <div class="flex items-center justify-between px-5 py-4 border-b border-warm-100">
        <h2 class="font-semibold text-warm-900">
          Fotos ({{ photos().length }}/{{ maxPhotos }})
        </h2>
        @if (canWrite()) {
          <button
            (click)="triggerFileInput()"
            [disabled]="!canAddMore()"
            [matTooltip]="!canAddMore() && !isUploading() ? 'Límite de 10 fotos alcanzado' : ''"
            class="flex items-center gap-2 px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <mat-icon class="text-[16px]">add_photo_alternate</mat-icon>
            Agregar fotos
          </button>
          <input
            #fileInput
            type="file"
            accept="image/*"
            multiple
            class="hidden"
            (change)="onFilesSelected($event)"
          >
        }
      </div>

      @if (uploadQueue().length > 0) {
        <div class="px-5 py-3 border-b border-warm-100">
          <app-photo-upload [queue]="uploadQueue()" />
        </div>
      }

      @if (photos().length === 0 && uploadQueue().length === 0) {
        <div class="px-5 py-10 text-center">
          <mat-icon class="text-warm-300 text-[48px]">photo_library</mat-icon>
          <p class="text-warm-400 text-sm mt-2">Sin fotos aún</p>
        </div>
      } @else {
        <div class="p-4 space-y-3">
          <!-- Principal photo -->
          @if (photos().length > 0) {
            <div class="relative group">
              <img
                [src]="photos()[0].url"
                [alt]="photos()[0].filename"
                class="w-full h-52 object-cover rounded-lg"
              >
              <span class="absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 bg-primary-500 text-white rounded-full">
                Principal
              </span>
              @if (canWrite()) {
                <button
                  (click)="confirmDelete(photos()[0])"
                  class="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full
                         flex items-center justify-center transition-opacity
                         sm:opacity-0 sm:group-hover:opacity-100 opacity-100"
                  title="Eliminar foto"
                >
                  <mat-icon class="text-[14px]">close</mat-icon>
                </button>
              }
            </div>
          }

          <!-- Secondary photos -->
          @if (photos().length > 1) {
            <div class="grid grid-cols-4 sm:grid-cols-5 gap-2">
              @for (photo of photos().slice(1); track photo.storagePath) {
                <div class="relative group aspect-square">
                  <img
                    [src]="photo.url"
                    [alt]="photo.filename"
                    class="w-full h-full object-cover rounded-lg"
                  >
                  @if (canWrite()) {
                    <!-- Set as principal -->
                    <button
                      (click)="setPrimary(photo)"
                      matTooltip="Marcar como principal"
                      class="absolute top-1 left-1 w-6 h-6 bg-black/60 text-white rounded-full
                             flex items-center justify-center transition-opacity
                             sm:opacity-0 sm:group-hover:opacity-100 opacity-100"
                      title="Marcar como principal"
                    >
                      <mat-icon class="text-[12px]">star</mat-icon>
                    </button>
                    <!-- Delete -->
                    <button
                      (click)="confirmDelete(photo)"
                      class="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full
                             flex items-center justify-center transition-opacity
                             sm:opacity-0 sm:group-hover:opacity-100 opacity-100"
                      title="Eliminar foto"
                    >
                      <mat-icon class="text-[12px]">close</mat-icon>
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PhotoGalleryComponent {
  photos = input.required<PhotoItem[]>();
  propertyId = input.required<string>();
  ownerId = input.required<string>();
  canWrite = input<boolean>(true);

  private propertyService = inject(PropertyService);
  private storageService = inject(StorageService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  readonly maxPhotos = MAX_PHOTOS;
  uploadQueue = signal<UploadItem[]>([]);
  isUploading = computed(() => this.uploadQueue().length > 0);
  canAddMore = computed(() => this.photos().length < MAX_PHOTOS && !this.isUploading());

  triggerFileInput() {
    const el = document.querySelector('app-photo-gallery input[type="file"]') as HTMLInputElement;
    el?.click();
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const files = Array.from(input.files);
    input.value = '';

    const available = MAX_PHOTOS - this.photos().length;
    const toUpload = files.slice(0, available);

    for (const file of toUpload) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        this.snackBar.open(
          `"${file.name}" supera el límite de ${MAX_SIZE_MB} MB`,
          'OK',
          { duration: 4000 }
        );
        continue;
      }
      this.uploadSingle(file);
    }
  }

  private uploadSingle(file: File) {
    const progress: WritableSignal<number> = signal(0);
    const item: UploadItem = { name: file.name, progress };
    this.uploadQueue.update(q => [...q, item]);

    const timestamp = Date.now();
    const path = `owners/${this.ownerId()}/properties/${this.propertyId()}/photos/${timestamp}_${file.name}`;

    this.storageService.uploadFile(path, file).subscribe({
      next: pct => progress.set(pct),
      complete: async () => {
        try {
          const url = await this.storageService.getDownloadURL(path);
          const photo: PhotoItem = {
            url,
            storagePath: path,
            filename: file.name,
            uploadedAt: (await import('@angular/fire/firestore')).Timestamp.now(),
          };
          await this.propertyService.addPhoto(this.propertyId(), photo);
        } catch {
          this.snackBar.open('Error al guardar la foto.', 'OK', { duration: 4000 });
        } finally {
          this.uploadQueue.update(q => q.filter(i => i !== item));
        }
      },
      error: () => {
        this.uploadQueue.update(q => q.filter(i => i !== item));
        this.snackBar.open(
          `Error al subir "${file.name}". Intenta de nuevo.`,
          'Reintentar',
          { duration: 5000 }
        ).onAction().subscribe(() => this.uploadSingle(file));
      },
    });
  }

  async setPrimary(photo: PhotoItem) {
    const rest = this.photos().filter(p => p.storagePath !== photo.storagePath);
    await this.propertyService.removePhoto(this.propertyId(), [photo, ...rest]);
  }

  confirmDelete(photo: PhotoItem) {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar foto',
        message: `¿Eliminar "${photo.filename}"?`,
        confirmLabel: 'Eliminar',
        danger: true,
      },
    });
    ref.afterClosed().subscribe(async confirmed => {
      if (!confirmed) return;
      try {
        await this.storageService.deleteFile(photo.storagePath);
        const remaining = this.photos().filter(p => p.storagePath !== photo.storagePath);
        await this.propertyService.removePhoto(this.propertyId(), remaining);
      } catch {
        this.snackBar.open('Error al eliminar la foto.', 'OK', { duration: 4000 });
      }
    });
  }
}
