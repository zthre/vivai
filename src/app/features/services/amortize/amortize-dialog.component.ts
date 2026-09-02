import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { ServiceReceipt } from '../../../core/models/service-receipt.model';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { PropertyService } from '../../../core/services/property.service';
import { PermissionService } from '../../../core/auth/permissions';

export interface AmortizeDialogData {
  receipt: ServiceReceipt;
}

/**
 * Traslada parte del monto de un recibo a otras propiedades.
 *
 * El caso típico: la luz de un apartamento incluye zonas comunes, así que se le
 * descuenta una parte y se reparte entre los demás.
 *
 * La pantalla enseña el reparto calculado ANTES de confirmar, porque el efecto
 * es sobre dinero repartido en varios documentos y no hay un «deshacer».
 */
@Component({
  selector: 'app-amortize-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="p-6 w-full">
      <div class="flex items-start justify-between gap-3 mb-1">
        <h2 class="text-lg font-semibold text-warm-900">Repartir parte del monto</h2>
        <button (click)="close()" class="p-1.5 rounded-lg text-warm-400 hover:bg-warm-100 transition-colors">
          <mat-icon class="text-[20px]">close</mat-icon>
        </button>
      </div>
      <p class="text-xs text-warm-500 mb-5">
        {{ data.receipt.serviceName }} · {{ data.receipt.propertyName }} ·
        {{ data.receipt.propertyAmount | currency:'COP':'symbol-narrow':'1.0-0' }}
      </p>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Cuánto se le quita</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
            <input type="number" min="0" [ngModel]="amount()" (ngModelChange)="amount.set(+$event || 0)"
              placeholder="Ej: 20000"
              class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          </div>
          @if (amount() > data.receipt.propertyAmount) {
            <p class="text-xs text-red-500 mt-1">
              No puedes repartir más de lo que tiene el recibo
              ({{ data.receipt.propertyAmount | currency:'COP':'symbol-narrow':'1.0-0' }}).
            </p>
          }
        </div>

        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">
            Entre qué propiedades
            @if (selected().length > 0) {
              <span class="text-warm-400 font-normal">· {{ selected().length }} seleccionada(s)</span>
            }
          </label>
          <div class="border border-warm-200 rounded-lg max-h-52 overflow-y-auto divide-y divide-warm-100">
            @for (p of candidates(); track p.id) {
              <label class="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-warm-50 transition-colors">
                <input type="checkbox" [checked]="isSelected(p.id!)" (change)="toggle(p.id!)"
                  class="w-4 h-4 accent-primary-500 cursor-pointer">
                <span class="text-sm text-warm-700 flex-1 min-w-0 truncate">{{ p.name }}</span>
              </label>
            }
            @if (candidates().length === 0) {
              <p class="px-3 py-4 text-xs text-warm-400 text-center">
                No hay otras propiedades sobre las que puedas gestionar servicios.
              </p>
            }
          </div>
        </div>

        <!-- Previsualización del reparto -->
        @if (canApply()) {
          <div class="border border-warm-200 rounded-lg bg-warm-50 p-3 space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-warm-600">{{ data.receipt.propertyName }}</span>
              <span class="font-medium text-red-600 whitespace-nowrap">
                {{ data.receipt.propertyAmount | currency:'COP':'symbol-narrow':'1.0-0' }}
                →
                {{ (data.receipt.propertyAmount - amount()) | currency:'COP':'symbol-narrow':'1.0-0' }}
              </span>
            </div>
            @for (row of preview(); track row.id) {
              <div class="flex items-center justify-between text-xs">
                <span class="text-warm-600">{{ row.name }}</span>
                <span class="font-medium text-green-700 whitespace-nowrap">
                  + {{ row.share | currency:'COP':'symbol-narrow':'1.0-0' }}
                </span>
              </div>
            }
          </div>
        }

        <div class="flex gap-3 pt-1">
          <button (click)="close()"
            class="flex-1 px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors">
            Cancelar
          </button>
          <button (click)="apply()" [disabled]="!canApply() || saving()"
            class="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            @if (saving()) {
              <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
            }
            Repartir
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AmortizeDialogComponent {
  private dialogRef = inject(MatDialogRef<AmortizeDialogComponent>);
  data: AmortizeDialogData = inject(MAT_DIALOG_DATA);
  private receiptService = inject(ServiceReceiptService);
  private propertyService = inject(PropertyService);
  private permissions = inject(PermissionService);
  private snackBar = inject(MatSnackBar);

  amount = signal(0);
  saving = signal(false);
  private selectedIds = signal<string[]>([]);

  private allProperties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  /** El origen no se ofrece: repartirle a sí mismo no significa nada. */
  candidates = computed(() =>
    this.permissions
      .filterByPermission(this.allProperties(), 'servicios')
      .filter(p => p.id && p.id !== this.data.receipt.propertyId)
  );

  selected = computed(() => this.selectedIds());

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggle(id: string) {
    this.selectedIds.update(ids =>
      ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    );
  }

  canApply = computed(() =>
    this.amount() > 0 &&
    this.amount() <= (this.data.receipt.propertyAmount ?? 0) &&
    this.selectedIds().length > 0
  );

  /**
   * El mismo reparto que hará el servicio, incluido el ajuste del último.
   * Se calcula aquí solo para enseñarlo; la fuente de verdad es `amortize`.
   */
  preview = computed(() => {
    const ids = this.selectedIds();
    if (ids.length === 0) return [];
    const round = (n: number) => Math.round(n * 100) / 100;
    const share = round(this.amount() / ids.length);
    const names = new Map(this.allProperties().map(p => [p.id!, p.name]));

    return ids.map((id, i) => ({
      id,
      name: names.get(id) ?? id,
      share: i === ids.length - 1
        ? round(this.amount() - share * (ids.length - 1))
        : share,
    }));
  });

  async apply() {
    if (!this.canApply() || this.saving()) return;
    this.saving.set(true);
    try {
      await this.receiptService.amortize(
        this.data.receipt,
        this.amount(),
        this.selectedIds()
      );
      this.snackBar.open(
        `Repartido entre ${this.selectedIds().length} propiedad(es).`,
        'OK',
        { duration: 3000 }
      );
      this.dialogRef.close(true);
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'No se pudo repartir.';
      this.snackBar.open(msg, 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  close() {
    this.dialogRef.close();
  }
}
