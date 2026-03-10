import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { PropertyService } from '../../../core/services/property.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Property } from '../../../core/models/property.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PaymentFormComponent } from '../../payments/payment-form/payment-form.component';

@Component({
  selector: 'app-properties-list',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatDialogModule, MatSnackBarModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-warm-900">Inmuebles</h1>
          <p class="text-warm-500 text-sm mt-1">{{ properties().length }} propiedad(es) registrada(s)</p>
        </div>
        @if (isOwner()) {
          <a
            routerLink="/properties/new"
            class="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium shadow-sm"
          >
            <mat-icon class="text-[18px]">add</mat-icon>
            Nuevo inmueble
          </a>
        }
      </div>

      <!-- Empty state -->
      @if (properties().length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-12 text-center">
          <mat-icon class="text-warm-300 text-[56px]">apartment</mat-icon>
          <h3 class="text-warm-700 font-semibold mt-3">Sin inmuebles aún</h3>
          @if (isOwner()) {
            <p class="text-warm-400 text-sm mt-1 mb-5">Registra tu primer inmueble para comenzar</p>
            <a
              routerLink="/properties/new"
              class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
            >
              <mat-icon class="text-[18px]">add</mat-icon>
              Agregar inmueble
            </a>
          } @else {
            <p class="text-warm-400 text-sm mt-1">Aún no tienes inmuebles asignados como colaborador</p>
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
                @if (property.status === 'ocupado' && canWritePagos(property)) {
                  <button
                    (click)="openPaymentForm(property)"
                    class="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                  >
                    <mat-icon class="text-[16px]">add</mat-icon>
                    Pago
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
                  @if (isOwnerOf(property)) {
                    <button
                      (click)="confirmDelete(property)"
                      class="p-1.5 text-warm-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <mat-icon class="text-[18px]">delete</mat-icon>
                    </button>
                  }
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
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  /** Only owners can create new properties */
  isOwner = computed(() => this.authService.activeRole() === 'owner');

  /** True if user is the direct owner of this property */
  isOwnerOf(property: Property): boolean {
    return property.ownerId === this.authService.uid();
  }

  canWrite(property: Property): boolean {
    const uid = this.authService.uid();
    if (!uid) return false;
    if (property.ownerId === uid) return true;
    const perms = property.collaboratorPermissions?.[uid];
    return !perms || perms.inmueblesUnidades !== false;
  }

  canWritePagos(property: Property): boolean {
    const uid = this.authService.uid();
    if (!uid) return false;
    if (property.ownerId === uid) return true;
    const perms = property.collaboratorPermissions?.[uid];
    return !perms || perms.inmueblesPagos !== false;
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
      },
    });
  }

  confirmDelete(property: Property) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar inmueble',
        message: `¿Estás seguro de eliminar "${property.name}"? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
        danger: true,
      },
    });

    dialogRef.afterClosed().subscribe(async confirmed => {
      if (confirmed) {
        await this.propertyService.delete(property.id!);
        this.snackBar.open('Inmueble eliminado.', 'OK', { duration: 3000 });
      }
    });
  }
}
