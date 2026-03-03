import {
  Component, inject, signal, computed, effect, OnInit, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import {
  CdkDropList, CdkDropListGroup, CdkDragDrop,
  moveItemInArray, transferArrayItem, DragDropModule,
} from '@angular/cdk/drag-drop';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { PropertyService } from '../../../core/services/property.service';
import { TicketCardComponent } from './ticket-card/ticket-card.component';
import { Ticket } from '../../../core/models/ticket.model';
import { Property } from '../../../core/models/property.model';
import { Timestamp } from '@angular/fire/firestore';

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
  selector: 'app-tickets-board',
  standalone: true,
  imports: [
    CommonModule, RouterLink, MatIconModule, FormsModule,
    DragDropModule, TicketCardComponent,
  ],
  template: `
    <div class="space-y-4">

      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-bold text-warm-900">Tickets de Mantenimiento</h1>
        <select
          [(ngModel)]="selectedPropertyId"
          class="px-3 py-1.5 rounded-lg border border-warm-200 text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
        >
          <option [value]="null">Todas las propiedades</option>
          @for (prop of properties(); track prop.id) {
            <option [value]="prop.id">{{ prop.name }}</option>
          }
        </select>
      </div>

      <!-- Mobile: tab bar -->
      <div class="flex md:hidden gap-1 bg-warm-100 p-1 rounded-xl">
        @for (col of columns; track col.status) {
          <button
            (click)="mobileTab = col.status"
            class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
            [class.bg-white]="mobileTab === col.status"
            [class.text-warm-900]="mobileTab === col.status"
            [class.shadow-sm]="mobileTab === col.status"
            [class.text-warm-500]="mobileTab !== col.status"
          >
            {{ col.label }}
            <span class="ml-1 text-xs">({{ col.list.length }})</span>
          </button>
        }
      </div>

      <!-- Desktop: Kanban -->
      <div class="hidden md:grid grid-cols-3 gap-4" cdkDropListGroup>
        @for (col of columns; track col.status) {
          <div class="flex flex-col gap-3">
            <!-- Column header -->
            <div class="flex items-center justify-between px-1">
              <span class="text-sm font-semibold text-warm-700">{{ col.label }}</span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="statusColor(col.status)">
                {{ col.list.length }}
              </span>
            </div>
            <!-- Drop zone -->
            <div
              cdkDropList
              [cdkDropListData]="col.list"
              (cdkDropListDropped)="onDrop($event, col.status)"
              class="flex flex-col gap-3 min-h-32 p-2 rounded-xl bg-warm-50 border border-warm-200 border-dashed"
            >
              @for (ticket of col.list; track ticket.id) {
                <app-ticket-card [ticket]="ticket" />
              }
              @if (!col.list.length) {
                <div class="flex items-center justify-center h-20 text-xs text-warm-400">
                  Sin tickets
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Mobile: single column list -->
      <div class="md:hidden space-y-3">
        @for (ticket of mobileTickets(); track ticket.id) {
          <a
            [routerLink]="['/tickets', ticket.id]"
            class="block bg-white rounded-xl border border-warm-200 p-4 hover:bg-warm-50 transition-colors"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="font-medium text-warm-900 truncate">{{ ticket.title }}</p>
                <p class="text-xs text-warm-500 mt-0.5">
                  {{ ticket.propertyName }} · Unidad {{ ticket.unitNumber }}
                </p>
                <p class="text-xs text-warm-400 mt-0.5">{{ formatDate(ticket.createdAt) }}</p>
              </div>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                [class]="statusColor(ticket.status)">
                {{ statusLabel(ticket.status) }}
              </span>
            </div>
          </a>
        }
        @if (!mobileTickets().length) {
          <div class="bg-white rounded-xl border border-warm-200 p-8 text-center">
            <p class="text-warm-400 text-sm">Sin tickets en esta categoría.</p>
          </div>
        }
      </div>

    </div>
  `,
})
export class TicketsBoardComponent implements OnInit {
  private authService = inject(AuthService);
  private ticketService = inject(TicketService);
  private propertyService = inject(PropertyService);

  selectedPropertyId: string | null = null;
  mobileTab: Ticket['status'] = 'pendiente';
  private dragging = false;

  allTickets = toSignal(
    toObservable(this.authService.uid).pipe(
      switchMap(uid => uid ? this.ticketService.getByOwner$(uid) : of([]))
    ),
    { initialValue: [] as Ticket[] }
  );

  properties = toSignal(
    toObservable(this.authService.uid).pipe(
      switchMap(uid => uid ? this.propertyService.getAll() : of([]))
    ),
    { initialValue: [] as Property[] }
  );

  filteredTickets = computed(() => {
    const pid = this.selectedPropertyId;
    return pid ? this.allTickets().filter(t => t.propertyId === pid) : this.allTickets();
  });

  // Mutable arrays for CDK drag-drop
  pendingList: Ticket[] = [];
  inProgressList: Ticket[] = [];
  resolvedList: Ticket[] = [];

  get columns() {
    return [
      { status: 'pendiente' as const, label: 'Pendiente', list: this.pendingList },
      { status: 'en_proceso' as const, label: 'En proceso', list: this.inProgressList },
      { status: 'resuelto' as const, label: 'Resuelto', list: this.resolvedList },
    ];
  }

  mobileTickets = computed(() =>
    this.filteredTickets().filter(t => t.status === this.mobileTab)
  );

  constructor() {
    effect(() => {
      if (this.dragging) return;
      const tickets = this.filteredTickets();
      this.pendingList = tickets.filter(t => t.status === 'pendiente');
      this.inProgressList = tickets.filter(t => t.status === 'en_proceso');
      this.resolvedList = tickets.filter(t => t.status === 'resuelto');
    });
  }

  ngOnInit() {}

  canWriteTicketsFor(propertyId: string): boolean {
    const uid = this.authService.uid();
    if (!uid) return false;
    const prop = this.properties().find(p => p.id === propertyId);
    if (!prop) return false;
    if (prop.ownerId === uid) return true;
    const perms = prop.collaboratorPermissions?.[uid];
    return !perms || perms.tickets === 'write';
  }

  async onDrop(event: CdkDragDrop<Ticket[]>, newStatus: Ticket['status']) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const ticket = event.previousContainer.data[event.previousIndex];
      if (!this.canWriteTicketsFor(ticket.propertyId)) return;
      this.dragging = true;
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
      try {
        await this.ticketService.updateStatus(ticket.id!, newStatus, this.authService.uid()!);
      } finally {
        this.dragging = false;
      }
    }
  }

  statusLabel(s: string) { return STATUS_LABELS[s] ?? s; }
  statusColor(s: string) { return STATUS_COLORS[s] ?? 'bg-warm-100 text-warm-700'; }

  formatDate(ts: Timestamp): string {
    return ts.toDate().toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
