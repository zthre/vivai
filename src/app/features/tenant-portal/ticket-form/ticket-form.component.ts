import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { TicketService } from '../../../core/services/ticket.service';
import { Unit } from '../../../core/models/unit.model';
import { Property } from '../../../core/models/property.model';

@Component({
  selector: 'app-ticket-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="max-w-lg mx-auto px-4 py-6 space-y-4">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <a routerLink="/tenant/tickets" class="p-1.5 rounded-lg text-warm-500 hover:bg-warm-100 transition-colors">
          <mat-icon>arrow_back</mat-icon>
        </a>
        <h1 class="text-xl font-bold text-warm-900">Reportar problema</h1>
      </div>

      @if (loadError()) {
        <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {{ loadError() }}
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">

          <!-- Title -->
          <div class="bg-white rounded-xl border border-warm-200 p-5 space-y-4">
            <div>
              <label class="block text-sm font-medium text-warm-700 mb-1">
                Título <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                formControlName="title"
                maxlength="100"
                placeholder="Ej: Fuga de agua en el baño"
                class="w-full px-3 py-2 rounded-lg border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
              @if (form.get('title')?.touched && form.get('title')?.invalid) {
                <p class="text-xs text-red-500 mt-1">El título es requerido.</p>
              }
            </div>

            <!-- Category -->
            <div>
              <label class="block text-sm font-medium text-warm-700 mb-1">
                Categoría <span class="text-red-500">*</span>
              </label>
              <select
                formControlName="category"
                class="w-full px-3 py-2 rounded-lg border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
              >
                <option value="">Seleccionar...</option>
                <option value="plomeria">Plomería</option>
                <option value="electricidad">Electricidad</option>
                <option value="estructura">Estructura</option>
                <option value="otro">Otro</option>
              </select>
              @if (form.get('category')?.touched && form.get('category')?.invalid) {
                <p class="text-xs text-red-500 mt-1">Selecciona una categoría.</p>
              }
            </div>

            <!-- Description -->
            <div>
              <label class="block text-sm font-medium text-warm-700 mb-1">
                Descripción <span class="text-red-500">*</span>
              </label>
              <textarea
                formControlName="description"
                maxlength="500"
                rows="4"
                placeholder="Describe el problema con el mayor detalle posible..."
                class="w-full px-3 py-2 rounded-lg border border-warm-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
              ></textarea>
              @if (form.get('description')?.touched && form.get('description')?.invalid) {
                <p class="text-xs text-red-500 mt-1">La descripción es requerida.</p>
              }
              <p class="text-xs text-warm-400 text-right mt-1">
                {{ form.get('description')?.value?.length ?? 0 }}/500
              </p>
            </div>
          </div>

          @if (submitError()) {
            <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {{ submitError() }}
            </div>
          }

          <button
            type="submit"
            [disabled]="form.invalid || saving()"
            class="w-full py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            @if (saving()) {
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>Enviando...</span>
            } @else {
              <mat-icon class="text-[18px]">send</mat-icon>
              <span>Enviar solicitud</span>
            }
          </button>

        </form>
      }
    </div>
  `,
})
export class TicketFormComponent implements OnInit {
  private firebaseAuth = inject(Auth);
  private firestore = inject(Firestore);
  private ticketService = inject(TicketService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  saving = signal(false);
  loadError = signal<string | null>(null);
  submitError = signal<string | null>(null);

  private unit: Unit | null = null;
  private property: Property | null = null;

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    category: ['', Validators.required],
    description: ['', [Validators.required, Validators.maxLength(500)]],
  });

  async ngOnInit() {
    try {
      await (this.firebaseAuth as any).authStateReady();
      const firebaseUser = this.firebaseAuth.currentUser;
      if (!firebaseUser) { this.loadError.set('No autenticado'); return; }

      const userSnap = await getDoc(doc(this.firestore, `users/${firebaseUser.uid}`));
      const unitId = userSnap.data()?.['unitId'] as string | undefined;
      if (!unitId) { this.loadError.set('No tienes una unidad asignada.'); return; }

      const unitSnap = await getDoc(doc(this.firestore, `units/${unitId}`));
      if (!unitSnap.exists()) { this.loadError.set('No se encontró tu unidad.'); return; }
      this.unit = { id: unitSnap.id, ...unitSnap.data() } as Unit;

      const propSnap = await getDoc(doc(this.firestore, `properties/${this.unit.propertyId}`));
      if (propSnap.exists()) {
        this.property = { id: propSnap.id, ...propSnap.data() } as Property;
      }
    } catch {
      this.loadError.set('Error al cargar tu información.');
    }
  }

  async submit() {
    if (this.form.invalid || !this.unit || !this.property) return;
    this.saving.set(true);
    this.submitError.set(null);
    try {
      const { title, category, description } = this.form.value;
      await this.ticketService.create({
        unitId: this.unit.id!,
        unitNumber: this.unit.number,
        propertyId: this.property.id!,
        propertyName: this.property.name,
        ownerId: this.unit.ownerId,
        tenantName: this.unit.tenantName,
        title: title!,
        category: category as any,
        description: description!,
      });
      await this.router.navigate(['/tenant/tickets']);
    } catch {
      this.submitError.set('Error al enviar la solicitud. Intenta de nuevo.');
      this.saving.set(false);
    }
  }
}
