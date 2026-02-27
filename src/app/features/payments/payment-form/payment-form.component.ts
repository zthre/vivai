import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PaymentService } from '../../../core/services/payment.service';

@Component({
  selector: 'app-payment-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-5">
        <div>
          <h2 class="text-lg font-bold text-warm-900">Registrar pago</h2>
          <p class="text-sm text-warm-400">Unidad · {{ data.unitId }}</p>
        </div>
        <button (click)="close()" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
        <!-- Monto -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Monto *</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
            <input
              formControlName="amount"
              type="number"
              [placeholder]="data.rentPrice"
              class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              [class.border-red-400]="form.get('amount')?.invalid && form.get('amount')?.touched"
            >
          </div>
          @if (data.rentPrice) {
            <button type="button" (click)="form.get('amount')?.setValue(data.rentPrice)"
              class="text-xs text-primary-600 hover:text-primary-700 mt-1">
              Usar precio de renta ({{ data.rentPrice | currency:'COP':'symbol-narrow':'1.0-0' }})
            </button>
          }
        </div>

        <!-- Fecha -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Fecha del pago *</label>
          <input
            formControlName="date"
            type="date"
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
        </div>

        <!-- Notas -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Notas (opcional)</label>
          <input
            formControlName="notes"
            type="text"
            placeholder="Ej: Pago mes de enero"
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-2">
          <button type="button" (click)="close()"
            class="flex-1 px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors">
            Cancelar
          </button>
          <button type="submit" [disabled]="form.invalid || loading()"
            class="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            @if (loading()) {
              <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
            }
            Guardar pago
          </button>
        </div>
      </form>
    </div>
  `,
})
export class PaymentFormComponent {
  private paymentService = inject(PaymentService);
  private dialogRef = inject(MatDialogRef<PaymentFormComponent>);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  data: { unitId: string; propertyId: string; rentPrice?: number } = inject(MAT_DIALOG_DATA);

  loading = signal(false);

  form = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    date: [new Date().toISOString().split('T')[0], Validators.required],
    notes: [''],
  });

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      const { amount, date, notes } = this.form.value;
      await this.paymentService.create({
        unitId: this.data.unitId,
        propertyId: this.data.propertyId,
        amount: amount!,
        date: new Date(date!),
        notes: notes || null,
      });
      this.snackBar.open('Pago registrado exitosamente.', 'OK', { duration: 3000 });
      this.dialogRef.close(true);
    } finally {
      this.loading.set(false);
    }
  }

  close() {
    this.dialogRef.close();
  }
}
