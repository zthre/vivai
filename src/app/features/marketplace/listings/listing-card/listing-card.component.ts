import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ListingItem } from '../../../../core/services/marketplace.service';

@Component({
  selector: 'app-listing-card',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <!-- Photo -->
      <div class="h-48 bg-warm-100 flex-shrink-0 overflow-hidden">
        @if (item.property.photos && item.property.photos.length > 0) {
          <img
            [src]="item.property.photos[0].url"
            [alt]="item.property.name"
            class="w-full h-full object-cover"
          >
        } @else {
          <div class="w-full h-full flex items-center justify-center">
            <mat-icon class="text-warm-300 text-[56px]">home</mat-icon>
          </div>
        }
      </div>

      <!-- Content -->
      <div class="p-4 flex flex-col flex-1 gap-2">
        <!-- Badge status -->
        <div class="flex items-center justify-between">
          <span
            class="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            [class.bg-blue-100]="item.unit.status === 'disponible_renta'"
            [class.text-blue-700]="item.unit.status === 'disponible_renta'"
            [class.bg-green-100]="item.unit.status === 'disponible_venta'"
            [class.text-green-700]="item.unit.status === 'disponible_venta'"
          >
            {{ item.unit.status === 'disponible_renta' ? 'En renta' : 'En venta' }}
          </span>
          <span class="text-xs text-warm-400 capitalize">{{ item.property.type }}</span>
        </div>

        <!-- Name and address -->
        <div>
          <h3 class="font-semibold text-warm-900 text-sm leading-snug">{{ item.property.name }}</h3>
          <p class="text-xs text-warm-500 mt-0.5">{{ item.property.address }}</p>
        </div>

        <!-- Unit number -->
        <p class="text-xs text-warm-400">Unidad {{ item.unit.number }}</p>

        <!-- Price -->
        <p class="text-lg font-bold text-primary-600">
          {{ item.unit.rentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}
          <span class="text-xs font-normal text-warm-400">
            {{ item.unit.status === 'disponible_renta' ? '/mes' : '' }}
          </span>
        </p>

        <!-- Actions -->
        <div class="mt-auto pt-2 flex flex-col gap-2">
          <a
            [routerLink]="['/inmuebles', item.unit.id]"
            class="w-full text-center px-3 py-2 border border-warm-200 text-warm-700 rounded-lg text-xs font-medium hover:bg-warm-50 transition-colors"
          >
            Ver detalles
          </a>
          @if (item.property.whatsappPhone) {
            <a
              [href]="whatsappLink()"
              target="_blank"
              rel="noopener"
              class="w-full text-center px-3 py-2 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 transition-colors flex items-center justify-center gap-1.5"
            >
              <mat-icon class="text-[16px]">chat</mat-icon>
              Contactar por WhatsApp
            </a>
          }
        </div>
      </div>
    </div>
  `,
})
export class ListingCardComponent {
  @Input({ required: true }) item!: ListingItem;

  whatsappLink(): string {
    const phone = this.item.property.whatsappPhone ?? '';
    const text = encodeURIComponent(
      `Hola, me interesa la unidad ${this.item.unit.number} en ${this.item.property.name} ( ${this.item.property.address} )`
    );
    return `https://wa.me/${phone}?text=${text}`;
  }
}
