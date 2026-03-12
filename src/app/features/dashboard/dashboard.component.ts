import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, map } from 'rxjs/operators';
import { combineLatest, of } from 'rxjs';
import { PropertyService } from '../../core/services/property.service';
import { PaymentService } from '../../core/services/payment.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold text-warm-900">
          Buenos días, {{ firstName() }} 👋
        </h1>
        <p class="text-warm-500 text-sm mt-1">Resumen de tu portafolio</p>
      </div>

      <!-- Stats cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="bg-white rounded-xl p-5 border border-warm-200 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-warm-500">Propiedades</span>
            <div class="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <mat-icon class="text-primary-600 text-[20px]">apartment</mat-icon>
            </div>
          </div>
          <p class="text-3xl font-bold text-warm-900">{{ totalProperties() }}</p>
        </div>

        <div class="bg-white rounded-xl p-5 border border-warm-200 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-warm-500">Propiedades ocupadas</span>
            <div class="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
              <mat-icon class="text-green-600 text-[20px]">people</mat-icon>
            </div>
          </div>
          <p class="text-3xl font-bold text-warm-900">{{ occupiedProperties() }}</p>
          <p class="text-xs text-warm-400 mt-1">de {{ totalProperties() }} propiedades</p>
        </div>

        <div class="bg-white rounded-xl p-5 border border-warm-200 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-warm-500">Propiedades disponibles</span>
            <div class="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
              <mat-icon class="text-orange-600 text-[20px]">door_open</mat-icon>
            </div>
          </div>
          <p class="text-3xl font-bold text-warm-900">{{ availableProperties() }}</p>
        </div>
      </div>

      <!-- Recent payments -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
        <div class="flex items-center justify-between px-5 py-4 border-b border-warm-100">
          <h2 class="font-semibold text-warm-900">Últimos pagos</h2>
          <a routerLink="/properties" class="text-sm text-primary-600 hover:text-primary-700 font-medium">
            Ver propiedades →
          </a>
        </div>
        <div class="divide-y divide-warm-100">
          @if (recentPayments().length === 0) {
            <div class="px-5 py-8 text-center">
              <mat-icon class="text-warm-300 text-[40px]">payments</mat-icon>
              <p class="text-warm-400 text-sm mt-2">No hay pagos registrados aún</p>
            </div>
          }
          @for (payment of recentPayments(); track payment.id) {
            <div class="flex items-center justify-between px-5 py-3">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <mat-icon class="text-green-600 text-[16px]">check</mat-icon>
                </div>
                <div>
                  <p class="text-sm font-medium text-warm-800">{{ payment.notes || 'Pago de arriendo' }}</p>
                  <p class="text-xs text-warm-400">{{ payment.date.toDate() | date:'d MMM y' }}</p>
                </div>
              </div>
              <span class="text-sm font-semibold text-warm-900">
                {{ payment.amount | currency:'COP':'symbol-narrow':'1.0-0' }}
              </span>
            </div>
          }
        </div>
      </div>

      <!-- Quick action -->
      @if (canCreate()) {
        <div class="flex gap-3">
          <a
            routerLink="/properties/new"
            class="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium shadow-sm"
          >
            <mat-icon class="text-[18px]">add</mat-icon>
            Nueva
          </a>
        </div>
      }
    </div>
  `,
})
export class DashboardComponent {
  private propertyService = inject(PropertyService);
  private paymentService = inject(PaymentService);
  private authService = inject(AuthService);

  private properties = toSignal(this.propertyService.getAll(), { initialValue: [] });
  private allOccupied = computed(() => this.properties().filter(p => p.status === 'ocupado'));
  /** Query per-property so both owners AND colaboradores see recent payments */
  recentPayments = toSignal(
    toObservable(this.properties).pipe(
      switchMap(props => {
        if (props.length === 0) return of([] as any[]);
        return combineLatest(
          props.map(p => this.paymentService.getByProperty(p.id!))
        ).pipe(
          map(arrays =>
            arrays.flat()
              .sort((a, b) => (b.date?.toDate?.()?.getTime?.() ?? 0) - (a.date?.toDate?.()?.getTime?.() ?? 0))
              .slice(0, 5)
          )
        );
      })
    ),
    { initialValue: [] }
  );

  totalProperties = computed(() => this.properties().length);
  occupiedProperties = computed(() => this.allOccupied().length);
  availableProperties = computed(() => this.totalProperties() - this.occupiedProperties());

  firstName = computed(() => {
    const name = this.authService.currentUser()?.displayName ?? '';
    return name.split(' ')[0];
  });

  canCreate = computed(() => {
    if (this.authService.activeRole() === 'owner') return true;
    const uid = this.authService.uid();
    if (!uid) return false;
    return this.properties().some(p => {
      const perms = p.collaboratorPermissions?.[uid];
      return !perms || perms.inmueblesUnidades !== false;
    });
  });
}
