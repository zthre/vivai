import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { UtilityServiceService } from '../../../core/services/utility-service.service';

@Component({
  selector: 'app-service-list',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-warm-900">Servicios</h1>
          <p class="text-warm-500 text-sm mt-1">Gestiona servicios y distribúyelos entre tus propiedades</p>
        </div>
        <a routerLink="/services/new"
          class="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium shadow-sm">
          <mat-icon class="text-[18px]">add</mat-icon>
          Nuevo servicio
        </a>
      </div>

      @if (!services()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else if (services()!.length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-12 text-center">
          <mat-icon class="text-warm-300 text-[56px]">receipt_long</mat-icon>
          <h3 class="text-warm-700 font-semibold mt-3">Sin servicios</h3>
          <p class="text-warm-400 text-sm mt-1">Crea un servicio para empezar a distribuir costos entre tus propiedades</p>
        </div>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (svc of services(); track svc.id) {
            <a [routerLink]="['/services', svc.id]"
              class="bg-white rounded-xl border border-warm-200 shadow-sm p-5 hover:border-primary-300 hover:shadow-md transition-all group">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  [class.bg-primary-100]="svc.isActive"
                  [class.bg-warm-100]="!svc.isActive">
                  <mat-icon class="text-[22px]"
                    [class.text-primary-600]="svc.isActive"
                    [class.text-warm-400]="!svc.isActive">{{ svc.icon || 'receipt_long' }}</mat-icon>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-warm-900 group-hover:text-primary-600 transition-colors">{{ svc.name }}</p>
                  @if (svc.description) {
                    <p class="text-xs text-warm-400 mt-0.5 line-clamp-2">{{ svc.description }}</p>
                  }
                  <div class="mt-2">
                    @if (svc.isActive) {
                      <span class="text-[11px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Activo</span>
                    } @else {
                      <span class="text-[11px] px-2 py-0.5 bg-warm-100 text-warm-500 rounded-full font-medium">Inactivo</span>
                    }
                  </div>
                </div>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class ServiceListComponent {
  private svcService = inject(UtilityServiceService);
  services = toSignal(this.svcService.getAll());
}
