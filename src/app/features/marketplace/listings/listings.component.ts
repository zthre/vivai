import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { MarketplaceService, listingPrice } from '../../../core/services/marketplace.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Property } from '../../../core/models/property.model';
import { ListingCardComponent } from './listing-card/listing-card.component';

type FilterType = 'todos' | 'renta' | 'venta';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-listings',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, ListingCardComponent],
  template: `
    <div class="min-h-screen bg-warm-50">
      <!-- Header -->
      <header class="bg-white border-b border-warm-200 sticky top-0 z-10">
        <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span class="text-white font-bold text-sm">V</span>
            </div>
            <span class="text-lg font-semibold text-warm-900">vivai</span>
            <span class="text-warm-400 text-sm hidden sm:block">· Propiedades disponibles</span>
          </div>
          @if (isLoggedIn()) {
            <div class="flex items-center gap-3">
              <a
                routerLink="/dashboard"
                class="text-sm font-medium text-primary-600 hover:text-primary-700 border border-primary-200 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
              >
                Ir al dashboard
              </a>
              @if (currentUser()?.photoURL) {
                <img [src]="currentUser()!.photoURL!" class="w-8 h-8 rounded-full" alt="avatar">
              } @else {
                <div class="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
                  <span class="text-white text-xs font-bold">{{ currentUser()?.displayName?.[0]?.toUpperCase() ?? 'U' }}</span>
                </div>
              }
            </div>
          } @else {
            <button
              (click)="loginWithGoogle()"
              [disabled]="loginLoading()"
              class="text-sm font-medium text-primary-600 hover:text-primary-700 border border-primary-200 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors disabled:opacity-50"
            >
              @if (loginLoading()) {
                Abriendo Google...
              } @else {
                Iniciar sesión
              }
            </button>
          }
        </div>
      </header>

      <!-- Filters -->
      <div class="max-w-6xl mx-auto px-4 py-4 flex flex-wrap gap-3 items-center justify-between">
        <!-- Type filter -->
        <div class="flex gap-2">
          @for (f of filters; track f.value) {
            <button
              (click)="setFilter(f.value)"
              class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border"
              [class.bg-primary-500]="filterType() === f.value"
              [class.text-white]="filterType() === f.value"
              [class.border-primary-500]="filterType() === f.value"
              [class.bg-white]="filterType() !== f.value"
              [class.text-warm-600]="filterType() !== f.value"
              [class.border-warm-200]="filterType() !== f.value"
              [class.hover:bg-warm-50]="filterType() !== f.value"
            >
              {{ f.label }}
            </button>
          }
        </div>

        <!-- Sort -->
        <div class="flex items-center gap-2">
          <span class="text-sm text-warm-500">Ordenar:</span>
          <select
            (change)="setSortOrder($any($event.target).value)"
            [value]="sortOrder()"
            class="text-sm border border-warm-200 rounded-lg px-2 py-1.5 bg-white text-warm-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="asc">Precio: menor a mayor</option>
            <option value="desc">Precio: mayor a menor</option>
          </select>
        </div>
      </div>

      <!-- Grid -->
      <main class="max-w-6xl mx-auto px-4 pb-12">
        @if (allListings() === undefined) {
          <!-- Loading -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            @for (i of [1,2,3,4,5,6]; track i) {
              <div class="bg-white rounded-xl border border-warm-200 h-72 animate-pulse"></div>
            }
          </div>
        } @else if (pagedListings().length === 0) {
          <!-- Empty state -->
          <div class="flex flex-col items-center justify-center py-24 text-center">
            <mat-icon class="text-warm-300 text-[56px]">search_off</mat-icon>
            <p class="text-warm-500 mt-3 text-base">No hay propiedades disponibles en este momento.</p>
            <p class="text-warm-400 text-sm mt-1">Vuelve pronto para nuevas opciones.</p>
          </div>
        } @else {
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            @for (property of pagedListings(); track property.id) {
              <app-listing-card [property]="property" [filterMode]="filterType()" />
            }
          </div>

          <!-- Pagination -->
          @if (totalPages() > 1) {
            <div class="flex justify-center items-center gap-4 mt-10">
              <button
                (click)="prevPage()"
                [disabled]="currentPage() === 1"
                class="px-4 py-2 border border-warm-200 rounded-lg text-sm font-medium text-warm-600 hover:bg-warm-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Anterior
              </button>
              <span class="text-sm text-warm-500">
                {{ currentPage() }} / {{ totalPages() }}
              </span>
              <button
                (click)="nextPage()"
                [disabled]="currentPage() === totalPages()"
                class="px-4 py-2 border border-warm-200 rounded-lg text-sm font-medium text-warm-600 hover:bg-warm-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente →
              </button>
            </div>
          }
        }
      </main>
    </div>
  `,
})
export class ListingsComponent {
  private marketplaceService = inject(MarketplaceService);
  private authService = inject(AuthService);

  currentUser = this.authService.currentUser;
  isLoggedIn = this.authService.isLoggedIn;
  loginLoading = signal(false);

  allListings = toSignal(this.marketplaceService.getListings());
  filterType = signal<FilterType>('todos');
  sortOrder = signal<SortOrder>('asc');
  currentPage = signal(1);

  filters = [
    { value: 'todos' as FilterType, label: 'Todos' },
    { value: 'renta' as FilterType, label: 'En renta' },
    { value: 'venta' as FilterType, label: 'En venta' },
  ];

  filteredAndSorted = computed<Property[]>(() => {
    const items = this.allListings() ?? [];
    const filter = this.filterType();

    const filtered =
      filter === 'todos'
        ? items
        : filter === 'renta'
          ? items.filter(p => p.isForRent)
          : items.filter(p => p.isForSale);

    return [...filtered].sort((a, b) =>
      this.sortOrder() === 'asc'
        ? listingPrice(a) - listingPrice(b)
        : listingPrice(b) - listingPrice(a)
    );
  });

  totalPages = computed(() => Math.ceil(this.filteredAndSorted().length / PAGE_SIZE));

  pagedListings = computed<Property[]>(() => {
    const page = this.currentPage();
    const start = (page - 1) * PAGE_SIZE;
    return this.filteredAndSorted().slice(start, start + PAGE_SIZE);
  });

  setFilter(value: FilterType) {
    this.filterType.set(value);
    this.currentPage.set(1);
  }

  setSortOrder(value: SortOrder) {
    this.sortOrder.set(value);
    this.currentPage.set(1);
  }

  prevPage() {
    if (this.currentPage() > 1) this.currentPage.update(p => p - 1);
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1);
  }

  async loginWithGoogle() {
    this.loginLoading.set(true);
    try {
      await this.authService.loginWithGoogle();
    } catch {
      this.loginLoading.set(false);
    }
  }
}
