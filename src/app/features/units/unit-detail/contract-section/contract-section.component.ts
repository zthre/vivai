import { Component, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ContractFile } from '../../../../core/models/unit.model';
import { UnitService } from '../../../../core/services/unit.service';
import { StorageService } from '../../../../core/services/storage.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

const MAX_SIZE_MB = 20;

@Component({
  selector: 'app-contract-section',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDialogModule, MatSnackBarModule],
  template: `
    <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
      <div class="flex items-center justify-between px-5 py-4 border-b border-warm-100">
        <h2 class="font-semibold text-warm-900">Contrato de arriendo</h2>
        @if (!contract() && canWrite()) {
          <button
            (click)="triggerFileInput()"
            [disabled]="uploading()"
            class="flex items-center gap-2 px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <mat-icon class="text-[16px]">upload_file</mat-icon>
            Subir Contrato PDF
          </button>
        }
        <input
          #fileInput
          type="file"
          accept="application/pdf"
          class="hidden"
          (change)="onFileSelected($event)"
        >
      </div>

      <!-- Upload progress -->
      @if (uploading()) {
        <div class="px-5 py-4">
          <p class="text-sm text-warm-600 mb-2">Subiendo contrato...</p>
          <div class="h-1.5 bg-warm-100 rounded-full overflow-hidden">
            <div class="h-full bg-primary-500 rounded-full animate-pulse w-full"></div>
          </div>
        </div>
      }

      <!-- No contract -->
      @if (!contract() && !uploading()) {
        <div class="px-5 py-10 text-center">
          <mat-icon class="text-warm-300 text-[48px]">description</mat-icon>
          <p class="text-warm-400 text-sm mt-2">Sin contrato cargado</p>
          @if (canWrite()) {
            <button
              (click)="triggerFileInput()"
              class="mt-4 flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium mx-auto"
            >
              <mat-icon class="text-[18px]">upload_file</mat-icon>
              Subir Contrato PDF
            </button>
          }
        </div>
      }

      <!-- Contract info -->
      @if (contract() && !uploading()) {
        <div class="px-5 py-4">
          <div class="flex items-center gap-4 p-4 bg-warm-50 rounded-lg border border-warm-200">
            <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <mat-icon class="text-red-500">picture_as_pdf</mat-icon>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-warm-900 truncate">{{ contract()!.filename }}</p>
              <p class="text-xs text-warm-400 mt-0.5">
                {{ contract()!.uploadedAt?.toDate() | date:'d MMM y' }} ·
                {{ formatSize(contract()!.sizeBytes) }}
              </p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <a
                [href]="contract()!.url"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1 px-3 py-1.5 border border-warm-200 text-warm-700 rounded-lg text-xs font-medium hover:bg-warm-50 transition-colors"
              >
                <mat-icon class="text-[14px]">open_in_new</mat-icon>
                Ver
              </a>
              @if (canWrite()) {
                <button
                  (click)="triggerFileInput()"
                  class="flex items-center gap-1 px-3 py-1.5 border border-primary-200 text-primary-600 rounded-lg text-xs font-medium hover:bg-primary-50 transition-colors"
                >
                  <mat-icon class="text-[14px]">swap_horiz</mat-icon>
                  Reemplazar
                </button>
                <button
                  (click)="confirmDelete()"
                  class="p-1.5 text-warm-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Eliminar contrato"
                >
                  <mat-icon class="text-[18px]">delete</mat-icon>
                </button>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ContractSectionComponent {
  contract = input<ContractFile | null | undefined>(null);
  unitId = input.required<string>();
  ownerId = input.required<string>();
  canWrite = input<boolean>(true);

  private unitService = inject(UnitService);
  private storageService = inject(StorageService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  uploading = signal(false);

  triggerFileInput() {
    const el = document.querySelector('app-contract-section input[type="file"]') as HTMLInputElement;
    el?.click();
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      this.snackBar.open(`El PDF supera el límite de ${MAX_SIZE_MB} MB.`, 'OK', { duration: 4000 });
      return;
    }

    this.uploading.set(true);

    try {
      // Delete old contract from Storage if exists
      const existing = this.contract();
      if (existing?.storagePath) {
        await this.storageService.deleteFile(existing.storagePath).catch(() => {});
      }

      const timestamp = Date.now();
      const path = `owners/${this.ownerId()}/units/${this.unitId()}/contracts/${timestamp}_${file.name}`;

      // Upload — collect progress but we'll use indeterminate UI
      await new Promise<void>((resolve, reject) => {
        this.storageService.uploadFile(path, file).subscribe({
          error: reject,
          complete: resolve,
        });
      });

      const url = await this.storageService.getDownloadURL(path);
      const contract: ContractFile = {
        url,
        storagePath: path,
        filename: file.name,
        sizeBytes: file.size,
        uploadedAt: (await import('@angular/fire/firestore')).Timestamp.now(),
      };

      await this.unitService.setContract(this.unitId(), contract);
      this.snackBar.open('Contrato cargado correctamente.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al subir el contrato. Intenta de nuevo.', 'OK', { duration: 4000 });
    } finally {
      this.uploading.set(false);
    }
  }

  confirmDelete() {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar contrato',
        message: '¿Eliminar el contrato? Esta acción no se puede deshacer.',
        confirmLabel: 'Eliminar',
        danger: true,
      },
    });
    ref.afterClosed().subscribe(async confirmed => {
      if (!confirmed) return;
      const existing = this.contract();
      if (existing?.storagePath) {
        await this.storageService.deleteFile(existing.storagePath).catch(() => {});
      }
      await this.unitService.setContract(this.unitId(), null);
    });
  }

  formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
}
