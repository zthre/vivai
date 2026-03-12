import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PaymentService } from '../../../core/services/payment.service';
import { Payment } from '../../../core/models/payment.model';

function localDateString(date?: Date): string {
  const d = date ?? new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-payment-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-5">
        <div>
          <h2 class="text-lg font-bold text-warm-900">{{ isEdit ? 'Editar pago' : 'Registrar pago' }}</h2>
          <p class="text-sm text-warm-400">
            {{ data.label ?? ('Propiedad · ' + data.propertyId) }}
          </p>
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
              placeholder="0"
              class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              [class.border-red-400]="form.get('amount')?.invalid && form.get('amount')?.touched"
            >
          </div>
          @if (data.rentPrice && !isEdit) {
            <p class="text-xs text-warm-400 mt-1">
              Renta mensual: <span class="font-medium text-warm-600">{{ data.rentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
            </p>
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
            Guardar
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

  data: {
    propertyId: string;
    rentPrice?: number | null;
    label?: string;
    payment?: Payment;
  } = inject(MAT_DIALOG_DATA);

  isEdit = !!this.data.payment;
  loading = signal(false);

  form = this.fb.group({
    amount: [
      (this.data.payment?.amount ?? this.data.rentPrice ?? null) as number | null,
      [Validators.required, Validators.min(1)],
    ],
    date: [
      this.data.payment
        ? localDateString(this.data.payment.date.toDate())
        : localDateString(),
      Validators.required,
    ],
    notes: [this.data.payment?.notes ?? ''],
  });

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      const { amount, date, notes } = this.form.value;
      if (this.isEdit && this.data.payment?.id) {
        await this.paymentService.update(this.data.payment.id, {
          amount: amount!,
          date: parseLocalDate(date!),
          notes: notes || null,
        });
        this.snackBar.open('Pago actualizado', 'OK', {
          duration: 3000,
          panelClass: 'snackbar-success',
        });
      } else {
        await this.paymentService.create({
          propertyId: this.data.propertyId,
          amount: amount!,
          date: parseLocalDate(date!),
          notes: notes || null,
        });
        this.snackBar.open('Pago registrado', 'OK', {
          duration: 3000,
          panelClass: 'snackbar-success',
        });
      }
      this.dialogRef.close(true);
    } catch (e) {
      this.snackBar.open('Error al guardar el pago', 'OK', {
        duration: 3000,
        panelClass: 'snackbar-error',
      });
    } finally {
      this.loading.set(false);
    }
  }

  close() {
    this.dialogRef.close();
  }
}
