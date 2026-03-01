import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PropertyService } from '../../../core/services/property.service';

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

      <!-- Form -->
      <form [formGroup]="form" (ngSubmit)="submit()" class="bg-white rounded-xl border border-warm-200 shadow-sm p-6 space-y-5">

        <!-- Nombre -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Nombre del inmueble *</label>
          <input
            formControlName="name"
            type="text"
            placeholder="Ej: Edificio Los Robles"
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            [class.border-red-400]="form.get('name')?.invalid && form.get('name')?.touched"
          >
          @if (form.get('name')?.invalid && form.get('name')?.touched) {
            <p class="text-xs text-red-500 mt-1">El nombre es obligatorio</p>
          }
        </div>

        <!-- Dirección -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Dirección *</label>
          <input
            formControlName="address"
            type="text"
            placeholder="Ej: Calle 123 # 45-67, Bogotá"
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            [class.border-red-400]="form.get('address')?.invalid && form.get('address')?.touched"
          >
          @if (form.get('address')?.invalid && form.get('address')?.touched) {
            <p class="text-xs text-red-500 mt-1">La dirección es obligatoria</p>
          }
        </div>

        <!-- Tipo -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Tipo *</label>
          <div class="grid grid-cols-2 gap-2">
            @for (type of propertyTypes; track type.value) {
              <button
                type="button"
                (click)="setType(type.value)"
                class="flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-medium transition-all"
                [class.border-primary-500]="form.get('type')?.value === type.value"
                [class.bg-primary-50]="form.get('type')?.value === type.value"
                [class.text-primary-700]="form.get('type')?.value === type.value"
                [class.border-warm-200]="form.get('type')?.value !== type.value"
                [class.text-warm-600]="form.get('type')?.value !== type.value"
              >
                <mat-icon class="text-[18px]">{{ type.icon }}</mat-icon>
                {{ type.label }}
              </button>
            }
          </div>
        </div>

        <!-- Marketplace -->
        <div class="pt-2 border-t border-warm-200 space-y-4">
          <p class="text-xs font-semibold text-warm-500 uppercase tracking-wide">Marketplace</p>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" formControlName="isPublic" class="w-4 h-4 accent-primary-500 cursor-pointer">
            <span class="text-sm text-warm-700">Publicar esta propiedad en el marketplace</span>
          </label>

          @if (form.get('isPublic')?.value) {
            <div>
              <label class="block text-sm font-medium text-warm-700 mb-1.5">
                Número de WhatsApp (con código de país) *
              </label>
              <input formControlName="whatsappPhone" type="text" placeholder="+57 300 123 4567"
                class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                [class.border-red-400]="form.get('whatsappPhone')?.invalid && form.get('whatsappPhone')?.touched">
              @if (form.get('whatsappPhone')?.invalid && form.get('whatsappPhone')?.touched) {
                <p class="text-xs text-red-500 mt-1">El número de WhatsApp es obligatorio si la propiedad es pública</p>
              }
            </div>

            <!-- Venta directa de la propiedad completa -->
            <div class="p-4 bg-green-50 rounded-lg border border-green-100 space-y-4">
              <p class="text-xs font-semibold text-green-700 uppercase tracking-wide">Venta de propiedad completa</p>
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" formControlName="isForSale" class="w-4 h-4 accent-green-600 cursor-pointer">
                <span class="text-sm text-warm-700">Publicar como venta directa (sin unidades)</span>
              </label>

              @if (form.get('isForSale')?.value) {
                <div>
                  <label class="block text-sm font-medium text-warm-700 mb-1.5">Precio de venta *</label>
                  <input formControlName="salePrice" type="number" placeholder="Ej: 250000000"
                    class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    [class.border-red-400]="form.get('salePrice')?.invalid && form.get('salePrice')?.touched">
                  @if (form.get('salePrice')?.invalid && form.get('salePrice')?.touched) {
                    <p class="text-xs text-red-500 mt-1">El precio de venta es obligatorio</p>
                  }
                </div>

                <div>
                  <label class="block text-sm font-medium text-warm-700 mb-1.5">Descripción pública</label>
                  <textarea formControlName="publicDescription" rows="3"
                    placeholder="Describe el inmueble para los compradores..."
                    class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
                </div>
              }
            </div>
          }
        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-2">
          <a
            routerLink="/properties"
            class="flex-1 px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors text-center"
          >
            Cancelar
          </a>
          <button
            type="submit"
            [disabled]="form.invalid || loading()"
            class="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
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

  form = this.fb.group({
    name: ['', Validators.required],
    address: ['', Validators.required],
    type: ['apartamento' as PropertyType, Validators.required],
    isPublic: [false],
    whatsappPhone: [null as string | null],
    isForSale: [false],
    salePrice: [null as number | null],
    publicDescription: [null as string | null],
  }, { validators: this.marketplaceValidator });

  private marketplaceValidator(control: AbstractControl): ValidationErrors | null {
    const isPublic = control.get('isPublic')?.value;
    const phone = control.get('whatsappPhone')?.value;
    const isForSale = control.get('isForSale')?.value;
    const salePrice = control.get('salePrice')?.value;

    if (isPublic && !phone) {
      control.get('whatsappPhone')?.setErrors({ required: true });
    } else {
      control.get('whatsappPhone')?.setErrors(null);
    }

    if (isForSale && !salePrice) {
      control.get('salePrice')?.setErrors({ required: true });
    } else {
      control.get('salePrice')?.setErrors(null);
    }

    return null;
  }

  propertyTypes = [
    { value: 'apartamento', label: 'Apartamento', icon: 'apartment' },
    { value: 'casa', label: 'Casa', icon: 'house' },
    { value: 'local', label: 'Local', icon: 'store' },
    { value: 'bodega', label: 'Bodega', icon: 'warehouse' },
  ];

  ngOnInit() {
    this.propertyId = this.route.snapshot.paramMap.get('id');
    if (this.propertyId) {
      this.isEdit.set(true);
      this.propertyService.getById(this.propertyId).subscribe(p => {
        if (p) this.form.patchValue(p);
      });
    }
  }

  setType(value: string) {
    this.form.get('type')?.setValue(value as PropertyType);
  }

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      const value = this.form.value as any;
      if (this.isEdit() && this.propertyId) {
        await this.propertyService.update(this.propertyId, value);
        this.snackBar.open('Inmueble actualizado.', 'OK', { duration: 3000 });
      } else {
        await this.propertyService.create(value);
        this.snackBar.open('Inmueble creado.', 'OK', { duration: 3000 });
      }
      await this.router.navigate(['/properties']);
    } finally {
      this.loading.set(false);
    }
  }
}
