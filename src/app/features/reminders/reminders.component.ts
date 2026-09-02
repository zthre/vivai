import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { PropertyService } from '../../core/services/property.service';
import { PaymentService } from '../../core/services/payment.service';
import { Property } from '../../core/models/property.model';
import { Payment } from '../../core/models/payment.model';
import { ServiceReceipt } from '../../core/models/service-receipt.model';
import { ServiceReceiptService } from '../../core/services/service-receipt.service';
import { PermissionService } from '../../core/auth/permissions';
import { currentMonthKey, fromMonthKey } from '../../core/utils/month.util';

@Component({
  selector: 'app-reminders',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-6">

      <!-- Header -->
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-warm-900">Recordatorios de pago</h1>
          <p class="text-warm-500 text-sm mt-1">Arriendo y servicios pendientes, por WhatsApp — uno a uno o a todos</p>
        </div>
        @if (!canRemind()) {
        <div class="bg-white rounded-xl border border-warm-200 p-8 text-center">
          <mat-icon class="text-warm-300 text-[40px]">lock</mat-icon>
          <p class="text-warm-500 text-sm mt-3">No tienes permiso para enviar recordatorios de pago</p>
        </div>
      }
      @if (canRemind() && pendingProperties().length > 0) {
          <button
            (click)="sendAll()"
            class="flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium shadow-sm"
          >
            <mat-icon class="text-[18px]">send</mat-icon>
            Enviar a todos pendientes ({{ pendingProperties().length }})
          </button>
        }
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap gap-3">
        <input
          type="month"
          [value]="selectedMonthStr()"
          (change)="onMonthChange($event)"
          class="px-3 py-2 border border-warm-200 rounded-lg text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
        <select
          (change)="onPropertyChange($event)"
          class="px-3 py-2 border border-warm-200 rounded-lg text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          <option value="">Todas las propiedades</option>
          @for (p of properties(); track p.id) {
            <option [value]="p.id">{{ p.name }}</option>
          }
        </select>
      </div>

      <!-- Summary chips -->
      @if (canRemind() && filteredProperties().length > 0) {
        <div class="flex gap-3 flex-wrap">
          <div class="bg-white rounded-lg border border-warm-200 px-4 py-2.5 flex items-center gap-2">
            <mat-icon class="text-warm-400 text-[18px]">home</mat-icon>
            <span class="text-sm text-warm-600">{{ filteredProperties().length }} ocupadas</span>
          </div>
          <div class="bg-green-50 rounded-lg border border-green-200 px-4 py-2.5 flex items-center gap-2">
            <mat-icon class="text-green-500 text-[18px]">check_circle</mat-icon>
            <span class="text-sm text-green-700 font-medium">{{ paidCount() }} pagados</span>
          </div>
          <div class="bg-yellow-50 rounded-lg border border-yellow-200 px-4 py-2.5 flex items-center gap-2">
            <mat-icon class="text-yellow-500 text-[18px]">schedule</mat-icon>
            <span class="text-sm text-yellow-700 font-medium">{{ pendingProperties().length }} pendientes</span>
          </div>
        </div>
      }

      <!-- Empty state -->
      @if (filteredProperties().length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 p-10 text-center">
          <mat-icon class="text-warm-300 text-[48px]">home</mat-icon>
          <p class="text-warm-500 text-sm mt-3">No hay propiedades ocupadas</p>
        </div>
      }

      <!-- Property list -->
      @for (prop of canRemind() ? filteredProperties() : []; track prop.id) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">
          <div class="flex items-center gap-4 px-5 py-4 flex-wrap">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="text-sm font-medium text-warm-800">{{ prop.name }}</p>
                @if (isPaid(prop.id!)) {
                  <span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Pagado</span>
                } @else {
                  <span class="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Pendiente</span>
                }
              </div>
              @if (prop.tenantName) {
                <p class="text-xs text-warm-500 mt-0.5">{{ prop.tenantName }}</p>
              }
              <div class="flex items-center gap-3 mt-0.5">
                @if (prop.paymentDueDay) {
                  <p class="text-xs text-warm-400">Vence el día {{ prop.paymentDueDay }}</p>
                }
                @if (prop.tenantRentPrice) {
                  <p class="text-xs text-warm-400">{{ prop.tenantRentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}/mes</p>
                }
              </div>
              @if (!prop.tenantPhone) {
                <p class="text-xs text-red-400 mt-0.5">Sin número de teléfono — agrégalo en la propiedad</p>
              }
            </div>

            @if (prop.tenantPhone) {
              @if (!isPaid(prop.id!)) {
                <a
                  [href]="whatsappLink(prop)"
                  target="_blank"
                  rel="noopener"
                  class="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors flex-shrink-0"
                >
                  <mat-icon class="text-[16px]">chat</mat-icon>
                  WhatsApp
                </a>
              } @else {
                <a
                  [href]="whatsappLink(prop)"
                  target="_blank"
                  rel="noopener"
                  class="flex items-center gap-2 px-3 py-2 border border-warm-200 text-warm-500 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors flex-shrink-0"
                >
                  <mat-icon class="text-[16px]">chat</mat-icon>
                  WhatsApp
                </a>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class RemindersComponent {
  private propertyService = inject(PropertyService);
  private paymentService = inject(PaymentService);
  private receiptService = inject(ServiceReceiptService);
  private permissions = inject(PermissionService);

  private now = new Date();

  selectedMonthStr = signal<string>(currentMonthKey());
  selectedPropertyId = signal<string>('');

  private selectedMonthDate = computed(() => {
    return fromMonthKey(this.selectedMonthStr()) ?? new Date();
  });

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  /**
   * Enviar un recordatorio es una acción de cara al inquilino, así que va bajo el
   * mismo permiso que registrar su pago. Antes no comprobaba nada: un colaborador
   * sin ningún permiso de pagos podía escribirle por WhatsApp a los inquilinos.
   */
  canRemind = computed(() => this.permissions.canOnAny(this.properties(), 'inmueblesPagos'));

  private allOccupied = computed(() =>
    this.properties().filter(p => p.status === 'ocupado')
  );

  /**
   * Por círculo, no por `ownerId`: la consulta anterior no devolvía nada a un
   * colaborador, así que le salían TODAS las propiedades como pendientes y los
   * recordatorios se enviaban a gente que ya había pagado.
   */
  private period$ = toObservable(this.selectedMonthStr);

  paymentsThisMonth = toSignal(
    this.period$.pipe(switchMap(period => this.paymentService.getByCircleAndPeriod(period))),
    { initialValue: [] as Payment[] }
  );

  private receiptsThisMonth = toSignal(
    this.period$.pipe(switchMap(month => this.receiptService.getByCircleAndMonth(month))),
    { initialValue: [] as ServiceReceipt[] }
  );

  paidPropertyIds = computed(() => new Set(this.paymentsThisMonth().map(p => p.propertyId)));

  /** Recibos de servicio sin pagar, por propiedad. */
  private pendingServicesByProperty = computed(() => {
    const map = new Map<string, ServiceReceipt[]>();
    for (const r of this.receiptsThisMonth()) {
      if (r.isPaid) continue;
      map.set(r.propertyId, [...(map.get(r.propertyId) ?? []), r]);
    }
    return map;
  });

  filteredProperties = computed(() => {
    const pid = this.selectedPropertyId();
    return pid ? this.allOccupied().filter(p => p.id === pid) : this.allOccupied();
  });

  /** Servicios pendientes de una propiedad este mes. */
  pendingServices(propertyId: string): ServiceReceipt[] {
    return this.pendingServicesByProperty().get(propertyId) ?? [];
  }

  /** Arriendo pendiente más servicios pendientes. */
  pendingTotal(prop: Property): number {
    const rent = this.rentPending(prop)
      ? (prop.tenantRentPrice ?? prop.rentPrice ?? 0)
      : 0;
    return rent + this.servicesTotal(prop.id!);
  }

  servicesTotal(propertyId: string): number {
    return this.pendingServices(propertyId).reduce((s, r) => s + (r.propertyAmount ?? 0), 0);
  }

  /**
   * ¿Falta el arriendo?
   *
   * `paymentFree` significa que a ese inquilino no se le cobra arriendo, así que
   * nunca está pendiente. Antes no se miraba, y esas propiedades salían como
   * pendientes todos los meses, para siempre.
   */
  rentPending(prop: Property): boolean {
    return !prop.paymentFree && !this.paidPropertyIds().has(prop.id!);
  }

  /** Al día: ni arriendo ni servicios pendientes. */
  isPaid(propertyId: string): boolean {
    const prop = this.filteredProperties().find(p => p.id === propertyId);
    if (!prop) return false;
    return !this.rentPending(prop) && this.pendingServices(propertyId).length === 0;
  }

  pendingProperties = computed(() =>
    this.filteredProperties().filter(p => !!p.tenantPhone && !this.isPaid(p.id!))
  );

  paidCount = computed(() =>
    this.filteredProperties().filter(p => this.isPaid(p.id!)).length
  );

  /**
   * El mensaje detalla arriendo y servicios por separado, con su total.
   *
   * Antes solo hablaba del arriendo, así que al inquilino le llegaban dos avisos
   * inconexos —o ninguno por los servicios— y no sabía cuánto tenía que pagar en
   * total.
   */
  whatsappLink(prop: Property): string {
    const phone = (prop.tenantPhone ?? '').replace(/\D/g, '');
    const name = prop.tenantName ?? 'Inquilino';
    const money = (n: number) => `$${n.toLocaleString('es-CO')}`;

    const lines: string[] = [];
    let total = 0;

    if (this.rentPending(prop)) {
      const amount = prop.tenantRentPrice ?? prop.rentPrice ?? 0;
      const due = prop.paymentDueDay ? ` (vence el día ${prop.paymentDueDay})` : '';
      lines.push(`• Arriendo: *${money(amount)}*${due}`);
      total += amount;
    }

    for (const r of this.pendingServices(prop.id!)) {
      const amount = r.propertyAmount ?? 0;
      lines.push(`• ${r.serviceName}: *${money(amount)}*`);
      total += amount;
    }

    // Sin nada pendiente no se envía nada; el botón no aparece en ese caso.
    if (lines.length === 0) return `https://wa.me/${phone}`;

    let msg = `Hola ${name}, te recordamos lo pendiente de *${prop.name}* este mes:\n\n`;
    msg += lines.join('\n');
    if (lines.length > 1) msg += `\n\nTotal: *${money(total)}*`;

    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  onMonthChange(event: Event) {
    this.selectedMonthStr.set((event.target as HTMLInputElement).value);
  }

  onPropertyChange(event: Event) {
    this.selectedPropertyId.set((event.target as HTMLSelectElement).value);
  }

  sendAll() {
    this.pendingProperties().forEach(prop => {
      window.open(this.whatsappLink(prop), '_blank');
    });
  }
}
