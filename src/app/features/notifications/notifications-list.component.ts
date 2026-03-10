import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { NotificationService } from '../../core/services/notification.service';
import { PropertyService } from '../../core/services/property.service';
import { AppNotification, NotificationType } from '../../core/models/notification.model';

@Component({
  selector: 'app-notifications-list',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-warm-900">Notificaciones</h1>
          <p class="text-warm-500 text-sm mt-1">Historial de alertas automáticas enviadas</p>
        </div>
        @if (unreadCount() > 0) {
          <button
            (click)="markAllRead()"
            [disabled]="marking()"
            class="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
          >
            Marcar todo como leído
          </button>
        }
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap gap-3">
        <select
          [value]="selectedPropertyId() ?? ''"
          (change)="onPropertyChange($event)"
          class="px-3 py-1.5 border border-warm-200 rounded-lg text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          <option value="">Todas las propiedades</option>
          @for (p of properties(); track p.id) {
            <option [value]="p.id">{{ p.name }}</option>
          }
        </select>

        <select
          [value]="selectedMonth() ?? ''"
          (change)="onMonthChange($event)"
          class="px-3 py-1.5 border border-warm-200 rounded-lg text-sm text-warm-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          <option value="">Todos los meses</option>
          @for (m of availableMonths(); track m.value) {
            <option [value]="m.value">{{ m.label }}</option>
          }
        </select>
      </div>

      <!-- List -->
      @if (filtered().length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-12 text-center">
          <mat-icon class="text-warm-300 text-[56px]">notifications_none</mat-icon>
          <h3 class="text-warm-700 font-semibold mt-3">Sin notificaciones</h3>
          <p class="text-warm-400 text-sm mt-1">Las alertas automáticas aparecerán aquí cuando se envíen</p>
        </div>
      } @else {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">
          @for (n of filtered(); track n.id; let last = $last) {
            <div
              class="flex items-start gap-4 px-5 py-4 transition-colors"
              [class.bg-primary-50]="!n.viewedByOwner"
              [class.border-b]="!last"
              [class.border-warm-100]="!last"
            >
              <!-- Type icon -->
              <div
                class="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5"
                [class.bg-red-100]="n.type === 'payment_overdue'"
                [class.bg-yellow-100]="n.type === 'payment_reminder'"
                [class.bg-blue-100]="n.type === 'ticket_update'"
              >
                <mat-icon
                  class="text-[18px]"
                  [class.text-red-600]="n.type === 'payment_overdue'"
                  [class.text-yellow-600]="n.type === 'payment_reminder'"
                  [class.text-blue-600]="n.type === 'ticket_update'"
                >
                  {{ typeIcon(n.type) }}
                </mat-icon>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-warm-900">{{ typeLabel(n.type) }}</p>
                <p class="text-xs text-warm-500 mt-0.5">
                  {{ n.metadata?.propertyName ?? n.propertyId }}
                  @if (n.metadata?.amount) {
                    · {{ n.metadata?.amount | currency:'COP':'symbol-narrow':'1.0-0' }}
                  }
                  @if (n.metadata?.ticketTitle) {
                    · "{{ n.metadata?.ticketTitle }}"
                  }
                </p>
                <p class="text-xs text-warm-400 mt-0.5">{{ n.tenantEmail }}</p>
              </div>

              <!-- Status + date -->
              <div class="flex-shrink-0 flex flex-col items-end gap-1">
                <span
                  class="text-xs px-2 py-0.5 rounded-full font-medium"
                  [class.bg-green-100]="n.status === 'sent'"
                  [class.text-green-700]="n.status === 'sent'"
                  [class.bg-red-100]="n.status === 'failed'"
                  [class.text-red-600]="n.status === 'failed'"
                >
                  {{ n.status === 'sent' ? 'Enviada' : 'Fallida' }}
                </span>
                <span class="text-[11px] text-warm-400">{{ formatDate(n) }}</span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class NotificationsListComponent {
  private notificationService = inject(NotificationService);
  private propertyService = inject(PropertyService);

  selectedPropertyId = signal<string | null>(null);
  selectedMonth = signal<string | null>(null);
  marking = signal(false);

  properties = toSignal(this.propertyService.getAll(), { initialValue: [] });
  notifications = toSignal(this.notificationService.getAll(), { initialValue: [] });
  unreadCount = toSignal(this.notificationService.getUnreadCount(), { initialValue: 0 });

  filtered = computed(() => {
    let list = this.notifications();
    const pid = this.selectedPropertyId();
    const month = this.selectedMonth();
    if (pid) list = list.filter(n => n.propertyId === pid);
    if (month) {
      list = list.filter(n => {
        const d = n.sentAt.toDate();
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return m === month;
      });
    }
    return list;
  });

  availableMonths = computed(() => {
    const months = new Set<string>();
    this.notifications().forEach(n => {
      const d = n.sentAt.toDate();
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return [...months].sort((a, b) => b.localeCompare(a)).map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
      return { value: m, label };
    });
  });

  onPropertyChange(e: Event) {
    this.selectedPropertyId.set((e.target as HTMLSelectElement).value || null);
  }

  onMonthChange(e: Event) {
    this.selectedMonth.set((e.target as HTMLSelectElement).value || null);
  }

  async markAllRead() {
    this.marking.set(true);
    await this.notificationService.markAllRead();
    this.marking.set(false);
  }

  typeIcon(type: NotificationType): string {
    switch (type) {
      case 'payment_overdue': return 'warning';
      case 'payment_reminder': return 'schedule';
      case 'ticket_update': return 'build_circle';
    }
  }

  typeLabel(type: NotificationType): string {
    switch (type) {
      case 'payment_overdue': return 'Pago vencido';
      case 'payment_reminder': return 'Recordatorio de pago';
      case 'ticket_update': return 'Actualización de ticket';
    }
  }

  formatDate(n: AppNotification): string {
    return n.sentAt.toDate().toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
