import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { UnitService } from '../../../core/services/unit.service';
import { PaymentService } from '../../../core/services/payment.service';
import { Unit } from '../../../core/models/unit.model';
import { PaymentFormComponent } from '../../payments/payment-form/payment-form.component';
import { ContractSectionComponent } from './contract-section/contract-section.component';

@Component({
  selector: 'app-unit-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatDialogModule, ContractSectionComponent],
  template: `
    <div class="space-y-6">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 text-sm text-warm-400">
        <a routerLink="/properties" class="hover:text-warm-600">Inmuebles</a>
        <mat-icon class="text-[16px]">chevron_right</mat-icon>
        <a [routerLink]="['/properties', propertyId]" class="hover:text-warm-600">{{ unit()?.propertyId }}</a>
        <mat-icon class="text-[16px]">chevron_right</mat-icon>
        <span class="text-warm-700 font-medium">Unidad {{ unit()?.number }}</span>
      </div>

      <!-- Unit header -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-6">
        <div class="flex items-start justify-between flex-wrap gap-4">
          <div class="flex items-center gap-3">
            <a [routerLink]="['/properties', propertyId]" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
              <mat-icon>arrow_back</mat-icon>
            </a>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-2xl font-bold text-warm-900">Unidad {{ unit()?.number }}</h1>
                <span
                  class="text-xs px-2 py-0.5 rounded-full font-medium"
                  [class.bg-green-100]="unit()?.status === 'ocupado'"
                  [class.text-green-700]="unit()?.status === 'ocupado'"
                  [class.bg-warm-100]="unit()?.status === 'disponible'"
                  [class.text-warm-600]="unit()?.status === 'disponible'"
                >
                  {{ unit()?.status }}
                </span>
              </div>
              <p class="text-lg font-semibold text-primary-600 mt-1">
                {{ unit()?.rentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}/mes
              </p>
            </div>
          </div>

          <button
            (click)="openPaymentForm()"
            class="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm"
          >
            <mat-icon class="text-[18px]">add</mat-icon>
            Registrar pago
          </button>
        </div>

        <!-- Tenant info -->
        @if (unit()?.status === 'ocupado') {
          <div class="mt-5 pt-5 border-t border-warm-100 flex items-center gap-3">
            <div class="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <mat-icon class="text-green-600 text-[20px]">person</mat-icon>
            </div>
            <div>
              <p class="text-sm font-medium text-warm-800">{{ unit()?.tenantName ?? 'Inquilino asignado' }}</p>
              <p class="text-xs text-warm-400">{{ unit()?.tenantEmail }}</p>
            </div>
            <a [routerLink]="['/properties', propertyId, 'units', unitId, 'edit']"
              class="ml-auto text-xs text-primary-600 hover:text-primary-700 font-medium">
              Editar
            </a>
          </div>
        }
      </div>

      <!-- Contract section -->
      @if (unit()) {
        <app-contract-section
          [contract]="unit()!.contract"
          [unitId]="unitId"
          [ownerId]="unit()!.ownerId"
        />
      }

      <!-- Payment history -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
        <div class="px-5 py-4 border-b border-warm-100">
          <h2 class="font-semibold text-warm-900">Historial de pagos</h2>
        </div>

        @if (payments().length === 0) {
          <div class="px-5 py-10 text-center">
            <mat-icon class="text-warm-300 text-[40px]">receipt_long</mat-icon>
            <p class="text-warm-400 text-sm mt-2">No hay pagos registrados para esta unidad</p>
          </div>
        }

        <div class="divide-y divide-warm-100">
          @for (payment of payments(); track payment.id) {
            <div class="flex items-center gap-4 px-5 py-4">
              <div class="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <mat-icon class="text-green-600 text-[18px]">check_circle</mat-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-warm-800">{{ payment.notes || 'Pago de arriendo' }}</p>
                <p class="text-xs text-warm-400">{{ payment.date?.toDate() | date:'d MMMM y' }}</p>
              </div>
              <span class="text-sm font-bold text-warm-900">
                {{ payment.amount | currency:'COP':'symbol-narrow':'1.0-0' }}
              </span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class UnitDetailComponent implements OnInit {
  private unitService = inject(UnitService);
  private paymentService = inject(PaymentService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);

  propertyId!: string;
  unitId!: string;
  unit = signal<Unit | null>(null);

  payments = toSignal(
    this.route.paramMap.pipe(
      switchMap(params => this.paymentService.getByUnit(params.get('unitId')!))
    ),
    { initialValue: [] }
  );

  ngOnInit() {
    this.propertyId = this.route.snapshot.paramMap.get('propertyId')!;
    this.unitId = this.route.snapshot.paramMap.get('unitId')!;
    this.unitService.getById(this.unitId).subscribe(u => this.unit.set(u));
  }

  openPaymentForm() {
    this.dialog.open(PaymentFormComponent, {
      width: '420px',
      data: {
        unitId: this.unitId,
        propertyId: this.propertyId,
        rentPrice: this.unit()?.rentPrice,
      },
    });
  }
}
