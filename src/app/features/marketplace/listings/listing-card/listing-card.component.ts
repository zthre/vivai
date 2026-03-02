import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ListingItem, listingPrice, listingStatus } from '../../../../core/services/marketplace.service';

type FilterMode = 'todos' | 'renta' | 'venta';

@Component({
  selector: 'app-listing-card',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <!-- Photo -->
      <div class="h-48 bg-warm-100 flex-shrink-0 overflow-hidden">
        @if (photoUrl()) {
          <img
            [src]="photoUrl()!"
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
        <!-- Badges -->
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex gap-1 flex-wrap">
            @if (isForRent()) {
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">En renta</span>
            }
            @if (isForSale()) {
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">En venta</span>
            }
          </div>
          <span class="text-xs text-warm-400 capitalize">{{ item.property.type }}</span>
        </div>

        <!-- Name and address -->
        <div>
          <h3 class="font-semibold text-warm-900 text-sm leading-snug">{{ item.property.name }}</h3>
          <p class="text-xs text-warm-500 mt-0.5">{{ item.property.address }}</p>
        </div>

        <!-- Unit / Propiedad completa -->
        @if (item.kind === 'unit') {
          <p class="text-xs text-warm-400">Unidad {{ item.unit.number }}</p>
        } @else {
          <p class="text-xs font-medium text-warm-600 bg-warm-100 px-2 py-0.5 rounded-full w-fit">Propiedad completa</p>
        }

        <!-- Price(s) -->
        <div class="space-y-0.5">
          @if (showRentPrice()) {
            <p class="text-lg font-bold text-primary-600">
              {{ rentPrice() | currency:'COP':'symbol-narrow':'1.0-0' }}
              <span class="text-xs font-normal text-warm-400">/mes</span>
            </p>
          }
          @if (showSalePrice()) {
            <p class="text-base font-bold text-green-600">
              {{ salePrice() | currency:'COP':'symbol-narrow':'1.0-0' }}
              <span class="text-xs font-normal text-warm-400"> venta</span>
            </p>
          }
        </div>

        <!-- Actions -->
        <div class="mt-auto pt-2 flex flex-col gap-2">
          <a
            [routerLink]="detailLink()"
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
  @Input() filterMode: FilterMode = 'todos';

  price(): number { return listingPrice(this.item); }
  status() { return listingStatus(this.item); }

  photoUrl(): string | null {
    if (this.item.kind === 'unit' && this.item.unit.photos?.length) {
      return this.item.unit.photos[0].url;
    }
    if (this.item.property.photos?.length) {
      return this.item.property.photos[0].url;
    }
    return null;
  }

  isForRent(): boolean {
    return this.item.kind === 'unit' ? this.item.unit.isForRent : !!this.item.property.isForRent;
  }
  isForSale(): boolean {
    return this.item.kind === 'unit' ? this.item.unit.isForSale : !!this.item.property.isForSale;
  }

  rentPrice(): number {
    if (this.item.kind === 'unit') return this.item.unit.rentPrice ?? 0;
    return this.item.property.rentPrice ?? 0;
  }
  salePrice(): number {
    if (this.item.kind === 'unit') return this.item.unit.salePrice ?? 0;
    return this.item.property.salePrice ?? 0;
  }

  showRentPrice(): boolean {
    return this.filterMode !== 'venta' && this.isForRent();
  }
  showSalePrice(): boolean {
    return this.filterMode !== 'renta' && this.isForSale();
  }

  detailLink(): string[] {
    return this.item.kind === 'unit'
      ? ['/inmuebles', 'u', this.item.unit.id!]
      : ['/inmuebles', 'p', this.item.property.id!];
  }

  whatsappLink(): string {
    const phone = this.item.property.whatsappPhone ?? '';
    const label =
      this.item.kind === 'unit'
        ? `la unidad ${this.item.unit.number} en ${this.item.property.name}`
        : `la propiedad ${this.item.property.name}`;
    const text = encodeURIComponent(
      `Hola, me interesa ${label} ( ${this.item.property.address} )`
    );
    return `https://wa.me/${phone}?text=${text}`;
  }
}
