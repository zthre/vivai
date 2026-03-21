import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, combineLatest, of } from 'rxjs';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { UtilityServiceService } from '../../../core/services/utility-service.service';
import { PropertyService } from '../../../core/services/property.service';
import { ServiceReceipt } from '../../../core/models/service-receipt.model';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

@Component({
  selector: 'app-service-receipts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatSnackBarModule],
  template: `
    <div class="space-y-6">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 text-sm text-warm-400">
        <a routerLink="/services" class="hover:text-warm-600 transition-colors">Servicios</a>
        <mat-icon class="text-[16px]">chevron_right</mat-icon>
        <a [routerLink]="['/services', serviceId]" class="hover:text-warm-600 transition-colors">{{ service()?.name }}</a>
        <mat-icon class="text-[16px]">chevron_right</mat-icon>
        <span class="text-warm-700 font-medium">Recibos{{ assignmentId ? ' — ' + filterCode() : '' }}</span>
      </div>

      <!-- Month selector + back -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h1 class="text-xl font-bold text-warm-900">
              Recibos — {{ service()?.name }}
            </h1>
            @if (assignmentId && filterCode()) {
              <p class="text-sm text-warm-500 mt-0.5">
                Código: <span class="font-mono font-bold text-warm-700">{{ filterCode() }}</span>
              </p>
            }
          </div>
          <div class="flex items-center gap-3">
            <button (click)="prevMonth()" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
              <mat-icon>chevron_left</mat-icon>
            </button>
            <span class="text-sm font-semibold text-warm-800 min-w-[120px] text-center">{{ monthLabel() }}</span>
            <button (click)="nextMonth()" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
              <mat-icon>chevron_right</mat-icon>
            </button>
          </div>
        </div>
      </div>

      @if (!receipts() || receipts()!.length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-12 text-center">
          <mat-icon class="text-warm-300 text-[48px]">receipt</mat-icon>
          <h3 class="text-warm-700 font-semibold mt-3">Sin recibos</h3>
          <p class="text-warm-400 text-sm mt-1">No hay recibos generados para este mes</p>
          <a [routerLink]="['/services', serviceId]"
            class="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
            <mat-icon class="text-[16px]">arrow_back</mat-icon>
            Ir a generar
          </a>
        </div>
      } @else {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-warm-50 border-b border-warm-200">
                <tr>
                  @if (!assignmentId) {
                    <th class="text-left px-4 py-3 text-xs font-semibold text-warm-500 uppercase">Código</th>
                  }
                  <th class="text-left px-4 py-3 text-xs font-semibold text-warm-500 uppercase">Propiedad</th>
                  <th class="text-center px-4 py-3 text-xs font-semibold text-warm-500 uppercase">Personas</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-warm-500 uppercase">Total servicio</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-warm-500 uppercase">Monto</th>
                  <th class="text-center px-4 py-3 text-xs font-semibold text-warm-500 uppercase">Pagado</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-warm-500 uppercase">Notas</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-warm-100">
                @for (r of receipts(); track r.id) {
                  <tr class="hover:bg-warm-50 transition-colors">
                    @if (!assignmentId) {
                      <td class="px-4 py-3">
                        <span class="px-1.5 py-0.5 bg-warm-100 rounded text-xs font-mono font-bold text-warm-600 border border-warm-200">
                          {{ r.assignmentCode || '—' }}
                        </span>
                      </td>
                    }
                    <td class="px-4 py-3 font-medium text-warm-800">{{ propertyName(r.propertyId) }}</td>
                    <td class="px-4 py-3 text-center text-warm-500">{{ r.residentCount }}</td>
                    <td class="px-4 py-3 text-right text-warm-500">{{ r.totalAmount | currency:'COP':'symbol-narrow':'1.0-0' }}</td>
                    <td class="px-4 py-3 text-right">
                      <div class="relative inline-block">
                        <span class="absolute left-1.5 top-1/2 -translate-y-1/2 text-warm-400 text-xs">$</span>
                        <input
                          type="number"
                          [ngModel]="r.propertyAmount"
                          (blur)="updateAmount(r, $event)"
                          class="w-28 pl-5 pr-2 py-1.5 border border-warm-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500">
                      </div>
                    </td>
                    <td class="px-4 py-3 text-center">
                      <button (click)="togglePaid(r)"
                        class="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                        [class.bg-green-100]="r.isPaid"
                        [class.text-green-600]="r.isPaid"
                        [class.bg-warm-100]="!r.isPaid"
                        [class.text-warm-400]="!r.isPaid">
                        <mat-icon class="text-[16px]">{{ r.isPaid ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                      </button>
                    </td>
                    <td class="px-4 py-3">
                      <input
                        type="text"
                        [ngModel]="r.notes ?? ''"
                        (blur)="updateNotes(r, $event)"
                        placeholder="Agregar nota..."
                        class="w-full px-2 py-1.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Summary -->
          <div class="px-4 py-3 bg-warm-50 border-t border-warm-200 flex items-center justify-between">
            <span class="text-xs text-warm-500">{{ receipts()!.length }} recibo(s)</span>
            <span class="text-sm font-bold text-warm-900">
              Total: {{ totalPropertyAmounts() | currency:'COP':'symbol-narrow':'1.0-0' }}
            </span>
          </div>
        </div>
      }
    </div>
  `,
})
export class ServiceReceiptsComponent implements OnInit {
  private receiptService = inject(ServiceReceiptService);
  private svcService = inject(UtilityServiceService);
  private propertyService = inject(PropertyService);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);

  serviceId!: string;
  assignmentId: string | null = null;
  selectedMonthDate = signal<Date>(startOfMonth(new Date()));

  service = toSignal(
    this.route.paramMap.pipe(
      switchMap(params => {
        this.serviceId = params.get('id')!;
        return this.svcService.getById(this.serviceId);
      })
    )
  );

  allProperties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  selectedMonth = computed(() => formatMonth(this.selectedMonthDate()));
  monthLabel = computed(() => {
    const d = this.selectedMonthDate();
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  });

  filterCode = signal('');

  private month$ = toObservable(this.selectedMonth);
  receipts = toSignal(
    combineLatest([this.route.paramMap, this.month$]).pipe(
      switchMap(([params, month]) => {
        const sid = params.get('id')!;
        if (this.assignmentId) {
          return this.receiptService.getByAssignmentAndMonth(this.assignmentId, month);
        }
        return this.receiptService.getByServiceAndMonth(sid, month);
      })
    ),
    { initialValue: [] }
  );

  totalPropertyAmounts = computed(() =>
    (this.receipts() ?? []).reduce((sum, r) => sum + (r.propertyAmount ?? 0), 0)
  );

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const qMonth = q.get('month');
    if (qMonth) {
      const [y, m] = qMonth.split('-').map(Number);
      if (y && m) this.selectedMonthDate.set(new Date(y, m - 1, 1));
    }
    this.assignmentId = q.get('assignmentId');
    if (this.assignmentId) {
      // Read code from first receipt once loaded, or from query param if provided
      const code = q.get('code');
      if (code) this.filterCode.set(code);
    }
  }

  propertyName(propertyId: string): string {
    return this.allProperties()?.find(p => p.id === propertyId)?.name ?? propertyId;
  }

  prevMonth() {
    this.selectedMonthDate.update(d => {
      const prev = new Date(d);
      prev.setMonth(prev.getMonth() - 1);
      return prev;
    });
  }

  nextMonth() {
    this.selectedMonthDate.update(d => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  }

  async updateAmount(receipt: ServiceReceipt, event: Event) {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (isNaN(value) || value === receipt.propertyAmount) return;
    try {
      await this.receiptService.update(receipt.id!, { propertyAmount: value });
    } catch {
      this.snackBar.open('Error al actualizar monto.', 'OK', { duration: 3000 });
    }
  }

  async togglePaid(receipt: ServiceReceipt) {
    try {
      await this.receiptService.update(receipt.id!, { isPaid: !receipt.isPaid });
    } catch {
      this.snackBar.open('Error al actualizar estado.', 'OK', { duration: 3000 });
    }
  }

  async updateNotes(receipt: ServiceReceipt, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    if (value === (receipt.notes ?? '')) return;
    try {
      await this.receiptService.update(receipt.id!, { notes: value });
    } catch {
      this.snackBar.open('Error al actualizar notas.', 'OK', { duration: 3000 });
    }
  }
}
