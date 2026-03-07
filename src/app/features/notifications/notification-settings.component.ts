import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { PropertyService } from '../../core/services/property.service';
import { UnitService } from '../../core/services/unit.service';
import { Unit } from '../../core/models/unit.model';

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
      } @else if (properties().length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 p-10 text-center">
          <mat-icon class="text-warm-300 text-[48px]">apartment</mat-icon>
          <p class="text-warm-500 text-sm mt-3">No tienes inmuebles registrados</p>
        </div>
      } @else {
        @for (prop of properties(); track prop.id) {
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-warm-100">
              <h2 class="font-semibold text-warm-900">{{ prop.name }}</h2>
              <p class="text-xs text-warm-400">{{ prop.address }}</p>
            </div>

            @if (unitsByProperty(prop.id!).length === 0) {
              <div class="px-5 py-4 text-sm text-warm-400">Sin unidades registradas</div>
            } @else {
              <div class="divide-y divide-warm-100">
                @for (unit of unitsByProperty(prop.id!); track unit.id) {
                  <div class="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <p class="text-sm font-medium text-warm-800">Unidad {{ unit.number }}</p>
                      @if (unit.tenantName) {
                        <p class="text-xs text-warm-400">{{ unit.tenantName }}</p>
                      }
                      @if (unit.paymentDueDay) {
                        <p class="text-xs text-warm-400">Vence el día {{ unit.paymentDueDay }} de cada mes</p>
                      }
                    </div>
                    <div class="flex items-center gap-3">
                      @if (!unit.tenantEmail) {
                        <span class="text-xs text-warm-400">Sin email de inquilino</span>
                      } @else {
                        <button
                          (click)="toggleNotifications(unit)"
                          [disabled]="savingUnitId() === unit.id"
                          class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                          [class.bg-primary-500]="unit.notificationsEnabled !== false"
                          [class.bg-warm-300]="unit.notificationsEnabled === false"
                        >
                          <span
                            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                            [class.translate-x-5]="unit.notificationsEnabled !== false"
                            [class.translate-x-0]="unit.notificationsEnabled === false"
                          ></span>
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class NotificationSettingsComponent {
  private propertyService = inject(PropertyService);
  private unitService = inject(UnitService);
  private snackBar = inject(MatSnackBar);

  loading = signal(false);
  savingUnitId = signal<string | null>(null);

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });
  allUnits = toSignal(this.unitService.getAllOccupied(), { initialValue: [] });

  unitsByProperty(propertyId: string): Unit[] {
    return this.allUnits().filter(u => u.propertyId === propertyId);
  }

  async toggleNotifications(unit: Unit) {
    if (!unit.id || this.savingUnitId()) return;
    const newValue = unit.notificationsEnabled === false;
    this.savingUnitId.set(unit.id);
    try {
      await this.unitService.update(unit.id, { notificationsEnabled: newValue });
      this.snackBar.open(
        newValue ? 'Notificaciones activadas.' : 'Notificaciones desactivadas.',
        'OK',
        { duration: 2500 }
      );
    } catch {
      this.snackBar.open('Error al guardar.', 'OK', { duration: 2500 });
    } finally {
      this.savingUnitId.set(null);
    }
  }
}
