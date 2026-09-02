import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { PropertyService } from '../../../core/services/property.service';
import { PaymentService } from '../../../core/services/payment.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Property } from '../../../core/models/property.model';
import { Payment } from '../../../core/models/payment.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ListingStatusComponent } from '../../../shared/components/listing-status/listing-status.component';
import { PaymentFormComponent } from '../../payments/payment-form/payment-form.component';
import { MonthSettlementDialogComponent } from '../../services/month-settlement/month-settlement-dialog.component';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { ServiceReceipt } from '../../../core/models/service-receipt.model';
import { listingState } from '../../../core/services/listing.util';
import { PermissionService } from '../../../core/auth/permissions';
import { currentMonthKey } from '../../../core/utils/month.util';

@Component({
  selector: 'app-properties-list',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatDialogModule, MatSnackBarModule, ListingStatusComponent],
  template: `
    <div class="space-y-4">
      @if (canCreate()) {
        <div class="flex justify-end">
          <a
            routerLink="/properties/new"
            class="flex items-center gap-1.5 px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-xs font-medium shadow-sm"
          >
            <mat-icon class="text-[16px]">add</mat-icon>
            Nueva
          </a>
        </div>
      }

      <!-- Empty state -->
      @if (properties().length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-12 text-center">
          <mat-icon class="text-warm-300 text-[56px]">apartment</mat-icon>
          <h3 class="text-warm-700 font-semibold mt-3">Sin propiedades aún</h3>
          @if (canCreate()) {
            <p class="text-warm-400 text-sm mt-1 mb-5">Registra tu primera propiedad para comenzar</p>
            <a
              routerLink="/properties/new"
              class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
            >
              <mat-icon class="text-[18px]">add</mat-icon>
              Agregar
            </a>
          } @else {
            <p class="text-warm-400 text-sm mt-1">Aún no tienes propiedades asignadas como colaborador</p>
          }
        </div>
      }

      <!-- Properties grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        @for (property of properties(); track property.id) {
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm hover:shadow-md transition-shadow">
            <!-- Card header -->
            <div class="p-5">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <mat-icon class="text-primary-600 text-[22px]">{{ iconForType(property.type) }}</mat-icon>
                  </div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-warm-900 truncate">{{ property.name }}</h3>
                    <p class="text-xs text-warm-400 truncate">{{ property.address }}</p>
                    @if (property.tenantRentPrice) {
                      <p class="text-sm font-semibold text-primary-600 mt-0.5">
                        {{ property.tenantRentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}/mes
                      </p>
                    }
                  </div>
                </div>
                <div class="flex flex-col items-end gap-1 flex-shrink-0">
                  <span class="text-xs px-2 py-0.5 bg-warm-100 text-warm-600 rounded-full capitalize">
                    {{ property.type }}
                  </span>
                  @if (property.status === 'ocupado') {
                    <span class="text-xs px-2 py-0.5 bg-warm-200 text-warm-700 rounded-full font-medium">Ocupado</span>
                  } @else if (property.status === 'disponible') {
                    <span class="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">Disponible</span>
                  }
                </div>
              </div>

              <!-- Status + tenant + listing badges -->
              <div class="mt-4 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 text-sm text-warm-500">
                  @if (property.status === 'ocupado') {
                    <mat-icon class="text-[16px]">person</mat-icon>
                    <span>{{ property.tenantName || 'Ocupado' }}</span>
                  } @else {
                    <mat-icon class="text-[16px]">home</mat-icon>
                    <span>Disponible</span>
                  }
                </div>
                @if (property.isPublic && (property.isForRent || property.isForSale)) {
                  <div class="flex gap-1">
                    @if (property.isForRent) {
                      <span class="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">En renta</span>
                    }
                    @if (property.isForSale) {
                      <span class="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">En venta</span>
                    }
                  </div>
                }
              </div>

              <!-- Estado de la publicación en el marketplace -->
              @if (listingVisible(property)) {
                <div class="mt-3">
                  <app-listing-status [property]="property" [canWrite]="canWrite(property)" />
                </div>
              }

              <!-- Tags -->
              @if (property.tags?.length) {
                <div class="mt-3 flex flex-wrap gap-1.5">
                  @for (tag of property.tags; track tag) {
                    <span class="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full font-medium">{{ tag }}</span>
                  }
                </div>
              }
            </div>

            <!-- Card actions -->
            <div class="border-t border-warm-100 px-5 py-3 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <a
                  [routerLink]="['/properties', property.id]"
                  class="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                >
                  Ver detalle
                  <mat-icon class="text-[16px]">arrow_forward</mat-icon>
                </a>
                @if (property.status === 'ocupado' && !property.paymentFree && canWritePagos(property)) {
                  @if (hasPaymentThisMonth(property)) {
                    <button
                      (click)="openEditPaymentForm(property)"
                      class="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      <mat-icon class="text-[16px]">edit</mat-icon>
                      Editar Pago
                    </button>
                  } @else {
                    <button
                      (click)="openPaymentForm(property)"
                      class="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                    >
                      <mat-icon class="text-[16px]">add</mat-icon>
                      Pagar
                    </button>
                  }
                }
                @if (canWriteServicios(property)) {
                  <button
                    (click)="openServices(property)"
                    class="text-sm font-medium flex items-center gap-1"
                    [class.text-blue-600]="servicesPending(property) > 0"
                    [class.hover:text-blue-700]="servicesPending(property) > 0"
                    [class.text-warm-500]="servicesPending(property) === 0"
                    [class.hover:text-warm-700]="servicesPending(property) === 0"
                  >
                    <mat-icon class="text-[16px]">bolt</mat-icon>
                    @if (servicesPending(property) > 0) {
                      Pagar servicios ({{ servicesPending(property) }})
                    } @else if (receiptSummary(property).total > 0) {
                      Servicios al día
                    } @else {
                      Registrar servicio
                    }
                  </button>
                }
              </div>
              @if (canWrite(property)) {
                <div class="flex items-center gap-1">
                  <a
                    [routerLink]="['/properties', property.id, 'edit']"
                    class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors"
                  >
                    <mat-icon class="text-[18px]">edit</mat-icon>
                  </a>
                  <button
                    (click)="confirmDelete(property)"
                    class="p-1.5 text-warm-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <mat-icon class="text-[18px]">delete</mat-icon>
                  </button>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class PropertiesListComponent {
  private propertyService = inject(PropertyService);
  private paymentService = inject(PaymentService);
  private receiptService = inject(ServiceReceiptService);
  private authService = inject(AuthService);
  private permissions = inject(PermissionService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  /**
   * Pagos y recibos del mes en curso, en todo el círculo: una consulta cada uno.
   *
   * Antes se abría una consulta por propiedad, y la de pagos traía además el
   * historial COMPLETO de cada una para filtrar el mes en memoria.
   */
  private currentMonthPayments = toSignal(
    this.paymentService.getByCircleAndPeriod(currentMonthKey()),
    { initialValue: [] as Payment[] }
  );

  private currentMonthReceipts = toSignal(
    this.receiptService.getByCircleAndMonth(currentMonthKey()),
    { initialValue: [] as ServiceReceipt[] }
  );

  /** Map of propertyId → { total, paid } */
  private receiptSummaryByProperty = computed(() => {
    const m = new Map<string, { total: number; paid: number }>();
    for (const r of this.currentMonthReceipts()) {
      const entry = m.get(r.propertyId) ?? { total: 0, paid: 0 };
      entry.total++;
      if (r.isPaid) entry.paid++;
      m.set(r.propertyId, entry);
    }
    return m;
  });

  /** Map of propertyId → Payment for the current month */
  private paymentByProperty = computed(() => {
    const map = new Map<string, Payment>();
    for (const p of this.currentMonthPayments()) {
      if (!map.has(p.propertyId)) map.set(p.propertyId, p);
    }
    return map;
  });

  /** Check if a property has a payment this month */
  hasPaymentThisMonth(property: Property): boolean {
    return this.paymentByProperty().has(property.id!);
  }

  /** Get the payment for a property this month */
  getPaymentThisMonth(property: Property): Payment | undefined {
    return this.paymentByProperty().get(property.id!);
  }

  /** Only owners can create new properties */
  isOwner = computed(() => this.authService.activeRole() === 'owner');

  /** Owner or colaborador with inmueblesUnidades permission */
  canCreate = computed(() =>
    this.isOwner() || this.permissions.canOnAny(this.properties(), 'inmueblesUnidades')
  );

  /** True if user is the direct owner of this property */
  isOwnerOf(property: Property): boolean {
    return this.permissions.isOwnerOf(property);
  }

  canWrite(property: Property): boolean {
    return this.permissions.can(property, 'inmueblesUnidades');
  }

  canWritePagos(property: Property): boolean {
    return this.permissions.can(property, 'inmueblesPagos');
  }

  canWriteServicios(property: Property): boolean {
    return this.permissions.can(property, 'servicios');
  }

  listingVisible(property: Property): boolean {
    return listingState(property) !== 'none';
  }

  receiptSummary(property: Property): { total: number; paid: number } {
    return this.receiptSummaryByProperty().get(property.id!) ?? { total: 0, paid: 0 };
  }

  servicesPending(property: Property): number {
    const s = this.receiptSummary(property);
    return s.total - s.paid;
  }

  openServices(property: Property) {
    this.dialog.open(MonthSettlementDialogComponent, {
      width: '520px',
      maxHeight: '90vh',
      data: {
        property,
        month: currentMonthKey(),
        canWritePagos: this.canWritePagos(property),
        canWriteServicios: this.canWriteServicios(property),
      },
    });
  }

  iconForType(type: string): string {
    const icons: Record<string, string> = {
      apartamento: 'apartment',
      casa: 'house',
      local: 'store',
      bodega: 'warehouse',
    };
    return icons[type] ?? 'apartment';
  }

  openPaymentForm(property: Property) {
    this.dialog.open(PaymentFormComponent, {
      width: '420px',
      data: {
        propertyId: property.id,
        rentPrice: property.tenantRentPrice ?? property.rentPrice ?? null,
        label: property.name,
        defaultDate: new Date(),
      },
    });
  }

  openEditPaymentForm(property: Property) {
    const payment = this.getPaymentThisMonth(property);
    this.dialog.open(PaymentFormComponent, {
      width: '420px',
      data: {
        propertyId: property.id,
        label: property.name,
        payment,
      },
    });
  }

  confirmDelete(property: Property) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar propiedad',
        message: `¿Estás seguro de eliminar "${property.name}"? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
        danger: true,
      },
    });

    dialogRef.afterClosed().subscribe(async confirmed => {
      if (confirmed) {
        await this.propertyService.delete(property.id!);
        this.snackBar.open('Propiedad eliminada.', 'OK', { duration: 3000 });
      }
    });
  }
}
