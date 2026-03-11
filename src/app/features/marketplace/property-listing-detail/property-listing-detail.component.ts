import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MarketplaceService } from '../../../core/services/marketplace.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Property } from '../../../core/models/property.model';

@Component({
  selector: 'app-property-listing-detail',
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
          @if (isLoggedIn()) {
            <div class="flex items-center gap-3">
              <a routerLink="/dashboard"
                class="text-sm font-medium text-primary-600 hover:text-primary-700 border border-primary-200 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors">
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
            <button (click)="loginWithGoogle()" [disabled]="loginLoading()"
              class="text-sm font-medium text-primary-600 hover:text-primary-700 border border-primary-200 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors disabled:opacity-50">
              @if (loginLoading()) { Abriendo Google... } @else { Iniciar sesión }
            </button>
          }
        </div>
      </header>

      <main class="max-w-4xl mx-auto px-4 py-8">
        <a routerLink="/" class="inline-flex items-center gap-1 text-sm text-warm-500 hover:text-warm-700 mb-6">
          <mat-icon class="text-[18px]">arrow_back</mat-icon>
          Volver al listado
        </a>

        @if (!property()) {
          <div class="space-y-4">
            <div class="h-72 bg-white rounded-xl border border-warm-200 animate-pulse"></div>
            <div class="h-40 bg-white rounded-xl border border-warm-200 animate-pulse"></div>
          </div>
        } @else {
          <!-- Photo gallery -->
          @if (property()!.photos && property()!.photos!.length > 0) {
            <div class="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              @for (photo of property()!.photos!; track photo.storagePath) {
                <img [src]="photo.url" [alt]="property()!.name"
                  class="w-full h-56 object-cover rounded-xl border border-warm-200">
              }
            </div>
          } @else {
            <div class="h-56 bg-white rounded-xl border border-warm-200 flex items-center justify-center mb-6">
              <mat-icon class="text-warm-300 text-[72px]">home</mat-icon>
            </div>
          }

          <!-- Info card -->
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-6 space-y-4">
            <div class="flex items-center gap-2 flex-wrap">
              @if (property()!.isForRent) {
                <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">En renta</span>
              }
              @if (property()!.isForSale) {
                <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">En venta</span>
              }
              <span class="text-xs font-medium text-warm-600 bg-warm-100 px-2 py-0.5 rounded-full">Propiedad completa</span>
              <span class="text-xs text-warm-400 capitalize">{{ property()!.type }}</span>
            </div>

            <div>
              <h1 class="text-2xl font-bold text-warm-900">{{ property()!.name }}</h1>
              <p class="text-warm-500 mt-1 flex items-center gap-1">
                <mat-icon class="text-[16px]">location_on</mat-icon>
                {{ property()!.address }}
              </p>
            </div>

            @if (property()!.tags?.length) {
              <div class="flex flex-wrap gap-1.5">
                @for (tag of property()!.tags!; track tag) {
                  <span class="px-2.5 py-1 bg-primary-100 text-primary-700 text-xs font-semibold rounded-full">{{ tag }}</span>
                }
              </div>
            }

            <!-- Price -->
            <div class="pt-2 border-t border-warm-100 space-y-3">
              @if (property()!.isForRent && property()!.rentPrice) {
                <div>
                  <p class="text-xs text-warm-400 mb-0.5">Precio de renta</p>
                  <p class="text-3xl font-bold text-primary-600">
                    {{ property()!.rentPrice! | currency:'COP':'symbol-narrow':'1.0-0' }}
                    <span class="text-base font-normal text-warm-400">/mes</span>
                  </p>
                </div>
              }
              @if (property()!.isForSale && property()!.salePrice) {
                <div>
                  <p class="text-xs text-warm-400 mb-0.5">Precio de venta</p>
                  <p class="text-3xl font-bold text-primary-600">
                    {{ property()!.salePrice! | currency:'COP':'symbol-narrow':'1.0-0' }}
                  </p>
                </div>
              }
            </div>

            @if (property()!.publicDescription) {
              <div class="pt-2 border-t border-warm-100">
                <h2 class="text-sm font-semibold text-warm-700 mb-2">Descripción</h2>
                <p class="text-sm text-warm-600 leading-relaxed whitespace-pre-line">
                  {{ property()!.publicDescription }}
                </p>
              </div>
            }

            @if (property()!.whatsappPhone) {
              <div class="pt-4 border-t border-warm-100">
                <a [href]="whatsappLink()" target="_blank" rel="noopener"
                  class="w-full flex items-center justify-center gap-2 px-5 py-3 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors shadow-sm">
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
export class PropertyListingDetailComponent implements OnInit {
  private marketplaceService = inject(MarketplaceService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);

  currentUser = this.authService.currentUser;
  isLoggedIn = this.authService.isLoggedIn;
  loginLoading = signal(false);
  property = signal<Property | null>(null);

  ngOnInit() {
    const propertyId = this.route.snapshot.paramMap.get('propertyId')!;
    this.marketplaceService.getPropertyById(propertyId).subscribe(p => this.property.set(p));
  }

  whatsappLink(): string {
    const phone = this.property()?.whatsappPhone ?? '';
    const text = encodeURIComponent(
      `Hola, me interesa la propiedad ${this.property()?.name} ( ${this.property()?.address} )`
    );
    return `https://wa.me/${phone}?text=${text}`;
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
