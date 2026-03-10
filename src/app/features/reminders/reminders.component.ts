import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { PropertyService } from '../../core/services/property.service';
import { PaymentService } from '../../core/services/payment.service';
import { Property } from '../../core/models/property.model';

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
          <p class="text-warm-500 text-sm mt-1">Envía recordatorios manuales por WhatsApp, uno a uno o a todos los pendientes</p>
        </div>
        @if (pendingProperties().length > 0) {
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
      @if (filteredProperties().length > 0) {
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
      @for (prop of filteredProperties(); track prop.id) {
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
                <p class="text-xs text-red-400 mt-0.5">Sin número de teléfono — agrégalo en el inmueble</p>
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

  private now = new Date();

  selectedMonthStr = signal<string>(
    `${this.now.getFullYear()}-${String(this.now.getMonth() + 1).padStart(2, '0')}`
  );
  selectedPropertyId = signal<string>('');

  private selectedMonthDate = computed(() => {
    const [y, m] = this.selectedMonthStr().split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  private allOccupied = computed(() =>
    this.properties().filter(p => p.status === 'ocupado')
  );

  paymentsThisMonth = toSignal(
    toObservable(this.selectedMonthDate).pipe(
      switchMap(d => {
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        return this.paymentService.getByMonth(start, end);
      })
    ),
    { initialValue: [] }
  );

  paidPropertyIds = computed(() => new Set(this.paymentsThisMonth().map(p => p.propertyId)));

  filteredProperties = computed(() => {
    const pid = this.selectedPropertyId();
    return pid ? this.allOccupied().filter(p => p.id === pid) : this.allOccupied();
  });

  pendingProperties = computed(() =>
    this.filteredProperties().filter(p => !!p.tenantPhone && !this.paidPropertyIds().has(p.id!))
  );

  paidCount = computed(() =>
    this.filteredProperties().filter(p => this.paidPropertyIds().has(p.id!)).length
  );

  isPaid(propertyId: string): boolean {
    return this.paidPropertyIds().has(propertyId);
  }

  whatsappLink(prop: Property): string {
    const phone = (prop.tenantPhone ?? '').replace(/\D/g, '');
    const name = prop.tenantName ?? 'Inquilino';
    let msg = `Hola ${name}, te recordamos que tu pago de arriendo de *${prop.name}*`;
    if (prop.paymentDueDay) {
      msg += ` vence el *día ${prop.paymentDueDay}* de este mes`;
    } else {
      msg += ` está pendiente este mes`;
    }
    if (prop.tenantRentPrice) {
      msg += `. Monto: *$${prop.tenantRentPrice.toLocaleString('es-CO')}*`;
    }
    msg += '.';
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
