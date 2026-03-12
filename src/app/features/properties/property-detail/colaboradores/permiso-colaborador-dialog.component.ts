import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ColaboradorPermission } from '../../../../core/models/property.model';
import { PropertyService } from '../../../../core/services/property.service';

export interface PermisoDialogData {
  collaborator: {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
    permissions: ColaboradorPermission;
  };
}

interface SubPermission {
  key: keyof ColaboradorPermission;
  label: string;
}

interface PermissionSection {
  icon: string;
  title: string;
  subPermissions: SubPermission[];
}

const SECTIONS: PermissionSection[] = [
  {
    icon: 'apartment',
    title: 'Propiedades',
    subPermissions: [
      { key: 'inmueblesUnidades', label: 'Crear, editar y eliminar' },
      { key: 'inmueblesPagos', label: 'Registrar pagos' },
      { key: 'inmueblesMedia', label: 'Fotos' },
    ],
  },
  {
    icon: 'bar_chart',
    title: 'Finanzas',
    subPermissions: [
      { key: 'gastos', label: 'Registrar y editar gastos' },
    ],
  },
  {
    icon: 'build_circle',
    title: 'Tickets',
    subPermissions: [
      { key: 'tickets', label: 'Cambiar estado de solicitudes' },
    ],
  },
  {
    icon: 'receipt_long',
    title: 'Servicios',
    subPermissions: [
      { key: 'servicios', label: 'Ver, crear y editar servicios y recibos' },
    ],
  },
];

@Component({
  selector: 'app-permiso-colaborador-dialog',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDialogModule, MatSnackBarModule],
  template: `
    <div class="w-full max-w-sm">
      <!-- Header -->
      <div class="px-6 pt-5 pb-4 border-b border-warm-100">
        <h2 class="text-base font-semibold text-warm-900">Permisos de colaboración</h2>
        <p class="text-xs text-warm-400 mt-0.5">Aplica a todas las propiedades del propietario</p>
      </div>

      <!-- Collaborator info -->
      <div class="px-6 py-4 flex items-center gap-3 border-b border-warm-100">
        @if (data.collaborator.photoURL) {
          <img [src]="data.collaborator.photoURL" class="w-9 h-9 rounded-full flex-shrink-0" alt="avatar">
        } @else {
          <div class="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span class="text-primary-700 font-bold text-sm">{{ initial() }}</span>
          </div>
        }
        <div class="min-w-0">
          <p class="text-sm font-semibold text-warm-900 truncate">
            {{ data.collaborator.displayName || data.collaborator.email }}
          </p>
          @if (data.collaborator.displayName) {
            <p class="text-xs text-warm-400 truncate">{{ data.collaborator.email }}</p>
          }
        </div>
      </div>

      <!-- Permission sections -->
      <div class="px-6 py-4 space-y-5">
        @for (section of sections; track section.icon) {
          <div>
            <!-- Section label -->
            <div class="flex items-center gap-2 mb-2">
              <div class="w-6 h-6 rounded-md bg-warm-100 flex items-center justify-center flex-shrink-0">
                <mat-icon class="text-[14px] text-warm-500">{{ section.icon }}</mat-icon>
              </div>
              <p class="text-[11px] font-semibold text-warm-500 uppercase tracking-wider">{{ section.title }}</p>
            </div>

            <!-- Sub-permission toggles -->
            <div class="space-y-1.5">
              @for (sub of section.subPermissions; track sub.key) {
                <div
                  class="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-colors cursor-pointer"
                  [class.border-primary-200]="isEnabled(sub.key)"
                  [class.bg-primary-50]="isEnabled(sub.key)"
                  [class.border-warm-200]="!isEnabled(sub.key)"
                  (click)="!saving() && toggle(sub.key)"
                >
                  <p class="text-sm text-warm-800 select-none">{{ sub.label }}</p>
                  <button
                    type="button"
                    role="switch"
                    [attr.aria-checked]="isEnabled(sub.key)"
                    [disabled]="saving()"
                    (click)="$event.stopPropagation(); toggle(sub.key)"
                    class="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50"
                    [class.bg-primary-500]="isEnabled(sub.key)"
                    [class.bg-warm-300]="!isEnabled(sub.key)"
                  >
                    <span
                      class="inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                      [class.translate-x-4]="isEnabled(sub.key)"
                      [class.translate-x-0]="!isEnabled(sub.key)"
                    ></span>
                  </button>
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="px-6 pb-5 flex justify-end border-t border-warm-100 pt-4">
        <button
          (click)="close()"
          class="px-5 py-2 rounded-lg border border-warm-200 text-sm text-warm-700 hover:bg-warm-50 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  `,
})
export class PermisoColaboradorDialogComponent {
  readonly data: PermisoDialogData = inject(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<PermisoColaboradorDialogComponent>);
  private propertyService = inject(PropertyService);
  private snackBar = inject(MatSnackBar);

  readonly sections = SECTIONS;
  permissions = signal<ColaboradorPermission>({ ...this.data.collaborator.permissions });
  saving = signal(false);

  initial(): string {
    return this.data.collaborator.displayName?.[0]?.toUpperCase()
      ?? this.data.collaborator.email?.[0]?.toUpperCase()
      ?? '?';
  }

  isEnabled(key: keyof ColaboradorPermission): boolean {
    return this.permissions()[key] !== false;
  }

  toggle(key: keyof ColaboradorPermission) {
    const newValue = this.isEnabled(key) ? false : true;
    this.savePermission(key, newValue);
  }

  private async savePermission(key: keyof ColaboradorPermission, value: boolean) {
    const previous = this.permissions()[key];
    const updated = { ...this.permissions(), [key]: value };
    this.permissions.set(updated);
    this.saving.set(true);
    try {
      await this.propertyService.updateGlobalCollaboradorPermissions(
        this.data.collaborator.uid,
        updated
      );
    } catch {
      this.permissions.set({ ...this.permissions(), [key]: previous });
      this.snackBar.open('Error al guardar el permiso.', 'OK', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }

  close() {
    this.dialogRef.close(this.permissions());
  }
}
