import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="p-6 max-w-sm">
      <div class="flex items-start gap-3 mb-4">
        <div
          class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          [class.bg-red-100]="data.danger"
          [class.bg-warm-100]="!data.danger"
        >
          <mat-icon
            [class.text-red-600]="data.danger"
            [class.text-warm-600]="!data.danger"
          >
            {{ data.danger ? 'warning' : 'help' }}
          </mat-icon>
        </div>
        <div>
          <h3 class="font-semibold text-warm-900">{{ data.title }}</h3>
          <p class="text-sm text-warm-500 mt-1">{{ data.message }}</p>
        </div>
      </div>
      <div class="flex gap-3 justify-end">
        <button
          (click)="dialogRef.close(false)"
          class="px-4 py-2 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          (click)="dialogRef.close(true)"
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white"
          [class.bg-red-600]="data.danger"
          [class.hover:bg-red-700]="data.danger"
          [class.bg-primary-600]="!data.danger"
          [class.hover:bg-primary-700]="!data.danger"
        >
          {{ data.confirmLabel ?? 'Confirmar' }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  data: ConfirmDialogData = inject(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
}
