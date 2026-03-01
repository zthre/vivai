import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { PropertyService } from '../../../core/services/property.service';
import { UnitService } from '../../../core/services/unit.service';
import { PaymentService } from '../../../core/services/payment.service';
import { ExpenseService } from '../../../core/services/expense.service';
import { Expense } from '../../../core/models/expense.model';
import { MonthSelectorComponent } from './month-selector/month-selector.component';
import { KpiCardComponent, KpiVariant } from './kpi-card/kpi-card.component';
import { PaymentListComponent } from './payment-list/payment-list.component';
import { ExpenseListComponent } from './expense-list/expense-list.component';
import { ExpenseFormComponent } from './expense-form/expense-form.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function toMonthParam(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function fromMonthParam(param: string): Date | null {
  const [y, m] = param.split('-').map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, 1);
}

@Component({
  selector: 'app-finances-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatDialogModule,
    MonthSelectorComponent,
    KpiCardComponent,
    PaymentListComponent,
    ExpenseListComponent,
  ],
  template: `
    <div class="space-y-6">

      <!-- Header + filters -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 class="text-2xl font-bold text-warm-900">Finanzas</h1>

        <div class="flex flex-wrap items-center gap-3">
          <app-month-selector
            [month]="selectedMonth()"
            (monthChange)="onMonthChange($event)"
          />

          <select
            [value]="selectedPropertyId() ?? ''"
            (change)="onPropertyChange($event)"
            class="px-3 py-1.5 border border-warm-200 rounded-lg text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
          >
            <option value="">Todas las propiedades</option>
            @for (p of properties(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </div>
      </div>

      <!-- KPI cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <app-kpi-card label="Total Esperado" [amount]="totalExpected()" />
        <app-kpi-card label="Total Recaudado" [amount]="totalCollected()" />
        <app-kpi-card label="Total Gastos" [amount]="totalExpensesAmount()" />
        <app-kpi-card
          label="Balance Neto"
          [amount]="netBalance()"
          [variant]="balanceVariant()"
        />
      </div>

      <!-- Lists -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <app-payment-list
          [payments]="filteredPayments()"
          [properties]="properties()"
          [units]="allUnits()"
          [month]="selectedMonth()"
        />

        <app-expense-list
          [expenses]="filteredExpenses()"
          [month]="selectedMonth()"
          (addExpense)="openExpenseForm()"
          (editExpense)="openExpenseForm($event)"
          (deleteExpense)="confirmDelete($event)"
        />
      </div>
    </div>
  `,
})
export class FinancesDashboardComponent implements OnInit {
  private propertyService = inject(PropertyService);
  private unitService = inject(UnitService);
  private paymentService = inject(PaymentService);
  private expenseService = inject(ExpenseService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  selectedMonth = signal<Date>(startOfMonth(new Date()));
  selectedPropertyId = signal<string | null>(null);

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });
  allUnits = toSignal(this.unitService.getAllOccupied(), { initialValue: [] });

  private month$ = toObservable(this.selectedMonth);

  paymentsInMonth = toSignal(
    this.month$.pipe(
      switchMap(m => this.paymentService.getByMonth(startOfMonth(m), endOfMonth(m)))
    ),
    { initialValue: [] }
  );

  expensesInMonth = toSignal(
    this.month$.pipe(
      switchMap(m => this.expenseService.getByMonth(startOfMonth(m), endOfMonth(m)))
    ),
    { initialValue: [] }
  );

  filteredPayments = computed(() => {
    const pid = this.selectedPropertyId();
    return pid
      ? this.paymentsInMonth().filter(p => p.propertyId === pid)
      : this.paymentsInMonth();
  });

  filteredExpenses = computed(() => {
    const pid = this.selectedPropertyId();
    return pid
      ? this.expensesInMonth().filter(e => e.propertyId === pid)
      : this.expensesInMonth();
  });

  filteredOccupiedUnits = computed(() => {
    const pid = this.selectedPropertyId();
    return pid
      ? this.allUnits().filter(u => u.propertyId === pid)
      : this.allUnits();
  });

  totalExpected = computed(() =>
    this.filteredOccupiedUnits().reduce((s, u) => s + u.rentPrice, 0)
  );
  totalCollected = computed(() =>
    this.filteredPayments().reduce((s, p) => s + p.amount, 0)
  );
  totalExpensesAmount = computed(() =>
    this.filteredExpenses().reduce((s, e) => s + e.amount, 0)
  );
  netBalance = computed(() => this.totalCollected() - this.totalExpensesAmount());
  balanceVariant = computed((): KpiVariant => {
    const b = this.netBalance();
    return b > 0 ? 'positive' : b < 0 ? 'negative' : 'neutral';
  });

  constructor() {
    // Sync filters to queryParams
    effect(() => {
      const monthParam = toMonthParam(this.selectedMonth());
      const pid = this.selectedPropertyId();
      const qp: Record<string, string> = { month: monthParam };
      if (pid) qp['propertyId'] = pid;
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: qp,
        replaceUrl: true,
      });
    });
  }

  ngOnInit() {
    const params = this.route.snapshot.queryParams;
    if (params['month']) {
      const d = fromMonthParam(params['month']);
      if (d) this.selectedMonth.set(d);
    }
    if (params['propertyId']) {
      this.selectedPropertyId.set(params['propertyId']);
    }
  }

  onMonthChange(d: Date) {
    this.selectedMonth.set(d);
  }

  onPropertyChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedPropertyId.set(value || null);
  }

  openExpenseForm(expense?: Expense) {
    this.dialog.open(ExpenseFormComponent, {
      data: { expense },
      width: '520px',
      maxWidth: '95vw',
    });
  }

  confirmDelete(expense: Expense) {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar gasto',
        message: `¿Eliminar "${expense.description}"? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
        danger: true,
      },
    });
    ref.afterClosed().subscribe(async confirmed => {
      if (confirmed && expense.id) {
        await this.expenseService.delete(expense.id);
      }
    });
  }
}
