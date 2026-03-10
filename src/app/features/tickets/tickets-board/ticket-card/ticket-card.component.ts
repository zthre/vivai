import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { Ticket } from '../../../../core/models/ticket.model';
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

@Component({
  selector: 'app-ticket-card',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, CdkDrag],
  template: `
    <div
      cdkDrag
      class="bg-white border border-warm-200 rounded-xl p-4 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow space-y-3"
    >
      <!-- Drag placeholder -->
      <div *cdkDragPlaceholder class="bg-warm-100 border-2 border-dashed border-warm-300 rounded-xl h-24"></div>

      <!-- Category chip -->
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="categoryColor()">
          {{ categoryLabel() }}
        </span>
        @if (ticket.resolvedAt) {
          <span class="text-xs text-green-600 flex items-center gap-1">
            <mat-icon class="text-[14px]">check_circle</mat-icon>
            {{ formatDate(ticket.resolvedAt) }}
          </span>
        }
      </div>

      <!-- Title -->
      <p class="text-sm font-semibold text-warm-900 leading-snug">{{ ticket.title }}</p>

      <!-- Unit & tenant info -->
      <div class="space-y-0.5">
        <p class="text-xs text-warm-500 flex items-center gap-1">
          <mat-icon class="text-[14px]">apartment</mat-icon>
          {{ ticket.propertyName }}
        </p>
        @if (ticket.tenantName) {
          <p class="text-xs text-warm-400 flex items-center gap-1">
            <mat-icon class="text-[14px]">person</mat-icon>
            {{ ticket.tenantName }}
          </p>
        }
        <p class="text-xs text-warm-400 flex items-center gap-1">
          <mat-icon class="text-[14px]">schedule</mat-icon>
          {{ formatDate(ticket.createdAt) }}
        </p>
      </div>

      <!-- Detail link -->
      <a
        [routerLink]="['/tickets', ticket.id]"
        (click)="$event.stopPropagation()"
        class="inline-flex items-center gap-1 text-xs text-primary-600 font-medium hover:text-primary-700"
      >
        Ver detalles
        <mat-icon class="text-[14px]">arrow_forward</mat-icon>
      </a>
    </div>
  `,
})
export class TicketCardComponent {
  @Input({ required: true }) ticket!: Ticket;

  categoryLabel() { return CATEGORY_LABELS[this.ticket.category] ?? this.ticket.category; }
  categoryColor() { return CATEGORY_COLORS[this.ticket.category] ?? 'bg-warm-100 text-warm-700'; }

  formatDate(ts: Timestamp): string {
    return ts.toDate().toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
