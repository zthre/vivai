import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, map } from 'rxjs/operators';
import { combineLatest, of } from 'rxjs';
import { PropertyService } from '../../core/services/property.service';
import { PaymentService } from '../../core/services/payment.service';
import { ServiceReceiptService } from '../../core/services/service-receipt.service';
import { AuthService } from '../../core/auth/auth.service';
import { Property } from '../../core/models/property.model';
import { Payment } from '../../core/models/payment.model';
import { ServiceReceipt } from '../../core/models/service-receipt.model';
import { PaymentFormComponent } from '../payments/payment-form/payment-form.component';
import { PropertyReceiptsDialogComponent } from '../services/property-receipts-dialog/property-receipts-dialog.component';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatDialogModule],
  template: `
    <div class="space-y-4">
      <!-- Stats cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl p-5 border border-warm-200 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-warm-500">Propiedades</span>
            <div class="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <mat-icon class="text-primary-600 text-[20px]">apartment</mat-icon>
            </div>
          </div>
          <p class="text-3xl font-bold text-warm-900">{{ totalProperties() }}</p>
        </div>

        <div class="bg-white rounded-xl p-5 border border-warm-200 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-warm-500">Ocupadas</span>
            <div class="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
              <mat-icon class="text-green-600 text-[20px]">people</mat-icon>
            </div>
          </div>
          <p class="text-3xl font-bold text-warm-900">{{ occupiedCount() }}</p>
          <p class="text-xs text-warm-400 mt-1">de {{ totalProperties() }}</p>
        </div>

        <div class="bg-white rounded-xl p-5 border border-warm-200 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-warm-500">Disponibles</span>
            <div class="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
              <mat-icon class="text-orange-600 text-[20px]">door_open</mat-icon>
            </div>
          </div>
          <p class="text-3xl font-bold text-warm-900">{{ availableCount() }}</p>
        </div>

        <div class="bg-white rounded-xl p-5 border border-warm-200 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-warm-500">Pagado</span>
            <div class="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
              <mat-icon class="text-green-600 text-[20px]">payments</mat-icon>
            </div>
          </div>
          <p class="text-3xl font-bold text-warm-900">{{ paidThisMonth() }}<span class="text-lg text-warm-400">/{{ occupiedCount() }}</span></p>
        </div>
      </div>

      <!-- Properties table -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-warm-100 flex items-center justify-between">
          <h2 class="font-semibold text-warm-900">Propiedades</h2>
          <div class="flex items-center gap-2">
            <button (click)="prevMonth()"
              class="p-1.5 rounded-lg text-warm-400 hover:bg-warm-100 transition-colors">
              <mat-icon class="text-[20px]">chevron_left</mat-icon>
            </button>
            <span class="text-sm font-medium text-warm-700 min-w-[140px] text-center capitalize">
              {{ monthLabel() }}
            </span>
            <button (click)="nextMonth()"
              class="p-1.5 rounded-lg text-warm-400 hover:bg-warm-100 transition-colors">
              <mat-icon class="text-[20px]">chevron_right</mat-icon>
            </button>
          </div>
        </div>

        @if (properties().length === 0) {
          <div class="px-5 py-12 text-center">
            <mat-icon class="text-warm-300 text-[48px]">apartment</mat-icon>
            <p class="text-warm-400 text-sm mt-2">No hay propiedades registradas</p>
          </div>
        } @else {
          <!-- Mobile cards -->
          <div class="divide-y divide-warm-100 lg:hidden">
            @for (prop of properties(); track prop.id) {
              <div class="p-4 space-y-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <p class="font-semibold text-warm-900 truncate">{{ prop.name }}</p>
                      @if (prop.status === 'ocupado') {
                        <span class="text-[10px] px-1.5 py-0.5 bg-warm-200 text-warm-700 rounded-full font-medium">Ocupado</span>
                      } @else {
                        <span class="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">Disponible</span>
                      }
                    </div>
                    @if (prop.tags?.length) {
                      <div class="flex flex-wrap gap-1 mt-1">
                        @for (tag of prop.tags; track tag) {
                          <span class="text-[10px] px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded-full">{{ tag }}</span>
                        }
                      </div>
                    }
                    @if (prop.tenantName) {
                      <p class="text-xs text-warm-500 mt-1">{{ prop.tenantName }}</p>
                    }
                    @if (prop.tenantRentPrice) {
                      <p class="text-sm font-semibold text-primary-600 mt-0.5">{{ prop.tenantRentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}/mes</p>
                    }
                  </div>
                  <div class="flex-shrink-0">
                    @if (hasPaymentThisMonth(prop)) {
                      <span class="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Pagado</span>
                    } @else if (prop.paymentFree && prop.status === 'ocupado') {
                      <span class="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Sin cobro</span>
                    } @else if (prop.status === 'ocupado') {
                      <span class="text-[10px] px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">Pendiente</span>
                    }
                  </div>
                </div>

                <!-- Payment CTA -->
                @if (prop.status === 'ocupado' && !prop.paymentFree && canWritePagos(prop)) {
                  @if (hasPaymentThisMonth(prop)) {
                    <button (click)="openEditPayment(prop)"
                      class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors">
                      <mat-icon class="text-[18px]">check_circle</mat-icon>
                      Recibo pagado — ver detalle
                    </button>
                  } @else {
                    <button (click)="openPayment(prop)"
                      class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors shadow-sm">
                      <mat-icon class="text-[18px]">receipt_long</mat-icon>
                      Registrar pago del mes
                    </button>
                  }
                }

                <!-- Service receipts CTA -->
                @if (canWriteServicios(prop)) {
                  @if (receiptSummary(prop).total > 0) {
                    @if (receiptSummary(prop).paid === receiptSummary(prop).total) {
                      <button (click)="openServiceReceipts(prop)"
                        class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors">
                        <mat-icon class="text-[18px]">check_circle</mat-icon>
                        Servicios al día
                        <span class="text-[10px] px-1.5 py-0.5 bg-green-200 text-green-800 rounded-full">{{ receiptSummary(prop).total }}</span>
                      </button>
                    } @else {
                      <button (click)="openServiceReceipts(prop)"
                        class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">
                        <mat-icon class="text-[18px]">bolt</mat-icon>
                        Pagar servicios
                        <span class="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">{{ receiptSummary(prop).total - receiptSummary(prop).paid }} pendientes</span>
                      </button>
                    }
                  } @else {
                    <button (click)="openServiceReceipts(prop)"
                      class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-warm-50 text-warm-500 border border-warm-200 rounded-lg text-sm font-medium hover:bg-warm-100 transition-colors">
                      <mat-icon class="text-[18px]">bolt</mat-icon>
                      Sin servicios este mes
                    </button>
                  }
                }

                <div class="flex items-center gap-2 flex-wrap">
                  <a [routerLink]="['/properties', prop.id]"
                    class="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">
                    <mat-icon class="text-[14px]">visibility</mat-icon> Detalle
                  </a>
                  @if (prop.isPublic) {
                    <a [routerLink]="['/inmueble', prop.id]"
                      class="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5">
                      <mat-icon class="text-[14px]">storefront</mat-icon> Marketplace
                    </a>
                  }
                  @if (canEdit(prop)) {
                    <a [routerLink]="['/properties', prop.id, 'edit']"
                      class="text-xs text-warm-500 hover:text-warm-700 font-medium flex items-center gap-0.5">
                      <mat-icon class="text-[14px]">edit_note</mat-icon> Editar
                    </a>
                  }
                  @if (prop.tenantPhone) {
                    <a [href]="whatsappLink(prop)" target="_blank" rel="noopener"
                      class="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-0.5">
                      <mat-icon class="text-[14px]">chat</mat-icon> WhatsApp
                    </a>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Desktop table -->
          <div class="hidden lg:block overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-warm-50 text-warm-500 text-xs uppercase tracking-wider">
                  <th class="text-left px-5 py-3 font-semibold">Propiedad</th>
                  <th class="text-left px-5 py-3 font-semibold">Inquilino</th>
                  <th class="text-right px-5 py-3 font-semibold">Arriendo</th>
                  <th class="text-center px-5 py-3 font-semibold">Estado</th>
                  <th class="text-center px-5 py-3 font-semibold">Pago mes</th>
                  <th class="text-center px-5 py-3 font-semibold">Servicios</th>
                  <th class="text-right px-5 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-warm-100">
                @for (prop of properties(); track prop.id) {
                  <tr class="hover:bg-warm-50/50 transition-colors">
                    <!-- Propiedad -->
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-2 min-w-0">
                        <div class="min-w-0">
                          <p class="font-medium text-warm-900 truncate">{{ prop.name }}</p>
                          @if (prop.tags?.length) {
                            <div class="flex flex-wrap gap-1 mt-0.5">
                              @for (tag of prop.tags; track tag) {
                                <span class="text-[10px] px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded-full">{{ tag }}</span>
                              }
                            </div>
                          }
                        </div>
                      </div>
                    </td>
                    <!-- Inquilino -->
                    <td class="px-5 py-3 text-warm-600">
                      @if (prop.tenantName) {
                        <div class="flex items-center gap-2">
                          <span class="truncate">{{ prop.tenantName }}</span>
                          @if (prop.tenantPhone) {
                            <a [href]="whatsappLink(prop)" target="_blank" rel="noopener"
                              class="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center hover:bg-green-200 transition-colors"
                              title="WhatsApp">
                              <mat-icon class="text-green-600 text-[14px]">chat</mat-icon>
                            </a>
                          }
                        </div>
                      } @else {
                        <span class="text-warm-300">—</span>
                      }
                    </td>
                    <!-- Arriendo -->
                    <td class="px-5 py-3 text-right font-medium text-warm-800">
                      @if (prop.tenantRentPrice) {
                        {{ prop.tenantRentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}
                      } @else {
                        <span class="text-warm-300">—</span>
                      }
                    </td>
                    <!-- Estado -->
                    <td class="px-5 py-3 text-center">
                      @if (prop.status === 'ocupado') {
                        <span class="text-xs px-2 py-0.5 bg-warm-200 text-warm-700 rounded-full font-medium">Ocupado</span>
                      } @else {
                        <span class="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">Disponible</span>
                      }
                    </td>
                    <!-- Pago mes -->
                    <td class="px-5 py-3 text-center">
                      @if (prop.status !== 'ocupado') {
                        <span class="text-warm-300">—</span>
                      } @else if (prop.paymentFree) {
                        <span class="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Sin cobro</span>
                      } @else if (hasPaymentThisMonth(prop)) {
                        <button (click)="openEditPayment(prop)"
                          class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                          [class.pointer-events-none]="!canWritePagos(prop)">
                          <mat-icon class="text-[16px]">check_circle</mat-icon>
                          Pagado
                        </button>
                      } @else if (canWritePagos(prop)) {
                        <button (click)="openPayment(prop)"
                          class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-lg text-xs font-medium hover:bg-primary-600 transition-colors shadow-sm">
                          <mat-icon class="text-[16px]">receipt_long</mat-icon>
                          Registrar pago
                        </button>
                      } @else {
                        <span class="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">Pendiente</span>
                      }
                    </td>
                    <!-- Servicios -->
                    <td class="px-5 py-3 text-center">
                      @if (canWriteServicios(prop)) {
                        @if (receiptSummary(prop).total > 0) {
                          @if (receiptSummary(prop).paid === receiptSummary(prop).total) {
                            <button (click)="openServiceReceipts(prop)"
                              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors">
                              <mat-icon class="text-[16px]">check_circle</mat-icon>
                              {{ receiptSummary(prop).total }} al día
                            </button>
                          } @else {
                            <button (click)="openServiceReceipts(prop)"
                              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                              <mat-icon class="text-[16px]">bolt</mat-icon>
                              {{ receiptSummary(prop).paid }}/{{ receiptSummary(prop).total }}
                            </button>
                          }
                        } @else {
                          <span class="text-warm-300 text-xs">Sin recibos</span>
                        }
                      } @else {
                        <span class="text-warm-300">—</span>
                      }
                    </td>
                    <!-- Acciones -->
                    <td class="px-5 py-3">
                      <div class="flex items-center justify-end gap-1">
                        <a [routerLink]="['/properties', prop.id]"
                          class="p-1.5 text-warm-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Ver detalle">
                          <mat-icon class="text-[18px]">visibility</mat-icon>
                        </a>
                        @if (prop.isPublic) {
                          <a [routerLink]="['/inmueble', prop.id]"
                            class="p-1.5 text-warm-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Ver en marketplace">
                            <mat-icon class="text-[18px]">storefront</mat-icon>
                          </a>
                        }
                        @if (canEdit(prop)) {
                          <a [routerLink]="['/properties', prop.id, 'edit']"
                            class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors"
                            title="Editar propiedad">
                            <mat-icon class="text-[18px]">edit_note</mat-icon>
                          </a>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
})
export class DashboardComponent {
  private propertyService = inject(PropertyService);
  private paymentService = inject(PaymentService);
  private receiptService = inject(ServiceReceiptService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);

  selectedMonth = signal<Date>(startOfMonth(new Date()));

  private selectedMonthStr = computed(() => {
    const d = this.selectedMonth();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  monthLabel = computed(() => {
    const d = this.selectedMonth();
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  });

  isCurrentMonth = computed(() => {
    const now = new Date();
    const sel = this.selectedMonth();
    return sel.getFullYear() === now.getFullYear() && sel.getMonth() === now.getMonth();
  });

  isFutureMonth = computed(() => {
    const now = new Date();
    const sel = this.selectedMonth();
    return sel.getFullYear() > now.getFullYear() ||
      (sel.getFullYear() === now.getFullYear() && sel.getMonth() > now.getMonth());
  });

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  /** Service receipts for the selected month, queried per property */
  private currentMonthReceipts = toSignal(
    combineLatest([toObservable(this.properties), toObservable(this.selectedMonthStr)]).pipe(
      switchMap(([props, monthStr]) => {
        const withId = props.filter(p => p.id);
        if (withId.length === 0) return of([] as ServiceReceipt[]);
        return combineLatest(
          withId.map(p => this.receiptService.getByPropertyAndMonth(p.id!, monthStr))
        ).pipe(
          map(arrays => arrays.flat())
        );
      })
    ),
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

  /** Payments for the selected month, queried per occupied property */
  private currentMonthPayments = toSignal(
    combineLatest([toObservable(this.properties), toObservable(this.selectedMonth)]).pipe(
      switchMap(([props, selMonth]) => {
        const occupied = props.filter(p => p.status === 'ocupado' && p.id);
        if (occupied.length === 0) return of([] as Payment[]);
        const monthStart = startOfMonth(selMonth).getTime();
        const monthEnd = endOfMonth(selMonth).getTime();
        return combineLatest(
          occupied.map(p => this.paymentService.getByProperty(p.id!))
        ).pipe(
          map(arrays => arrays.flat().filter(payment => {
            const payDate = payment.date?.toDate?.()?.getTime?.();
            return payDate && payDate >= monthStart && payDate <= monthEnd;
          }))
        );
      })
    ),
    { initialValue: [] }
  );

  private paymentByProperty = computed(() => {
    const m = new Map<string, Payment>();
    for (const p of this.currentMonthPayments()) {
      if (!m.has(p.propertyId)) m.set(p.propertyId, p);
    }
    return m;
  });

  totalProperties = computed(() => this.properties().length);
  occupiedCount = computed(() => this.properties().filter(p => p.status === 'ocupado').length);
  availableCount = computed(() => this.totalProperties() - this.occupiedCount());
  paidThisMonth = computed(() => {
    const map = this.paymentByProperty();
    return this.properties().filter(p =>
      p.status === 'ocupado' && (p.paymentFree || map.has(p.id!))
    ).length;
  });

  firstName = computed(() => {
    const name = this.authService.currentUser()?.displayName ?? '';
    return name.split(' ')[0];
  });

  canCreate = computed(() => {
    if (this.authService.activeRole() === 'owner') return true;
    const uid = this.authService.uid();
    if (!uid) return false;
    return this.properties().some(p => {
      const perms = p.collaboratorPermissions?.[uid];
      return !perms || perms.inmueblesUnidades !== false;
    });
  });

  hasPaymentThisMonth(prop: Property): boolean {
    return this.paymentByProperty().has(prop.id!);
  }

  getPaymentThisMonth(prop: Property): Payment | undefined {
    return this.paymentByProperty().get(prop.id!);
  }

  canWritePagos(prop: Property): boolean {
    const uid = this.authService.uid();
    if (!uid) return false;
    if (prop.ownerId === uid) return true;
    const perms = prop.collaboratorPermissions?.[uid];
    return !perms || perms.inmueblesPagos !== false;
  }

  canEdit(prop: Property): boolean {
    const uid = this.authService.uid();
    if (!uid) return false;
    if (prop.ownerId === uid) return true;
    const perms = prop.collaboratorPermissions?.[uid];
    return !perms || perms.inmueblesUnidades !== false;
  }

  whatsappLink(prop: Property): string {
    const phone = prop.tenantPhone ?? '';
    const text = encodeURIComponent(`Hola ${prop.tenantName ?? ''}, te escribo respecto a ${prop.name}.`);
    return `https://wa.me/${phone}?text=${text}`;
  }

  receiptSummary(prop: Property): { total: number; paid: number } {
    return this.receiptSummaryByProperty().get(prop.id!) ?? { total: 0, paid: 0 };
  }

  canWriteServicios(prop: Property): boolean {
    const uid = this.authService.uid();
    if (!uid) return false;
    if (prop.ownerId === uid) return true;
    const perms = prop.collaboratorPermissions?.[uid];
    return !perms || perms.servicios !== false;
  }

  prevMonth() {
    const d = this.selectedMonth();
    this.selectedMonth.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  nextMonth() {
    const d = this.selectedMonth();
    this.selectedMonth.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  openServiceReceipts(prop: Property) {
    this.dialog.open(PropertyReceiptsDialogComponent, {
      width: '480px',
      data: {
        propertyId: prop.id,
        propertyName: prop.name,
        month: this.selectedMonthStr(),
      },
    });
  }

  openPayment(prop: Property) {
    this.dialog.open(PaymentFormComponent, {
      width: '420px',
      data: {
        propertyId: prop.id,
        rentPrice: prop.tenantRentPrice ?? prop.rentPrice ?? null,
        label: prop.name,
        defaultDate: this.selectedMonth(),
      },
    });
  }

  openEditPayment(prop: Property) {
    const payment = this.getPaymentThisMonth(prop);
    this.dialog.open(PaymentFormComponent, {
      width: '420px',
      data: {
        propertyId: prop.id,
        label: prop.name,
        payment,
      },
    });
  }
}
