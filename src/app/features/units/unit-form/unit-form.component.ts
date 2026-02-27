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

        <div class="grid grid-cols-2 gap-4">
          <!-- Número -->
          <div>
            <label class="block text-sm font-medium text-warm-700 mb-1.5">Número / ID *</label>
            <input
              formControlName="number"
              type="text"
              placeholder="Ej: 101"
              class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              [class.border-red-400]="form.get('number')?.invalid && form.get('number')?.touched"
            >
          </div>

          <!-- Precio -->
          <div>
            <label class="block text-sm font-medium text-warm-700 mb-1.5">Precio de renta *</label>
            <input
              formControlName="rentPrice"
              type="number"
              placeholder="1200000"
              class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              [class.border-red-400]="form.get('rentPrice')?.invalid && form.get('rentPrice')?.touched"
            >
          </div>
        </div>

        <!-- Estado -->
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Estado</label>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" (click)="form.get('status')?.setValue('disponible')"
              class="flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-medium transition-all"
              [class.border-warm-400]="form.get('status')?.value === 'disponible'"
              [class.bg-warm-100]="form.get('status')?.value === 'disponible'"
              [class.text-warm-700]="form.get('status')?.value === 'disponible'"
              [class.border-warm-200]="form.get('status')?.value !== 'disponible'"
              [class.text-warm-500]="form.get('status')?.value !== 'disponible'">
              <mat-icon class="text-[18px]">door_open</mat-icon> Disponible
            </button>
            <button type="button" (click)="form.get('status')?.setValue('ocupado')"
              class="flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-medium transition-all"
              [class.border-green-500]="form.get('status')?.value === 'ocupado'"
              [class.bg-green-50]="form.get('status')?.value === 'ocupado'"
              [class.text-green-700]="form.get('status')?.value === 'ocupado'"
              [class.border-warm-200]="form.get('status')?.value !== 'ocupado'"
              [class.text-warm-500]="form.get('status')?.value !== 'ocupado'">
              <mat-icon class="text-[18px]">person</mat-icon> Ocupado
            </button>
          </div>
        </div>

        <!-- Inquilino (solo si ocupado) -->
        @if (form.get('status')?.value === 'ocupado') {
          <div class="space-y-4 p-4 bg-green-50 rounded-lg border border-green-100">
            <p class="text-xs font-medium text-green-700 uppercase tracking-wide">Datos del inquilino</p>
            <div>
              <label class="block text-sm font-medium text-warm-700 mb-1.5">Nombre</label>
              <input formControlName="tenantName" type="text" placeholder="Nombre completo"
                class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-warm-700 mb-1.5">Email</label>
              <input formControlName="tenantEmail" type="email" placeholder="inquilino@email.com"
                class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            </div>
          </div>
        }

        <div class="flex gap-3 pt-2">
          <a [routerLink]="['/properties', propertyId]"
            class="flex-1 px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors text-center">
            Cancelar
          </a>
          <button type="submit" [disabled]="form.invalid || loading()"
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
    rentPrice: [null as number | null, [Validators.required, Validators.min(1)]],
    status: ['disponible'],
    tenantEmail: [null as string | null],
    tenantName: [null as string | null],
  });

  ngOnInit() {
    this.propertyId = this.route.snapshot.paramMap.get('propertyId')!;
    this.unitId = this.route.snapshot.paramMap.get('unitId');
    if (this.unitId) {
      this.isEdit.set(true);
      this.unitService.getById(this.unitId).subscribe(u => {
        if (u) this.form.patchValue(u as any);
      });
    }
  }

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      const value = this.form.value as any;
      if (value.status === 'disponible') {
        value.tenantEmail = null;
        value.tenantName = null;
      }
      if (this.isEdit() && this.unitId) {
        await this.unitService.update(this.unitId, value);
        this.snackBar.open('Unidad actualizada.', 'OK', { duration: 3000 });
      } else {
        await this.unitService.create({ ...value, propertyId: this.propertyId });
        await this.propertyService.incrementUnitCount(this.propertyId, 1);
        this.snackBar.open('Unidad creada.', 'OK', { duration: 3000 });
      }
      await this.router.navigate(['/properties', this.propertyId]);
    } finally {
      this.loading.set(false);
    }
  }
}
