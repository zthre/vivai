import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  Firestore,
  collection,
  query,
  where,
  collectionData,
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { PaymentLink } from '../../../core/models/payment-link.model';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(): string {
  const [y, m] = currentMonthKey().split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

@Component({
  selector: 'app-payment-status',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="max-w-md mx-auto space-y-6">

      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold text-warm-900">Pagar arriendo</h1>
        <p class="text-warm-500 text-sm mt-1">{{ monthLabelStr }}</p>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else if (!activeLink()) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-10 text-center">
          <mat-icon class="text-warm-300 text-[48px]">receipt_long</mat-icon>
          <h3 class="text-warm-700 font-semibold mt-3">Sin link de pago activo</h3>
          <p class="text-warm-400 text-sm mt-1">
            Tu administrador aún no ha generado el link de pago para este mes.
          </p>
        </div>
      } @else if (activeLink()?.status === 'paid') {
        <div class="bg-white rounded-xl border border-green-200 shadow-sm p-8 text-center">
          <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <mat-icon class="text-green-600 text-[32px]">check_circle</mat-icon>
          </div>
          <h2 class="text-xl font-bold text-green-800 mt-4">Pago confirmado</h2>
          <p class="text-green-600 text-sm mt-2">
            Tu pago de
            {{ activeLink()?.amount | currency:'COP':'symbol-narrow':'1.0-0' }}
            fue procesado exitosamente.
          </p>
          <p class="text-warm-400 text-xs mt-3">Recibirás el recibo en tu correo electrónico.</p>
          <a routerLink="/tenant" class="mt-6 inline-block text-sm text-primary-600 font-medium hover:underline">
            Volver a Mi Arriendo
          </a>
        </div>
      } @else if (activeLink()?.status === 'expired') {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-10 text-center">
          <mat-icon class="text-warm-300 text-[48px]">link_off</mat-icon>
          <h3 class="text-warm-700 font-semibold mt-3">Link expirado</h3>
          <p class="text-warm-400 text-sm mt-1">Este link ha expirado. Solicita uno nuevo a tu administrador.</p>
        </div>
      } @else {
        <!-- Active link — show pay button -->
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-6 space-y-5">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold text-warm-900">{{ activeLink()?.propertyName }}</p>
            </div>
            <p class="text-2xl font-bold text-primary-600">
              {{ activeLink()?.amount | currency:'COP':'symbol-narrow':'1.0-0' }}
            </p>
          </div>

          <div class="text-xs text-warm-400 flex items-center gap-1.5">
            <mat-icon class="text-[14px]">schedule</mat-icon>
            Link válido hasta {{ formatExpiry() }}
          </div>

          @if (activeLink()?.externalUrl) {
            <a
              [href]="activeLink()!.externalUrl!"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center justify-center gap-2 w-full px-4 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors font-medium"
            >
              <mat-icon class="text-[20px]">payment</mat-icon>
              Pagar con tarjeta
            </a>
          }

          <p class="text-xs text-center text-warm-400">
            Pago seguro procesado por Stripe. Recibirás confirmación por email.
          </p>
        </div>
      }
    </div>
  `,
})
export class PaymentStatusComponent implements OnInit {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  loading = signal(true);
  activeLink = signal<PaymentLink | null>(null);
  monthLabelStr = monthLabel();

  ngOnInit() {
    const propertyId = this.authService.tenantPropertyId();
    if (!propertyId) {
      this.loading.set(false);
      return;
    }
    const q = query(
      collection(this.firestore, 'paymentLinks'),
      where('propertyId', '==', propertyId),
      where('month', '==', currentMonthKey())
    );
    collectionData(q, { idField: 'id' }).subscribe((links: any[]) => {
      const link = links.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))[0];
      this.activeLink.set(link ?? null);
      this.loading.set(false);
    });
  }

  formatExpiry(): string {
    const link = this.activeLink();
    if (!link?.expiresAt) return '';
    return link.expiresAt.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
