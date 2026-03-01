import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Payment } from '../../../../core/models/payment.model';
import { Property } from '../../../../core/models/property.model';
import { Unit } from '../../../../core/models/unit.model';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

@Component({
  selector: 'app-payment-list',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">
      <div class="px-5 py-4 border-b border-warm-100 flex items-center justify-between">
        <h2 class="font-semibold text-warm-900">Pagos del mes</h2>
        <span class="text-xs text-warm-400">{{ payments().length }} registros</span>
      </div>

      @if (payments().length === 0) {
        <div class="px-5 py-10 text-center">
          <mat-icon class="text-warm-300 text-[40px]">payments</mat-icon>
          <p class="text-warm-400 text-sm mt-2">No hay pagos en {{ monthLabel() }}</p>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-warm-400 uppercase tracking-wide border-b border-warm-100">
                <th class="px-5 py-3 font-medium">Fecha</th>
                <th class="px-5 py-3 font-medium">Inmueble</th>
                <th class="px-5 py-3 font-medium">Unidad</th>
                <th class="px-5 py-3 font-medium">Inquilino</th>
                <th class="px-5 py-3 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-warm-50">
              @for (p of payments(); track p.id) {
                <tr class="hover:bg-warm-50 transition-colors">
                  <td class="px-5 py-3 text-warm-600">
                    {{ p.date?.toDate() | date:'d MMM y' }}
                  </td>
                  <td class="px-5 py-3 text-warm-800 font-medium">
                    {{ propertyName(p.propertyId) }}
                  </td>
                  <td class="px-5 py-3">
                    <a
                      [routerLink]="['/properties', p.propertyId, 'units', p.unitId]"
                      class="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {{ unitNumber(p.unitId) }}
                    </a>
                  </td>
                  <td class="px-5 py-3 text-warm-600">
                    {{ tenantName(p.unitId) }}
                  </td>
                  <td class="px-5 py-3 text-right font-semibold text-warm-900">
                    {{ p.amount | currency:'COP':'symbol-narrow':'1.0-0' }}
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="border-t-2 border-warm-200 bg-warm-50">
                <td colspan="4" class="px-5 py-3 text-sm font-semibold text-warm-700">Total</td>
                <td class="px-5 py-3 text-right font-bold text-warm-900">
                  {{ total() | currency:'COP':'symbol-narrow':'1.0-0' }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      }
    </div>
  `,
})
export class PaymentListComponent {
  payments = input.required<Payment[]>();
  properties = input.required<Property[]>();
  units = input.required<Unit[]>();
  month = input.required<Date>();

  total = computed(() => this.payments().reduce((s, p) => s + p.amount, 0));

  monthLabel() {
    const d = this.month();
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  propertyName(propertyId: string): string {
    return this.properties().find(p => p.id === propertyId)?.name ?? propertyId;
  }

  unitNumber(unitId: string): string {
    const unit = this.units().find(u => u.id === unitId);
    return unit ? `Unidad ${unit.number}` : unitId;
  }

  tenantName(unitId: string): string {
    return this.units().find(u => u.id === unitId)?.tenantName ?? '—';
  }
}
