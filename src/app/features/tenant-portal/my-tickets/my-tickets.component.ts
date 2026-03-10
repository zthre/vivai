import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Auth } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket } from '../../../core/models/ticket.model';
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
  selector: 'app-my-tickets',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-6 space-y-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <a routerLink="/tenant" class="p-1.5 rounded-lg text-warm-500 hover:bg-warm-100 transition-colors">
            <mat-icon>arrow_back</mat-icon>
          </a>
          <h1 class="text-xl font-bold text-warm-900">Mis solicitudes</h1>
        </div>
        <a
          routerLink="/tenant/tickets/new"
          class="flex items-center gap-1.5 px-3 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
        >
          <mat-icon class="text-[18px]">add</mat-icon>
          Nueva
        </a>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else if (!tickets().length) {
        <div class="bg-white rounded-xl border border-warm-200 p-8 text-center">
          <mat-icon class="text-warm-300 text-[48px] mb-3">build_circle</mat-icon>
          <p class="text-warm-600 font-medium mb-1">Sin solicitudes</p>
          <p class="text-warm-400 text-sm mb-4">¿Tienes algún problema? Repórtalo aquí.</p>
          <a
            routerLink="/tenant/tickets/new"
            class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            <mat-icon class="text-[18px]">add</mat-icon>
            Reportar problema
          </a>
        </div>
      } @else {
        <div class="space-y-3">
          @for (ticket of tickets(); track ticket.id) {
            <a
              [routerLink]="['/tickets', ticket.id]"
              class="block bg-white rounded-xl border border-warm-200 p-4 hover:bg-warm-50 transition-colors"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-warm-900 truncate">{{ ticket.title }}</p>
                  <p class="text-xs text-warm-400 mt-0.5">{{ formatDate(ticket.createdAt) }}</p>
                </div>
                <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                    [class]="statusColor(ticket.status)">
                    {{ statusLabel(ticket.status) }}
                  </span>
                  <span class="text-xs px-2 py-0.5 rounded-full"
                    [class]="categoryColor(ticket.category)">
                    {{ categoryLabel(ticket.category) }}
                  </span>
                </div>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class MyTicketsComponent implements OnInit, OnDestroy {
  private firebaseAuth = inject(Auth);
  private ticketService = inject(TicketService);

  loading = signal(true);
  tickets = signal<Ticket[]>([]);
  private sub?: Subscription;

  formatDate(ts: Timestamp): string {
    return ts.toDate().toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  categoryLabel(cat: string) { return CATEGORY_LABELS[cat] ?? cat; }
  categoryColor(cat: string) { return CATEGORY_COLORS[cat] ?? 'bg-warm-100 text-warm-700'; }
  statusLabel(s: string) { return STATUS_LABELS[s] ?? s; }
  statusColor(s: string) { return STATUS_COLORS[s] ?? 'bg-warm-100 text-warm-700'; }

  async ngOnInit() {
    await (this.firebaseAuth as any).authStateReady();
    const user = this.firebaseAuth.currentUser;
    if (!user) { this.loading.set(false); return; }

    this.sub = this.ticketService.getByTenant$(user.uid).subscribe(ts => {
      this.tickets.set(ts);
      this.loading.set(false);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }
}
