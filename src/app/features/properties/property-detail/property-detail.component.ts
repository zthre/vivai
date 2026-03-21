import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { PropertyService } from '../../../core/services/property.service';
import { PaymentService } from '../../../core/services/payment.service';
import { Property, ContractFile } from '../../../core/models/property.model';
import { Payment } from '../../../core/models/payment.model';
import { PhotoGalleryComponent } from './photo-gallery/photo-gallery.component';
import { PaymentFormComponent } from '../../payments/payment-form/payment-form.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-property-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule, MatDialogModule, MatSnackBarModule, PhotoGalleryComponent],
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
            @if (canWritePagos() && !property()?.paymentFree) {
              <button
                (click)="openPaymentForm()"
                class="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm"
              >
                <mat-icon class="text-[18px]">add</mat-icon>
                Registrar
              </button>
            }
          </div>
        </div>

      </div>

      <!-- Two-column layout on desktop -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left column: Inquilino + Contract -->
        <div class="space-y-6">
          <!-- Inquilino section -->
          @if (canWrite()) {
            <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
              <div class="px-5 py-4 border-b border-warm-100 flex items-center justify-between">
                <h2 class="font-semibold text-warm-900 flex items-center gap-2">
                  <mat-icon class="text-[20px] text-warm-500">person</mat-icon>
                  Inquilino
                </h2>
                @if (property()?.tenantName && !showTenantForm()) {
                  <div class="flex items-center gap-2">
                    @if (property()?.tenantUid) {
                      <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Vinculado</span>
                    }
                    <button (click)="confirmRemoveTenant()"
                      class="flex items-center gap-1 px-2.5 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
                      [disabled]="tenantLoading()">
                      <mat-icon class="text-[14px]">person_remove</mat-icon>
                      Quitar
                    </button>
                  </div>
                }
              </div>

              @if (property()?.tenantName && !showTenantForm()) {
                <!-- Tenant info display -->
                <div class="p-5">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <mat-icon class="text-green-600 text-[20px]">person</mat-icon>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-warm-800">{{ property()!.tenantName }}</p>
                      <div class="flex items-center gap-2 flex-wrap">
                        @if (property()?.tenantPhone) {
                          <p class="text-xs text-warm-500">{{ property()!.tenantPhone }}</p>
                        }
                        @if (property()?.tenantEmail) {
                          <p class="text-xs text-warm-400">{{ property()!.tenantEmail }}</p>
                        }
                        @if (property()?.residentCount && property()!.residentCount! > 0) {
                          <span class="text-xs text-warm-400">· {{ property()!.residentCount }} persona(s)</span>
                        }
                        @if (property()?.tenantRentPrice) {
                          <span class="text-xs text-warm-400">· {{ property()!.tenantRentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}/mes</span>
                        }
                      </div>
                    </div>
                  </div>
                  @if (property()?.tenantPhone || property()?.tenantEmail) {
                    <div class="mt-3 flex gap-2 flex-wrap">
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
              } @else if (!showTenantForm()) {
                <!-- No tenant — show add button -->
                <div class="p-5 text-center">
                  <mat-icon class="text-warm-300 text-[40px]">person_add</mat-icon>
                  <p class="text-warm-400 text-sm mt-2">No hay inquilino asignado</p>
                  <button (click)="showTenantForm.set(true)"
                    class="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors">
                    <mat-icon class="text-[16px]">person_add</mat-icon>
                    Agregar inquilino
                  </button>
                </div>
              } @else {
                <!-- Add tenant form -->
                <form [formGroup]="tenantForm" (ngSubmit)="submitTenant()" class="p-5 space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-warm-700 mb-1.5">Nombre *</label>
                    <input formControlName="name" type="text" placeholder="Nombre completo"
                      class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-warm-700 mb-1.5">Celular (WhatsApp)</label>
                      <input formControlName="phone" type="tel" placeholder="3001234567"
                        class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-warm-700 mb-1.5">Email</label>
                      <input formControlName="email" type="email" placeholder="inquilino@email.com"
                        class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <p class="text-xs text-warm-400 mt-1">Si coincide con una cuenta existente, se vincula automáticamente</p>
                    </div>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-warm-700 mb-1.5">Renta mensual</label>
                      <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
                        <input formControlName="rentPrice" type="number" placeholder="1200000"
                          class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                      </div>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-warm-700 mb-1.5">Personas</label>
                      <input formControlName="residentCount" type="number" min="1" placeholder="1"
                        class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                    </div>
                  </div>
                  <div class="flex gap-2 pt-2">
                    <button type="button" (click)="showTenantForm.set(false)"
                      class="flex-1 px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" [disabled]="tenantForm.get('name')?.invalid || tenantLoading()"
                      class="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      @if (tenantLoading()) {
                        <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                      }
                      Asignar inquilino
                    </button>
                  </div>
                </form>
              }
            </div>
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
                <div class="flex items-center gap-4 px-5 py-4 group">
                  <div class="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <mat-icon class="text-green-600 text-[18px]">check_circle</mat-icon>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-warm-800">{{ payment.notes || 'Pago registrado' }}</p>
                    <p class="text-xs text-warm-400">{{ payment.date.toDate() | date:'d MMMM y' }}</p>
                  </div>
                  <span class="text-sm font-bold text-warm-900">
                    {{ payment.amount | currency:'COP':'symbol-narrow':'1.0-0' }}
                  </span>
                  @if (canWritePagos()) {
                    <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button (click)="editPayment(payment)"
                        class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
                        <mat-icon class="text-[16px]">edit</mat-icon>
                      </button>
                      <button (click)="confirmDeletePayment(payment)"
                        class="p-1.5 text-warm-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <mat-icon class="text-[16px]">delete</mat-icon>
                      </button>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Photos (full width, at the end) -->
      @if (property()) {
        <app-photo-gallery
          [photos]="property()?.photos ?? []"
          [propertyId]="propertyId"
          [ownerId]="property()!.ownerId"
          [canWrite]="canWriteMedia()"
        />
      }

    </div>
  `,
})
export class PropertyDetailComponent implements OnInit {
  private propertyService = inject(PropertyService);
  private paymentService = inject(PaymentService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  propertyId!: string;
  property = signal<Property | null>(null);
  showTenantForm = signal(false);
  tenantLoading = signal(false);

  tenantForm = this.fb.group({
    name: ['', Validators.required],
    phone: [''],
    email: [''],
    rentPrice: [null as number | null],
    residentCount: [1 as number | null],
  });

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
        defaultDate: new Date(),
      },
    });
  }

  editPayment(payment: Payment) {
    this.dialog.open(PaymentFormComponent, {
      width: '420px',
      data: {
        propertyId: this.propertyId,
        label: this.property()?.name ?? 'Propiedad',
        payment,
      },
    });
  }

  confirmDeletePayment(payment: Payment) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar pago',
        message: `¿Eliminar este pago de ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(payment.amount)}?`,
        confirmLabel: 'Eliminar',
        danger: true,
      },
    });
    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed && payment.id) {
        try {
          await this.paymentService.delete(payment.id);
          this.snackBar.open('Pago eliminado', 'OK', {
            duration: 3000,
            panelClass: 'snackbar-success',
          });
        } catch (e) {
          this.snackBar.open('Error al eliminar pago', 'OK', {
            duration: 3000,
            panelClass: 'snackbar-error',
          });
        }
      }
    });
  }

  async confirmRemoveTenant(): Promise<void> {
    const name = this.property()?.tenantName ?? 'el inquilino';
    const confirmed = confirm(`¿Quitar a ${name} de esta propiedad? Se le quitarán los permisos de acceso.`);
    if (!confirmed) return;

    this.tenantLoading.set(true);
    try {
      await this.propertyService.removeTenant(this.propertyId);
      this.snackBar.open('Inquilino removido', 'OK', { duration: 3000, panelClass: 'snackbar-success' });
      this.propertyService.getById(this.propertyId).subscribe(p => this.property.set(p));
    } catch (e) {
      this.snackBar.open('Error al remover inquilino', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    } finally {
      this.tenantLoading.set(false);
    }
  }

  async submitTenant(): Promise<void> {
    if (this.tenantForm.get('name')?.invalid) return;
    this.tenantLoading.set(true);
    try {
      const v = this.tenantForm.value;
      const result = await this.propertyService.assignTenant(this.propertyId, {
        name: v.name!,
        phone: v.phone || undefined,
        email: v.email || undefined,
        rentPrice: v.rentPrice || undefined,
        residentCount: v.residentCount || undefined,
      });
      this.showTenantForm.set(false);
      this.tenantForm.reset({ residentCount: 1 });
      const msg = result === 'linked'
        ? 'Inquilino asignado y vinculado a su cuenta.'
        : 'Inquilino asignado. Se vinculará cuando inicie sesión con ese email.';
      this.snackBar.open(msg, 'OK', { duration: 4000, panelClass: 'snackbar-success' });
      this.propertyService.getById(this.propertyId).subscribe(p => this.property.set(p));
    } catch (e) {
      this.snackBar.open('Error al asignar inquilino', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    } finally {
      this.tenantLoading.set(false);
    }
  }

  whatsappTenantLink(): string {
    const phone = this.property()?.tenantPhone ?? '';
    const name = this.property()?.tenantName ?? 'inquilino';
    const text = encodeURIComponent(`Hola ${name}, te escribo respecto a ${this.property()?.name}.`);
    return `https://wa.me/${phone}?text=${text}`;
  }
}
