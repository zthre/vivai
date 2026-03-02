import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { UnitService } from '../../../core/services/unit.service';
import { PropertyService } from '../../../core/services/property.service';

@Component({
  selector: 'app-unit-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule, MatSnackBarModule],
  template: `
    <div class="max-w-lg">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-6">
        <a [routerLink]="['/properties', propertyId]" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
          <mat-icon>arrow_back</mat-icon>
        </a>
        <div>
          <h1 class="text-2xl font-bold text-warm-900">{{ isEdit() ? 'Editar' : 'Nueva' }} unidad</h1>
          <p class="text-warm-500 text-sm">{{ isEdit() ? 'Actualiza los datos de la unidad' : 'Agrega una unidad al inmueble' }}</p>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="bg-white rounded-xl border border-warm-200 shadow-sm p-6 space-y-5">

        <!-- ── Info básica ── -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Número / ID *</label>
          <input formControlName="number" type="text" placeholder="Ej: 101"
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            [class.border-red-400]="form.get('number')?.invalid && form.get('number')?.touched">
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
              <p class="text-xs text-warm-400 mt-0.5">Hay un inquilino activo en esta unidad</p>
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
          <div>
            <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide">Marketplace</p>
            <p class="text-xs text-warm-400 mt-1">Esta unidad aparecerá en el portal si el inmueble está publicado</p>
          </div>

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
                <input formControlName="rentPrice" type="number" placeholder="Ej: 1400000"
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
                placeholder="Describe las características de la unidad para el marketplace..."
                class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
            </div>
          }
        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-2">
          <a [routerLink]="['/properties', propertyId]"
            class="flex-1 px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors text-center">
            Cancelar
          </a>
          <button type="submit" [disabled]="!isFormValid() || loading()"
            class="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            @if (loading()) {
              <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
            }
            {{ isEdit() ? 'Guardar cambios' : 'Crear unidad' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class UnitFormComponent implements OnInit {
  private unitService = inject(UnitService);
  private propertyService = inject(PropertyService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  isEdit = signal(false);
  loading = signal(false);
  propertyId!: string;
  private unitId: string | null = null;

  form = this.fb.group({
    number: ['', Validators.required],
    // Occupancy
    isOccupied: [false],
    tenantName: [null as string | null],
    tenantPhone: [null as string | null],
    tenantEmail: [null as string | null],
    tenantRentPrice: [null as number | null],
    // Marketplace (independent of occupancy)
    isForRent: [false],
    rentPrice: [null as number | null],
    isForSale: [false],
    salePrice: [null as number | null],
    publicDescription: [null as string | null],
  });

  isFormValid(): boolean {
    if (this.form.get('number')?.invalid) return false;
    if (this.form.get('isForRent')?.value && !this.form.get('rentPrice')?.value) return false;
    if (this.form.get('isForSale')?.value && !this.form.get('salePrice')?.value) return false;
    return true;
  }

  ngOnInit() {
    this.propertyId = this.route.snapshot.paramMap.get('propertyId')!;
    this.unitId = this.route.snapshot.paramMap.get('unitId');
    if (this.unitId) {
      this.isEdit.set(true);
      this.unitService.getById(this.unitId).subscribe(u => {
        if (!u) return;
        const rawStatus = u.status as string;
        const isForRent = u.isForRent ?? (rawStatus === 'disponible_renta');
        const isForSale = u.isForSale ?? (rawStatus === 'disponible_venta');
        this.form.patchValue({
          ...u,
          isOccupied: u.status === 'ocupado',
          isForRent,
          isForSale,
        } as any);
      });
    }
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
        number: v.number,
        status: isOccupied ? 'ocupado' : 'disponible',
        tenantName: isOccupied ? (v.tenantName || null) : null,
        tenantPhone: isOccupied ? (v.tenantPhone || null) : null,
        tenantEmail: isOccupied ? (v.tenantEmail || null) : null,
        tenantRentPrice: isOccupied ? (v.tenantRentPrice || null) : null,
        isForRent,
        rentPrice: isForRent ? (v.rentPrice || null) : null,
        isForSale,
        salePrice: isForSale ? (v.salePrice || null) : null,
        isListed: isForRent || isForSale,
        publicDescription: (isForRent || isForSale) ? (v.publicDescription || null) : null,
      };

      if (this.isEdit() && this.unitId) {
        await this.unitService.update(this.unitId, payload);
        this.snackBar.open('Unidad actualizada.', 'OK', { duration: 3000 });
      } else {
        await this.unitService.create({ ...payload, propertyId: this.propertyId });
        await this.propertyService.incrementUnitCount(this.propertyId, 1);
        this.snackBar.open('Unidad creada.', 'OK', { duration: 3000 });
      }
      await this.router.navigate(['/properties', this.propertyId]);
    } finally {
      this.loading.set(false);
    }
  }
}
