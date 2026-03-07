import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { SnapshotService } from '../../../core/services/snapshot.service';
import { PropertyService } from '../../../core/services/property.service';
import { PaymentService } from '../../../core/services/payment.service';
import { ExpenseService } from '../../../core/services/expense.service';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from '@angular/fire/firestore';
import { AuthService } from '../../../core/auth/auth.service';

function monthOptions(count = 24): { value: string; label: string }[] {
  const result = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    result.push({ value, label });
  }
  return result;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatSnackBarModule],
  template: `
    <div class="max-w-2xl space-y-6">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <a routerLink="/analytics" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
          <mat-icon>arrow_back</mat-icon>
        </a>
        <div>
          <h1 class="text-2xl font-bold text-warm-900">Exportar reporte</h1>
          <p class="text-warm-500 text-sm">Descarga tu información financiera en CSV o Excel</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5 space-y-4">
        <p class="text-sm font-semibold text-warm-700">Filtros del reporte</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-warm-600 mb-1.5">Desde</label>
            <select
              [value]="startMonth()"
              (change)="onStartMonthChange($event)"
              class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              @for (m of months; track m.value) {
                <option [value]="m.value">{{ m.label }}</option>
              }
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-warm-600 mb-1.5">Hasta</label>
            <select
              [value]="endMonth()"
              (change)="onEndMonthChange($event)"
              class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              @for (m of months; track m.value) {
                <option [value]="m.value">{{ m.label }}</option>
              }
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs font-medium text-warm-600 mb-1.5">Propiedad</label>
          <select
            [value]="selectedPropertyId() ?? ''"
            (change)="onPropertyChange($event)"
            class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
          >
            <option value="">Todas las propiedades</option>
            @for (p of properties(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </div>
      </div>

      <!-- Export buttons -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5 space-y-4">
        <p class="text-sm font-semibold text-warm-700">Formato de exportación</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <!-- CSV — client-side, always available -->
          <button
            (click)="exportCSV()"
            [disabled]="exporting()"
            class="flex items-center gap-3 p-4 border-2 border-warm-200 rounded-xl hover:border-primary-300 hover:bg-primary-50 transition-all disabled:opacity-50 text-left"
          >
            <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <mat-icon class="text-green-700">table_chart</mat-icon>
            </div>
            <div>
              <p class="font-semibold text-warm-900 text-sm">Exportar CSV</p>
              <p class="text-xs text-warm-400">Abre en Excel o Google Sheets</p>
            </div>
          </button>

          <!-- Excel — requires cloud function -->
          <button
            (click)="exportXLSX()"
            [disabled]="exporting()"
            class="flex items-center gap-3 p-4 border-2 border-warm-200 rounded-xl hover:border-primary-300 hover:bg-primary-50 transition-all disabled:opacity-50 text-left"
          >
            <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <mat-icon class="text-blue-700">description</mat-icon>
            </div>
            <div>
              <p class="font-semibold text-warm-900 text-sm">Exportar Excel (.xlsx)</p>
              <p class="text-xs text-warm-400">Requiere Cloud Functions desplegadas</p>
            </div>
          </button>
        </div>

        @if (exporting()) {
          <div class="flex items-center gap-2 text-sm text-warm-500">
            <div class="w-4 h-4 border-2 border-warm-300 border-t-primary-500 rounded-full animate-spin"></div>
            Generando reporte...
          </div>
        }

        @if (downloadUrl()) {
          <div class="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <mat-icon class="text-green-600">check_circle</mat-icon>
            <div class="flex-1">
              <p class="text-sm font-medium text-green-800">Reporte listo</p>
            </div>
            <a
              [href]="downloadUrl()!"
              download
              class="text-sm text-green-700 font-medium underline hover:no-underline"
            >Descargar</a>
          </div>
        }
      </div>

      <!-- Format reference -->
      <div class="bg-warm-50 rounded-xl border border-warm-200 p-4">
        <p class="text-xs font-semibold text-warm-600 uppercase tracking-wide mb-2">Columnas del reporte</p>
        <p class="text-xs text-warm-500 font-mono">
          Fecha | Inmueble | Unidad | Concepto | Categoría | Monto | Fuente
        </p>
      </div>
    </div>
  `,
})
export class ReportsComponent {
  private snapshotService = inject(SnapshotService);
  private propertyService = inject(PropertyService);
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  months = monthOptions();

  selectedPropertyId = signal<string | null>(null);
  startMonth = signal(this.months[11]?.value ?? this.months[0].value);
  endMonth = signal(this.months[0].value);
  exporting = signal(false);
  downloadUrl = signal<string | null>(null);

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  onPropertyChange(e: Event) {
    this.selectedPropertyId.set((e.target as HTMLSelectElement).value || null);
  }
  onStartMonthChange(e: Event) {
    this.startMonth.set((e.target as HTMLSelectElement).value);
  }
  onEndMonthChange(e: Event) {
    this.endMonth.set((e.target as HTMLSelectElement).value);
  }

  async exportCSV() {
    this.exporting.set(true);
    this.downloadUrl.set(null);
    try {
      const rows = await this.fetchRows();
      const header = 'Fecha,Inmueble,Unidad,Concepto,Categoría,Monto,Fuente\n';
      const body = rows
        .map(r =>
          [r.fecha, r.inmueble, r.unidad, r.concepto, r.categoria, r.monto, r.fuente]
            .map(v => `"${String(v).replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');
      const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      this.downloadUrl.set(url);
      // Auto-trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `vivai-reporte-${this.startMonth()}-${this.endMonth()}.csv`;
      a.click();
    } catch (err) {
      this.snackBar.open('Error al generar el reporte CSV.', 'OK', { duration: 3000 });
    } finally {
      this.exporting.set(false);
    }
  }

  async exportXLSX() {
    this.exporting.set(true);
    this.downloadUrl.set(null);
    try {
      const url = await this.snapshotService.exportReport({
        startMonth: this.startMonth(),
        endMonth: this.endMonth(),
        propertyId: this.selectedPropertyId(),
        format: 'xlsx',
      });
      this.downloadUrl.set(url);
    } catch {
      this.snackBar.open(
        'Error al generar el Excel. Verifica que las Cloud Functions estén desplegadas.',
        'OK',
        { duration: 4000 }
      );
    } finally {
      this.exporting.set(false);
    }
  }

  private async fetchRows(): Promise<any[]> {
    const uid = this.authService.uid()!;
    const pid = this.selectedPropertyId();
    const [sy, sm] = this.startMonth().split('-').map(Number);
    const [ey, em] = this.endMonth().split('-').map(Number);
    const startDate = new Date(sy, sm - 1, 1);
    const endDate = new Date(ey, em, 0, 23, 59, 59);

    const propsSnap = await getDocs(
      query(collection(this.firestore, 'properties'), where('ownerId', '==', uid))
    );
    const propMap = new Map<string, string>(propsSnap.docs.map(d => [d.id, (d.data() as any)['name']]));
    const unitsSnap = await getDocs(
      query(collection(this.firestore, 'units'), where('ownerId', '==', uid))
    );
    const unitMap = new Map<string, string>(unitsSnap.docs.map(d => [d.id, (d.data() as any)['number']]));

    const rows: any[] = [];

    // Payments
    let pq = query(
      collection(this.firestore, 'payments'),
      where('ownerId', '==', uid),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate))
    );
    if (pid) pq = query(pq, where('propertyId', '==', pid));
    const paymentsSnap = await getDocs(pq);
    for (const d of paymentsSnap.docs) {
      const p = d.data() as any;
      rows.push({
        fecha: p.date?.toDate().toLocaleDateString('es-CO'),
        inmueble: propMap.get(p.propertyId) ?? p.propertyId,
        unidad: unitMap.get(p.unitId) ?? (p.unitId ?? '—'),
        concepto: `Pago${p.notes ? ': ' + p.notes : ''}`,
        categoria: 'Ingreso',
        monto: p.amount,
        fuente: p.source ?? 'manual',
      });
    }

    // Expenses
    let eq = query(
      collection(this.firestore, 'expenses'),
      where('ownerId', '==', uid),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate))
    );
    if (pid) eq = query(eq, where('propertyId', '==', pid));
    const expensesSnap = await getDocs(eq);
    for (const d of expensesSnap.docs) {
      const e = d.data() as any;
      rows.push({
        fecha: e.date?.toDate().toLocaleDateString('es-CO'),
        inmueble: propMap.get(e.propertyId) ?? e.propertyId,
        unidad: '—',
        concepto: e.description,
        categoria: e.category,
        monto: -e.amount,
        fuente: 'manual',
      });
    }

    return rows.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  }
}
