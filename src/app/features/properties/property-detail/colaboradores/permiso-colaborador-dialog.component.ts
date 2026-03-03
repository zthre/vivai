import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ColaboradorPermission } from '../../../../core/models/property.model';
import { PropertyService } from '../../../../core/services/property.service';

export interface PermisoDialogData {
  propertyId: string;
  propertyName: string;
  collaborator: {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
    permissions: ColaboradorPermission;
  };
}

interface PermissionSection {
  key: keyof ColaboradorPermission;
  icon: string;
  title: string;
  description: string;
}

const SECTIONS: PermissionSection[] = [
  {
    key: 'inmuebles',
    icon: 'apartment',
    title: 'Inmuebles',
    description: 'Crear, editar y eliminar unidades, registrar pagos, fotos y contratos.',
  },
  {
    key: 'finances',
    icon: 'bar_chart',
    title: 'Finanzas',
    description: 'Registrar y editar gastos del inmueble.',
  },
  {
    key: 'tickets',
    icon: 'build_circle',
    title: 'Tickets',
    description: 'Cambiar el estado de solicitudes de mantenimiento.',
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
        <p class="text-xs text-warm-400 mt-0.5">{{ data.propertyName }}</p>
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

      <!-- Permission toggles -->
      <div class="px-6 py-4">
        <p class="text-[11px] font-semibold text-warm-400 uppercase tracking-wider mb-3">Permisos</p>
        <div class="space-y-2">
          @for (section of sections; track section.key) {
            <div class="flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer"
              [class.border-primary-200]="permissions()[section.key] === 'write'"
              [class.bg-primary-50]="permissions()[section.key] === 'write'"
              [class.border-warm-200]="permissions()[section.key] !== 'write'"
              (click)="!saving() && togglePermission(section.key)"
            >
              <!-- Icon -->
              <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                [class.bg-primary-100]="permissions()[section.key] === 'write'"
                [class.bg-warm-100]="permissions()[section.key] !== 'write'"
              >
                <mat-icon class="text-[18px] transition-colors"
                  [class.text-primary-600]="permissions()[section.key] === 'write'"
                  [class.text-warm-400]="permissions()[section.key] !== 'write'"
                >{{ section.icon }}</mat-icon>
              </div>

              <!-- Label + description -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-warm-900">{{ section.title }}</p>
                <p class="text-xs text-warm-400 leading-snug">{{ section.description }}</p>
              </div>

              <!-- Toggle switch -->
              <button
                type="button"
                role="switch"
                [attr.aria-checked]="permissions()[section.key] === 'write'"
                [disabled]="saving()"
                (click)="$event.stopPropagation(); togglePermission(section.key)"
                class="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50"
                [class.bg-primary-500]="permissions()[section.key] === 'write'"
                [class.bg-warm-300]="permissions()[section.key] !== 'write'"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                  [class.translate-x-5]="permissions()[section.key] === 'write'"
                  [class.translate-x-0]="permissions()[section.key] !== 'write'"
                ></span>
              </button>
            </div>
          }
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 pb-5 flex justify-end">
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

  togglePermission(key: keyof ColaboradorPermission) {
    const newValue = this.permissions()[key] === 'write' ? 'read' : 'write';
    this.savePermission(key, newValue);
  }

  private async savePermission(key: keyof ColaboradorPermission, value: 'read' | 'write') {
    const previous = this.permissions()[key];
    const updated = { ...this.permissions(), [key]: value };
    this.permissions.set(updated);
    this.saving.set(true);
    try {
      await this.propertyService.updateColaboradorPermissions(
        this.data.propertyId,
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
