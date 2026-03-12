import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { PropertyService } from '../../../core/services/property.service';
import { PaymentService } from '../../../core/services/payment.service';
import { Property, ContractFile } from '../../../core/models/property.model';
import { PhotoGalleryComponent } from './photo-gallery/photo-gallery.component';
import { PaymentFormComponent } from '../../payments/payment-form/payment-form.component';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-property-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatDialogModule, MatSnackBarModule, PhotoGalleryComponent],
  template: `
    <div class="space-y-6">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 text-sm text-warm-400">
        <a routerLink="/properties" class="hover:text-warm-600 transition-colors">Propiedades</a>
        <mat-icon class="text-[16px]">chevron_right</mat-icon>
        <span class="text-warm-700 font-medium">{{ property()?.name }}</span>
      </div>

      <!-- Header (full width) -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-6">
        <div class="flex items-start justify-between flex-wrap gap-4">
          <div class="flex items-center gap-3">
            <a routerLink="/properties" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
              <mat-icon>arrow_back</mat-icon>
            </a>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h1 class="text-2xl font-bold text-warm-900">{{ property()?.name }}</h1>
                @if (property()?.status === 'ocupado') {
                  <span class="text-xs px-2 py-0.5 bg-warm-100 text-warm-700 rounded-full font-medium">Ocupado</span>
                } @else if (property()?.status === 'disponible') {
                  <span class="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">Disponible</span>
                }
                @if (property()?.isPublic && property()?.isForRent) {
                  <span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">En renta</span>
                }
                @if (property()?.isPublic && property()?.isForSale) {
                  <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">En venta</span>
                }
              </div>
              <p class="text-warm-400 text-sm flex items-center gap-1 mt-0.5">
                <mat-icon class="text-[14px]">location_on</mat-icon>
                {{ property()?.address }}
              </p>
              <!-- Prices -->
              <div class="flex items-baseline gap-3 mt-1 flex-wrap">
                @if (property()?.tenantRentPrice) {
                  <p class="text-lg font-semibold text-primary-600">
                    {{ property()?.tenantRentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}/mes
                  </p>
                }
                @if (property()?.isForSale && property()?.salePrice) {
                  <p class="text-base font-semibold text-green-600">
                    {{ property()?.salePrice | currency:'COP':'symbol-narrow':'1.0-0' }}
                    <span class="text-xs font-normal text-warm-400">venta</span>
                  </p>
                }
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            @if (canWrite()) {
              <a [routerLink]="['/properties', propertyId, 'edit']"
                class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
                <mat-icon class="text-[20px]">edit</mat-icon>
              </a>
            }
            @if (canWritePagos()) {
              <button
                (click)="openPaymentForm()"
                class="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm"
              >
                <mat-icon class="text-[18px]">add</mat-icon>
                Registrar pago
              </button>
            }
          </div>
        </div>

        <!-- Tenant info -->
        @if (property()?.status === 'ocupado' && property()?.tenantName) {
          <div class="mt-5 pt-5 border-t border-warm-100">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <mat-icon class="text-green-600 text-[20px]">person</mat-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-warm-800">{{ property()!.tenantName }}</p>
                <div class="flex items-center gap-2">
                  @if (property()?.tenantPhone) {
                    <p class="text-xs text-warm-500">{{ property()!.tenantPhone }}</p>
                  } @else if (property()?.tenantEmail) {
                    <p class="text-xs text-warm-400">{{ property()!.tenantEmail }}</p>
                  }
                  @if (property()?.residentCount && property()!.residentCount! > 0) {
                    <span class="text-xs text-warm-400">· {{ property()!.residentCount }} persona(s)</span>
                  }
                </div>
              </div>
            </div>
            @if (property()?.tenantPhone || property()?.tenantEmail) {
              <div class="mt-3 flex gap-2">
                @if (property()?.tenantPhone) {
                  <a [href]="whatsappTenantLink()" target="_blank" rel="noopener"
                    class="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 transition-colors">
                    <mat-icon class="text-[14px]">chat</mat-icon>
                    WhatsApp
                  </a>
                  <a [href]="'tel:' + property()!.tenantPhone"
                    class="flex items-center gap-1.5 px-3 py-1.5 border border-warm-200 text-warm-600 rounded-lg text-xs font-medium hover:bg-warm-50 transition-colors">
                    <mat-icon class="text-[14px]">call</mat-icon>
                    Llamar
                  </a>
                }
                @if (property()?.tenantEmail) {
                  <a [href]="'mailto:' + property()!.tenantEmail"
                    class="flex items-center gap-1.5 px-3 py-1.5 border border-warm-200 text-warm-600 rounded-lg text-xs font-medium hover:bg-warm-50 transition-colors">
                    <mat-icon class="text-[14px]">email</mat-icon>
                    Email
                  </a>
                }
              </div>
            }
          </div>
        }
      </div>

      <!-- Two-column layout on desktop -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left column: Photos + Contract -->
        <div class="space-y-6">
          <!-- Photo gallery -->
          @if (property()) {
            <app-photo-gallery
              [photos]="property()?.photos ?? []"
              [propertyId]="propertyId"
              [ownerId]="property()!.ownerId"
              [canWrite]="canWriteMedia()"
            />
          }

          <!-- Contract -->
          @if (property()?.contract?.url) {
            <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
              <p class="text-sm font-medium text-warm-600 mb-3">Contrato</p>
              <a [href]="property()!.contract!.url" target="_blank" rel="noopener"
                class="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-100 transition-colors">
                <mat-icon class="text-[18px]">open_in_new</mat-icon>
                Ver contrato ({{ property()!.contract!.filename }})
              </a>
            </div>
          }
        </div>

        <!-- Right column: Payment history -->
        <div class="space-y-6">
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
            <div class="px-5 py-4 border-b border-warm-100">
              <h2 class="font-semibold text-warm-900">Historial de pagos</h2>
            </div>
            @if (propertyPayments().length === 0) {
              <div class="px-5 py-10 text-center">
                <mat-icon class="text-warm-300 text-[40px]">receipt_long</mat-icon>
                <p class="text-warm-400 text-sm mt-2">No hay pagos registrados</p>
              </div>
            }
            <div class="divide-y divide-warm-100">
              @for (payment of propertyPayments(); track payment.id) {
                <div class="flex items-center gap-4 px-5 py-4">
                  <div class="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <mat-icon class="text-green-600 text-[18px]">check_circle</mat-icon>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-warm-800">{{ payment.notes || 'Pago registrado' }}</p>
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
      </div>

    </div>
  `,
})
export class PropertyDetailComponent implements OnInit {
  private propertyService = inject(PropertyService);
  private paymentService = inject(PaymentService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);

  propertyId!: string;
  property = signal<Property | null>(null);

  canWrite = computed(() => {
    const uid = this.authService.uid();
    const prop = this.property();
    if (!uid || !prop) return false;
    if (prop.ownerId === uid) return true;
    const perms = prop.collaboratorPermissions?.[uid];
    return !perms || perms.inmueblesUnidades !== false;
  });

  canWritePagos = computed(() => {
    const uid = this.authService.uid();
    const prop = this.property();
    if (!uid || !prop) return false;
    if (prop.ownerId === uid) return true;
    const perms = prop.collaboratorPermissions?.[uid];
    return !perms || perms.inmueblesPagos !== false;
  });

  canWriteMedia = computed(() => {
    const uid = this.authService.uid();
    const prop = this.property();
    if (!uid || !prop) return false;
    if (prop.ownerId === uid) return true;
    const perms = prop.collaboratorPermissions?.[uid];
    return !perms || perms.inmueblesMedia !== false;
  });

  propertyPayments = toSignal(
    this.route.paramMap.pipe(
      switchMap(params => this.paymentService.getByProperty(params.get('id')!))
    ),
    { initialValue: [] }
  );

  ngOnInit() {
    this.propertyId = this.route.snapshot.paramMap.get('id')!;
    this.propertyService.getById(this.propertyId).subscribe(p => this.property.set(p));
  }

  openPaymentForm() {
    this.dialog.open(PaymentFormComponent, {
      width: '420px',
      data: {
        propertyId: this.propertyId,
        rentPrice: this.property()?.tenantRentPrice ?? this.property()?.rentPrice ?? null,
        label: this.property()?.name ?? 'Propiedad',
      },
    });
  }

  whatsappTenantLink(): string {
    const phone = this.property()?.tenantPhone ?? '';
    const name = this.property()?.tenantName ?? 'inquilino';
    const text = encodeURIComponent(`Hola ${name}, te escribo respecto a ${this.property()?.name}.`);
    return `https://wa.me/${phone}?text=${text}`;
  }
}
