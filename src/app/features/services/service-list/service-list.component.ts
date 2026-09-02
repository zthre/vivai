import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { DialogService } from '../../../core/services/dialog.service';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { UtilityServiceService } from '../../../core/services/utility-service.service';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { PropertyService } from '../../../core/services/property.service';
import { ServiceReceipt } from '../../../core/models/service-receipt.model';
import { RegisterServiceDialogComponent } from '../register-service/register-service-dialog.component';
import { PermissionService } from '../../../core/auth/permissions';
import { addMonths, monthKey, monthLabel, startOfMonth } from '../../../core/utils/month.util';

@Component({
  selector: 'app-service-list',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatDialogModule],
  template: `
    <div class="space-y-4">
      <!-- Cabecera: mes + acciones -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div class="flex items-center gap-3">
            <button (click)="prevMonth()" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
              <mat-icon>chevron_left</mat-icon>
            </button>
            <span class="text-sm font-semibold text-warm-800 min-w-[130px] text-center capitalize">{{ monthLabel() }}</span>
            <button (click)="nextMonth()" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
              <mat-icon>chevron_right</mat-icon>
            </button>
          </div>

          <div class="flex items-center gap-2">
            @if (canWrite()) {
              <button (click)="openRegister()"
                class="flex items-center gap-1.5 px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-xs font-medium shadow-sm">
                <mat-icon class="text-[16px]">add</mat-icon>
                Registrar servicio
              </button>
              <a routerLink="/services/new"
                class="flex items-center gap-1.5 px-3 py-2 border border-warm-200 text-warm-600 rounded-lg hover:bg-warm-50 transition-colors text-xs font-medium">
                <mat-icon class="text-[16px]">tune</mat-icon>
                Nuevo tipo de servicio
              </a>
            }
          </div>
        </div>

        <!-- KPIs del mes -->
        <div class="grid grid-cols-3 gap-3 mt-4">
          <div class="p-3 rounded-lg bg-warm-50 border border-warm-100">
            <p class="text-xs text-warm-500">Total del mes</p>
            <p class="text-lg font-bold text-warm-900 mt-0.5">{{ monthTotal() | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
          </div>
          <div class="p-3 rounded-lg bg-green-50 border border-green-100">
            <p class="text-xs text-green-700">Pagado</p>
            <p class="text-lg font-bold text-green-700 mt-0.5">{{ monthPaid() | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
          </div>
          <div class="p-3 rounded-lg border"
            [class.bg-red-50]="monthPending() > 0"
            [class.border-red-100]="monthPending() > 0"
            [class.bg-warm-50]="monthPending() === 0"
            [class.border-warm-100]="monthPending() === 0">
            <p class="text-xs" [class.text-red-600]="monthPending() > 0" [class.text-warm-500]="monthPending() === 0">Pendiente</p>
            <p class="text-lg font-bold mt-0.5"
              [class.text-red-600]="monthPending() > 0"
              [class.text-warm-900]="monthPending() === 0">
              {{ monthPending() | currency:'COP':'symbol-narrow':'1.0-0' }}
            </p>
          </div>
        </div>
      </div>

      @if (!services()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else if (services()!.length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-12 text-center">
          <mat-icon class="text-warm-300 text-[56px]">receipt_long</mat-icon>
          <h3 class="text-warm-700 font-semibold mt-3">Sin servicios</h3>
          @if (canWrite()) {
            <p class="text-warm-400 text-sm mt-1 mb-5">
              Registra el primer servicio de una propiedad: qué es y cuánto se paga
            </p>
            <button (click)="openRegister()"
              class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium">
              <mat-icon class="text-[18px]">add</mat-icon>
              Registrar servicio
            </button>
          } @else {
            <p class="text-warm-400 text-sm mt-1">
              No tienes permiso para gestionar servicios
            </p>
          }
        </div>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (svc of services(); track svc.id) {
            <a [routerLink]="['/services', svc.id]" [queryParams]="{ month: monthKey() }"
              class="bg-white rounded-xl border border-warm-200 shadow-sm p-5 hover:border-primary-300 hover:shadow-md transition-all group">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  [class.bg-primary-100]="svc.isActive"
                  [class.bg-warm-100]="!svc.isActive">
                  <mat-icon class="text-[22px]"
                    [class.text-primary-600]="svc.isActive"
                    [class.text-warm-400]="!svc.isActive">{{ svc.icon || 'receipt_long' }}</mat-icon>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-warm-900 group-hover:text-primary-600 transition-colors">{{ svc.name }}</p>
                  @if (svc.description) {
                    <p class="text-xs text-warm-400 mt-0.5 line-clamp-2">{{ svc.description }}</p>
                  }

                  <!-- Resumen del mes -->
                  @if (summaryFor(svc.id!).total > 0) {
                    <div class="mt-2 flex items-baseline gap-2">
                      <span class="text-base font-bold text-warm-900">
                        {{ summaryFor(svc.id!).amount | currency:'COP':'symbol-narrow':'1.0-0' }}
                      </span>
                      <span class="text-xs text-warm-400">{{ summaryFor(svc.id!).total }} recibo(s)</span>
                    </div>
                  } @else {
                    <p class="text-xs text-warm-400 mt-2">Sin recibos este mes</p>
                  }

                  <div class="mt-2 flex items-center gap-1.5 flex-wrap">
                    @if (summaryFor(svc.id!).pending > 0) {
                      <span class="text-[11px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                        {{ summaryFor(svc.id!).pending }} por pagar
                      </span>
                    } @else if (summaryFor(svc.id!).total > 0) {
                      <span class="text-[11px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Al día</span>
                    }
                    @if (!svc.isActive) {
                      <span class="text-[11px] px-2 py-0.5 bg-warm-100 text-warm-500 rounded-full font-medium">Inactivo</span>
                    }
                  </div>
                </div>
              </div>
            </a>
          }
        </div>
      }

      <!-- Recibos cuyo servicio fue eliminado: siguen contando en el total del mes -->
      @if (orphanGroups().length > 0) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
          <div class="px-5 py-4 border-b border-warm-100">
            <h2 class="font-semibold text-warm-900 flex items-center gap-2">
              <mat-icon class="text-[20px] text-warm-400">history</mat-icon>
              Servicios eliminados
            </h2>
            <p class="text-xs text-warm-400 mt-0.5">
              Estos recibos se conservaron al eliminar su servicio. Siguen contando en el
              total del mes y en Finanzas, pero ya no se genera ninguno nuevo.
            </p>
          </div>
          <div class="divide-y divide-warm-100">
            @for (g of orphanGroups(); track g.serviceId) {
              <a [routerLink]="['/services', g.serviceId]" [queryParams]="{ month: monthKey() }"
                class="flex items-center gap-3 px-5 py-3 hover:bg-warm-50 transition-colors">
                <div class="w-9 h-9 rounded-lg bg-warm-100 flex items-center justify-center flex-shrink-0">
                  <mat-icon class="text-warm-400 text-[20px]">receipt_long</mat-icon>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <p class="text-sm font-medium text-warm-800 truncate">{{ g.serviceName }}</p>
                    <span class="text-[10px] px-1.5 py-0.5 bg-warm-100 text-warm-500 rounded-full font-medium">eliminado</span>
                  </div>
                  <p class="text-xs text-warm-400">
                    {{ g.total }} recibo(s)
                    @if (g.pending > 0) {
                      · <span class="text-red-600 font-medium">{{ g.pending }} por pagar</span>
                    }
                  </p>
                </div>
                <span class="text-sm font-bold text-warm-900 flex-shrink-0">
                  {{ g.amount | currency:'COP':'symbol-narrow':'1.0-0' }}
                </span>
              </a>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ServiceListComponent {
  private svcService = inject(UtilityServiceService);
  private receiptService = inject(ServiceReceiptService);
  private propertyService = inject(PropertyService);
  private permissions = inject(PermissionService);
  private dialog = inject(DialogService);

  services = toSignal(this.svcService.getAll());
  private properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  /**
   * El detalle de un servicio y el registro manual ya comprobaban el permiso,
   * pero esta lista no: sus botones de crear se le mostraban a cualquier
   * colaborador, tuviera o no `servicios`.
   */
  canWrite = computed(() => this.permissions.canOnAny(this.properties(), 'servicios'));

  selectedMonth = signal<Date>(startOfMonth(new Date()));

  monthKey = computed(() => monthKey(this.selectedMonth()));

  monthLabel = computed(() => monthLabel(this.selectedMonth()));

  /** Recibos del mes en todo el círculo: una consulta, no una por propiedad. */
  private receipts = toSignal(
    toObservable(this.monthKey).pipe(
      switchMap(month => this.receiptService.getByCircleAndMonth(month))
    ),
    { initialValue: [] as ServiceReceipt[] }
  );

  monthTotal = computed(() => this.receipts().reduce((s, r) => s + (r.propertyAmount ?? 0), 0));
  monthPaid = computed(() =>
    this.receipts().filter(r => r.isPaid).reduce((s, r) => s + (r.propertyAmount ?? 0), 0)
  );
  monthPending = computed(() => this.monthTotal() - this.monthPaid());

  private summaryByService = computed(() => {
    const m = new Map<string, { total: number; pending: number; amount: number }>();
    for (const r of this.receipts()) {
      const e = m.get(r.serviceId) ?? { total: 0, pending: 0, amount: 0 };
      e.total++;
      if (!r.isPaid) e.pending++;
      e.amount += r.propertyAmount ?? 0;
      m.set(r.serviceId, e);
    }
    return m;
  });

  summaryFor(serviceId: string): { total: number; pending: number; amount: number } {
    return this.summaryByService().get(serviceId) ?? { total: 0, pending: 0, amount: 0 };
  }

  /**
   * Recibos del mes cuyo servicio ya no existe (se eliminó conservando el histórico).
   * Sin esto quedaban invisibles aquí — no hay tarjeta que los muestre — pero seguían
   * apareciendo en el dashboard y sumando en el total del mes, que era justo la
   * discrepancia reportada. `serviceName` va denormalizado en cada recibo, así que
   * se siguen identificando.
   */
  orphanGroups = computed(() => {
    const known = new Set((this.services() ?? []).map(s => s.id));
    const groups = new Map<string, { serviceId: string; serviceName: string; total: number; pending: number; amount: number }>();
    for (const r of this.receipts()) {
      if (known.has(r.serviceId)) continue;
      const g = groups.get(r.serviceId) ?? {
        serviceId: r.serviceId,
        serviceName: r.serviceName || 'Servicio sin nombre',
        total: 0,
        pending: 0,
        amount: 0,
      };
      g.total++;
      if (!r.isPaid) g.pending++;
      g.amount += r.propertyAmount ?? 0;
      groups.set(r.serviceId, g);
    }
    return [...groups.values()];
  });

  prevMonth() {
    this.selectedMonth.set(addMonths(this.selectedMonth(), -1));
  }

  nextMonth() {
    this.selectedMonth.set(addMonths(this.selectedMonth(), 1));
  }

  openRegister() {
    this.dialog.open(RegisterServiceDialogComponent, {
      width: '460px',
      maxHeight: '90vh',
      data: { month: this.monthKey() },
    });
  }
}
