import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { UtilityServiceService } from '../../../core/services/utility-service.service';
import { PropertyService } from '../../../core/services/property.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PermissionService } from '../../../core/auth/permissions';
import { monthLabelFromKey } from '../../../core/utils/month.util';

export interface RegisterServiceDialogData {
  /** 'YYYY-MM' */
  month: string;
  /** Preselecciona el servicio y bloquea el selector */
  serviceId?: string;
  serviceName?: string;
  /** Preselecciona la propiedad */
  propertyId?: string;
}

/**
 * Registro manual de un servicio sobre una propiedad: qué servicio es y cuánto se paga.
 * No requiere códigos de distribución.
 */
@Component({
  selector: 'app-register-service-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="p-6 w-full">
      <div class="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 class="text-lg font-semibold text-warm-900">Registrar servicio</h2>
          <p class="text-xs text-warm-500 mt-0.5 capitalize">{{ label }}</p>
        </div>
        <button (click)="close()" class="p-1.5 rounded-lg text-warm-400 hover:bg-warm-100 transition-colors">
          <mat-icon class="text-[20px]">close</mat-icon>
        </button>
      </div>

      <div class="space-y-4">
        <!-- Propiedad -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Propiedad *</label>
          <select [(ngModel)]="propertyId"
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Selecciona una propiedad…</option>
            @for (p of properties(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
          @if (properties().length === 0) {
            <p class="text-xs text-amber-600 mt-1">
              No hay propiedades disponibles sobre las que puedas gestionar servicios.
            </p>
          }
        </div>

        <!-- Servicio -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Servicio *</label>
          @if (data.serviceId) {
            <div class="px-3 py-2.5 border border-warm-200 rounded-lg text-sm bg-warm-50 text-warm-700">
              {{ data.serviceName }}
            </div>
          } @else if (creatingService()) {
            <div class="flex gap-2">
              <input [(ngModel)]="newServiceName" placeholder="Nombre del nuevo servicio"
                class="flex-1 px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <button (click)="creatingService.set(false)"
                class="px-3 py-2.5 border border-warm-200 text-warm-500 rounded-lg text-sm hover:bg-warm-50 transition-colors">
                Cancelar
              </button>
            </div>
          } @else {
            <select [(ngModel)]="serviceId"
              class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Selecciona un servicio…</option>
              @for (s of activeServices(); track s.id) {
                <option [value]="s.id">{{ s.name }}</option>
              }
            </select>
            <button (click)="creatingService.set(true)"
              class="mt-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
              + Crear un servicio nuevo
            </button>
            @if (activeServices().length === 0) {
              <p class="text-xs text-warm-500 mt-1">
                Aún no tienes servicios. Crea el primero con el enlace de arriba.
              </p>
            }
          }
        </div>

        <!-- Monto -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Suma a pagar *</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
            <input type="number" min="0" [ngModel]="amount()" (ngModelChange)="amount.set(+$event || 0)"
              placeholder="Ej: 85000"
              class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          </div>
        </div>

        <!-- Nota -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">
            Nota <span class="text-warm-400 font-normal">(opcional)</span>
          </label>
          <input [(ngModel)]="notes" placeholder="Ej: factura 4432"
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
        </div>

        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" [(ngModel)]="markPaid" class="w-4 h-4 accent-green-600 cursor-pointer">
          <span class="text-sm text-warm-600">Marcarlo como pagado ahora</span>
        </label>

        <div class="flex gap-3 pt-1">
          <button (click)="close()"
            class="flex-1 px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors">
            Cancelar
          </button>
          <button (click)="save()" [disabled]="saving() || !canSave()"
            class="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            @if (saving()) {
              <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
            }
            Guardar
          </button>
        </div>
      </div>
    </div>
  `,
})
export class RegisterServiceDialogComponent {
  private dialogRef = inject(MatDialogRef<RegisterServiceDialogComponent>);
  data: RegisterServiceDialogData = inject(MAT_DIALOG_DATA);
  private receiptService = inject(ServiceReceiptService);
  private utilityService = inject(UtilityServiceService);
  private propertyService = inject(PropertyService);
  private authService = inject(AuthService);
  private permissions = inject(PermissionService);
  private snackBar = inject(MatSnackBar);

  label = monthLabelFromKey(this.data.month);
  saving = signal(false);
  creatingService = signal(false);

  private allProperties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  /** Solo propiedades sobre las que se pueden gestionar servicios */
  properties = computed(() =>
    this.permissions.filterByPermission(this.allProperties(), 'servicios')
  );

  private services = toSignal(this.utilityService.getAll(), { initialValue: [] });
  activeServices = computed(() => this.services().filter(s => s.isActive !== false));

  propertyId = this.data.propertyId ?? '';
  serviceId = this.data.serviceId ?? '';
  newServiceName = '';
  amount = signal(0);
  notes = '';
  markPaid = false;

  canSave(): boolean {
    const hasService = this.creatingService()
      ? this.newServiceName.trim().length > 0
      : !!this.serviceId;
    return !!this.propertyId && hasService && this.amount() > 0;
  }

  async save() {
    if (!this.canSave()) return;
    this.saving.set(true);
    try {
      const property = this.properties().find(p => p.id === this.propertyId)!;
      let serviceId = this.serviceId;
      let serviceName = this.data.serviceName
        ?? this.activeServices().find(s => s.id === serviceId)?.name
        ?? '';
      let serviceIcon = this.activeServices().find(s => s.id === serviceId)?.icon;

      if (this.creatingService()) {
        serviceName = this.newServiceName.trim();
        serviceId = await this.utilityService.create({
          name: serviceName,
          icon: 'receipt_long',
          description: '',
          isActive: true,
        });
        serviceIcon = 'receipt_long';
      }

      await this.receiptService.createManual({
        propertyId: property.id!,
        propertyName: property.name,
        serviceId,
        serviceName,
        serviceIcon,
        month: this.data.month,
        amount: this.amount(),
        notes: this.notes.trim() || undefined,
        markPaid: this.markPaid,
      });

      this.snackBar.open('Servicio registrado.', 'OK', { duration: 3000, panelClass: 'snackbar-success' });
      this.dialogRef.close(true);
    } catch {
      this.snackBar.open('No se pudo registrar el servicio.', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    } finally {
      this.saving.set(false);
    }
  }

  close() {
    this.dialogRef.close();
  }
}
