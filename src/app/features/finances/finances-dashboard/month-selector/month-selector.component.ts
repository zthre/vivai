import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

@Component({
  selector: 'app-month-selector',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="flex items-center gap-1">
      <button
        (click)="prev()"
        class="p-1.5 rounded-lg text-warm-500 hover:bg-warm-100 transition-colors"
      >
        <mat-icon class="text-[20px]">chevron_left</mat-icon>
      </button>
      <span class="text-sm font-semibold text-warm-800 min-w-[120px] text-center">
        {{ label() }}
      </span>
      <button
        (click)="next()"
        class="p-1.5 rounded-lg text-warm-500 hover:bg-warm-100 transition-colors"
      >
        <mat-icon class="text-[20px]">chevron_right</mat-icon>
      </button>
    </div>
  `,
})
export class MonthSelectorComponent {
  month = input.required<Date>();
  monthChange = output<Date>();

  label() {
    const d = this.month();
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  prev() {
    const d = this.month();
    this.monthChange.emit(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  next() {
    const d = this.month();
    this.monthChange.emit(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
}
