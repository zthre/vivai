import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuthService } from '../../../core/auth/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { PropertyService } from '../../../core/services/property.service';
import { Ticket } from '../../../core/models/ticket.model';
import { Property } from '../../../core/models/property.model';
import { Timestamp } from '@angular/fire/firestore';

const CATEGORY_LABELS: Record<string, string> = {
  plomeria: 'Plomería',
  electricidad: 'Electricidad',
  estructura: 'Estructura',
  otro: 'Otro',
};
const CATEGORY_COLORS: Record<string, string> = {
  plomeria: 'bg-blue-100 text-blue-700',
  electricidad: 'bg-yellow-100 text-yellow-700',
  estructura: 'bg-orange-100 text-orange-700',
  otro: 'bg-warm-100 text-warm-700',
};
const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
};
const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-red-100 text-red-700',
  en_proceso: 'bg-amber-100 text-amber-700',
  resuelto: 'bg-green-100 text-green-700',
};

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, FormsModule],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-6 space-y-4">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <a
          [routerLink]="isOwner() ? '/tickets' : '/tenant/tickets'"
          class="p-1.5 rounded-lg text-warm-500 hover:bg-warm-100 transition-colors"
        >
          <mat-icon>arrow_back</mat-icon>
        </a>
        <h1 class="text-xl font-bold text-warm-900">Detalle del ticket</h1>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else if (!ticket()) {
        <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          No se encontró el ticket.
        </div>
      } @else {
        <!-- Status + category badges -->
        <div class="flex flex-wrap gap-2">
          <span class="text-sm px-3 py-1 rounded-full font-medium" [class]="statusColor(ticket()!.status)">
            {{ statusLabel(ticket()!.status) }}
          </span>
          <span class="text-sm px-3 py-1 rounded-full" [class]="categoryColor(ticket()!.category)">
            {{ categoryLabel(ticket()!.category) }}
          </span>
        </div>

        <!-- Main card -->
        <div class="bg-white rounded-xl border border-warm-200 p-5 space-y-4">
          <h2 class="text-lg font-semibold text-warm-900">{{ ticket()!.title }}</h2>

          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-xs text-warm-400 mb-0.5">Inmueble</p>
              <p class="text-warm-700 font-medium">{{ ticket()!.propertyName }}</p>
            </div>
            @if (ticket()!.tenantName) {
              <div>
                <p class="text-xs text-warm-400 mb-0.5">Inquilino</p>
                <p class="text-warm-700">{{ ticket()!.tenantName }}</p>
              </div>
            }
            <div>
              <p class="text-xs text-warm-400 mb-0.5">Fecha</p>
              <p class="text-warm-700">{{ formatDate(ticket()!.createdAt) }}</p>
            </div>
            @if (ticket()!.resolvedAt) {
              <div>
                <p class="text-xs text-warm-400 mb-0.5">Resuelto</p>
                <p class="text-green-700">{{ formatDate(ticket()!.resolvedAt!) }}</p>
              </div>
            }
          </div>

          <div class="border-t border-warm-100 pt-3">
            <p class="text-xs text-warm-400 mb-1">Descripción</p>
            <p class="text-sm text-warm-700 whitespace-pre-wrap">{{ ticket()!.description }}</p>
          </div>
        </div>

        <!-- Status change (owner/colaborador with write) -->
        @if (isOwner() && canWriteTickets()) {
          <div class="bg-white rounded-xl border border-warm-200 p-5 space-y-3">
            <p class="text-sm font-medium text-warm-700">Cambiar estado</p>
            <select
              [(ngModel)]="newStatus"
              class="w-full px-3 py-2 rounded-lg border border-warm-200 text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="resuelto">Resuelto</option>
            </select>
            <button
              (click)="saveStatus()"
              [disabled]="newStatus === ticket()!.status || saving()"
              class="w-full py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              @if (saving()) {
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Guardando...
              } @else {
                Guardar estado
              }
            </button>
            @if (saveSuccess()) {
              <p class="text-xs text-green-600 text-center">Estado actualizado correctamente.</p>
            }
          </div>
        }

        <!-- Status history -->
        @if (ticket()!.statusHistory?.length) {
          <div class="bg-white rounded-xl border border-warm-200 p-5">
            <p class="text-sm font-medium text-warm-700 mb-3">Historial de cambios</p>
            <div class="space-y-2">
              @for (change of ticket()!.statusHistory; track change.changedAt) {
                <div class="flex items-center gap-2 text-xs text-warm-500">
                  <span class="px-2 py-0.5 rounded-full font-medium" [class]="statusColor(change.status)">
                    {{ statusLabel(change.status) }}
                  </span>
                  <span>{{ formatDate(change.changedAt) }}</span>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class TicketDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private ticketService = inject(TicketService);
  private propertyService = inject(PropertyService);

  loading = signal(true);
  ticket = signal<Ticket | null>(null);
  property = signal<Property | null>(null);
  saving = signal(false);
  saveSuccess = signal(false);
  newStatus: Ticket['status'] = 'pendiente';
  private sub?: Subscription;

  isOwner = computed(() => this.authService.userRole() !== 'tenant');

  canWriteTickets = computed(() => {
    const uid = this.authService.uid();
    if (!uid) return false;
    if (this.authService.activeRole() !== 'colaborador') return true;
    const prop = this.property();
    if (!prop) return false;
    const perms = prop.collaboratorPermissions?.[uid];
    return !perms || perms.tickets !== false;
  });

  categoryLabel(cat: string) { return CATEGORY_LABELS[cat] ?? cat; }
  categoryColor(cat: string) { return CATEGORY_COLORS[cat] ?? 'bg-warm-100 text-warm-700'; }
  statusLabel(s: string) { return STATUS_LABELS[s] ?? s; }
  statusColor(s: string) { return STATUS_COLORS[s] ?? 'bg-warm-100 text-warm-700'; }

  formatDate(ts: Timestamp): string {
    return ts.toDate().toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.sub = this.ticketService.getById$(id).subscribe(t => {
      this.ticket.set(t);
      if (t) {
        this.newStatus = t.status;
        this.propertyService.getById(t.propertyId).pipe(take(1)).subscribe(p => this.property.set(p));
      }
      this.loading.set(false);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  async saveStatus() {
    if (!this.ticket()?.id || this.newStatus === this.ticket()!.status) return;
    this.saving.set(true);
    this.saveSuccess.set(false);
    try {
      await this.ticketService.updateStatus(
        this.ticket()!.id!,
        this.newStatus,
        this.authService.uid()!
      );
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 3000);
    } finally {
      this.saving.set(false);
    }
  }
}
