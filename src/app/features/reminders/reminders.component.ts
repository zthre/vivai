import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { PropertyService } from '../../core/services/property.service';
import { UnitService } from '../../core/services/unit.service';
import { PaymentService } from '../../core/services/payment.service';
import { Unit } from '../../core/models/unit.model';
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
        @if (pendingUnits().length > 0) {
          <button
            (click)="sendAll()"
            class="flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium shadow-sm"
          >
            <mat-icon class="text-[18px]">send</mat-icon>
            Enviar a todos pendientes ({{ pendingUnits().length }})
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
      @if (allUnits().length > 0) {
        <div class="flex gap-3 flex-wrap">
          <div class="bg-white rounded-lg border border-warm-200 px-4 py-2.5 flex items-center gap-2">
            <mat-icon class="text-warm-400 text-[18px]">home</mat-icon>
            <span class="text-sm text-warm-600">{{ filteredUnits().length }} ocupadas</span>
          </div>
          <div class="bg-green-50 rounded-lg border border-green-200 px-4 py-2.5 flex items-center gap-2">
            <mat-icon class="text-green-500 text-[18px]">check_circle</mat-icon>
            <span class="text-sm text-green-700 font-medium">{{ paidCount() }} pagados</span>
          </div>
          <div class="bg-yellow-50 rounded-lg border border-yellow-200 px-4 py-2.5 flex items-center gap-2">
            <mat-icon class="text-yellow-500 text-[18px]">schedule</mat-icon>
            <span class="text-sm text-yellow-700 font-medium">{{ pendingUnits().length }} pendientes</span>
          </div>
        </div>
      }

      <!-- Empty state -->
      @if (propertiesWithUnits().length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 p-10 text-center">
          <mat-icon class="text-warm-300 text-[48px]">home</mat-icon>
          <p class="text-warm-500 text-sm mt-3">No hay unidades ocupadas</p>
        </div>
      }

      <!-- Property groups -->
      @for (prop of propertiesWithUnits(); track prop.id) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-warm-100 flex items-center justify-between">
            <div>
              <h2 class="font-semibold text-warm-900">{{ prop.name }}</h2>
              <p class="text-xs text-warm-400">{{ prop.address }}</p>
            </div>
            @if (pendingInProperty(prop.id!).length > 0) {
              <button
                (click)="sendForProperty(prop)"
                class="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 transition-colors"
              >
                <mat-icon class="text-[14px]">send</mat-icon>
                Enviar a pendientes ({{ pendingInProperty(prop.id!).length }})
              </button>
            }
          </div>

          <div class="divide-y divide-warm-100">
            @for (unit of unitsForProperty(prop.id!); track unit.id) {
              <div class="flex items-center gap-4 px-5 py-4 flex-wrap">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="text-sm font-medium text-warm-800">Unidad {{ unit.number }}</p>
                    @if (isPaid(unit.id!)) {
                      <span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Pagado</span>
                    } @else {
                      <span class="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Pendiente</span>
                    }
                  </div>
                  @if (unit.tenantName) {
                    <p class="text-xs text-warm-500 mt-0.5">{{ unit.tenantName }}</p>
                  }
                  <div class="flex items-center gap-3 mt-0.5">
                    @if (unit.paymentDueDay) {
                      <p class="text-xs text-warm-400">Vence el día {{ unit.paymentDueDay }}</p>
                    }
                    @if (unit.tenantRentPrice) {
                      <p class="text-xs text-warm-400">{{ unit.tenantRentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}/mes</p>
                    }
                  </div>
                  @if (!unit.tenantPhone) {
                    <p class="text-xs text-red-400 mt-0.5">Sin número de teléfono — agrégalo en la unidad</p>
                  }
                </div>

                @if (unit.tenantPhone) {
                  @if (!isPaid(unit.id!)) {
                    <a
                      [href]="whatsappLink(unit, prop)"
                      target="_blank"
                      rel="noopener"
                      class="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors flex-shrink-0"
                    >
                      <mat-icon class="text-[16px]">chat</mat-icon>
                      WhatsApp
                    </a>
                  } @else {
                    <a
                      [href]="whatsappLink(unit, prop)"
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
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class RemindersComponent {
  private propertyService = inject(PropertyService);
  private unitService = inject(UnitService);
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
  allUnits = toSignal(this.unitService.getAllOccupied(), { initialValue: [] });

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

  paidUnitIds = computed(() => new Set(this.paymentsThisMonth().map(p => p.unitId)));

  filteredUnits = computed(() => {
    const pid = this.selectedPropertyId();
    return pid ? this.allUnits().filter(u => u.propertyId === pid) : this.allUnits();
  });

  propertiesWithUnits = computed(() => {
    const propIds = new Set(this.filteredUnits().map(u => u.propertyId));
    return this.properties().filter(p => propIds.has(p.id!));
  });

  pendingUnits = computed(() =>
    this.filteredUnits().filter(u => !!u.tenantPhone && !this.paidUnitIds().has(u.id!))
  );

  paidCount = computed(() =>
    this.filteredUnits().filter(u => this.paidUnitIds().has(u.id!)).length
  );

  unitsForProperty(propId: string): Unit[] {
    return this.filteredUnits().filter(u => u.propertyId === propId);
  }

  pendingInProperty(propId: string): Unit[] {
    return this.unitsForProperty(propId).filter(u => !!u.tenantPhone && !this.paidUnitIds().has(u.id!));
  }

  isPaid(unitId: string): boolean {
    return this.paidUnitIds().has(unitId);
  }

  whatsappLink(unit: Unit, prop: Property): string {
    const phone = (unit.tenantPhone ?? '').replace(/\D/g, '');
    const name = unit.tenantName ?? 'Inquilino';
    let msg = `Hola ${name}, te recordamos que tu pago de arriendo de *${prop.name}* unidad *${unit.number}*`;
    if (unit.paymentDueDay) {
      msg += ` vence el *día ${unit.paymentDueDay}* de este mes`;
    } else {
      msg += ` está pendiente este mes`;
    }
    if (unit.tenantRentPrice) {
      msg += `. Monto: *$${unit.tenantRentPrice.toLocaleString('es-CO')}*`;
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
    const props = this.properties();
    this.pendingUnits().forEach(unit => {
      const prop = props.find(p => p.id === unit.propertyId);
      if (prop) window.open(this.whatsappLink(unit, prop), '_blank');
    });
  }

  sendForProperty(prop: Property) {
    this.pendingInProperty(prop.id!).forEach(unit => {
      window.open(this.whatsappLink(unit, prop), '_blank');
    });
  }
}
