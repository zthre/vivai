import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc, Timestamp } from '@angular/fire/firestore';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, map, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { PaymentService } from '../../../core/services/payment.service';
import { Unit } from '../../../core/models/unit.model';
import { Property } from '../../../core/models/property.model';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

@Component({
  selector: 'app-my-lease',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6 space-y-4">

      @if (loading()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else if (error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
          <p class="font-medium mb-1">No se pudo cargar tu arriendo</p>
          <p>{{ error() }}</p>
        </div>
      } @else {

        <!-- Header -->
        <div>
          <p class="text-warm-500 text-sm">Hola, {{ displayName() }}</p>
          <h1 class="text-2xl font-bold text-warm-900">Tu arriendo</h1>
        </div>

        <!-- Property + unit card -->
        @if (property(); as prop) {
          <div class="bg-white rounded-xl border border-warm-200 p-5 space-y-2">
            <p class="font-semibold text-warm-900 text-lg">{{ prop.name }}</p>
            <p class="text-sm text-warm-500 flex items-center gap-1">
              <mat-icon class="text-[16px]">location_on</mat-icon>
              {{ prop.address }}
            </p>
            @if (unit(); as u) {
              <span class="inline-block text-xs px-2 py-0.5 bg-warm-100 text-warm-600 rounded-full">
                Unidad {{ u.number }}
              </span>
            }
          </div>
        }

        <!-- Payment status this month -->
        <div class="bg-white rounded-xl border border-warm-200 p-5 space-y-3">
          <p class="text-sm font-medium text-warm-600">Pago de {{ currentMonthLabel() }}</p>

          @switch (paymentStatus()) {
            @case ('al_dia') {
              <div class="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <mat-icon class="text-green-600">check_circle</mat-icon>
                <div>
                  <p class="font-semibold text-green-700">Al día</p>
                  <p class="text-xs text-green-600">Pagado: &#36;{{ totalPaid() | number }}</p>
                </div>
              </div>
            }
            @case ('parcial') {
              <div class="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <mat-icon class="text-amber-600">schedule</mat-icon>
                <div>
                  <p class="font-semibold text-amber-700">Pago parcial</p>
                  <p class="text-xs text-amber-600">
                    &#36;{{ totalPaid() | number }} de &#36;{{ rentPrice() | number }}
                  </p>
                </div>
              </div>
            }
            @case ('pendiente') {
              <div class="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <mat-icon class="text-red-600">warning</mat-icon>
                <div>
                  <p class="font-semibold text-red-700">Pendiente</p>
                  <p class="text-xs text-red-600">&#36;{{ rentPrice() | number }}</p>
                </div>
              </div>
            }
            @default {
              <div class="flex items-center gap-3 bg-warm-50 border border-warm-200 rounded-lg px-4 py-3">
                <mat-icon class="text-warm-400">info</mat-icon>
                <p class="text-sm text-warm-500">Sin precio de renta configurado</p>
              </div>
            }
          }

          @if (rentPrice() > 0) {
            <p class="text-xs text-warm-400">Precio mensual: &#36;{{ rentPrice() | number }}</p>
          }
        </div>

        <!-- Contract -->
        <div class="bg-white rounded-xl border border-warm-200 p-5">
          <p class="text-sm font-medium text-warm-600 mb-3">Contrato de arriendo</p>
          @if (unit()?.contract?.url) {
            <a
              [href]="unit()!.contract!.url"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-100 transition-colors"
            >
              <mat-icon class="text-[18px]">open_in_new</mat-icon>
              Ver contrato
            </a>
          } @else {
            <p class="text-sm text-warm-400">Sin contrato disponible</p>
          }
        </div>

        <!-- Quick links -->
        <a
          routerLink="/tenant/payments"
          class="flex items-center justify-between bg-white rounded-xl border border-warm-200 p-5 hover:bg-warm-50 transition-colors"
        >
          <div class="flex items-center gap-2">
            <mat-icon class="text-warm-500">receipt_long</mat-icon>
            <span class="text-sm font-medium text-warm-700">Ver historial de pagos</span>
          </div>
          <mat-icon class="text-warm-400">arrow_forward</mat-icon>
        </a>

        <a
          routerLink="/tenant/tickets"
          class="flex items-center justify-between bg-white rounded-xl border border-warm-200 p-5 hover:bg-warm-50 transition-colors"
        >
          <div class="flex items-center gap-2">
            <mat-icon class="text-warm-500">build_circle</mat-icon>
            <span class="text-sm font-medium text-warm-700">Solicitudes de mantenimiento</span>
          </div>
          <mat-icon class="text-warm-400">arrow_forward</mat-icon>
        </a>

      }
    </div>
  `,
})
export class MyLeaseComponent implements OnInit {
  private firebaseAuth = inject(Auth);
  private firestore = inject(Firestore);
  private paymentService = inject(PaymentService);

  unit = signal<Unit | null>(null);
  property = signal<Property | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  private unitIdSig = signal<string | null>(null);

  currentMonthStart = startOfMonth(new Date());
  currentMonthEnd = endOfMonth(new Date());

  currentMonthPayments = toSignal(
    toObservable(this.unitIdSig).pipe(
      switchMap(id => (id ? this.paymentService.getByUnit(id) : of([]))),
      map(payments =>
        payments.filter(p => {
          const d = (p.date as Timestamp).toDate();
          return d >= this.currentMonthStart && d <= this.currentMonthEnd;
        })
      )
    ),
    { initialValue: [] }
  );

  totalPaid = computed(() => this.currentMonthPayments().reduce((sum, p) => sum + p.amount, 0));
  rentPrice = computed(() => this.unit()?.tenantRentPrice ?? 0);

  paymentStatus = computed((): 'al_dia' | 'parcial' | 'pendiente' | 'sin_precio' => {
    const total = this.totalPaid();
    const rent = this.rentPrice();
    if (rent === 0) return 'sin_precio';
    if (total >= rent) return 'al_dia';
    if (total > 0) return 'parcial';
    return 'pendiente';
  });

  currentMonthLabel = computed(() =>
    new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  );

  displayName = computed(() => this.firebaseAuth.currentUser?.displayName ?? '');

  async ngOnInit() {
    try {
      await (this.firebaseAuth as any).authStateReady();
      const firebaseUser = this.firebaseAuth.currentUser;
      if (!firebaseUser) {
        this.error.set('No autenticado');
        return;
      }

      const userSnap = await getDoc(doc(this.firestore, `users/${firebaseUser.uid}`));
      const unitId = userSnap.data()?.['unitId'] as string | undefined;
      if (!unitId) {
        this.error.set('No tienes una unidad asignada. Contacta a tu arrendador.');
        return;
      }

      const unitSnap = await getDoc(doc(this.firestore, `units/${unitId}`));
      if (!unitSnap.exists()) {
        this.error.set('No se encontró tu unidad.');
        return;
      }

      const unit = { id: unitSnap.id, ...unitSnap.data() } as Unit;
      this.unit.set(unit);
      this.unitIdSig.set(unitId);

      const propSnap = await getDoc(doc(this.firestore, `properties/${unit.propertyId}`));
      if (propSnap.exists()) {
        this.property.set({ id: propSnap.id, ...propSnap.data() } as Property);
      }
    } catch {
      this.error.set('Error al cargar tu información.');
    } finally {
      this.loading.set(false);
    }
  }
}
