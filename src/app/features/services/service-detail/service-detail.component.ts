import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, combineLatest } from 'rxjs';
import { UtilityServiceService } from '../../../core/services/utility-service.service';
import { ServiceAssignmentService } from '../../../core/services/service-assignment.service';
import { ServiceReceiptService } from '../../../core/services/service-receipt.service';
import { PropertyService } from '../../../core/services/property.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ServiceAssignment } from '../../../core/models/service-assignment.model';
import { ServiceReceipt } from '../../../core/models/service-receipt.model';
import { RegisterServiceDialogComponent } from '../register-service/register-service-dialog.component';

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
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatDialogModule, MatSnackBarModule],
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
              <button (click)="deleteService()" [disabled]="deletingService()" title="Eliminar servicio"
                class="p-1.5 text-warm-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                @if (deletingService()) {
                  <div class="w-5 h-5 border-2 border-red-200 border-t-red-500 rounded-full animate-spin"></div>
                } @else {
                  <mat-icon class="text-[20px]">delete_outline</mat-icon>
                }
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1 border-b border-warm-200">
        <button (click)="tab.set('recibos')"
          class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
          [class.border-primary-500]="tab() === 'recibos'"
          [class.text-primary-600]="tab() === 'recibos'"
          [class.border-transparent]="tab() !== 'recibos'"
          [class.text-warm-500]="tab() !== 'recibos'">
          Recibos del mes
          @if (monthPendingCount() > 0) {
            <span class="ml-1.5 text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">{{ monthPendingCount() }}</span>
          }
        </button>
        <button (click)="tab.set('distribucion')"
          class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
          [class.border-primary-500]="tab() === 'distribucion'"
          [class.text-primary-600]="tab() === 'distribucion'"
          [class.border-transparent]="tab() !== 'distribucion'"
          [class.text-warm-500]="tab() !== 'distribucion'">
          Códigos de distribución
          <span class="ml-1 text-[10px] text-warm-400">avanzado</span>
        </button>
      </div>

      <!-- ── Pestaña: recibos del mes ───────────────────────────────── -->
      @if (tab() === 'recibos') {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
          <div class="px-5 py-4 border-b border-warm-100 flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-3">
              <button (click)="prevMonth()" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
                <mat-icon>chevron_left</mat-icon>
              </button>
              <span class="text-sm font-semibold text-warm-800 min-w-[130px] text-center capitalize">{{ monthLabel() }}</span>
              <button (click)="nextMonth()" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
                <mat-icon>chevron_right</mat-icon>
              </button>
            </div>
            @if (canWrite()) {
              <div class="flex items-center gap-2">
                @if (monthPendingCount() > 0) {
                  <button (click)="markAllPaid()" [disabled]="markingAll()"
                    class="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
                    @if (markingAll()) {
                      <div class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                    } @else {
                      <mat-icon class="text-[15px]">done_all</mat-icon>
                    }
                    Pagar todos
                  </button>
                }
                <button (click)="openRegister()"
                  class="inline-flex items-center gap-1.5 px-3 py-2 bg-primary-500 text-white rounded-lg text-xs font-medium hover:bg-primary-600 transition-colors">
                  <mat-icon class="text-[15px]">add</mat-icon>
                  Registrar
                </button>
              </div>
            }
          </div>

          @if (monthReceipts().length === 0) {
            <div class="px-5 py-12 text-center">
              <mat-icon class="text-warm-300 text-[40px]">receipt</mat-icon>
              <p class="text-warm-500 text-sm mt-2 font-medium">Sin recibos este mes</p>
              <p class="text-warm-400 text-xs mt-1">
                Registra el servicio sobre una propiedad, o genera recibos desde un código de distribución
              </p>
            </div>
          } @else {
            <!-- Cabecera de columnas (desktop) -->
            <div class="hidden sm:flex items-center gap-3 px-5 py-2 bg-warm-50 border-b border-warm-100">
              <span class="w-8 flex-shrink-0"></span>
              <span class="flex-1 min-w-0 text-[11px] font-semibold text-warm-500 uppercase tracking-wide">Propiedad</span>
              @if (canWrite()) {
                <span class="w-[8.5rem] flex-shrink-0 text-[11px] font-semibold text-warm-500 uppercase tracking-wide">Mes</span>
              }
              <span class="w-32 flex-shrink-0 text-right text-[11px] font-semibold text-warm-500 uppercase tracking-wide">Monto</span>
              @if (canWrite()) {
                <span class="w-7 flex-shrink-0"></span>
              }
            </div>

            <div class="divide-y divide-warm-100">
              @for (r of monthReceipts(); track r.id) {
                <div class="flex flex-wrap sm:flex-nowrap items-center gap-3 px-5 py-3 hover:bg-warm-50/60 transition-colors">
                  <button (click)="togglePaid(r)" [disabled]="!canWrite() || busy()"
                    class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-60"
                    [class.bg-green-100]="r.isPaid"
                    [class.text-green-600]="r.isPaid"
                    [class.bg-warm-100]="!r.isPaid"
                    [class.text-warm-400]="!r.isPaid"
                    [title]="r.isPaid ? 'Marcar como no pagado' : 'Pagar recibo'">
                    <mat-icon class="text-[18px]">{{ r.isPaid ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                  </button>

                  <!-- Propiedad + nota -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <p class="text-sm font-medium text-warm-800 truncate">{{ r.propertyName || propertyName(r.propertyId) }}</p>
                      @if (r.assignmentCode) {
                        <span class="text-[10px] px-1.5 py-0.5 bg-warm-100 rounded font-mono font-bold text-warm-600 border border-warm-200">{{ r.assignmentCode }}</span>
                      } @else {
                        <span class="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">manual</span>
                      }
                    </div>

                    <!-- La nota solo ocupa espacio cuando se está editando -->
                    @if (canWrite() && editingNoteId() === r.id) {
                      <input type="text" [ngModel]="r.notes ?? ''"
                        (blur)="saveNote(r, $event)" (keydown.enter)="saveNote(r, $event)"
                        (keydown.escape)="editingNoteId.set(null)"
                        placeholder="Ej: factura 4432" autofocus
                        class="mt-1 w-full max-w-xs px-2 py-1 border border-primary-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
                    } @else if (canWrite()) {
                      <button (click)="editingNoteId.set(r.id!)"
                        class="mt-0.5 text-xs text-left transition-colors"
                        [class.text-warm-500]="r.notes"
                        [class.text-warm-300]="!r.notes"
                        [class.hover:text-primary-600]="true">
                        {{ r.notes || '+ nota' }}
                      </button>
                    } @else if (r.notes) {
                      <p class="text-xs text-warm-400 truncate">{{ r.notes }}</p>
                    }
                  </div>

                  <!-- Mes -->
                  @if (canWrite()) {
                    <input type="month" [ngModel]="r.month" (change)="moveMonth(r, $event)"
                      title="Mes al que corresponde — cámbialo si lo anotaste en el mes equivocado"
                      class="w-[8.5rem] flex-shrink-0 px-2 py-1.5 border border-warm-200 rounded-lg text-xs text-warm-600 focus:outline-none focus:ring-2 focus:ring-primary-500">
                  }

                  <!-- Monto -->
                  @if (canWrite()) {
                    <div class="relative w-32 flex-shrink-0">
                      <span class="absolute left-2 top-1/2 -translate-y-1/2 text-warm-400 text-xs">$</span>
                      <input type="number" [ngModel]="r.propertyAmount" (blur)="updateAmount(r, $event)"
                        class="w-full pl-5 pr-2 py-1.5 border border-warm-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500">
                    </div>
                  } @else {
                    <span class="w-32 flex-shrink-0 text-right text-sm font-bold text-warm-900">
                      {{ r.propertyAmount | currency:'COP':'symbol-narrow':'1.0-0' }}
                    </span>
                  }

                  @if (canWrite()) {
                    <button (click)="removeReceipt(r)" [disabled]="busy()" title="Eliminar recibo"
                      class="w-7 flex-shrink-0 p-1 text-warm-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50">
                      <mat-icon class="text-[16px]">delete_outline</mat-icon>
                    </button>
                  }
                </div>
              }
            </div>

            <div class="px-5 py-3 bg-warm-50 border-t border-warm-200 flex items-center justify-between">
              <span class="text-xs text-warm-500">
                {{ monthReceipts().length }} recibo(s) · {{ monthPendingCount() }} pendiente(s)
              </span>
              <span class="text-sm font-bold text-warm-900">
                Total: {{ monthTotal() | currency:'COP':'symbol-narrow':'1.0-0' }}
              </span>
            </div>
          }
        </div>
      }

      <!-- ── Pestaña: códigos de distribución ───────────────────────── -->
      @if (tab() === 'distribucion') {
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
      }
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
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  serviceId = '';

  ngOnInit() {
    const qMonth = this.route.snapshot.queryParamMap.get('month');
    if (qMonth) {
      const [y, m] = qMonth.split('-').map(Number);
      if (y && m) this.selectedMonthDate.set(new Date(y, m - 1, 1));
    }
  }

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

  // ── Mes seleccionado (compartido por ambas pestañas) ──────────────────────
  selectedMonthDate = signal<Date>(startOfMonth(new Date()));
  selectedMonth = computed(() => formatMonth(this.selectedMonthDate()));
  monthLabel = computed(() => {
    const d = this.selectedMonthDate();
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  });

  // ── Pestañas ─────────────────────────────────────────────────────────────
  tab = signal<'recibos' | 'distribucion'>('recibos');
  busy = signal(false);
  markingAll = signal(false);
  deletingService = signal(false);

  /**
   * Elimina el servicio y sus códigos de distribución. Los recibos ya generados
   * se conservan como histórico (pueden tener un gasto asociado en Finanzas) y,
   * al no quedar códigos, no se vuelve a generar ninguno.
   */
  async deleteService() {
    const nombre = this.service()?.name ?? 'este servicio';
    this.deletingService.set(true);
    try {
      const recibos = await this.svcService.countReceipts(this.serviceId);
      const codigos = this.assignments().length;

      const detalle = [
        codigos > 0 ? `Se eliminarán sus ${codigos} código(s) de distribución.` : '',
        recibos > 0
          ? `Los ${recibos} recibo(s) ya generados SE CONSERVAN como histórico y no se volverán a generar.`
          : '',
      ].filter(Boolean).join('\n\n');

      if (!confirm(`¿Eliminar "${nombre}"?\n\n${detalle}`.trim())) {
        this.deletingService.set(false);
        return;
      }

      const res = await this.svcService.deleteWithAssignments(this.serviceId);
      this.snackBar.open(
        res.receiptsKept > 0
          ? `Servicio eliminado. Se conservaron ${res.receiptsKept} recibo(s).`
          : 'Servicio eliminado.',
        'OK',
        { duration: 4000 }
      );
      await this.router.navigate(['/services']);
    } catch {
      this.snackBar.open('No se pudo eliminar el servicio.', 'OK', { duration: 3000 });
    } finally {
      this.deletingService.set(false);
    }
  }

  /** Todos los recibos de este servicio en el mes seleccionado (manuales + distribuidos) */
  monthReceipts = toSignal(
    combineLatest([this.route.paramMap, toObservable(this.selectedMonth)]).pipe(
      switchMap(([params, month]) =>
        this.receiptService.getByServiceAndMonth(params.get('id')!, month)
      )
    ),
    { initialValue: [] }
  );

  monthTotal = computed(() =>
    this.monthReceipts().reduce((s, r) => s + (r.propertyAmount ?? 0), 0)
  );
  monthPendingCount = computed(() => this.monthReceipts().filter(r => !r.isPaid).length);

  async togglePaid(receipt: ServiceReceipt) {
    this.busy.set(true);
    try {
      await this.receiptService.setPaid(receipt, !receipt.isPaid);
    } catch {
      this.snackBar.open('Error al actualizar el recibo.', 'OK', { duration: 3000 });
    } finally {
      this.busy.set(false);
    }
  }

  async updateAmount(receipt: ServiceReceipt, event: Event) {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (isNaN(value) || value === receipt.propertyAmount) return;
    try {
      await this.receiptService.updateAmount(receipt, value);
    } catch {
      this.snackBar.open('Error al actualizar el monto.', 'OK', { duration: 3000 });
    }
  }

  /** Corrige el mes de un recibo anotado en el mes equivocado. */
  async moveMonth(receipt: ServiceReceipt, event: Event) {
    const nuevo = (event.target as HTMLInputElement).value;
    if (!nuevo || nuevo === receipt.month) return;
    try {
      await this.receiptService.changeMonth(receipt, nuevo);
      this.snackBar.open(`Recibo movido a ${nuevo}.`, 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('No se pudo cambiar el mes del recibo.', 'OK', { duration: 3000 });
    }
  }

  /** Fila cuya nota se está editando; fuera de edición la nota es solo texto. */
  editingNoteId = signal<string | null>(null);

  async saveNote(receipt: ServiceReceipt, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.editingNoteId.set(null);
    if (value === (receipt.notes ?? '')) return;
    try {
      await this.receiptService.update(receipt.id!, { notes: value });
    } catch {
      this.snackBar.open('Error al actualizar la nota.', 'OK', { duration: 3000 });
    }
  }

  async removeReceipt(receipt: ServiceReceipt) {
    const nombre = receipt.propertyName || this.propertyName(receipt.propertyId);
    const extra = receipt.origin !== 'manual' && receipt.assignmentCode
      ? `\n\nEs un recibo generado por el código ${receipt.assignmentCode}. Si regeneras ese código para este mes, volverá a crearse.`
      : '';
    const gasto = receipt.isPaid && receipt.expenseId
      ? '\n\nSe eliminará también el gasto asociado en Finanzas.'
      : '';
    if (!confirm(`¿Eliminar el recibo de ${nombre}?${extra}${gasto}`)) return;
    this.busy.set(true);
    try {
      await this.receiptService.delete(receipt);
      this.snackBar.open('Recibo eliminado.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al eliminar el recibo.', 'OK', { duration: 3000 });
    } finally {
      this.busy.set(false);
    }
  }

  async markAllPaid() {
    const pending = this.monthReceipts().filter(r => !r.isPaid);
    if (pending.length === 0) return;
    this.markingAll.set(true);
    try {
      await this.receiptService.markManyPaid(pending);
      this.snackBar.open(`${pending.length} recibo(s) marcados como pagados.`, 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al marcar los recibos.', 'OK', { duration: 3000 });
    } finally {
      this.markingAll.set(false);
    }
  }

  openRegister() {
    this.dialog.open(RegisterServiceDialogComponent, {
      width: '460px',
      maxHeight: '90vh',
      data: {
        month: this.selectedMonth(),
        serviceId: this.serviceId,
        serviceName: this.service()?.name,
      },
    });
  }

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
  generatingReceipts = signal(false);
  deletingReceipts = signal(false);

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
