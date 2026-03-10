import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc, Timestamp } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { PaymentService } from '../../../core/services/payment.service';
import { Payment } from '../../../core/models/payment.model';

@Component({
  selector: 'app-payment-history',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-6 space-y-4">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <a routerLink="/tenant" class="p-1.5 rounded-lg text-warm-500 hover:bg-warm-100 transition-colors">
          <mat-icon>arrow_back</mat-icon>
        </a>
        <h1 class="text-xl font-bold text-warm-900">Historial de pagos</h1>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else if (!payments().length) {
        <div class="bg-white rounded-xl border border-warm-200 p-8 text-center">
          <mat-icon class="text-warm-300 text-[48px] mb-3">receipt_long</mat-icon>
          <p class="text-warm-500">No hay pagos registrados aún.</p>
        </div>
      } @else {
        <div class="bg-white rounded-xl border border-warm-200 overflow-hidden">
          <table class="w-full">
            <thead class="bg-warm-50 border-b border-warm-200">
              <tr>
                <th class="text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wide">Fecha</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wide">Monto</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-warm-600 uppercase tracking-wide hidden sm:table-cell">Nota</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-warm-100">
              @for (payment of payments(); track payment.id) {
                <tr class="hover:bg-warm-50 transition-colors">
                  <td class="px-4 py-3 text-sm text-warm-700">{{ formatDate(payment.date) }}</td>
                  <td class="px-4 py-3 text-sm font-semibold text-warm-900 text-right">
                    &#36;{{ payment.amount | number }}
                  </td>
                  <td class="px-4 py-3 text-sm text-warm-500 hidden sm:table-cell">
                    {{ payment.notes || '—' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="text-xs text-warm-400 text-center">
          {{ payments().length }} pago{{ payments().length !== 1 ? 's' : '' }} registrado{{ payments().length !== 1 ? 's' : '' }}
        </p>
      }
    </div>
  `,
})
export class PaymentHistoryComponent implements OnInit, OnDestroy {
  private firebaseAuth = inject(Auth);
  private firestore = inject(Firestore);
  private paymentService = inject(PaymentService);

  loading = signal(true);
  payments = signal<Payment[]>([]);
  private sub?: Subscription;

  formatDate(date: Timestamp): string {
    return date.toDate().toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  async ngOnInit() {
    try {
      await (this.firebaseAuth as any).authStateReady();
      const firebaseUser = this.firebaseAuth.currentUser;
      if (!firebaseUser) return;

      const userSnap = await getDoc(doc(this.firestore, `users/${firebaseUser.uid}`));
      const userData = userSnap.data();
      const propertyIds = (userData?.['propertyIds'] ?? userData?.['unitIds']) as string[] | undefined;
      const propertyId = propertyIds?.[0];
      if (!propertyId) {
        this.loading.set(false);
        return;
      }

      this.sub = this.paymentService.getByProperty(propertyId).subscribe(ps => {
        this.payments.set(ps);
        this.loading.set(false);
      });
    } catch {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
