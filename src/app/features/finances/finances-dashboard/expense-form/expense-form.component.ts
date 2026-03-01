import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { toSignal } from '@angular/core/rxjs-interop';
import { PropertyService } from '../../../../core/services/property.service';
import { UnitService } from '../../../../core/services/unit.service';
import { ExpenseService } from '../../../../core/services/expense.service';
import { Expense, ExpenseCategory } from '../../../../core/models/expense.model';

export interface ExpenseFormData {
  expense?: Expense;
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

@Component({
  selector: 'app-expense-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule, MatSelectModule],
  template: `
    <div class="p-6 w-full max-w-lg">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-semibold text-warm-900">
          {{ isEdit() ? 'Editar Gasto' : 'Registrar Gasto' }}
        </h2>
        <button (click)="close()" class="p-1.5 rounded-lg text-warm-400 hover:bg-warm-100 transition-colors">
          <mat-icon class="text-[20px]">close</mat-icon>
        </button>
      </div>

      <form (ngSubmit)="save()" #f="ngForm" class="space-y-4">

        <!-- Amount + Date row -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-warm-600 mb-1">Monto *</label>
            <input
              type="number"
              name="amount"
              [(ngModel)]="form.amount"
              required min="1"
              placeholder="0"
              class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
          </div>
          <div>
            <label class="block text-xs font-medium text-warm-600 mb-1">Fecha *</label>
            <input
              type="date"
              name="date"
              [(ngModel)]="form.date"
              required
              class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
          </div>
        </div>

        <!-- Category -->
        <div>
          <label class="block text-xs font-medium text-warm-600 mb-1">Categoría *</label>
          <select
            name="category"
            [(ngModel)]="form.category"
            required
            class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
          >
            <option value="" disabled>Selecciona una categoría</option>
            <option value="reparacion">Reparación</option>
            <option value="impuesto">Impuesto</option>
            <option value="servicio">Servicio</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        <!-- Description -->
        <div>
          <label class="block text-xs font-medium text-warm-600 mb-1">
            Descripción * ({{ form.description.length }}/200)
          </label>
          <input
            type="text"
            name="description"
            [(ngModel)]="form.description"
            required maxlength="200"
            placeholder="Ej: Reparación plomería baño"
            class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
          >
        </div>

        <!-- Property -->
        <div>
          <label class="block text-xs font-medium text-warm-600 mb-1">Inmueble *</label>
          <select
            name="propertyId"
            [(ngModel)]="form.propertyId"
            (ngModelChange)="onPropertyChange($event)"
            required
            class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
          >
            <option value="" disabled>Selecciona un inmueble</option>
            @for (p of properties(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </div>

        <!-- Unit (optional) -->
        @if (form.propertyId && unitsForProperty().length > 0) {
          <div>
            <label class="block text-xs font-medium text-warm-600 mb-1">Unidad (opcional)</label>
            <select
              name="unitId"
              [(ngModel)]="form.unitId"
              class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
            >
              <option [value]="null">Sin unidad específica</option>
              @for (u of unitsForProperty(); track u.id) {
                <option [value]="u.id">Unidad {{ u.number }}</option>
              }
            </select>
          </div>
        }

        <!-- Notes -->
        <div>
          <label class="block text-xs font-medium text-warm-600 mb-1">Notas (opcional)</label>
          <textarea
            name="notes"
            [(ngModel)]="form.notes"
            rows="2"
            placeholder="Información adicional..."
            class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
          ></textarea>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 justify-end pt-2">
          <button
            type="button"
            (click)="close()"
            class="px-4 py-2 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            [disabled]="!f.valid || saving()"
            class="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            @if (saving()) {
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            }
            {{ saving() ? 'Guardando...' : 'Guardar' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class ExpenseFormComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<ExpenseFormComponent>);
  private data: ExpenseFormData = inject(MAT_DIALOG_DATA);
  private propertyService = inject(PropertyService);
  private unitService = inject(UnitService);
  private expenseService = inject(ExpenseService);

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });
  private allUnits = toSignal(this.unitService.getAllOccupied(), { initialValue: [] });

  saving = signal(false);
  isEdit = signal(false);

  form = {
    amount: 0,
    date: formatDate(new Date()),
    category: '' as ExpenseCategory | '',
    description: '',
    propertyId: '',
    unitId: null as string | null,
    notes: '',
  };

  unitsForProperty = computed(() => {
    if (!this.form.propertyId) return [];
    return this.allUnits().filter(u => u.propertyId === this.form.propertyId);
  });

  ngOnInit() {
    if (this.data?.expense) {
      const e = this.data.expense;
      this.isEdit.set(true);
      this.form = {
        amount: e.amount,
        date: formatDate(e.date.toDate()),
        category: e.category,
        description: e.description,
        propertyId: e.propertyId,
        unitId: e.unitId,
        notes: e.notes ?? '',
      };
    }
  }

  onPropertyChange(propertyId: string) {
    this.form.unitId = null;
    this.form.propertyId = propertyId;
  }

  async save() {
    if (!this.form.category || !this.form.propertyId) return;
    this.saving.set(true);

    const selectedProperty = this.properties().find(p => p.id === this.form.propertyId);
    const selectedUnit = this.form.unitId
      ? this.allUnits().find(u => u.id === this.form.unitId)
      : null;

    const payload = {
      amount: Number(this.form.amount),
      date: new Date(this.form.date + 'T12:00:00'),
      category: this.form.category as ExpenseCategory,
      description: this.form.description,
      propertyId: this.form.propertyId,
      propertyName: selectedProperty?.name ?? '',
      unitId: this.form.unitId,
      unitNumber: selectedUnit?.number ?? null,
      notes: this.form.notes || null,
    };

    try {
      if (this.isEdit() && this.data.expense?.id) {
        await this.expenseService.update(this.data.expense.id, payload);
      } else {
        await this.expenseService.create(payload);
      }
      this.dialogRef.close(true);
    } catch {
      this.saving.set(false);
    }
  }

  close() {
    this.dialogRef.close(false);
  }
}
