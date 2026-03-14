import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { SnapshotService } from '../../../core/services/snapshot.service';
import { PropertyService } from '../../../core/services/property.service';
import { MonthlySnapshot } from '../../../core/models/monthly-snapshot.model';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatSnackBarModule],
  template: `
    <div class="space-y-6">

      <!-- Filters -->
      <div class="flex flex-wrap items-center justify-end gap-3">

          <!-- Year selector -->
          <select
            [value]="selectedYear()"
            (change)="onYearChange($event)"
            class="px-3 py-1.5 border border-warm-200 rounded-lg text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
          >
            @for (y of availableYears; track y) {
              <option [value]="y">{{ y }}</option>
            }
          </select>

          <!-- Property filter -->
          <select
            [value]="selectedPropertyId() ?? ''"
            (change)="onPropertyChange($event)"
            class="px-3 py-1.5 border border-warm-200 rounded-lg text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
          >
            <option value="">Todas las propiedades</option>
            @for (p of properties(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>

          <!-- Regenerate -->
          <button
            (click)="regenerate()"
            [disabled]="regenerating()"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-warm-200 rounded-lg text-warm-600 hover:bg-warm-50 transition-colors disabled:opacity-50"
            title="Regenerar snapshots del año"
          >
            <mat-icon class="text-[16px]" [class.animate-spin]="regenerating()">sync</mat-icon>
            @if (!regenerating()) { Regenerar }
          </button>

          <a
            routerLink="/analytics/reports"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <mat-icon class="text-[16px]">download</mat-icon>
            Exportar
          </a>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
          <p class="text-xs font-medium text-warm-500 uppercase tracking-wide">Ingresos anuales</p>
          <p class="text-2xl font-bold text-warm-900 mt-2">
            {{ annualIncome() | currency:'COP':'symbol-narrow':'1.0-0' }}
          </p>
        </div>
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
          <p class="text-xs font-medium text-warm-500 uppercase tracking-wide">Gastos anuales</p>
          <p class="text-2xl font-bold text-red-600 mt-2">
            {{ annualExpenses() | currency:'COP':'symbol-narrow':'1.0-0' }}
          </p>
        </div>
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
          <p class="text-xs font-medium text-warm-500 uppercase tracking-wide">Balance anual</p>
          <p class="text-2xl font-bold mt-2"
            [class.text-green-600]="annualBalance() >= 0"
            [class.text-red-600]="annualBalance() < 0"
          >
            {{ annualBalance() | currency:'COP':'symbol-narrow':'1.0-0' }}
          </p>
        </div>
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
          <p class="text-xs font-medium text-warm-500 uppercase tracking-wide">Ocupación promedio</p>
          <p class="text-2xl font-bold text-warm-900 mt-2">{{ avgOccupancy() | number:'1.0-1' }}%</p>
        </div>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else if (filteredSnapshots().length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-12 text-center">
          <mat-icon class="text-warm-300 text-[56px]">bar_chart</mat-icon>
          <h3 class="text-warm-700 font-semibold mt-3">Sin datos para {{ selectedYear() }}</h3>
          <p class="text-warm-400 text-sm mt-1">
            Los snapshots se generan automáticamente el primer día de cada mes.
            Usa "Regenerar" para generar los datos manualmente.
          </p>
        </div>
      } @else {
        <!-- Charts row -->
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

          <!-- Occupancy Bar Chart -->
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
            <h3 class="text-sm font-semibold text-warm-700 mb-4">Ocupación mensual (%)</h3>
            <div class="flex items-end gap-1.5 h-40">
              @for (snap of chartData(); track snap.month) {
                <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span class="text-[10px] text-warm-500 font-medium">{{ snap.occupancy | number:'1.0-0' }}</span>
                  <div
                    class="w-full rounded-t transition-all duration-300"
                    [style.height.%]="snap.occupancyBar"
                    [class.bg-primary-400]="snap.occupancy >= 80"
                    [class.bg-yellow-400]="snap.occupancy >= 50 && snap.occupancy < 80"
                    [class.bg-red-400]="snap.occupancy < 50"
                    style="min-height: 4px"
                  ></div>
                  <span class="text-[10px] text-warm-400 truncate w-full text-center">{{ snap.monthLabel }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Income vs Expenses Line Chart (SVG) -->
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
            <h3 class="text-sm font-semibold text-warm-700 mb-1">Ingresos vs Gastos</h3>
            <div class="flex items-center gap-4 mb-3">
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded-full bg-primary-500"></div>
                <span class="text-xs text-warm-500">Ingresos</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded-full bg-red-400"></div>
                <span class="text-xs text-warm-500">Gastos</span>
              </div>
            </div>
            <svg class="w-full" [attr.viewBox]="'0 0 400 140'" preserveAspectRatio="none">
              <!-- Income line -->
              <polyline
                [attr.points]="incomeLine()"
                fill="none"
                stroke="#f97316"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <!-- Expense line -->
              <polyline
                [attr.points]="expenseLine()"
                fill="none"
                stroke="#f87171"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <!-- Month labels -->
              @for (snap of chartData(); track snap.month; let i = $index) {
                <text
                  [attr.x]="lineX(i)"
                  y="136"
                  text-anchor="middle"
                  font-size="9"
                  fill="#a8a29e"
                >{{ snap.monthLabel }}</text>
              }
            </svg>
          </div>
        </div>

        <!-- Profitability Table -->
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-warm-100">
            <h3 class="font-semibold text-warm-900">Rentabilidad por propiedad</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-warm-50 text-xs font-semibold text-warm-500 uppercase tracking-wide">
                  <th class="px-5 py-3 text-left">Propiedad</th>
                  <th class="px-5 py-3 text-right">Ingresos</th>
                  <th class="px-5 py-3 text-right">Gastos</th>
                  <th class="px-5 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-warm-100">
                @for (row of profitabilityRows(); track row.propertyId) {
                  <tr class="hover:bg-warm-50 cursor-pointer transition-colors" (click)="goToProperty(row.propertyId)">
                    <td class="px-5 py-3.5 font-medium text-warm-900">{{ row.name }}</td>
                    <td class="px-5 py-3.5 text-right text-green-600">
                      {{ row.totalIncome | currency:'COP':'symbol-narrow':'1.0-0' }}
                    </td>
                    <td class="px-5 py-3.5 text-right text-red-500">
                      {{ row.totalExpenses | currency:'COP':'symbol-narrow':'1.0-0' }}
                    </td>
                    <td class="px-5 py-3.5 text-right font-semibold"
                      [class.text-green-700]="row.balance >= 0"
                      [class.text-red-600]="row.balance < 0"
                    >
                      {{ row.balance | currency:'COP':'symbol-narrow':'1.0-0' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

      }
    </div>
  `,
})
export class AnalyticsDashboardComponent {
  private snapshotService = inject(SnapshotService);
  private propertyService = inject(PropertyService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  currentYear = new Date().getFullYear();
  availableYears = Array.from({ length: 3 }, (_, i) => this.currentYear - i);

  selectedYear = signal(this.currentYear);
  selectedPropertyId = signal<string | null>(null);
  regenerating = signal(false);
  loading = signal(false);


  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  private year$ = toObservable(this.selectedYear);
  allSnapshots = toSignal(
    this.year$.pipe(switchMap(y => this.snapshotService.getByYear(y))),
    { initialValue: [] }
  );

  filteredSnapshots = computed(() => {
    const pid = this.selectedPropertyId();
    const snaps = this.allSnapshots();
    return pid ? snaps.filter(s => s.propertyId === pid) : snaps;
  });

  // Annual KPIs (aggregated across all filtered snapshots, deduplicating months)
  annualIncome = computed(() =>
    this.dedupedMonthlyAgg().reduce((s, m) => s + m.totalCollected, 0)
  );
  annualExpenses = computed(() =>
    this.dedupedMonthlyAgg().reduce((s, m) => s + m.totalExpenses, 0)
  );
  annualBalance = computed(() => this.annualIncome() - this.annualExpenses());
  avgOccupancy = computed(() => {
    const data = this.dedupedMonthlyAgg();
    return data.length ? data.reduce((s, m) => s + m.occupancyRate, 0) / data.length : 0;
  });

  // Per-month aggregated data (sum across properties for charts)
  private dedupedMonthlyAgg = computed(() => {
    const snaps = this.filteredSnapshots();
    const byMonth = new Map<string, { totalCollected: number; totalExpenses: number; occupancyRate: number }>();
    for (const s of snaps) {
      const existing = byMonth.get(s.month) ?? { totalCollected: 0, totalExpenses: 0, occupancyRate: 0 };
      byMonth.set(s.month, {
        totalCollected: existing.totalCollected + s.totalCollected,
        totalExpenses: existing.totalExpenses + s.totalExpenses,
        occupancyRate: Math.max(existing.occupancyRate, s.occupancyRate), // max across properties
      });
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({ month, ...data }));
  });

  chartData = computed(() => {
    const data = this.dedupedMonthlyAgg();
    if (data.length === 0) return [];
    const maxOcc = Math.max(...data.map(d => d.occupancyRate), 1);
    return data.map(d => ({
      month: d.month,
      monthLabel: MONTH_NAMES[Number(d.month.split('-')[1]) - 1] ?? '',
      occupancy: d.occupancyRate,
      occupancyBar: (d.occupancyRate / maxOcc) * 100,
      income: d.totalCollected,
      expenses: d.totalExpenses,
    }));
  });

  // SVG line chart helpers
  incomeLine = computed(() => {
    const data = this.chartData();
    if (data.length === 0) return '';
    const maxVal = Math.max(...data.map(d => d.income), 1);
    return data
      .map((d, i) => `${this.lineX(i)},${120 - (d.income / maxVal) * 110}`)
      .join(' ');
  });

  expenseLine = computed(() => {
    const data = this.chartData();
    if (data.length === 0) return '';
    const maxVal = Math.max(...data.map(d => d.income), 1);
    return data
      .map((d, i) => `${this.lineX(i)},${120 - (d.expenses / maxVal) * 110}`)
      .join(' ');
  });

  lineX(i: number): number {
    const count = Math.max(this.chartData().length - 1, 1);
    return 10 + (i * 380) / count;
  }

  profitabilityRows = computed(() => {
    const props = this.properties();
    const snaps = this.filteredSnapshots();
    return props.map(p => {
      const propSnaps = snaps.filter(s => s.propertyId === p.id);
      const totalIncome = propSnaps.reduce((s, sn) => s + sn.totalCollected, 0);
      const totalExpenses = propSnaps.reduce((s, sn) => s + sn.totalExpenses, 0);
      const balance = totalIncome - totalExpenses;
      return { propertyId: p.id!, name: p.name, totalIncome, totalExpenses, balance };
    }).filter(r => r.totalIncome > 0 || r.totalExpenses > 0);
  });


  onYearChange(e: Event) {
    this.selectedYear.set(Number((e.target as HTMLSelectElement).value));
  }

  onPropertyChange(e: Event) {
    this.selectedPropertyId.set((e.target as HTMLSelectElement).value || null);
  }


  async regenerate() {
    if (this.regenerating()) return;
    this.regenerating.set(true);
    try {
      await this.snapshotService.regenerateSnapshots(this.selectedYear());
      this.snackBar.open('Snapshots regenerados.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al regenerar. Verifica que las Cloud Functions estén desplegadas.', 'OK', { duration: 4000 });
    } finally {
      this.regenerating.set(false);
    }
  }

  goToProperty(id: string) {
    this.router.navigate(['/properties', id]);
  }
}
