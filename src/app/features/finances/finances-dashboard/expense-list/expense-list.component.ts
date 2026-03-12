import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Expense, ExpenseCategory } from '../../../../core/models/expense.model';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  reparacion: 'Reparación',
  impuesto: 'Impuesto',
  servicio: 'Servicio',
  otro: 'Otro',
};

const CATEGORY_CLASSES: Record<ExpenseCategory, string> = {
  reparacion: 'bg-amber-100 text-amber-700',
  impuesto: 'bg-red-100 text-red-700',
  servicio: 'bg-blue-100 text-blue-700',
  otro: 'bg-warm-100 text-warm-600',
};

@Component({
  selector: 'app-expense-list',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">
      <div class="px-5 py-4 border-b border-warm-100 flex items-center justify-between">
        <h2 class="font-semibold text-warm-900">Gastos del mes</h2>
        <div class="flex items-center gap-2">
          <span class="text-xs text-warm-400">{{ expenses().length }} registros</span>
          @if (canWrite()) {
            <button
              (click)="addExpense.emit()"
              class="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-xs font-medium"
            >
              <mat-icon class="text-[16px]">add</mat-icon>
              Registrar
            </button>
          }
        </div>
      </div>

      @if (expenses().length === 0) {
        <div class="px-5 py-10 text-center">
          <mat-icon class="text-warm-300 text-[40px]">receipt_long</mat-icon>
          <p class="text-warm-400 text-sm mt-2">No hay gastos en {{ monthLabel() }}</p>
          @if (canWrite()) {
            <button
              (click)="addExpense.emit()"
              class="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
            >
              Registrar primer gasto
            </button>
          }
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-warm-400 uppercase tracking-wide border-b border-warm-100">
                <th class="px-5 py-3 font-medium">Fecha</th>
                <th class="px-5 py-3 font-medium">Categoría</th>
                <th class="px-5 py-3 font-medium">Descripción</th>
                <th class="px-5 py-3 font-medium">Propiedad</th>
                <th class="px-5 py-3 font-medium text-right">Monto</th>
                @if (canWrite()) { <th class="px-5 py-3 font-medium"></th> }
              </tr>
            </thead>
            <tbody class="divide-y divide-warm-50">
              @for (e of expenses(); track e.id) {
                <tr class="hover:bg-warm-50 transition-colors">
                  <td class="px-5 py-3 text-warm-600">
                    {{ e.date?.toDate() | date:'d MMM y' }}
                  </td>
                  <td class="px-5 py-3">
                    <span
                      class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                      [ngClass]="categoryClass(e.category)"
                    >
                      {{ categoryLabel(e.category) }}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-warm-800 max-w-[200px] truncate">
                    {{ e.description }}
                  </td>
                  <td class="px-5 py-3 text-warm-600 truncate max-w-[120px]">
                    {{ e.propertyName }}
                  </td>
                  <td class="px-5 py-3 text-right font-semibold text-warm-900">
                    {{ e.amount | currency:'COP':'symbol-narrow':'1.0-0' }}
                  </td>
                  @if (canWrite()) {
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-1 justify-end">
                        <button
                          (click)="editExpense.emit(e)"
                          class="p-1.5 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                          title="Editar"
                        >
                          <mat-icon class="text-[16px]">edit</mat-icon>
                        </button>
                        <button
                          (click)="deleteExpense.emit(e)"
                          class="p-1.5 rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <mat-icon class="text-[16px]">delete</mat-icon>
                        </button>
                      </div>
                    </td>
                  }
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="border-t-2 border-warm-200 bg-warm-50">
                <td colspan="4" class="px-5 py-3 text-sm font-semibold text-warm-700">Total</td>
                <td class="px-5 py-3 text-right font-bold text-warm-900">
                  {{ total() | currency:'COP':'symbol-narrow':'1.0-0' }}
                </td>
                @if (canWrite()) { <td></td> }
              </tr>
            </tfoot>
          </table>
        </div>
      }
    </div>
  `,
})
export class ExpenseListComponent {
  expenses = input.required<Expense[]>();
  month = input.required<Date>();
  canWrite = input<boolean>(true);
  addExpense = output<void>();
  editExpense = output<Expense>();
  deleteExpense = output<Expense>();

  total = computed(() => this.expenses().reduce((s, e) => s + e.amount, 0));

  monthLabel() {
    const d = this.month();
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  categoryLabel(cat: ExpenseCategory): string {
    return CATEGORY_LABELS[cat] ?? cat;
  }

  categoryClass(cat: ExpenseCategory): string {
    return CATEGORY_CLASSES[cat] ?? 'bg-warm-100 text-warm-600';
  }
}
