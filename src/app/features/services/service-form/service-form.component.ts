import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { UtilityServiceService } from '../../../core/services/utility-service.service';

const ICON_OPTIONS = [
  { value: 'water_drop', label: 'Agua' },
  { value: 'bolt', label: 'Luz' },
  { value: 'local_fire_department', label: 'Gas' },
  { value: 'wifi', label: 'Internet' },
  { value: 'delete_sweep', label: 'Aseo' },
  { value: 'security', label: 'Vigilancia' },
  { value: 'local_parking', label: 'Parqueadero' },
  { value: 'receipt_long', label: 'Otro' },
];

@Component({
  selector: 'app-service-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule, MatSnackBarModule],
  template: `
    <div class="max-w-lg">
      <div class="flex items-center gap-3 mb-6">
        <a routerLink="/services" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
          <mat-icon>arrow_back</mat-icon>
        </a>
        <div>
          <h1 class="text-2xl font-bold text-warm-900">{{ isEdit() ? 'Editar' : 'Nuevo' }} servicio</h1>
          <p class="text-warm-500 text-sm">{{ isEdit() ? 'Actualiza los datos del servicio' : 'Registra un nuevo servicio' }}</p>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="bg-white rounded-xl border border-warm-200 shadow-sm p-6 space-y-5">
        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Nombre del servicio *</label>
          <input formControlName="name" type="text" placeholder="Ej: Agua, Luz, Internet"
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
        </div>

        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Ícono</label>
          <div class="grid grid-cols-4 gap-2">
            @for (opt of iconOptions; track opt.value) {
              <button type="button" (click)="form.get('icon')?.setValue(opt.value)"
                class="flex flex-col items-center gap-1 p-2.5 border rounded-lg text-xs font-medium transition-all"
                [class.border-primary-500]="form.get('icon')?.value === opt.value"
                [class.bg-primary-50]="form.get('icon')?.value === opt.value"
                [class.text-primary-700]="form.get('icon')?.value === opt.value"
                [class.border-warm-200]="form.get('icon')?.value !== opt.value"
                [class.text-warm-500]="form.get('icon')?.value !== opt.value">
                <mat-icon class="text-[20px]">{{ opt.value }}</mat-icon>
                {{ opt.label }}
              </button>
            }
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-warm-700 mb-1.5">Descripción <span class="text-warm-400 font-normal">(opcional)</span></label>
          <textarea formControlName="description" rows="2" placeholder="Descripción breve del servicio..."
            class="w-full px-3 py-2.5 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
        </div>

        <label class="flex items-start gap-3 cursor-pointer p-3 border rounded-lg transition-all"
          [class.border-green-400]="form.get('isActive')?.value"
          [class.bg-green-50]="form.get('isActive')?.value"
          [class.border-warm-200]="!form.get('isActive')?.value">
          <input type="checkbox" formControlName="isActive" class="w-4 h-4 accent-green-600 cursor-pointer mt-0.5 flex-shrink-0">
          <div>
            <span class="text-sm font-medium text-warm-700">Servicio activo</span>
            <p class="text-xs text-warm-400 mt-0.5">Los servicios inactivos no generan recibos</p>
          </div>
        </label>

        <div class="flex gap-3 pt-2">
          <a routerLink="/services"
            class="flex-1 px-4 py-2.5 border border-warm-200 text-warm-600 rounded-lg text-sm font-medium hover:bg-warm-50 transition-colors text-center">
            Cancelar
          </a>
          <button type="submit" [disabled]="form.invalid || loading()"
            class="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            @if (loading()) {
              <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
            }
            {{ isEdit() ? 'Guardar cambios' : 'Crear servicio' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class ServiceFormComponent implements OnInit {
  private svcService = inject(UtilityServiceService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  isEdit = signal(false);
  loading = signal(false);
  iconOptions = ICON_OPTIONS;
  private serviceId: string | null = null;

  form = this.fb.group({
    name: ['', Validators.required],
    icon: ['receipt_long'],
    description: [''],
    isActive: [true],
  });

  ngOnInit() {
    this.serviceId = this.route.snapshot.paramMap.get('id');
    if (this.serviceId) {
      this.isEdit.set(true);
      this.svcService.getById(this.serviceId).subscribe(s => {
        if (s) this.form.patchValue(s as any);
      });
    }
  }

  async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      const v = this.form.value;
      const payload = {
        name: v.name!,
        icon: v.icon || 'receipt_long',
        description: v.description || '',
        isActive: !!v.isActive,
      };

      if (this.isEdit() && this.serviceId) {
        await this.svcService.update(this.serviceId, payload);
        this.snackBar.open('Servicio actualizado.', 'OK', { duration: 3000 });
      } else {
        const id = await this.svcService.create(payload);
        this.snackBar.open('Servicio creado.', 'OK', { duration: 3000 });
        await this.router.navigate(['/services', id]);
        return;
      }
      await this.router.navigate(['/services']);
    } finally {
      this.loading.set(false);
    }
  }
}
