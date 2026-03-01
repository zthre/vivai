import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { switchMap } from 'rxjs';
import { MarketplaceService } from '../../../core/services/marketplace.service';
import { Unit } from '../../../core/models/unit.model';
import { Property } from '../../../core/models/property.model';

@Component({
  selector: 'app-listing-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="min-h-screen bg-warm-50">
      <!-- Header -->
      <header class="bg-white border-b border-warm-200 sticky top-0 z-10">
        <div class="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span class="text-white font-bold text-sm">V</span>
            </div>
            <span class="text-lg font-semibold text-warm-900">vivai</span>
          </div>
          <a
            routerLink="/login"
            class="text-sm font-medium text-primary-600 hover:text-primary-700 border border-primary-200 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
          >
            Iniciar sesión
          </a>
        </div>
      </header>

      <main class="max-w-4xl mx-auto px-4 py-8">
        <!-- Back link -->
        <a routerLink="/inmuebles" class="inline-flex items-center gap-1 text-sm text-warm-500 hover:text-warm-700 mb-6">
          <mat-icon class="text-[18px]">arrow_back</mat-icon>
          Volver al listado
        </a>

        @if (!unit() || !property()) {
          <!-- Loading -->
          <div class="space-y-4">
            <div class="h-72 bg-white rounded-xl border border-warm-200 animate-pulse"></div>
            <div class="h-40 bg-white rounded-xl border border-warm-200 animate-pulse"></div>
          </div>
        } @else {
          <!-- Photo gallery -->
          @if (property()!.photos && property()!.photos!.length > 0) {
            <div class="mb-6">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                @for (photo of property()!.photos!; track photo.storagePath) {
                  <img
                    [src]="photo.url"
                    [alt]="property()!.name"
                    class="w-full h-56 object-cover rounded-xl border border-warm-200"
                  >
                }
              </div>
            </div>
          } @else {
            <div class="h-56 bg-white rounded-xl border border-warm-200 flex items-center justify-center mb-6">
              <mat-icon class="text-warm-300 text-[72px]">home</mat-icon>
            </div>
          }

          <!-- Info card -->
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-6 space-y-4">
            <!-- Status badge + type -->
            <div class="flex items-center gap-2">
              <span
                class="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                [class.bg-blue-100]="unit()!.status === 'disponible_renta'"
                [class.text-blue-700]="unit()!.status === 'disponible_renta'"
                [class.bg-green-100]="unit()!.status === 'disponible_venta'"
                [class.text-green-700]="unit()!.status === 'disponible_venta'"
              >
                {{ unit()!.status === 'disponible_renta' ? 'En renta' : 'En venta' }}
              </span>
              <span class="text-xs text-warm-400 capitalize">{{ property()!.type }}</span>
            </div>

            <!-- Title -->
            <div>
              <h1 class="text-2xl font-bold text-warm-900">{{ property()!.name }}</h1>
              <p class="text-warm-500 mt-1 flex items-center gap-1">
                <mat-icon class="text-[16px]">location_on</mat-icon>
                {{ property()!.address }}
              </p>
              <p class="text-sm text-warm-400 mt-0.5">Unidad {{ unit()!.number }}</p>
            </div>

            <!-- Price -->
            <div class="pt-2 border-t border-warm-100">
              <p class="text-3xl font-bold text-primary-600">
                {{ unit()!.rentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}
                <span class="text-base font-normal text-warm-400">
                  {{ unit()!.status === 'disponible_renta' ? '/mes' : '' }}
                </span>
              </p>
            </div>

            <!-- Description -->
            @if (unit()!.publicDescription) {
              <div class="pt-2 border-t border-warm-100">
                <h2 class="text-sm font-semibold text-warm-700 mb-2">Descripción</h2>
                <p class="text-sm text-warm-600 leading-relaxed whitespace-pre-line">
                  {{ unit()!.publicDescription }}
                </p>
              </div>
            }

            <!-- WhatsApp CTA -->
            @if (property()!.whatsappPhone) {
              <div class="pt-4 border-t border-warm-100">
                <a
                  [href]="whatsappLink()"
                  target="_blank"
                  rel="noopener"
                  class="w-full flex items-center justify-center gap-2 px-5 py-3 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors shadow-sm"
                >
                  <mat-icon class="text-[20px]">chat</mat-icon>
                  Contactar por WhatsApp
                </a>
              </div>
            }
          </div>
        }
      </main>
    </div>
  `,
})
export class ListingDetailComponent implements OnInit {
  private marketplaceService = inject(MarketplaceService);
  private route = inject(ActivatedRoute);

  unit = signal<Unit | null>(null);
  property = signal<Property | null>(null);

  ngOnInit() {
    const unitId = this.route.snapshot.paramMap.get('unitId')!;
    this.marketplaceService.getUnitById(unitId).subscribe(u => {
      if (u) {
        this.unit.set(u);
        this.marketplaceService.getPropertyById(u.propertyId).subscribe(p => {
          this.property.set(p);
        });
      }
    });
  }

  whatsappLink(): string {
    const phone = this.property()?.whatsappPhone ?? '';
    const text = encodeURIComponent(
      `Hola, me interesa la unidad ${this.unit()?.number} en ${this.property()?.name} ( ${this.property()?.address} )`
    );
    return `https://wa.me/${phone}?text=${text}`;
  }
}
