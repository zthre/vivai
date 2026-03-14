import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { ServiceReceipt } from '../../../core/models/service-receipt.model';

export interface PropertyReceiptsDialogData {
  propertyId: string;
  propertyName: string;
  month: string; // 'YYYY-MM'
}

@Component({
  selector: 'app-property-receipts-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="p-6 w-full max-w-lg">
      <div class="flex items-center justify-between mb-5">
        <div>
          <h2 class="text-lg font-semibold text-warm-900">Servicios del mes</h2>
          <p class="text-xs text-warm-500 mt-0.5">{{ data.propertyName }} — {{ monthLabel }}</p>
        </div>
        <button (click)="close()" class="p-1.5 rounded-lg text-warm-400 hover:bg-warm-100 transition-colors">
          <mat-icon class="text-[20px]">close</mat-icon>
        </button>
      </div>

      @if (loading()) {
        <div class="py-8 text-center">
          <div class="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto"></div>
          <p class="text-warm-400 text-sm mt-3">Cargando recibos…</p>
        </div>
      } @else if (receipts().length === 0) {
        <div class="py-8 text-center">
          <mat-icon class="text-warm-300 text-[40px]">receipt_long</mat-icon>
          <p class="text-warm-400 text-sm mt-2">No hay recibos de servicios para este mes</p>
          <p class="text-warm-300 text-xs mt-1">Genera recibos desde el módulo de Servicios</p>
        </div>
      } @else {
        <div class="space-y-2">
          @for (r of receipts(); track r.id) {
            <div class="flex items-center gap-3 p-3 rounded-lg border transition-colors"
              [class.border-green-200]="r.isPaid"
              [class.bg-green-50]="r.isPaid"
              [class.border-warm-200]="!r.isPaid"
              [class.bg-white]="!r.isPaid">
              <button (click)="togglePaid(r)" [disabled]="toggling()"
                class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                [class.bg-green-100]="r.isPaid"
                [class.text-green-600]="r.isPaid"
                [class.bg-warm-100]="!r.isPaid"
                [class.text-warm-400]="!r.isPaid"
                [class.hover:bg-green-200]="r.isPaid"
                [class.hover:bg-warm-200]="!r.isPaid">
                <mat-icon class="text-[18px]">{{ r.isPaid ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
              </button>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-warm-800 truncate">{{ r.serviceName }}</p>
                @if (r.notes) {
                  <p class="text-xs text-warm-400 truncate">{{ r.notes }}</p>
                }
              </div>
              <span class="text-sm font-semibold text-warm-900 flex-shrink-0">
                {{ r.propertyAmount | currency:'COP':'symbol-narrow':'1.0-0' }}
              </span>
            </div>
          }
        </div>

        <!-- Summary -->
        <div class="mt-4 pt-4 border-t border-warm-100">
          <div class="flex items-center justify-between">
            <div class="text-sm text-warm-500">
              <span class="font-medium text-green-600">{{ paidCount() }}</span> de {{ receipts().length }} pagados
            </div>
            <div class="text-right">
              <p class="text-xs text-warm-400">Total pendiente</p>
              <p class="text-lg font-bold text-warm-900">{{ pendingTotal() | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
            </div>
          </div>
          @if (pendingCount() > 0) {
            <button (click)="markAllPaid()" [disabled]="toggling()"
              class="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
              <mat-icon class="text-[18px]">done_all</mat-icon>
              Marcar todos como pagados
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class PropertyReceiptsDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<PropertyReceiptsDialogComponent>);
  data: PropertyReceiptsDialogData = inject(MAT_DIALOG_DATA);
  private receiptService = inject(ServiceReceiptService);
  private snackBar = inject(MatSnackBar);

  loading = signal(true);
  toggling = signal(false);
  receipts = signal<ServiceReceipt[]>([]);

  monthLabel = (() => {
    const [y, m] = this.data.month.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  })();

  paidCount = computed(() => this.receipts().filter(r => r.isPaid).length);
  pendingCount = computed(() => this.receipts().filter(r => !r.isPaid).length);
  pendingTotal = computed(() => this.receipts().filter(r => !r.isPaid).reduce((s, r) => s + r.propertyAmount, 0));

  ngOnInit() {
    this.receiptService
      .getByPropertyAndMonth(this.data.propertyId, this.data.month)
      .subscribe(receipts => {
        this.receipts.set(receipts);
        this.loading.set(false);
      });
  }

  async togglePaid(receipt: ServiceReceipt) {
    this.toggling.set(true);
    try {
      await this.receiptService.update(receipt.id!, { isPaid: !receipt.isPaid });
      this.receipts.update(list =>
        list.map(r => r.id === receipt.id ? { ...r, isPaid: !r.isPaid } : r)
      );
    } catch {
      this.snackBar.open('Error al actualizar', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    }
    this.toggling.set(false);
  }

  async markAllPaid() {
    this.toggling.set(true);
    try {
      const pending = this.receipts().filter(r => !r.isPaid);
      await Promise.all(pending.map(r => this.receiptService.update(r.id!, { isPaid: true })));
      this.receipts.update(list => list.map(r => ({ ...r, isPaid: true })));
      this.snackBar.open('Todos los servicios marcados como pagados', 'OK', { duration: 3000, panelClass: 'snackbar-success' });
    } catch {
      this.snackBar.open('Error al actualizar', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    }
    this.toggling.set(false);
  }

  close() {
    this.dialogRef.close();
  }
}
