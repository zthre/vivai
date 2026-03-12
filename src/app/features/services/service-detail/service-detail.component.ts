import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { UtilityServiceService } from '../../../core/services/utility-service.service';
import { ServiceAssignmentService } from '../../../core/services/service-assignment.service';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { PropertyService } from '../../../core/services/property.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Property } from '../../../core/models/property.model';
import { ServiceAssignment } from '../../../core/models/service-assignment.model';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

type DistMethod = 'por_persona' | 'partes_iguales' | 'manual';

@Component({
  selector: 'app-service-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatSnackBarModule],
  template: `
    <div class="space-y-6">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 text-sm text-warm-400">
        <a routerLink="/services" class="hover:text-warm-600 transition-colors">Servicios</a>
        <mat-icon class="text-[16px]">chevron_right</mat-icon>
        <span class="text-warm-700 font-medium">{{ service()?.name }}</span>
      </div>

      <!-- Header (full width) -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-6">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <mat-icon class="text-primary-600 text-[28px]">{{ service()?.icon || 'receipt_long' }}</mat-icon>
            </div>
            <div>
              <h1 class="text-2xl font-bold text-warm-900">{{ service()?.name }}</h1>
              @if (service()?.description) {
                <p class="text-warm-400 text-sm mt-0.5">{{ service()?.description }}</p>
              }
            </div>
          </div>
          <div class="flex items-center gap-2">
            @if (service()?.isActive) {
              <span class="text-xs px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Activo</span>
            } @else {
              <span class="text-xs px-2.5 py-0.5 bg-warm-100 text-warm-500 rounded-full font-medium">Inactivo</span>
            }
            <a [routerLink]="['/services', serviceId, 'edit']"
              class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
              <mat-icon class="text-[20px]">edit</mat-icon>
            </a>
          </div>
        </div>
      </div>

      <!-- Two-column layout on desktop -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left column: Assignment -->
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm h-fit">
          <div class="px-5 py-4 border-b border-warm-100">
            <h2 class="font-semibold text-warm-900">Propiedades asignadas</h2>
            <p class="text-xs text-warm-400 mt-0.5">Selecciona las propiedades que comparten este servicio</p>
          </div>
          <div class="p-5 space-y-4">
            <!-- Property checkboxes -->
            @if (allProperties().length) {
              <div class="space-y-2">
                @for (prop of allProperties(); track prop.id) {
                  <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all"
                    [class.border-primary-300]="isPropertySelected(prop.id!)"
                    [class.bg-primary-50]="isPropertySelected(prop.id!)"
                    [class.border-warm-200]="!isPropertySelected(prop.id!)">
                    <input type="checkbox"
                      [checked]="isPropertySelected(prop.id!)"
                      (change)="toggleProperty(prop.id!)"
                      class="w-4 h-4 accent-primary-500 cursor-pointer">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-warm-800">{{ prop.name }}</p>
                      <p class="text-xs text-warm-400">{{ prop.residentCount ?? 1 }} persona(s)</p>
                    </div>
                  </label>
                }
              </div>
            } @else {
              <p class="text-sm text-warm-400">No tienes propiedades registradas</p>
            }

            <!-- Distribution method -->
            @if (selectedPropertyIds().length > 0) {
              <div>
                <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2">Método de distribución</p>
                <div class="grid grid-cols-3 gap-2">
                  @for (opt of distOptions; track opt.value) {
                    <button type="button" (click)="distributionMethod.set(opt.value)"
                      class="flex flex-col items-center gap-1 p-3 border rounded-lg text-xs font-medium transition-all"
                      [class.border-primary-500]="distributionMethod() === opt.value"
                      [class.bg-primary-50]="distributionMethod() === opt.value"
                      [class.text-primary-700]="distributionMethod() === opt.value"
                      [class.border-warm-200]="distributionMethod() !== opt.value"
                      [class.text-warm-500]="distributionMethod() !== opt.value">
                      <mat-icon class="text-[18px]">{{ opt.icon }}</mat-icon>
                      {{ opt.label }}
                    </button>
                  }
                </div>
              </div>

              <button (click)="saveAssignment()" [disabled]="savingAssignment()"
                class="w-full px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                @if (savingAssignment()) {
                  <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                }
                Guardar asignación
              </button>
            }
          </div>
        </div>

        <!-- Right column: Generate receipts -->
        <div class="space-y-6">
          @if (currentAssignment()) {
            <div class="bg-white rounded-xl border border-warm-200 shadow-sm h-fit">
              <div class="px-5 py-4 border-b border-warm-100">
                <h2 class="font-semibold text-warm-900">Generar recibos del mes</h2>
              </div>
              <div class="p-5 space-y-4">
                <!-- Month selector -->
                <div class="flex items-center gap-3">
                  <button (click)="prevMonth()" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
                    <mat-icon>chevron_left</mat-icon>
                  </button>
                  <span class="text-sm font-semibold text-warm-800 min-w-[120px] text-center">{{ monthLabel() }}</span>
                  <button (click)="nextMonth()" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
                    <mat-icon>chevron_right</mat-icon>
                  </button>
                </div>

                <!-- Total amount input -->
                <div>
                  <label class="block text-sm font-medium text-warm-700 mb-1.5">Monto total del servicio</label>
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
                    <input [(ngModel)]="totalAmount" type="number" min="0" placeholder="Ej: 150000"
                      class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  </div>
                </div>

                <!-- Preview -->
                @if (totalAmount() > 0 && currentAssignment()!.distributionMethod !== 'manual') {
                  <div>
                    <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2">Vista previa</p>
                    <div class="border border-warm-200 rounded-lg overflow-hidden">
                      <table class="w-full text-sm">
                        <thead class="bg-warm-50">
                          <tr>
                            <th class="text-left px-3 py-2 text-xs font-semibold text-warm-500">Propiedad</th>
                            <th class="text-center px-3 py-2 text-xs font-semibold text-warm-500">Personas</th>
                            <th class="text-right px-3 py-2 text-xs font-semibold text-warm-500">Monto</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-warm-100">
                          @for (row of previewRows(); track row.propertyId) {
                            <tr>
                              <td class="px-3 py-2 text-warm-800">{{ row.propertyName }}</td>
                              <td class="px-3 py-2 text-center text-warm-500">{{ row.residentCount }}</td>
                              <td class="px-3 py-2 text-right font-medium text-warm-900">{{ row.amount | currency:'COP':'symbol-narrow':'1.0-0' }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                }

                @if (existingReceipts().length) {
                  <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <mat-icon class="text-amber-500 text-[18px] flex-shrink-0 mt-0.5">warning</mat-icon>
                    <p class="text-xs text-amber-700">Ya existen {{ existingReceipts().length }} recibo(s) para este mes. Al generar nuevos se reemplazarán.</p>
                  </div>
                }

                <button (click)="generateReceipts()" [disabled]="generatingReceipts() || totalAmount() <= 0"
                  class="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  @if (generatingReceipts()) {
                    <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  }
                  <mat-icon class="text-[18px]">receipt</mat-icon>
                  Generar recibos
                </button>

                @if (existingReceipts().length) {
                  <div class="flex gap-2">
                    <a [routerLink]="['/services', serviceId, 'receipts']" [queryParams]="{ month: selectedMonth() }"
                      class="flex-1 text-center px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors">
                      Ver recibos del mes
                    </a>
                    <button (click)="deleteReceipts()" [disabled]="deletingReceipts()"
                      class="px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                      @if (deletingReceipts()) {
                        <div class="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin"></div>
                      } @else {
                        <mat-icon class="text-[16px]">delete_outline</mat-icon>
                      }
                      Eliminar
                    </button>
                  </div>
                }
              </div>
            </div>
          } @else {
            <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-8 text-center">
              <mat-icon class="text-warm-300 text-[40px]">receipt_long</mat-icon>
              <p class="text-warm-400 text-sm mt-2">Guarda una asignación para generar recibos</p>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ServiceDetailComponent implements OnInit {
  private svcService = inject(UtilityServiceService);
  private assignmentService = inject(ServiceAssignmentService);
  private receiptService = inject(ServiceReceiptService);
  private propertyService = inject(PropertyService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);

  serviceId!: string;
  totalAmount = signal(0);

  selectedPropertyIds = signal<string[]>([]);
  distributionMethod = signal<DistMethod>('por_persona');
  currentAssignment = signal<ServiceAssignment | null>(null);
  savingAssignment = signal(false);
  generatingReceipts = signal(false);
  deletingReceipts = signal(false);
  selectedMonthDate = signal<Date>(startOfMonth(new Date()));

  distOptions = [
    { value: 'por_persona' as DistMethod, label: 'Por persona', icon: 'group' },
    { value: 'partes_iguales' as DistMethod, label: 'Partes iguales', icon: 'drag_handle' },
    { value: 'manual' as DistMethod, label: 'Manual', icon: 'edit' },
  ];

  service = toSignal(
    this.route.paramMap.pipe(
      switchMap(params => {
        this.serviceId = params.get('id')!;
        return this.svcService.getById(this.serviceId);
      })
    )
  );

  allProperties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  // Load existing assignment for this service
  private assignments = toSignal(
    this.route.paramMap.pipe(
      switchMap(params => this.assignmentService.getByService(params.get('id')!))
    ),
    { initialValue: [] }
  );

  selectedMonth = computed(() => formatMonth(this.selectedMonthDate()));
  monthLabel = computed(() => {
    const d = this.selectedMonthDate();
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  });

  existingReceipts = toSignal(
    this.route.paramMap.pipe(
      switchMap(() => {
        const sid = this.serviceId;
        const month = this.selectedMonth();
        if (!sid || !month) return of([]);
        return this.receiptService.getByServiceAndMonth(sid, month);
      })
    ),
    { initialValue: [] }
  );

  previewRows = computed(() => {
    const props = this.allProperties() ?? [];
    const selectedIds = this.selectedPropertyIds();
    const selected = props.filter(p => selectedIds.includes(p.id!));
    const total = this.totalAmount();
    const method = this.distributionMethod();

    if (method === 'por_persona') {
      const totalPersonas = selected.reduce((sum, p) => sum + (p.residentCount ?? 1), 0);
      return selected.map(p => ({
        propertyId: p.id!,
        propertyName: p.name,
        residentCount: p.residentCount ?? 1,
        amount: totalPersonas > 0 ? Math.round((total * (p.residentCount ?? 1) / totalPersonas) * 100) / 100 : 0,
      }));
    }
    if (method === 'partes_iguales') {
      const perProp = Math.round((total / selected.length) * 100) / 100;
      return selected.map(p => ({
        propertyId: p.id!,
        propertyName: p.name,
        residentCount: p.residentCount ?? 1,
        amount: perProp,
      }));
    }
    return selected.map(p => ({
      propertyId: p.id!,
      propertyName: p.name,
      residentCount: p.residentCount ?? 1,
      amount: 0,
    }));
  });

  constructor() {}

  ngOnInit() {
    // Watch assignments to hydrate UI
    this.route.paramMap.pipe(
      switchMap(params => this.assignmentService.getByService(params.get('id')!))
    ).subscribe(assignments => {
      if (assignments.length > 0) {
        const a = assignments[0];
        this.currentAssignment.set(a);
        this.selectedPropertyIds.set([...a.propertyIds]);
        this.distributionMethod.set(a.distributionMethod);
      }
    });
  }

  isPropertySelected(id: string): boolean {
    return this.selectedPropertyIds().includes(id);
  }

  toggleProperty(id: string) {
    this.selectedPropertyIds.update(ids =>
      ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    );
  }

  prevMonth() {
    this.selectedMonthDate.update(d => {
      const prev = new Date(d);
      prev.setMonth(prev.getMonth() - 1);
      return prev;
    });
  }

  nextMonth() {
    this.selectedMonthDate.update(d => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  }

  async saveAssignment() {
    this.savingAssignment.set(true);
    try {
      const svc = this.service();
      const data: Partial<ServiceAssignment> = {
        serviceId: this.serviceId,
        serviceName: svc?.name ?? '',
        propertyIds: this.selectedPropertyIds(),
        distributionMethod: this.distributionMethod(),
      };
      const existing = this.currentAssignment();
      const id = await this.assignmentService.save(data, existing?.id);
      this.currentAssignment.set({ ...data, id, ownerId: this.authService.uid()! } as ServiceAssignment);
      this.snackBar.open('Asignación guardada.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al guardar asignación.', 'OK', { duration: 3000 });
    } finally {
      this.savingAssignment.set(false);
    }
  }

  async generateReceipts() {
    const assignment = this.currentAssignment();
    if (!assignment || this.totalAmount() <= 0) return;
    this.generatingReceipts.set(true);
    try {
      await this.receiptService.generateReceipts(assignment, this.selectedMonth(), this.totalAmount());
      this.snackBar.open(`${assignment.propertyIds.length} recibo(s) generados.`, 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al generar recibos.', 'OK', { duration: 3000 });
    } finally {
      this.generatingReceipts.set(false);
    }
  }

  async deleteReceipts() {
    if (!confirm('¿Eliminar todos los recibos de este mes? Esta acción no se puede deshacer.')) return;
    this.deletingReceipts.set(true);
    try {
      await this.receiptService.deleteByServiceAndMonth(this.serviceId, this.selectedMonth());
      this.snackBar.open('Recibos eliminados.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al eliminar recibos.', 'OK', { duration: 3000 });
    } finally {
      this.deletingReceipts.set(false);
    }
  }
}
