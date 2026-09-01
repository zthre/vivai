import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { UtilityServiceService } from '../../../core/services/utility-service.service';
import { PaymentService } from '../../../core/services/payment.service';
import { ServiceReceipt } from '../../../core/models/service-receipt.model';
import { Property } from '../../../core/models/property.model';

export interface MonthSettlementDialogData {
  property: Property;
  /** 'YYYY-MM' */
  month: string;
  canWritePagos: boolean;
  canWriteServicios: boolean;
  /** Abrir directamente en la confirmación de "Pagar todo" */
  startInPayAll?: boolean;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

/** Fecha con la que se registra el pago del mes seleccionado. */
function paymentDateForMonth(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  const now = new Date();
  if (now.getFullYear() === y && now.getMonth() + 1 === m) return now;
  return new Date(y, m, 0, 12, 0, 0);
}

/**
 * Liquidación mensual de una propiedad: arriendo + servicios en un solo lugar.
 * Permite registrar servicios manualmente, pagar recibos uno a uno o pagar todo de una vez.
 */
@Component({
  selector: 'app-month-settlement-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="p-6 w-full">
      <!-- Header -->
      <div class="flex items-start justify-between gap-3 mb-5">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold text-warm-900 truncate">{{ data.property.name }}</h2>
          <p class="text-xs text-warm-500 mt-0.5 capitalize">{{ label }}</p>
        </div>
        <button (click)="close()" class="p-1.5 rounded-lg text-warm-400 hover:bg-warm-100 transition-colors flex-shrink-0">
          <mat-icon class="text-[20px]">close</mat-icon>
        </button>
      </div>

      <!-- ── Arriendo ───────────────────────────────────────────────── -->
      @if (showRent()) {
        <div class="mb-5">
          <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2">Arriendo del mes</p>
          <div class="flex items-center gap-3 p-3 rounded-lg border"
            [class.border-green-200]="rentPaid()"
            [class.bg-green-50]="rentPaid()"
            [class.border-warm-200]="!rentPaid()">
            <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
              [class.bg-green-100]="rentPaid()"
              [class.text-green-600]="rentPaid()"
              [class.bg-warm-100]="!rentPaid()"
              [class.text-warm-400]="!rentPaid()">
              <mat-icon class="text-[18px]">{{ rentPaid() ? 'check_circle' : 'home' }}</mat-icon>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-warm-800">
                {{ rentPaid() ? 'Arriendo pagado' : 'Arriendo pendiente' }}
              </p>
              <p class="text-xs text-warm-400">
                {{ data.property.tenantName || 'Sin inquilino registrado' }}
              </p>
            </div>
            <span class="text-sm font-semibold text-warm-900 flex-shrink-0">
              {{ (rentPaid() ? rentPayment()!.amount : rentAmount()) | currency:'COP':'symbol-narrow':'1.0-0' }}
            </span>
          </div>

          @if (!rentPaid() && data.canWritePagos) {
            @if (!showRentForm()) {
              <button (click)="showRentForm.set(true)"
                class="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 border border-primary-200 text-primary-600 rounded-lg text-sm font-medium hover:bg-primary-50 transition-colors">
                <mat-icon class="text-[18px]">receipt_long</mat-icon>
                Registrar pago del arriendo
              </button>
            } @else {
              <div class="mt-2 p-3 border border-warm-200 rounded-lg bg-warm-50 space-y-2">
                <label class="block text-xs font-medium text-warm-600">Monto del arriendo</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
                  <input type="number" min="0" [ngModel]="rentAmount()" (ngModelChange)="rentAmount.set(+$event || 0)"
                    class="w-full pl-7 pr-3 py-2 border border-warm-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                </div>
                <div class="flex gap-2">
                  <button (click)="showRentForm.set(false)"
                    class="flex-1 px-3 py-2 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-white transition-colors">
                    Cancelar
                  </button>
                  <button (click)="payRent()" [disabled]="busy() || rentAmount() <= 0"
                    class="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
                    Registrar pago
                  </button>
                </div>
              </div>
            }
          }
        </div>
      }

      <!-- ── Servicios ──────────────────────────────────────────────── -->
      <div class="mb-4">
        <div class="flex items-center justify-between gap-2 mb-2">
          <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide">Servicios del mes</p>
          @if (receipts().length > 0) {
            <span class="text-xs text-warm-400">
              <span class="font-medium text-green-600">{{ paidCount() }}</span> de {{ receipts().length }} pagados
            </span>
          }
        </div>

        @if (loading()) {
          <div class="py-8 text-center">
            <div class="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto"></div>
          </div>
        } @else if (receipts().length === 0) {
          <div class="py-6 text-center border border-dashed border-warm-200 rounded-lg">
            <mat-icon class="text-warm-300 text-[32px]">bolt</mat-icon>
            <p class="text-warm-400 text-sm mt-1">Sin servicios registrados este mes</p>
          </div>
        } @else {
          <div class="space-y-2">
            @for (r of receipts(); track r.id) {
              <div class="flex items-center gap-3 p-3 rounded-lg border transition-colors"
                [class.border-green-200]="r.isPaid"
                [class.bg-green-50]="r.isPaid"
                [class.border-warm-200]="!r.isPaid">
                <button (click)="togglePaid(r)" [disabled]="busy() || !data.canWriteServicios"
                  class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-60"
                  [class.bg-green-100]="r.isPaid"
                  [class.text-green-600]="r.isPaid"
                  [class.bg-warm-100]="!r.isPaid"
                  [class.text-warm-400]="!r.isPaid"
                  [title]="r.isPaid ? 'Marcar como no pagado' : 'Pagar recibo'">
                  <mat-icon class="text-[18px]">{{ r.isPaid ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                </button>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <p class="text-sm font-medium text-warm-800 truncate">{{ r.serviceName }}</p>
                    @if (r.assignmentCode) {
                      <span class="text-[10px] px-1.5 py-0.5 bg-warm-100 rounded font-mono font-bold text-warm-600 border border-warm-200">
                        {{ r.assignmentCode }}
                      </span>
                    }
                  </div>
                  @if (r.notes) {
                    <p class="text-xs text-warm-400 truncate">{{ r.notes }}</p>
                  }
                </div>

                <span class="text-sm font-semibold text-warm-900 flex-shrink-0">
                  {{ r.propertyAmount | currency:'COP':'symbol-narrow':'1.0-0' }}
                </span>

                @if (data.canWriteServicios) {
                  <div class="flex items-center gap-0.5 flex-shrink-0">
                    <button (click)="startEdit(r)" [disabled]="busy()" title="Editar recibo"
                      class="p-1 text-warm-300 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors disabled:opacity-50">
                      <mat-icon class="text-[16px]">edit</mat-icon>
                    </button>
                    <button (click)="removeReceipt(r)" [disabled]="busy()" title="Eliminar recibo"
                      class="p-1 text-warm-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50">
                      <mat-icon class="text-[16px]">delete_outline</mat-icon>
                    </button>
                  </div>
                }
              </div>

              <!-- Edición en línea -->
              @if (editingId() === r.id) {
                <div class="p-3 border border-primary-200 bg-primary-50 rounded-lg space-y-2 -mt-1">
                  <div>
                    <label class="block text-xs font-medium text-warm-600 mb-1">Monto</label>
                    <div class="relative">
                      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
                      <input type="number" min="0" [ngModel]="editAmount()" (ngModelChange)="editAmount.set(+$event || 0)"
                        class="w-full pl-7 pr-3 py-2 border border-warm-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-warm-600 mb-1">Nota</label>
                    <input [(ngModel)]="editNotes" placeholder="Ej: factura 4432"
                      class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-warm-600 mb-1">
                      Mes al que corresponde
                    </label>
                    <input type="month" [(ngModel)]="editMonth"
                      class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    @if (editMonth !== data.month) {
                      <p class="text-[11px] text-amber-700 mt-1">
                        Se moverá a otro mes y dejará de verse en esta ventana.
                        @if (r.isPaid && r.expenseId) {
                          Su gasto en Finanzas se mueve con él.
                        }
                      </p>
                    }
                  </div>
                  @if (r.origin !== 'manual') {
                    <p class="text-[11px] text-amber-700">
                      Recibo generado por distribución. Si regeneras el código
                      <span class="font-mono font-semibold">{{ r.assignmentCode }}</span> de este mes, se reemplazará.
                    </p>
                  }
                  <div class="flex gap-2">
                    <button (click)="cancelEdit()"
                      class="flex-1 px-3 py-2 border border-warm-200 bg-white text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors">
                      Cancelar
                    </button>
                    <button (click)="saveEdit(r)" [disabled]="busy() || editAmount() <= 0"
                      class="flex-1 px-3 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50">
                      Guardar
                    </button>
                  </div>
                </div>
              }
            }
          </div>
        }

        <!-- Registrar servicio -->
        @if (data.canWriteServicios) {
          @if (!showServiceForm()) {
            <button (click)="openServiceForm()"
              class="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 border border-primary-200 text-primary-600 rounded-lg text-sm font-medium hover:bg-primary-50 transition-colors">
              <mat-icon class="text-[18px]">add</mat-icon>
              Registrar servicio
            </button>
          } @else {
            <div class="mt-2 p-3 border border-warm-200 rounded-lg bg-warm-50 space-y-3">
              <div>
                <label class="block text-xs font-medium text-warm-600 mb-1">Servicio</label>
                @if (creatingService()) {
                  <div class="flex gap-2">
                    <input [(ngModel)]="newServiceName" placeholder="Nombre del nuevo servicio"
                      class="flex-1 px-3 py-2 border border-warm-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <button (click)="creatingService.set(false)"
                      class="px-3 py-2 border border-warm-200 text-warm-500 rounded-lg text-sm hover:bg-white transition-colors">
                      Cancelar
                    </button>
                  </div>
                } @else {
                  <select [(ngModel)]="formServiceId"
                    class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">Selecciona un servicio…</option>
                    @for (s of activeServices(); track s.id) {
                      <option [value]="s.id">{{ s.name }}</option>
                    }
                  </select>
                  <button (click)="creatingService.set(true)"
                    class="mt-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                    + Crear un servicio nuevo
                  </button>
                }
              </div>

              <div>
                <label class="block text-xs font-medium text-warm-600 mb-1">Suma a pagar</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
                  <input type="number" min="0" [ngModel]="formAmount()" (ngModelChange)="formAmount.set(+$event || 0)"
                    placeholder="Ej: 85000"
                    class="w-full pl-7 pr-3 py-2 border border-warm-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                </div>
              </div>

              <div>
                <label class="block text-xs font-medium text-warm-600 mb-1">Nota (opcional)</label>
                <input [(ngModel)]="formNotes" placeholder="Ej: factura 4432"
                  class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              </div>

              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" [(ngModel)]="formMarkPaid" class="w-4 h-4 accent-green-600 cursor-pointer">
                <span class="text-xs text-warm-600">Marcarlo como pagado ahora</span>
              </label>

              <div class="flex gap-2">
                <button (click)="showServiceForm.set(false)"
                  class="flex-1 px-3 py-2 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-white transition-colors">
                  Cancelar
                </button>
                <button (click)="saveService()" [disabled]="busy() || !canSaveService()"
                  class="flex-1 px-3 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50">
                  Guardar servicio
                </button>
              </div>
            </div>
          }
        }
      </div>

      <!-- ── Totales + Pagar todo ───────────────────────────────────── -->
      <div class="pt-4 border-t border-warm-100">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm text-warm-500">Total pendiente del mes</span>
          <span class="text-lg font-bold text-warm-900">
            {{ pendingTotal() | currency:'COP':'symbol-narrow':'1.0-0' }}
          </span>
        </div>

        @if (pendingTotal() > 0 && canPayAll()) {
          @if (!confirmingPayAll()) {
            <button (click)="confirmingPayAll.set(true)" [disabled]="busy()"
              class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
              <mat-icon class="text-[18px]">done_all</mat-icon>
              Pagar todo
            </button>
          } @else {
            <div class="p-3 border border-green-200 bg-green-50 rounded-lg space-y-2">
              <p class="text-xs font-semibold text-green-800 uppercase tracking-wide">Se registrará</p>
              <div class="space-y-1">
                @if (rentPending()) {
                  <div class="flex justify-between text-sm">
                    <span class="text-warm-700">Arriendo</span>
                    <span class="font-medium text-warm-900">{{ rentAmount() | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                  </div>
                }
                @for (r of pendingReceipts(); track r.id) {
                  <div class="flex justify-between text-sm">
                    <span class="text-warm-700 truncate">{{ r.serviceName }}</span>
                    <span class="font-medium text-warm-900">{{ r.propertyAmount | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                  </div>
                }
              </div>
              <div class="flex justify-between pt-2 border-t border-green-200 text-sm font-bold text-warm-900">
                <span>Total</span>
                <span>{{ pendingTotal() | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
              </div>
              <p class="text-[11px] text-green-700">
                Los servicios pagados quedan además como gasto de categoría «servicio» en Finanzas.
              </p>
              <div class="flex gap-2 pt-1">
                <button (click)="confirmingPayAll.set(false)" [disabled]="busy()"
                  class="flex-1 px-3 py-2 border border-warm-200 bg-white text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors disabled:opacity-50">
                  Cancelar
                </button>
                <button (click)="payAll()" [disabled]="busy()"
                  class="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  @if (busy()) {
                    <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  }
                  Confirmar
                </button>
              </div>
            </div>
          }
        } @else if (pendingTotal() === 0 && !loading()) {
          <div class="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium">
            <mat-icon class="text-[18px]">check_circle</mat-icon>
            Todo al día este mes
          </div>
        }
      </div>
    </div>
  `,
})
export class MonthSettlementDialogComponent {
  private dialogRef = inject(MatDialogRef<MonthSettlementDialogComponent>);
  data: MonthSettlementDialogData = inject(MAT_DIALOG_DATA);
  private receiptService = inject(ServiceReceiptService);
  private utilityService = inject(UtilityServiceService);
  private paymentService = inject(PaymentService);
  private snackBar = inject(MatSnackBar);

  label = monthLabel(this.data.month);
  busy = signal(false);

  // ── Servicios del mes ──────────────────────────────────────────────────
  private receiptsSignal = toSignal(
    this.receiptService.getByPropertyAndMonth(this.data.property.id!, this.data.month),
    { initialValue: undefined }
  );
  loading = computed(() => this.receiptsSignal() === undefined);
  receipts = computed(() => this.receiptsSignal() ?? []);
  paidCount = computed(() => this.receipts().filter(r => r.isPaid).length);
  pendingReceipts = computed(() => this.receipts().filter(r => !r.isPaid));
  servicesPendingTotal = computed(() =>
    this.pendingReceipts().reduce((s, r) => s + (r.propertyAmount ?? 0), 0)
  );

  services = toSignal(this.utilityService.getAll(), { initialValue: [] });
  activeServices = computed(() => this.services().filter(s => s.isActive !== false));

  // ── Arriendo del mes ───────────────────────────────────────────────────
  private payments = toSignal(this.paymentService.getByProperty(this.data.property.id!), {
    initialValue: [],
  });

  rentPayment = computed(() =>
    this.payments().find(p => {
      const d = p.date?.toDate?.();
      if (!d) return false;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === this.data.month;
    })
  );

  showRent = computed(() =>
    this.data.property.status === 'ocupado' && !this.data.property.paymentFree
  );
  rentPaid = computed(() => !!this.rentPayment());
  rentPending = computed(() => this.showRent() && !this.rentPaid());
  rentAmount = signal(
    this.data.property.tenantRentPrice ?? this.data.property.rentPrice ?? 0
  );

  pendingTotal = computed(
    () => this.servicesPendingTotal() + (this.rentPending() ? this.rentAmount() : 0)
  );

  canPayAll = computed(() =>
    (this.rentPending() && this.data.canWritePagos) ||
    (this.pendingReceipts().length > 0 && this.data.canWriteServicios)
  );

  // ── Estado de formularios ──────────────────────────────────────────────
  showRentForm = signal(false);
  showServiceForm = signal(false);
  creatingService = signal(false);
  confirmingPayAll = signal(this.data.startInPayAll ?? false);

  formServiceId = '';
  newServiceName = '';
  formAmount = signal(0);
  formNotes = '';
  formMarkPaid = false;

  canSaveService(): boolean {
    const hasService = this.creatingService()
      ? this.newServiceName.trim().length > 0
      : !!this.formServiceId;
    return hasService && this.formAmount() > 0;
  }

  openServiceForm() {
    this.formServiceId = '';
    this.newServiceName = '';
    this.formAmount.set(0);
    this.formNotes = '';
    this.formMarkPaid = false;
    this.creatingService.set(this.activeServices().length === 0);
    this.showServiceForm.set(true);
  }

  // ── Acciones ───────────────────────────────────────────────────────────

  async saveService() {
    if (!this.canSaveService()) return;
    this.busy.set(true);
    try {
      let serviceId = this.formServiceId;
      let serviceName = this.activeServices().find(s => s.id === serviceId)?.name ?? '';
      let serviceIcon = this.activeServices().find(s => s.id === serviceId)?.icon;

      if (this.creatingService()) {
        serviceName = this.newServiceName.trim();
        serviceId = await this.utilityService.create({
          name: serviceName,
          icon: 'receipt_long',
          description: '',
          isActive: true,
        });
        serviceIcon = 'receipt_long';
      }

      await this.receiptService.createManual({
        propertyId: this.data.property.id!,
        propertyName: this.data.property.name,
        serviceId,
        serviceName,
        serviceIcon,
        month: this.data.month,
        amount: this.formAmount(),
        notes: this.formNotes.trim() || undefined,
        markPaid: this.formMarkPaid,
      });

      this.showServiceForm.set(false);
      this.creatingService.set(false);
      this.snackBar.open('Servicio registrado.', 'OK', { duration: 3000, panelClass: 'snackbar-success' });
    } catch {
      this.snackBar.open('No se pudo registrar el servicio.', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    } finally {
      this.busy.set(false);
    }
  }

  async togglePaid(receipt: ServiceReceipt) {
    this.busy.set(true);
    try {
      await this.receiptService.setPaid(receipt, !receipt.isPaid);
    } catch {
      this.snackBar.open('No se pudo actualizar el recibo.', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    } finally {
      this.busy.set(false);
    }
  }

  // ── Edición en línea ───────────────────────────────────────────────────
  editingId = signal<string | null>(null);
  editAmount = signal(0);
  editNotes = '';
  editMonth = '';

  startEdit(receipt: ServiceReceipt) {
    this.editingId.set(receipt.id!);
    this.editAmount.set(receipt.propertyAmount);
    this.editNotes = receipt.notes ?? '';
    this.editMonth = receipt.month;
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  async saveEdit(receipt: ServiceReceipt) {
    if (this.editAmount() <= 0) return;
    this.busy.set(true);
    try {
      if (this.editAmount() !== receipt.propertyAmount) {
        // Propaga el nuevo monto al gasto asociado si el recibo ya estaba pagado
        await this.receiptService.updateAmount(receipt, this.editAmount());
      }
      if (this.editNotes !== (receipt.notes ?? '')) {
        await this.receiptService.update(receipt.id!, { notes: this.editNotes });
      }
      const movido = this.editMonth !== receipt.month;
      if (movido) {
        await this.receiptService.changeMonth(receipt, this.editMonth);
      }
      this.editingId.set(null);
      this.snackBar.open(
        movido ? `Recibo movido a ${this.editMonth}.` : 'Recibo actualizado.',
        'OK',
        { duration: 3000, panelClass: 'snackbar-success' }
      );
    } catch {
      this.snackBar.open('No se pudo actualizar el recibo.', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    } finally {
      this.busy.set(false);
    }
  }

  async removeReceipt(receipt: ServiceReceipt) {
    const extra = receipt.origin !== 'manual' && receipt.assignmentCode
      ? `\n\nEs un recibo generado por el código ${receipt.assignmentCode}. Si regeneras ese código para este mes, volverá a crearse.`
      : '';
    const gasto = receipt.isPaid && receipt.expenseId
      ? '\n\nSe eliminará también el gasto asociado en Finanzas.'
      : '';
    if (!confirm(`¿Eliminar el recibo de ${receipt.serviceName}?${extra}${gasto}`)) return;
    this.busy.set(true);
    try {
      await this.receiptService.delete(receipt);
      if (this.editingId() === receipt.id) this.editingId.set(null);
      this.snackBar.open('Recibo eliminado.', 'OK', { duration: 3000, panelClass: 'snackbar-success' });
    } catch {
      this.snackBar.open('No se pudo eliminar el recibo.', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    } finally {
      this.busy.set(false);
    }
  }

  async payRent() {
    if (this.rentAmount() <= 0) return;
    this.busy.set(true);
    try {
      await this.paymentService.create({
        propertyId: this.data.property.id!,
        amount: this.rentAmount(),
        date: paymentDateForMonth(this.data.month),
        notes: `Arriendo ${this.label}`,
      });
      this.showRentForm.set(false);
      this.snackBar.open('Pago de arriendo registrado.', 'OK', { duration: 3000, panelClass: 'snackbar-success' });
    } catch {
      this.snackBar.open('No se pudo registrar el pago.', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    } finally {
      this.busy.set(false);
    }
  }

  async payAll() {
    this.busy.set(true);
    try {
      if (this.rentPending() && this.data.canWritePagos && this.rentAmount() > 0) {
        await this.paymentService.create({
          propertyId: this.data.property.id!,
          amount: this.rentAmount(),
          date: paymentDateForMonth(this.data.month),
          notes: `Arriendo ${this.label}`,
        });
      }
      if (this.data.canWriteServicios) {
        await this.receiptService.markManyPaid(this.pendingReceipts());
      }
      this.confirmingPayAll.set(false);
      this.snackBar.open('Mes liquidado.', 'OK', { duration: 3000, panelClass: 'snackbar-success' });
    } catch {
      this.snackBar.open('No se pudo completar el pago.', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    } finally {
      this.busy.set(false);
    }
  }

  close() {
    this.dialogRef.close();
  }
}
