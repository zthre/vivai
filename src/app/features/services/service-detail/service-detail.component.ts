import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, combineLatest } from 'rxjs';
import { UtilityServiceService } from '../../../core/services/utility-service.service';
import { ServiceAssignmentService } from '../../../core/services/service-assignment.service';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { PropertyService } from '../../../core/services/property.service';
import { AuthService } from '../../../core/auth/auth.service';
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

      <!-- Service header -->
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
            @if (canWrite()) {
              <a [routerLink]="['/services', serviceId, 'edit']"
                class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
                <mat-icon class="text-[20px]">edit</mat-icon>
              </a>
            }
          </div>
        </div>
      </div>

      <!-- Two-column layout -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Left: Códigos de distribución -->
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
          <div class="px-5 py-4 border-b border-warm-100 flex items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold text-warm-900">Códigos de distribución</h2>
              <p class="text-xs text-warm-400 mt-0.5">Cada código agrupa propiedades con su propia factura mensual</p>
            </div>
            @if (!showForm() && canWrite()) {
              <button (click)="openAddForm()"
                class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
                <mat-icon class="text-[16px]">add</mat-icon>
                Agregar
              </button>
            }
          </div>

          <!-- Inline form -->
          @if (showForm()) {
            <div class="p-5 border-b border-warm-100 bg-warm-50">
              <h3 class="text-sm font-semibold text-warm-800 mb-4">
                {{ editingId ? 'Editar código' : 'Nuevo código' }}
              </h3>
              <div class="space-y-4">
                <!-- Code + description -->
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-warm-600 mb-1">Código *</label>
                    <input [(ngModel)]="formCode" placeholder="Ej: GAS-101"
                      class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-warm-600 mb-1">Descripción</label>
                    <input [(ngModel)]="formDescription" placeholder="Ej: Torre Norte"
                      class="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white">
                  </div>
                </div>

                <!-- Distribution method -->
                <div>
                  <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2">Método de distribución</p>
                  <div class="grid grid-cols-3 gap-2">
                    @for (opt of distOptions; track opt.value) {
                      <button type="button" (click)="formDistMethod = opt.value"
                        class="flex flex-col items-center gap-1 p-2.5 border rounded-lg text-xs font-medium transition-all"
                        [class.border-primary-500]="formDistMethod === opt.value"
                        [class.bg-primary-50]="formDistMethod === opt.value"
                        [class.text-primary-700]="formDistMethod === opt.value"
                        [class.border-warm-200]="formDistMethod !== opt.value"
                        [class.text-warm-500]="formDistMethod !== opt.value">
                        <mat-icon class="text-[16px]">{{ opt.icon }}</mat-icon>
                        {{ opt.label }}
                      </button>
                    }
                  </div>
                </div>

                <!-- Properties -->
                <div>
                  <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2">Propiedades *</p>
                  @if (allProperties().length) {
                    <div class="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      @for (prop of allProperties(); track prop.id) {
                        <label class="flex items-center gap-2.5 p-2.5 border rounded-lg cursor-pointer transition-all"
                          [class.border-primary-300]="isFormPropertySelected(prop.id!)"
                          [class.bg-primary-50]="isFormPropertySelected(prop.id!)"
                          [class.border-warm-200]="!isFormPropertySelected(prop.id!)">
                          <input type="checkbox"
                            [checked]="isFormPropertySelected(prop.id!)"
                            (change)="toggleFormProperty(prop.id!)"
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
                </div>

                <!-- Form buttons -->
                <div class="flex gap-2 pt-1">
                  <button (click)="saveAssignment()" [disabled]="savingAssignment() || !formCode.trim() || formPropertyIds().length === 0"
                    class="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    @if (savingAssignment()) {
                      <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                    }
                    Guardar código
                  </button>
                  <button (click)="cancelForm()"
                    class="px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Assignments list -->
          <div class="p-5">
            @if (assignments().length === 0 && !showForm()) {
              <div class="text-center py-8">
                <mat-icon class="text-warm-300 text-[36px]">receipt_long</mat-icon>
                <p class="text-warm-400 text-sm mt-2">Sin códigos de distribución</p>
                <button (click)="openAddForm()"
                  class="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium">
                  + Agregar el primero
                </button>
              </div>
            } @else {
              <div class="space-y-2">
                @for (a of assignments(); track a.id) {
                  <div class="border rounded-lg p-3 transition-all cursor-pointer"
                    [class.border-primary-400]="selectedAssignment()?.id === a.id"
                    [class.bg-primary-50]="selectedAssignment()?.id === a.id"
                    [class.border-warm-200]="selectedAssignment()?.id !== a.id"
                    (click)="selectForReceipts(a)">
                    <div class="flex items-start gap-3">
                      <!-- Code badge -->
                      <span class="flex-shrink-0 mt-0.5 px-2 py-0.5 bg-warm-100 rounded text-xs font-mono font-bold text-warm-700 border border-warm-200">
                        {{ a.code || '—' }}
                      </span>
                      <!-- Info -->
                      <div class="flex-1 min-w-0">
                        @if (a.description) {
                          <p class="text-sm text-warm-700 font-medium truncate">{{ a.description }}</p>
                        }
                        <p class="text-xs text-warm-400 mt-0.5">
                          {{ a.propertyIds.length }} propiedad(es) · {{ distLabel(a.distributionMethod) }}
                        </p>
                        <div class="flex flex-wrap gap-1 mt-1.5">
                          @for (pid of a.propertyIds.slice(0, 3); track pid) {
                            <span class="text-xs px-1.5 py-0.5 bg-warm-100 rounded text-warm-500">{{ propertyName(pid) }}</span>
                          }
                          @if (a.propertyIds.length > 3) {
                            <span class="text-xs text-warm-400">+{{ a.propertyIds.length - 3 }} más</span>
                          }
                        </div>
                      </div>
                      <!-- Action buttons -->
                      @if (canWrite()) {
                        <div class="flex items-center gap-0.5 flex-shrink-0" (click)="$event.stopPropagation()">
                          <button (click)="openEditForm(a)" title="Editar"
                            class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
                            <mat-icon class="text-[16px]">edit</mat-icon>
                          </button>
                          <button (click)="deleteAssignment(a)" [disabled]="deletingId() === a.id" title="Eliminar"
                            class="p-1.5 text-warm-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40">
                            @if (deletingId() === a.id) {
                              <div class="w-4 h-4 border-2 border-warm-300 border-t-warm-600 rounded-full animate-spin"></div>
                            } @else {
                              <mat-icon class="text-[16px]">delete_outline</mat-icon>
                            }
                          </button>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Right: Receipt generation -->
        <div>
          @if (selectedAssignment()) {
            <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
              <div class="px-5 py-4 border-b border-warm-100 flex items-center justify-between gap-3">
                <div>
                  <h2 class="font-semibold text-warm-900">Generar recibos</h2>
                  <p class="text-xs text-warm-400 mt-0.5">
                    Código:
                    <span class="font-mono font-bold text-warm-600">{{ selectedAssignment()!.code || '—' }}</span>
                    @if (selectedAssignment()!.description) {
                      · {{ selectedAssignment()!.description }}
                    }
                  </p>
                </div>
                <button (click)="selectedAssignment.set(null)"
                  class="p-1 text-warm-400 hover:text-warm-600 hover:bg-warm-100 rounded-lg transition-colors">
                  <mat-icon class="text-[18px]">close</mat-icon>
                </button>
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

                <!-- Total amount -->
                @if (canWrite()) {
                  <div>
                    <label class="block text-sm font-medium text-warm-700 mb-1.5">Monto total del servicio</label>
                    <div class="relative">
                      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
                      <input [ngModel]="totalAmount()" (ngModelChange)="totalAmount.set(+$event || 0)"
                        type="number" min="0" placeholder="Ej: 150000"
                        class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    </div>
                  </div>
                }

                <!-- Preview -->
                @if (totalAmount() > 0 && selectedAssignment()!.distributionMethod !== 'manual') {
                  <div>
                    <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2">Vista previa</p>
                    <div class="border border-warm-200 rounded-lg overflow-hidden">
                      <table class="w-full text-sm">
                        <thead class="bg-warm-50">
                          <tr>
                            <th class="text-left px-3 py-2 text-xs font-semibold text-warm-500">Propiedad</th>
                            <th class="text-center px-3 py-2 text-xs font-semibold text-warm-500">Pers.</th>
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

                @if (canWrite()) {
                  <button (click)="generateReceipts()" [disabled]="generatingReceipts() || totalAmount() <= 0"
                    class="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    @if (generatingReceipts()) {
                      <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                    }
                    <mat-icon class="text-[18px]">receipt</mat-icon>
                    Generar {{ selectedAssignment()!.propertyIds.length }} recibo(s)
                  </button>
                }

                @if (existingReceipts().length) {
                  <div class="flex gap-2">
                    <a [routerLink]="['/services', serviceId, 'receipts']"
                      [queryParams]="{ month: selectedMonth(), assignmentId: selectedAssignment()!.id, code: selectedAssignment()!.code }"
                      class="flex-1 text-center px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors">
                      Ver recibos del mes
                    </a>
                    @if (canWrite()) {
                      <button (click)="deleteReceipts()" [disabled]="deletingReceipts()"
                        class="px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                        @if (deletingReceipts()) {
                          <div class="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin"></div>
                        } @else {
                          <mat-icon class="text-[16px]">delete_outline</mat-icon>
                        }
                        Eliminar
                      </button>
                    }
                  </div>
                }
              </div>
            </div>
          } @else {
            <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-10 text-center">
              <mat-icon class="text-warm-300 text-[40px]">touch_app</mat-icon>
              <p class="text-warm-500 text-sm mt-2 font-medium">Selecciona un código</p>
              <p class="text-warm-400 text-xs mt-1">Haz clic en un código para generar sus recibos mensuales</p>
            </div>
          }
        </div>

      </div>
    </div>
  `,
})
export class ServiceDetailComponent {
  private svcService = inject(UtilityServiceService);
  private assignmentService = inject(ServiceAssignmentService);
  private receiptService = inject(ServiceReceiptService);
  private propertyService = inject(PropertyService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);

  serviceId = '';

  service = toSignal(
    this.route.paramMap.pipe(
      switchMap(params => {
        this.serviceId = params.get('id')!;
        return this.svcService.getById(this.serviceId);
      })
    )
  );

  allProperties = toSignal(this.propertyService.getAll(), { initialValue: [] });

  canWrite = computed(() => {
    const uid = this.authService.uid();
    const svc = this.service();
    if (!uid) return false;
    if (svc?.ownerId === uid) return true;
    return this.allProperties().some(p => {
      const perms = p.collaboratorPermissions?.[uid];
      return !perms || perms.servicios !== false;
    });
  });

  assignments = toSignal(
    this.route.paramMap.pipe(
      switchMap(params => this.assignmentService.getByService(params.get('id')!))
    ),
    { initialValue: [] }
  );

  // ── Form state ──────────────────────────────────────────────────────────
  showForm = signal(false);
  editingId: string | null = null;
  formCode = '';
  formDescription = '';
  formDistMethod: DistMethod = 'por_persona';
  formPropertyIds = signal<string[]>([]);
  savingAssignment = signal(false);
  deletingId = signal<string | null>(null);

  distOptions = [
    { value: 'por_persona' as DistMethod, label: 'Por persona', icon: 'group' },
    { value: 'partes_iguales' as DistMethod, label: 'Partes iguales', icon: 'drag_handle' },
    { value: 'manual' as DistMethod, label: 'Manual', icon: 'edit' },
  ];

  // ── Receipt generation state ─────────────────────────────────────────────
  selectedAssignment = signal<ServiceAssignment | null>(null);
  totalAmount = signal(0);
  selectedMonthDate = signal<Date>(startOfMonth(new Date()));
  generatingReceipts = signal(false);
  deletingReceipts = signal(false);

  selectedMonth = computed(() => formatMonth(this.selectedMonthDate()));
  monthLabel = computed(() => {
    const d = this.selectedMonthDate();
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  });

  private selectedAssignment$ = toObservable(this.selectedAssignment);
  private selectedMonth$ = toObservable(this.selectedMonth);

  existingReceipts = toSignal(
    combineLatest([this.selectedAssignment$, this.selectedMonth$]).pipe(
      switchMap(([assignment, month]) => {
        if (!assignment?.id) return of([]);
        return this.receiptService.getByAssignmentAndMonth(assignment.id, month);
      })
    ),
    { initialValue: [] }
  );

  previewRows = computed(() => {
    const assignment = this.selectedAssignment();
    if (!assignment) return [];
    const props = this.allProperties() ?? [];
    const selected = props.filter(p => assignment.propertyIds.includes(p.id!));
    const total = this.totalAmount();
    const method = assignment.distributionMethod;

    if (method === 'por_persona') {
      const totalPersonas = selected.reduce((sum, p) => sum + (p.residentCount ?? 1), 0);
      return selected.map(p => ({
        propertyId: p.id!,
        propertyName: p.name,
        residentCount: p.residentCount ?? 1,
        amount: totalPersonas > 0 ? Math.round(total * (p.residentCount ?? 1) / totalPersonas * 100) / 100 : 0,
      }));
    }
    if (method === 'partes_iguales') {
      const perProp = Math.round(total / selected.length * 100) / 100;
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

  // ── Form helpers ─────────────────────────────────────────────────────────

  openAddForm() {
    this.editingId = null;
    this.formCode = '';
    this.formDescription = '';
    this.formDistMethod = 'por_persona';
    this.formPropertyIds.set([]);
    this.showForm.set(true);
  }

  openEditForm(a: ServiceAssignment) {
    this.editingId = a.id ?? null;
    this.formCode = a.code ?? '';
    this.formDescription = a.description ?? '';
    this.formDistMethod = a.distributionMethod;
    this.formPropertyIds.set([...a.propertyIds]);
    this.showForm.set(true);
  }

  cancelForm() {
    this.showForm.set(false);
    this.editingId = null;
  }

  isFormPropertySelected(id: string): boolean {
    return this.formPropertyIds().includes(id);
  }

  toggleFormProperty(id: string) {
    this.formPropertyIds.update(ids =>
      ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    );
  }

  distLabel(method: DistMethod): string {
    if (method === 'por_persona') return 'Por persona';
    if (method === 'partes_iguales') return 'Partes iguales';
    return 'Manual';
  }

  propertyName(id: string): string {
    return this.allProperties()?.find(p => p.id === id)?.name ?? id;
  }

  async saveAssignment() {
    if (!this.formCode.trim() || this.formPropertyIds().length === 0) return;
    this.savingAssignment.set(true);
    try {
      const svc = this.service();
      const data: Partial<ServiceAssignment> = {
        serviceId: this.serviceId,
        serviceName: svc?.name ?? '',
        code: this.formCode.trim(),
        description: this.formDescription.trim() || undefined,
        propertyIds: this.formPropertyIds(),
        distributionMethod: this.formDistMethod,
      };
      await this.assignmentService.save(data, this.editingId ?? undefined);
      this.showForm.set(false);
      this.editingId = null;
      this.snackBar.open('Código guardado.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al guardar el código.', 'OK', { duration: 3000 });
    } finally {
      this.savingAssignment.set(false);
    }
  }

  async deleteAssignment(a: ServiceAssignment) {
    const label = a.code ? `"${a.code}"` : 'este código';
    if (!confirm(`¿Eliminar ${label}? Sus recibos históricos no se borrarán automáticamente.`)) return;
    this.deletingId.set(a.id!);
    try {
      await this.assignmentService.delete(a.id!);
      if (this.selectedAssignment()?.id === a.id) this.selectedAssignment.set(null);
      this.snackBar.open('Código eliminado.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al eliminar el código.', 'OK', { duration: 3000 });
    } finally {
      this.deletingId.set(null);
    }
  }

  selectForReceipts(a: ServiceAssignment) {
    this.selectedAssignment.set(a);
    this.totalAmount.set(0);
  }

  // ── Month navigation ──────────────────────────────────────────────────────

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

  // ── Receipt generation ────────────────────────────────────────────────────

  async generateReceipts() {
    const assignment = this.selectedAssignment();
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
    const assignment = this.selectedAssignment();
    if (!assignment?.id) return;
    if (!confirm('¿Eliminar todos los recibos de este código para este mes?')) return;
    this.deletingReceipts.set(true);
    try {
      await this.receiptService.deleteByMonth(assignment.id, this.selectedMonth());
      this.snackBar.open('Recibos eliminados.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al eliminar recibos.', 'OK', { duration: 3000 });
    } finally {
      this.deletingReceipts.set(false);
    }
  }
}
