import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Functions, httpsCallable } from '@angular/fire/functions';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { PropertyService } from '../../core/services/property.service';
import { AuthService } from '../../core/auth/auth.service';
import { PaymentLink } from '../../core/models/payment-link.model';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-payment-link-generator',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatSnackBarModule],
  template: `
    <div class="max-w-lg space-y-6">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <a
          [routerLink]="['/properties', propertyId]"
          class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors"
        >
          <mat-icon>arrow_back</mat-icon>
        </a>
        <div>
          <h1 class="text-xl font-bold text-warm-900">Link de pago</h1>
          <p class="text-warm-500 text-sm">Genera un link para que el inquilino pague en línea</p>
        </div>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else {

        <!-- Property info -->
        @if (property()) {
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5 space-y-2">
            <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide">Propiedad</p>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-semibold text-warm-900">{{ property()?.name }}</p>
                @if (property()?.tenantName) {
                  <p class="text-sm text-warm-500">{{ property()?.tenantName }}</p>
                }
              </div>
              <p class="text-lg font-bold text-primary-600">
                {{ property()?.tenantRentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}/mes
              </p>
            </div>
            <p class="text-xs text-warm-400">Mes: {{ monthLabel() }}</p>
          </div>
        }

        <!-- Existing active link -->
        @if (activeLink()) {
          <div class="bg-white rounded-xl border border-primary-200 shadow-sm p-5 space-y-4">
            <div class="flex items-center gap-2">
              <mat-icon class="text-primary-500">link</mat-icon>
              <p class="font-semibold text-warm-900">Link activo</p>
            </div>
            <div class="bg-warm-50 rounded-lg p-3 break-all text-sm text-warm-700 font-mono">
              {{ activeLink()?.externalUrl ?? 'Pendiente de activación' }}
            </div>
            <div class="flex items-center justify-between text-xs text-warm-400">
              <span>Expira: {{ formatExpiry(activeLink()!) }}</span>
              <span
                class="px-2 py-0.5 rounded-full font-medium"
                [class.bg-green-100]="activeLink()?.status === 'active'"
                [class.text-green-700]="activeLink()?.status === 'active'"
                [class.bg-warm-100]="activeLink()?.status !== 'active'"
                [class.text-warm-500]="activeLink()?.status !== 'active'"
              >
                {{ statusLabel(activeLink()?.status) }}
              </span>
            </div>
            @if (activeLink()?.externalUrl) {
              <button
                (click)="copyLink(activeLink()!.externalUrl!)"
                class="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-primary-300 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors text-sm font-medium"
              >
                <mat-icon class="text-[18px]">content_copy</mat-icon>
                Copiar link
              </button>
            }
          </div>
        }

        <!-- Generate new link -->
        @if (!activeLink()) {
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5 space-y-4">
            <p class="text-sm text-warm-600">
              Se generará un link de pago de Stripe por
              <strong>{{ property()?.tenantRentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}</strong>
              para el mes de {{ monthLabel() }}.
            </p>

            @if (!property()?.tenantRentPrice) {
              <div class="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <mat-icon class="text-yellow-600 text-[18px]">warning</mat-icon>
                <p class="text-sm text-yellow-700">La propiedad no tiene precio de renta configurado.</p>
              </div>
            }

            @if (!property()?.tenantEmail) {
              <div class="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <mat-icon class="text-yellow-600 text-[18px]">warning</mat-icon>
                <p class="text-sm text-yellow-700">La propiedad no tiene email de inquilino para enviar el recibo.</p>
              </div>
            }

            <button
              (click)="generateLink()"
              [disabled]="generating() || !property()?.tenantRentPrice"
              class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              @if (generating()) {
                <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                Generando...
              } @else {
                <mat-icon class="text-[18px]">payments</mat-icon>
                Generar link de pago
              }
            </button>
          </div>
        }

        <!-- Paid confirmation -->
        @if (activeLink()?.status === 'paid') {
          <div class="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
            <mat-icon class="text-green-600">check_circle</mat-icon>
            <div>
              <p class="font-semibold text-green-800">Pago confirmado</p>
              <p class="text-sm text-green-600">El pago fue procesado vía gateway.</p>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class PaymentLinkGeneratorComponent implements OnInit {
  private functions = inject(Functions);
  private firestore = inject(Firestore);
  private propertyService = inject(PropertyService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private route = inject(ActivatedRoute);

  propertyId!: string;

  loading = signal(true);
  generating = signal(false);
  activeLink = signal<PaymentLink | null>(null);

  property = signal<any>(null);

  monthLabel(): string {
    const [y, m] = currentMonthKey().split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }

  ngOnInit() {
    this.propertyId = this.route.snapshot.paramMap.get('id')!;

    this.propertyService.getById(this.propertyId).subscribe(p => this.property.set(p));
    void this.loadActiveLink();
  }

  private async loadActiveLink() {
    this.loading.set(true);
    const q = query(
      collection(this.firestore, 'paymentLinks'),
      where('propertyId', '==', this.propertyId),
      where('month', '==', currentMonthKey()),
      where('status', 'in', ['active', 'paid'])
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      this.activeLink.set({ id: snap.docs[0].id, ...snap.docs[0].data() } as PaymentLink);
    }
    this.loading.set(false);
  }

  async generateLink() {
    if (this.generating()) return;
    this.generating.set(true);
    try {
      const fn = httpsCallable<{ propertyId: string; month: string }, { url: string; linkId: string }>(
        this.functions,
        'createPaymentLink'
      );
      const result = await fn({ propertyId: this.propertyId, month: currentMonthKey() });
      await this.loadActiveLink();
      this.snackBar.open('Link generado. Cópialo y compártelo con el inquilino.', 'OK', { duration: 4000 });
    } catch (err: any) {
      this.snackBar.open(
        err?.message?.includes('already exists')
          ? 'Ya existe un link activo para este mes.'
          : 'Error al generar el link. Verifica la configuración de Stripe.',
        'OK',
        { duration: 4000 }
      );
    } finally {
      this.generating.set(false);
    }
  }

  copyLink(url: string) {
    navigator.clipboard.writeText(url);
    this.snackBar.open('Link copiado al portapapeles.', 'OK', { duration: 2500 });
  }

  formatExpiry(link: PaymentLink): string {
    return link.expiresAt.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  statusLabel(status?: string): string {
    switch (status) {
      case 'active': return 'Activo';
      case 'paid': return 'Pagado';
      case 'expired': return 'Expirado';
      default: return status ?? '';
    }
  }
}
