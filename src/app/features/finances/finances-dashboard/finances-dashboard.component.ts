import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { PropertyService } from '../../../core/services/property.service';
import { PaymentService } from '../../../core/services/payment.service';
import { ExpenseService } from '../../../core/services/expense.service';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { Expense } from '../../../core/models/expense.model';
import { Payment } from '../../../core/models/payment.model';
import { ServiceReceipt } from '../../../core/models/service-receipt.model';
import { MonthSelectorComponent } from './month-selector/month-selector.component';
import { KpiCardComponent, KpiVariant } from './kpi-card/kpi-card.component';
import { PaymentListComponent } from './payment-list/payment-list.component';
import { ExpenseListComponent } from './expense-list/expense-list.component';
import { ExpenseFormComponent } from './expense-form/expense-form.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionService } from '../../../core/auth/permissions';
import { fromMonthKey, monthKey, startOfMonth } from '../../../core/utils/month.util';

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
    <div class="space-y-4">

      <!-- Filters -->
      <div class="flex flex-wrap items-center justify-end gap-3">
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

      <!-- KPI cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <app-kpi-card
          label="Total Esperado"
          [amount]="totalExpected()"
          [hint]="expectedHint()"
        />
        <app-kpi-card label="Total Recaudado" [amount]="totalCollected()" />
        <app-kpi-card
          label="Total Gastos"
          [amount]="totalExpensesAmount()"
          [hint]="expensesHint()"
        />
        <app-kpi-card
          label="Balance Neto"
          [amount]="netBalance()"
          [variant]="balanceVariant()"
        />
      </div>

      <!-- Servicios del mes -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <app-kpi-card
          label="Servicios del mes"
          [amount]="servicesTotal()"
          [hint]="servicesHint()"
          [hintVariant]="servicesPendingTotal() > 0 ? 'negative' : 'positive'"
        />
        <div class="col-span-1 lg:col-span-3 bg-white rounded-xl p-5 border border-warm-200 shadow-sm flex items-center">
          <div class="text-sm text-warm-500 leading-relaxed">
            «Total Esperado» es solo el arriendo de las propiedades ocupadas.
            Los servicios no son ingreso: entran en «Total Gastos» cuando marcas
            el recibo como pagado, y por eso afectan al balance, no a lo esperado.
          </div>
        </div>
      </div>

      <!-- Lists -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <app-payment-list
          [payments]="filteredPayments()"
          [properties]="properties()"
          [month]="selectedMonth()"
        />

        <app-expense-list
          [expenses]="filteredExpenses()"
          [month]="selectedMonth()"
          [canWrite]="canWriteFinances()"
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
  private paymentService = inject(PaymentService);
  private expenseService = inject(ExpenseService);
  private receiptService = inject(ServiceReceiptService);
  private authService = inject(AuthService);
  private permissions = inject(PermissionService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  selectedMonth = signal<Date>(startOfMonth(new Date()));
  selectedPropertyId = signal<string | null>(null);

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  private month$ = toObservable(this.selectedMonth);

  /**
   * Pagos, gastos y recibos del mes en todo el círculo: una consulta cada uno.
   *
   * Los pagos se abrían propiedad por propiedad, y cada consulta traía el
   * historial COMPLETO para filtrar el mes en memoria.
   *
   * Los gastos, en cambio, se consultaban por `ownerId == uid`. Como un gasto se
   * atribuye siempre al DUEÑO de la propiedad —incluso cuando lo crea un
   * colaborador—, a un colaborador esa consulta no le devolvía nada: veía los
   * pagos y los recibos del mes, pero la lista de gastos y el KPI de balance le
   * salían en cero. Con el círculo, ve lo mismo que el dueño.
   */
  private period$ = toObservable(computed(() => monthKey(this.selectedMonth())));

  paymentsInMonth = toSignal(
    this.period$.pipe(switchMap(period => this.paymentService.getByCircleAndPeriod(period))),
    { initialValue: [] as Payment[] }
  );

  expensesInMonth = toSignal(
    this.period$.pipe(switchMap(period => this.expenseService.getByCircleAndPeriod(period))),
    { initialValue: [] as Expense[] }
  );

  private receiptsInMonth = toSignal(
    this.period$.pipe(switchMap(period => this.receiptService.getByCircleAndMonth(period))),
    { initialValue: [] as ServiceReceipt[] }
  );

  /** Recibos del mes, respetando el filtro de propiedad */
  private filteredReceipts = computed(() => {
    const pid = this.selectedPropertyId();
    const all = this.receiptsInMonth();
    return pid ? all.filter(r => r.propertyId === pid) : all;
  });

  servicesTotal = computed(() =>
    this.filteredReceipts().reduce((s, r) => s + (r.propertyAmount ?? 0), 0)
  );
  servicesPendingTotal = computed(() =>
    this.filteredReceipts().filter(r => !r.isPaid).reduce((s, r) => s + (r.propertyAmount ?? 0), 0)
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

  filteredOccupiedProperties = computed(() => {
    const pid = this.selectedPropertyId();
    const occupied = this.properties().filter(p => p.status === 'ocupado');
    return pid ? occupied.filter(p => p.id === pid) : occupied;
  });

  totalExpected = computed(() =>
    this.filteredOccupiedProperties().reduce((s, p) => s + (p.tenantRentPrice ?? p.rentPrice ?? 0), 0)
  );
  totalCollected = computed(() =>
    this.filteredPayments().reduce((s, p) => s + p.amount, 0)
  );
  totalExpensesAmount = computed(() =>
    this.filteredExpenses().reduce((s, e) => s + e.amount, 0)
  );
  netBalance = computed(() => this.totalCollected() - this.totalExpensesAmount());

  /** Formatea un monto en pesos sin decimales, para las líneas secundarias */
  private cop(n: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  }

  /** Arriendo + servicios del mes, para ver el movimiento total esperado */
  expectedHint = computed(() => {
    const servicios = this.servicesTotal();
    if (servicios === 0) return '';
    return `+ ${this.cop(servicios)} en servicios = ${this.cop(this.totalExpected() + servicios)}`;
  });

  /** Cuánto de los gastos del mes corresponde a servicios ya pagados */
  expensesHint = computed(() => {
    const deServicios = this.filteredExpenses()
      .filter(e => e.category === 'servicio')
      .reduce((s, e) => s + e.amount, 0);
    if (deServicios === 0) return '';
    return `${this.cop(deServicios)} son servicios`;
  });

  servicesHint = computed(() => {
    const pendiente = this.servicesPendingTotal();
    if (this.filteredReceipts().length === 0) return 'Sin recibos este mes';
    return pendiente > 0 ? `${this.cop(pendiente)} pendiente` : 'Todo pagado';
  });
  balanceVariant = computed((): KpiVariant => {
    const b = this.netBalance();
    return b > 0 ? 'positive' : b < 0 ? 'negative' : 'neutral';
  });

  canWriteFinances = computed(() => {
    if (!this.authService.uid()) return false;
    if (this.authService.activeRole() !== 'colaborador') return true;
    const pid = this.selectedPropertyId();
    if (pid) {
      return this.permissions.can(this.properties().find(p => p.id === pid), 'gastos');
    }
    // Sin propiedad seleccionada: basta con poder registrar gastos en alguna
    return this.permissions.canOnAny(this.properties(), 'gastos');
  });

  constructor() {
    // Sync filters to queryParams
    effect(() => {
      const monthParam = monthKey(this.selectedMonth());
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
      const d = fromMonthKey(params['month']);
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
