import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { PropertyService } from '../../core/services/property.service';
import { Property } from '../../core/models/property.model';

@Component({
  selector: 'app-notification-settings',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="space-y-6 max-w-2xl">

      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold text-warm-900">Configuración de notificaciones</h1>
        <p class="text-warm-500 text-sm mt-1">
          Activa o desactiva los recordatorios automáticos de pago por propiedad
        </p>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else if (occupiedProperties().length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 p-10 text-center">
          <mat-icon class="text-warm-300 text-[48px]">apartment</mat-icon>
          <p class="text-warm-500 text-sm mt-3">No tienes propiedades ocupadas</p>
        </div>
      } @else {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">
          <div class="divide-y divide-warm-100">
            @for (prop of occupiedProperties(); track prop.id) {
              <div class="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p class="text-sm font-medium text-warm-800">{{ prop.name }}</p>
                  @if (prop.tenantName) {
                    <p class="text-xs text-warm-400">{{ prop.tenantName }}</p>
                  }
                  @if (prop.paymentDueDay) {
                    <p class="text-xs text-warm-400">Vence el día {{ prop.paymentDueDay }} de cada mes</p>
                  }
                </div>
                <div class="flex items-center gap-3">
                  @if (!prop.tenantEmail) {
                    <span class="text-xs text-warm-400">Sin email de inquilino</span>
                  } @else {
                    <button
                      (click)="toggleNotifications(prop)"
                      [disabled]="savingPropertyId() === prop.id"
                      class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                      [class.bg-primary-500]="prop.notificationsEnabled !== false"
                      [class.bg-warm-300]="prop.notificationsEnabled === false"
                    >
                      <span
                        class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                        [class.translate-x-5]="prop.notificationsEnabled !== false"
                        [class.translate-x-0]="prop.notificationsEnabled === false"
                      ></span>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationSettingsComponent {
  private propertyService = inject(PropertyService);
  private snackBar = inject(MatSnackBar);

  loading = signal(false);
  savingPropertyId = signal<string | null>(null);

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  occupiedProperties(): Property[] {
    return this.properties().filter(p => p.status === 'ocupado');
  }

  async toggleNotifications(prop: Property) {
    if (!prop.id || this.savingPropertyId()) return;
    const newValue = prop.notificationsEnabled === false;
    this.savingPropertyId.set(prop.id);
    try {
      await this.propertyService.update(prop.id, { notificationsEnabled: newValue });
      this.snackBar.open(
        newValue ? 'Notificaciones activadas.' : 'Notificaciones desactivadas.',
        'OK',
        { duration: 2500 }
      );
    } catch {
      this.snackBar.open('Error al guardar.', 'OK', { duration: 2500 });
    } finally {
      this.savingPropertyId.set(null);
    }
  }
}
