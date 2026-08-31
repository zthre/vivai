import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Property } from '../../../core/models/property.model';
import { PropertyService } from '../../../core/services/property.service';
import {
  LISTING_DURATION_DAYS,
  listingDaysLeft,
  listingState,
} from '../../../core/services/listing.util';

/**
 * Estado de la publicación en el marketplace, con acción de republicar.
 * Las publicaciones duran LISTING_DURATION_DAYS días y no se renuevan solas.
 */
@Component({
  selector: 'app-listing-status',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatSnackBarModule],
  template: `
    @if (state() !== 'none') {
      <div class="flex items-center gap-1.5 flex-wrap">
        @switch (state()) {
          @case ('active') {
            <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">
              <mat-icon class="text-[13px]">storefront</mat-icon>
              Publicada · {{ daysLeft() }}d
            </span>
          }
          @case ('expiring') {
            <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
              <mat-icon class="text-[13px]">schedule</mat-icon>
              Vence en {{ daysLeft() }}d
            </span>
          }
          @case ('expired') {
            <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-warm-100 text-warm-500 rounded-full font-medium">
              <mat-icon class="text-[13px]">event_busy</mat-icon>
              Publicación vencida
            </span>
          }
        }

        @if (canWrite() && state() !== 'active') {
          <button (click)="republish()" [disabled]="loading()"
            class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border border-primary-200 text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50">
            @if (loading()) {
              <div class="w-3 h-3 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
            } @else {
              <mat-icon class="text-[13px]">autorenew</mat-icon>
            }
            Publicar de nuevo
          </button>
        }
      </div>
    }
  `,
})
export class ListingStatusComponent {
  private propertyService = inject(PropertyService);
  private snackBar = inject(MatSnackBar);

  property = input.required<Property>();
  canWrite = input<boolean>(true);
  republished = output<void>();

  loading = signal(false);

  state = computed(() => listingState(this.property()));
  daysLeft = computed(() => listingDaysLeft(this.property()) ?? 0);

  async republish() {
    const p = this.property();
    if (!p.id) return;
    this.loading.set(true);
    try {
      await this.propertyService.republishListing(p.id);
      this.snackBar.open(
        `Publicación renovada por ${LISTING_DURATION_DAYS} días.`,
        'OK',
        { duration: 3000, panelClass: 'snackbar-success' }
      );
      this.republished.emit();
    } catch {
      this.snackBar.open('No se pudo republicar.', 'OK', { duration: 3000, panelClass: 'snackbar-error' });
    } finally {
      this.loading.set(false);
    }
  }
}
