import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  Firestore,
  collection,
  query,
  where,
  collectionData,
} from '@angular/fire/firestore';

@Component({
  selector: 'app-payment-success',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="max-w-md mx-auto py-16 text-center space-y-6">

      @if (loading()) {
        <!-- Polling state -->
        <div class="w-20 h-20 bg-warm-100 rounded-full flex items-center justify-center mx-auto">
          <div class="w-10 h-10 border-3 border-warm-300 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
        <h2 class="text-xl font-bold text-warm-900">Procesando pago...</h2>
        <p class="text-warm-500 text-sm">Confirmando con el gateway. Esto puede tomar unos segundos.</p>
      } @else if (confirmed()) {
        <!-- Confirmed -->
        <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <mat-icon class="text-green-600 text-[40px]">check_circle</mat-icon>
        </div>
        <h2 class="text-2xl font-bold text-green-800">Pago recibido</h2>
        <p class="text-green-600">Tu pago fue procesado exitosamente.</p>
        <p class="text-warm-400 text-sm">Recibirás el recibo en tu correo electrónico.</p>
        <a
          routerLink="/tenant"
          class="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors font-medium"
        >
          <mat-icon class="text-[18px]">home</mat-icon>
          Volver a Mi Arriendo
        </a>
      } @else {
        <!-- Timeout / not found -->
        <div class="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
          <mat-icon class="text-yellow-600 text-[40px]">pending</mat-icon>
        </div>
        <h2 class="text-xl font-bold text-warm-900">Pago en proceso</h2>
        <p class="text-warm-500 text-sm">
          Tu pago está siendo verificado. Puede demorar unos minutos en confirmarse.
          Revisa tu correo electrónico para la confirmación.
        </p>
        <a
          routerLink="/tenant"
          class="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors font-medium"
        >
          Volver a Mi Arriendo
        </a>
      }
    </div>
  `,
})
export class PaymentSuccessComponent implements OnInit {
  private firestore = inject(Firestore);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  confirmed = signal(false);

  ngOnInit() {
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (!sessionId) {
      this.loading.set(false);
      return;
    }
    // Poll for up to 30s waiting for webhook to write the payment
    let attempts = 0;
    const poll = () => {
      const q = query(
        collection(this.firestore, 'paymentLinks'),
        where('externalId', '==', sessionId),
        where('status', '==', 'paid')
      );
      collectionData(q).subscribe(docs => {
        if (docs.length > 0) {
          this.loading.set(false);
          this.confirmed.set(true);
        } else if (attempts < 6) {
          attempts++;
          setTimeout(poll, 5000);
        } else {
          this.loading.set(false);
        }
      });
    };
    poll();
  }
}
