import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { DialogService } from '../../../core/services/dialog.service';
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
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatDialogModule, MatSnackBarModule, ListingStatusComponent],
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

      <!-- Pestañas y búsqueda -->
      @if (properties().length > 0) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-3 flex flex-wrap items-center gap-3">
          <div class="flex bg-warm-100 p-1 rounded-lg">
            @for (t of tabs; track t.key) {
              <button (click)="activeTab.set(t.key)"
                class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                [class.bg-white]="activeTab() === t.key"
                [class.text-warm-900]="activeTab() === t.key"
                [class.shadow-sm]="activeTab() === t.key"
                [class.text-warm-500]="activeTab() !== t.key">
                {{ t.label }}
                <span class="ml-1 text-xs text-warm-400">{{ countFor(t.key) }}</span>
              </button>
            }
          </div>

          <div class="relative flex-1 min-w-[12rem]">
            <mat-icon class="absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-400 text-[18px]">search</mat-icon>
            <input [ngModel]="search()" (ngModelChange)="search.set($event)"
              placeholder="Buscar por nombre, dirección, inquilino o etiqueta"
              class="w-full pl-9 pr-8 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            @if (search()) {
              <button (click)="search.set('')"
                class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-warm-400 hover:text-warm-600 rounded">
                <mat-icon class="text-[16px]">close</mat-icon>
              </button>
            }
          </div>
        </div>

        @if (visibleProperties().length === 0) {
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-10 text-center">
            <mat-icon class="text-warm-300 text-[40px]">search_off</mat-icon>
            <p class="text-warm-500 text-sm mt-2">
              @if (search()) {
                Ninguna propiedad coincide con «{{ search() }}»
              } @else {
                No hay propiedades en esta pestaña
              }
            </p>
          </div>
        }
      }

      <!-- Properties grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        @for (property of visibleProperties(); track property.id) {
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm hover:border-warm-300 transition-colors flex flex-col">
            <!--
              La cabecera entera es el enlace al detalle: antes había que acertarle
              a «Ver detalle», un enlace de texto que competía con las otras dos
              acciones. Ahora el gesto obvio —pulsar la tarjeta— hace lo obvio, y
              el pie queda solo para las acciones que escriben.
            -->
            <a [routerLink]="['/properties', property.id]" class="block p-5 flex-1 group">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <mat-icon class="text-primary-600 text-[22px]">{{ iconForType(property.type) }}</mat-icon>
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <h3 class="font-semibold text-warm-900 truncate group-hover:text-primary-700 transition-colors">
                      {{ property.name }}
                    </h3>
                    <!-- Un solo distintivo de estado: el tipo va como texto, que no compite -->
                    @if (property.status === 'ocupado') {
                      <span class="flex-shrink-0 text-xs px-2 py-0.5 bg-warm-100 text-warm-600 rounded-full font-medium">Ocupado</span>
                    } @else {
                      <span class="flex-shrink-0 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">Disponible</span>
                    }
                  </div>

                  <p class="text-xs text-warm-400 truncate mt-0.5">
                    <span class="capitalize">{{ property.type }}</span> · {{ property.address }}
                  </p>

                  <!-- Precio e inquilino, la información que se busca de un vistazo -->
                  <div class="mt-3 space-y-1">
                    @if (displayPrice(property); as price) {
                      <p class="text-base font-semibold text-warm-900">
                        {{ price | currency:'COP':'symbol-narrow':'1.0-0' }}
                        <span class="text-xs font-normal text-warm-400">{{ priceSuffix(property) }}</span>
                      </p>
                    } @else {
                      <p class="text-sm text-warm-300">Sin precio definido</p>
                    }

                    @if (property.status === 'ocupado') {
                      <p class="text-sm text-warm-500 flex items-center gap-1.5 truncate">
                        <mat-icon class="text-[15px] flex-shrink-0">person</mat-icon>
                        {{ property.tenantName || 'Inquilino sin nombre' }}
                      </p>
                    }
                  </div>

                  <!-- Destino y etiquetas, en una sola fila -->
                  @if (property.isForRent || property.isForSale || property.tags?.length) {
                    <div class="mt-3 flex flex-wrap gap-1.5">
                      @if (property.isForRent) {
                        <span class="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">En arriendo</span>
                      }
                      @if (property.isForSale) {
                        <span class="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">En venta</span>
                      }
                      @for (tag of property.tags; track tag) {
                        <span class="text-xs px-2 py-0.5 bg-warm-100 text-warm-500 rounded-full">{{ tag }}</span>
                      }
                    </div>
                  }
                </div>
              </div>

              @if (listingVisible(property)) {
                <div class="mt-3">
                  <app-listing-status [property]="property" [canWrite]="canWrite(property)" />
                </div>
              }
            </a>

            <!--
              Pie: solo lo que escribe. La acción principal del mes destaca; lo
              destructivo y lo de editar se quedan a la derecha, discretos.
            -->
            <div class="border-t border-warm-100 px-4 py-2.5 flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                @if (property.status === 'ocupado' && !property.paymentFree && canWritePagos(property)) {
                  @if (hasPaymentThisMonth(property)) {
                    <button (click)="openEditPaymentForm(property)"
                      class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors">
                      <mat-icon class="text-[14px]">check_circle</mat-icon>
                      Arriendo pagado
                    </button>
                  } @else {
                    <button (click)="openPaymentForm(property)"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-primary-500 hover:bg-primary-600 transition-colors">
                      <mat-icon class="text-[14px]">add</mat-icon>
                      Registrar pago
                    </button>
                  }
                }

                @if (canWriteServicios(property)) {
                  <button (click)="openServices(property)"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors"
                    [class]="servicesPending(property) > 0
                      ? 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                      : 'text-warm-500 hover:bg-warm-100'">
                    <mat-icon class="text-[14px]">bolt</mat-icon>
                    @if (servicesPending(property) > 0) {
                      {{ servicesPending(property) }} servicio(s)
                    } @else if (receiptSummary(property).total > 0) {
                      Servicios al día
                    } @else {
                      Servicios
                    }
                  </button>
                }
              </div>

              @if (canWrite(property)) {
                <div class="flex items-center gap-0.5 flex-shrink-0">
                  <a [routerLink]="['/properties', property.id, 'edit']" title="Editar propiedad"
                    class="p-1.5 text-warm-300 hover:text-warm-700 hover:bg-warm-100 rounded-md transition-colors">
                    <mat-icon class="text-[17px]">edit</mat-icon>
                  </a>
                  <button (click)="confirmDelete(property)" title="Eliminar propiedad"
                    class="p-1.5 text-warm-300 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                    <mat-icon class="text-[17px]">delete_outline</mat-icon>
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
  private dialog = inject(DialogService);
  private snackBar = inject(MatSnackBar);

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  // ── Pestañas y búsqueda ───────────────────────────────────────────────────

  /**
   * «Todas» no sobra: la mayoría de propiedades están ocupadas y no llevan
   * `isForRent` ni `isForSale` marcados, así que filtrar solo por esos dos las
   * dejaría invisibles. Una propiedad marcada para ambas cosas sale en las dos
   * pestañas, que es lo que se espera.
   */
  readonly tabs = [
    { key: 'todas' as const, label: 'Todas' },
    { key: 'arriendo' as const, label: 'En arriendo' },
    { key: 'venta' as const, label: 'En venta' },
  ];

  activeTab = signal<'todas' | 'arriendo' | 'venta'>('todas');
  search = signal('');

  private matchesTab(p: Property, tab: 'todas' | 'arriendo' | 'venta'): boolean {
    if (tab === 'arriendo') return !!p.isForRent;
    if (tab === 'venta') return !!p.isForSale;
    return true;
  }

  /** Busca en lo que uno recuerda de una propiedad, no solo en el nombre. */
  private matchesSearch(p: Property, term: string): boolean {
    if (!term) return true;
    const haystack = [p.name, p.address, p.tenantName, ...(p.tags ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return term
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every(word => haystack.includes(word));
  }

  countFor(tab: 'todas' | 'arriendo' | 'venta'): number {
    return this.properties().filter(p => this.matchesTab(p, tab)).length;
  }

  visibleProperties = computed(() => {
    const tab = this.activeTab();
    const term = this.search().trim();
    return this.properties().filter(p => this.matchesTab(p, tab) && this.matchesSearch(p, term));
  });

  /**
   * El precio que tiene sentido enseñar.
   *
   * Si está ocupada, lo que paga el inquilino; si está en venta y no ocupada, el
   * de venta; si no, el de arriendo publicado. Antes solo se mostraba
   * `tenantRentPrice`, así que una propiedad disponible o sin inquilino asignado
   * aparecía sin ninguna cifra.
   */
  displayPrice(p: Property): number | null {
    if (p.status === 'ocupado') return p.tenantRentPrice ?? p.rentPrice ?? null;
    if (p.isForSale && !p.isForRent) return p.salePrice ?? null;
    return p.rentPrice ?? p.salePrice ?? null;
  }

  priceSuffix(p: Property): string {
    if (p.status === 'ocupado') return '/mes';
    if (p.isForSale && !p.isForRent) return '';
    return p.rentPrice ? '/mes' : '';
  }

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
