import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PropertyService } from '../../../core/services/property.service';
import { Timestamp } from '@angular/fire/firestore';

type PropertyType = 'apartamento' | 'casa' | 'local' | 'bodega';

@Component({
  selector: 'app-property-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule, MatSnackBarModule],
  template: `
    <div class="max-w-lg">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-6">
        <a routerLink="/properties" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
          <mat-icon>arrow_back</mat-icon>
        </a>
        <div>
          <h1 class="text-2xl font-bold text-warm-900">{{ isEdit() ? 'Editar' : 'Nuevo' }} inmueble</h1>
          <p class="text-warm-500 text-sm">{{ isEdit() ? 'Actualiza los datos del inmueble' : 'Registra una nueva propiedad' }}</p>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="bg-white rounded-xl border border-warm-200 shadow-sm p-6 space-y-5">

        <!-- ── Info básica ── -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Nombre del inmueble *</label>
          <input formControlName="name" type="text" placeholder="Ej: Edificio Los Robles"
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            [class.border-red-400]="form.get('name')?.invalid && form.get('name')?.touched">
        </div>

        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Dirección *</label>
          <input formControlName="address" type="text" placeholder="Ej: Calle 123 # 45-67, Bogotá"
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            [class.border-red-400]="form.get('address')?.invalid && form.get('address')?.touched">
        </div>

        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Tipo *</label>
          <div class="grid grid-cols-2 gap-2">
            @for (t of propertyTypes; track t.value) {
              <button type="button" (click)="setType(t.value)"
                class="flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-medium transition-all"
                [class.border-primary-500]="form.get('type')?.value === t.value"
                [class.bg-primary-50]="form.get('type')?.value === t.value"
                [class.text-primary-700]="form.get('type')?.value === t.value"
                [class.border-warm-200]="form.get('type')?.value !== t.value"
                [class.text-warm-600]="form.get('type')?.value !== t.value">
                <mat-icon class="text-[18px]">{{ t.icon }}</mat-icon>
                {{ t.label }}
              </button>
            }
          </div>
        </div>

        <!-- ── Ocupación ── -->
        <div class="pt-2 border-t border-warm-200 space-y-4">
          <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide">Ocupación</p>

          <label class="flex items-start gap-3 cursor-pointer p-3 border rounded-lg transition-all"
            [class.border-warm-400]="form.get('isOccupied')?.value"
            [class.bg-warm-50]="form.get('isOccupied')?.value"
            [class.border-warm-200]="!form.get('isOccupied')?.value">
            <input type="checkbox" formControlName="isOccupied" class="w-4 h-4 accent-warm-600 cursor-pointer mt-0.5 flex-shrink-0">
            <div>
              <span class="text-sm font-medium text-warm-700">Ocupado</span>
              <p class="text-xs text-warm-400 mt-0.5">Hay un inquilino activo en este inmueble</p>
            </div>
          </label>

          @if (form.get('isOccupied')?.value) {
            <div class="space-y-4 p-4 bg-warm-50 rounded-lg border border-warm-200">
              <p class="text-xs font-semibold text-warm-600 uppercase tracking-wide">Datos del inquilino</p>
              <div>
                <label class="block text-sm font-medium text-warm-700 mb-1.5">Nombre</label>
                <input formControlName="tenantName" type="text" placeholder="Nombre completo"
                  class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-warm-700 mb-1.5">
                  Celular <span class="text-warm-400 font-normal">(WhatsApp)</span>
                </label>
                <input formControlName="tenantPhone" type="tel" placeholder="Ej: 3001234567"
                  class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-warm-700 mb-1.5">
                  Email <span class="text-warm-400 font-normal">(opcional)</span>
                </label>
                <input formControlName="tenantEmail" type="email" placeholder="inquilino@email.com"
                  class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-warm-700 mb-1.5">Precio de renta mensual</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
                  <input formControlName="tenantRentPrice" type="number" placeholder="Ej: 1200000"
                    class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                </div>
                <p class="text-xs text-warm-400 mt-1">Monto que paga el inquilino — se usa al registrar pagos</p>
              </div>
            </div>
          }
        </div>

        <!-- ── Marketplace ── -->
        <div class="pt-2 border-t border-warm-200 space-y-4">
          <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide">Marketplace</p>

          <label class="flex items-start gap-3 cursor-pointer p-3 border rounded-lg transition-all"
            [class.border-primary-500]="form.get('isPublic')?.value"
            [class.bg-primary-50]="form.get('isPublic')?.value"
            [class.border-warm-200]="!form.get('isPublic')?.value">
            <input type="checkbox" formControlName="isPublic" class="w-4 h-4 accent-primary-500 cursor-pointer mt-0.5 flex-shrink-0">
            <div>
              <span class="text-sm font-medium text-warm-700">Publicar en marketplace</span>
              <p class="text-xs text-warm-400 mt-0.5">El inmueble aparecerá en el portal público</p>
            </div>
          </label>

          @if (form.get('isPublic')?.value) {
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-warm-700 mb-1.5">
                  WhatsApp de contacto *
                </label>
                <input formControlName="whatsappPhone" type="text" placeholder="+57 300 123 4567"
                  class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  [class.border-red-400]="form.get('whatsappPhone')?.invalid && form.get('whatsappPhone')?.touched">
                @if (form.get('whatsappPhone')?.invalid && form.get('whatsappPhone')?.touched) {
                  <p class="text-xs text-red-500 mt-1">Requerido para publicar</p>
                }
              </div>

              <div class="space-y-3">
                <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide">Tipo de listado</p>
                <div class="grid grid-cols-2 gap-2">
                  <label class="flex items-center gap-2 cursor-pointer p-2.5 border rounded-lg transition-all"
                    [class.border-blue-500]="form.get('isForRent')?.value"
                    [class.bg-blue-50]="form.get('isForRent')?.value"
                    [class.border-warm-200]="!form.get('isForRent')?.value">
                    <input type="checkbox" formControlName="isForRent" class="w-4 h-4 accent-blue-500 cursor-pointer">
                    <span class="text-sm font-medium text-warm-700">En renta</span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer p-2.5 border rounded-lg transition-all"
                    [class.border-green-500]="form.get('isForSale')?.value"
                    [class.bg-green-50]="form.get('isForSale')?.value"
                    [class.border-warm-200]="!form.get('isForSale')?.value">
                    <input type="checkbox" formControlName="isForSale" class="w-4 h-4 accent-green-600 cursor-pointer">
                    <span class="text-sm font-medium text-warm-700">En venta</span>
                  </label>
                </div>

                @if (form.get('isForRent')?.value) {
                  <div>
                    <label class="block text-sm font-medium text-warm-700 mb-1.5">Precio de renta en marketplace *</label>
                    <div class="relative">
                      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
                      <input formControlName="rentPrice" type="number" placeholder="Ej: 1200000"
                        class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        [class.border-red-400]="form.get('rentPrice')?.invalid && form.get('rentPrice')?.touched">
                    </div>
                  </div>
                }

                @if (form.get('isForSale')?.value) {
                  <div>
                    <label class="block text-sm font-medium text-warm-700 mb-1.5">Precio de venta *</label>
                    <div class="relative">
                      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
                      <input formControlName="salePrice" type="number" placeholder="Ej: 250000000"
                        class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        [class.border-red-400]="form.get('salePrice')?.invalid && form.get('salePrice')?.touched">
                    </div>
                  </div>
                }

                @if (form.get('isForRent')?.value || form.get('isForSale')?.value) {
                  <div>
                    <label class="block text-sm font-medium text-warm-700 mb-1.5">Descripción pública</label>
                    <textarea formControlName="publicDescription" rows="3"
                      placeholder="Describe el inmueble para el marketplace..."
                      class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- ── Notificaciones ── -->
        <div class="pt-2 border-t border-warm-200 space-y-4">
          <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide">Notificaciones automáticas</p>

          @if (form.get('isOccupied')?.value && form.get('tenantEmail')?.value) {
            <div>
              <label class="block text-sm font-medium text-warm-700 mb-1.5">Día de vencimiento del pago (1-28)</label>
              <input formControlName="paymentDueDay" type="number" min="1" max="28" placeholder="Ej: 5"
                class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            </div>

            <label class="flex items-start gap-3 cursor-pointer p-3 border rounded-lg transition-all"
              [class.border-primary-500]="form.get('notificationsEnabled')?.value"
              [class.bg-primary-50]="form.get('notificationsEnabled')?.value"
              [class.border-warm-200]="!form.get('notificationsEnabled')?.value">
              <input type="checkbox" formControlName="notificationsEnabled" class="w-4 h-4 accent-primary-500 cursor-pointer mt-0.5 flex-shrink-0">
              <div>
                <span class="text-sm font-medium text-warm-700">Enviar recordatorios de pago</span>
                <p class="text-xs text-warm-400 mt-0.5">Se enviarán emails automáticos al inquilino antes y después del vencimiento</p>
              </div>
            </label>
          } @else {
            <p class="text-xs text-warm-400">Activa la ocupación y agrega email del inquilino para configurar recordatorios</p>
          }
        </div>

        <!-- ── Inversión ── -->
        <div class="pt-2 border-t border-warm-200 space-y-4">
          <div>
            <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide">Inversión</p>
            <p class="text-xs text-warm-400 mt-1">Datos opcionales para calcular el retorno de inversión (ROI)</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-warm-700 mb-1.5">Precio de compra</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 text-sm">$</span>
              <input formControlName="purchasePrice" type="number" placeholder="Ej: 350000000"
                class="w-full pl-7 pr-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-warm-700 mb-1.5">Fecha de compra</label>
            <input formControlName="purchaseDate" type="date"
              class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-2">
          <a routerLink="/properties"
            class="flex-1 px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors text-center">
            Cancelar
          </a>
          <button type="submit" [disabled]="!isFormValid() || loading()"
            class="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            @if (loading()) {
              <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
            }
            {{ isEdit() ? 'Guardar cambios' : 'Crear inmueble' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class PropertyFormComponent implements OnInit {
  private propertyService = inject(PropertyService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  isEdit = signal(false);
  loading = signal(false);
  private propertyId: string | null = null;

  propertyTypes = [
    { value: 'apartamento', label: 'Apartamento', icon: 'apartment' },
    { value: 'casa', label: 'Casa', icon: 'house' },
    { value: 'local', label: 'Local', icon: 'store' },
    { value: 'bodega', label: 'Bodega', icon: 'warehouse' },
  ];

  form = this.fb.group({
    name: ['', Validators.required],
    address: ['', Validators.required],
    type: ['apartamento' as PropertyType, Validators.required],
    // Occupancy
    isOccupied: [false],
    tenantName: [null as string | null],
    tenantPhone: [null as string | null],
    tenantEmail: [null as string | null],
    tenantRentPrice: [null as number | null],
    // Marketplace (independent of occupancy)
    isPublic: [false],
    whatsappPhone: [null as string | null],
    isForRent: [false],
    rentPrice: [null as number | null],
    isForSale: [false],
    salePrice: [null as number | null],
    publicDescription: [null as string | null],
    // Notifications
    paymentDueDay: [null as number | null],
    notificationsEnabled: [false],
    // Investment (v1.0.0)
    purchasePrice: [null as number | null],
    purchaseDate: [null as string | null],
  });

  isFormValid(): boolean {
    if (this.form.get('name')?.invalid || this.form.get('address')?.invalid) return false;
    if (this.form.get('isPublic')?.value && !this.form.get('whatsappPhone')?.value) return false;
    if (this.form.get('isForRent')?.value && !this.form.get('rentPrice')?.value) return false;
    if (this.form.get('isForSale')?.value && !this.form.get('salePrice')?.value) return false;
    return true;
  }

  ngOnInit() {
    this.propertyId = this.route.snapshot.paramMap.get('id');
    if (this.propertyId) {
      this.isEdit.set(true);
      this.propertyService.getById(this.propertyId).subscribe(p => {
        if (p) {
          const purchaseDateStr = p.purchaseDate
            ? (p.purchaseDate as Timestamp).toDate().toISOString().split('T')[0]
            : null;
          this.form.patchValue({ ...p, isOccupied: p.status === 'ocupado', purchaseDate: purchaseDateStr } as any);
        }
      });
    }
  }

  setType(value: string) {
    this.form.get('type')?.setValue(value as PropertyType);
  }

  async submit() {
    if (!this.isFormValid()) return;
    this.loading.set(true);
    try {
      const v = this.form.value;
      const isOccupied = !!v.isOccupied;
      const isForRent = !!v.isForRent;
      const isForSale = !!v.isForSale;

      const payload: any = {
        name: v.name,
        address: v.address,
        type: v.type,
        status: isOccupied ? 'ocupado' : 'disponible',
        tenantName: isOccupied ? (v.tenantName || null) : null,
        tenantPhone: isOccupied ? (v.tenantPhone || null) : null,
        tenantEmail: isOccupied ? (v.tenantEmail || null) : null,
        tenantRentPrice: isOccupied ? (v.tenantRentPrice || null) : null,
        isPublic: !!v.isPublic,
        whatsappPhone: v.isPublic ? (v.whatsappPhone || null) : null,
        isForRent,
        rentPrice: isForRent ? (v.rentPrice || null) : null,
        isForSale,
        salePrice: isForSale ? (v.salePrice || null) : null,
        isListed: isForRent || isForSale,
        publicDescription: (isForRent || isForSale) ? (v.publicDescription || null) : null,
        paymentDueDay: isOccupied ? (v.paymentDueDay || null) : null,
        notificationsEnabled: isOccupied ? !!v.notificationsEnabled : false,
        purchasePrice: v.purchasePrice || null,
        purchaseDate: v.purchaseDate
          ? Timestamp.fromDate(new Date(v.purchaseDate))
          : null,
      };

      if (this.isEdit() && this.propertyId) {
        await this.propertyService.update(this.propertyId, payload);
        this.snackBar.open('Inmueble actualizado.', 'OK', { duration: 3000 });
      } else {
        await this.propertyService.create(payload);
        this.snackBar.open('Inmueble creado.', 'OK', { duration: 3000 });
      }
      await this.router.navigate(['/properties']);
    } finally {
      this.loading.set(false);
    }
  }
}
