import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { PropertyService } from '../../../core/services/property.service';
import { UnitService } from '../../../core/services/unit.service';
import { Unit } from '../../../core/models/unit.model';
import { Property } from '../../../core/models/property.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PhotoGalleryComponent } from './photo-gallery/photo-gallery.component';

@Component({
  selector: 'app-property-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatDialogModule, MatSnackBarModule, PhotoGalleryComponent],
  template: `
    <div class="space-y-6">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 text-sm text-warm-400">
        <a routerLink="/properties" class="hover:text-warm-600 transition-colors">Inmuebles</a>
        <mat-icon class="text-[16px]">chevron_right</mat-icon>
        <span class="text-warm-700 font-medium">{{ property()?.name }}</span>
      </div>

      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-3">
          <a routerLink="/properties" class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
            <mat-icon>arrow_back</mat-icon>
          </a>
          <div>
            <h1 class="text-2xl font-bold text-warm-900">{{ property()?.name }}</h1>
            <p class="text-warm-400 text-sm flex items-center gap-1">
              <mat-icon class="text-[14px]">location_on</mat-icon>
              {{ property()?.address }}
            </p>
          </div>
        </div>
        <a
          [routerLink]="['/properties', propertyId, 'units', 'new']"
          class="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium shadow-sm"
        >
          <mat-icon class="text-[18px]">add</mat-icon>
          Nueva unidad
        </a>
      </div>

      <!-- Units -->
      @if (units().length === 0) {
        <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-12 text-center">
          <mat-icon class="text-warm-300 text-[56px]">meeting_room</mat-icon>
          <h3 class="text-warm-700 font-semibold mt-3">Sin unidades aún</h3>
          <p class="text-warm-400 text-sm mt-1 mb-5">Agrega la primera unidad a este inmueble</p>
          <a
            [routerLink]="['/properties', propertyId, 'units', 'new']"
            class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
          >
            <mat-icon class="text-[18px]">add</mat-icon>
            Agregar unidad
          </a>
        </div>
      }

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        @for (unit of units(); track unit.id) {
          <div class="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow"
            [class.border-green-200]="unit.status === 'ocupado'"
            [class.border-warm-200]="unit.status === 'disponible'"
          >
            <div class="p-5">
              <div class="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 class="font-semibold text-warm-900">Unidad {{ unit.number }}</h3>
                  @if (unit.tenantName) {
                    <p class="text-xs text-warm-500 mt-0.5 flex items-center gap-1">
                      <mat-icon class="text-[13px]">person</mat-icon>
                      {{ unit.tenantName }}
                    </p>
                  }
                </div>
                <span
                  class="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                  [class.bg-green-100]="unit.status === 'ocupado'"
                  [class.text-green-700]="unit.status === 'ocupado'"
                  [class.bg-warm-100]="unit.status === 'disponible'"
                  [class.text-warm-600]="unit.status === 'disponible'"
                >
                  {{ unit.status }}
                </span>
              </div>
              <p class="text-lg font-bold text-warm-900">
                {{ unit.rentPrice | currency:'COP':'symbol-narrow':'1.0-0' }}
                <span class="text-xs font-normal text-warm-400">/mes</span>
              </p>
            </div>
            <div class="border-t border-warm-100 px-5 py-3 flex items-center justify-between">
              <a
                [routerLink]="['/properties', propertyId, 'units', unit.id]"
                class="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                Ver pagos
                <mat-icon class="text-[16px]">arrow_forward</mat-icon>
              </a>
              <div class="flex items-center gap-1">
                <a
                  [routerLink]="['/properties', propertyId, 'units', unit.id, 'edit']"
                  class="p-1.5 text-warm-400 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors"
                >
                  <mat-icon class="text-[18px]">edit</mat-icon>
                </a>
                <button
                  (click)="confirmDeleteUnit(unit)"
                  class="p-1.5 text-warm-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <mat-icon class="text-[18px]">delete</mat-icon>
                </button>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Photo gallery -->
      @if (property()) {
        <app-photo-gallery
          [photos]="property()?.photos ?? []"
          [propertyId]="propertyId"
          [ownerId]="property()!.ownerId"
        />
      }
    </div>
  `,
})
export class PropertyDetailComponent implements OnInit {
  private propertyService = inject(PropertyService);
  private unitService = inject(UnitService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private route = inject(ActivatedRoute);

  propertyId!: string;
  property = signal<Property | null>(null);
  units = toSignal(
    this.route.paramMap.pipe(
      switchMap(params => this.unitService.getByProperty(params.get('id')!))
    ),
    { initialValue: [] }
  );

  ngOnInit() {
    this.propertyId = this.route.snapshot.paramMap.get('id')!;
    this.propertyService.getById(this.propertyId).subscribe(p => this.property.set(p));
  }

  confirmDeleteUnit(unit: Unit) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar unidad',
        message: `¿Eliminar la unidad "${unit.number}"? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
        danger: true,
      },
    });
    dialogRef.afterClosed().subscribe(async confirmed => {
      if (confirmed) {
        await this.unitService.delete(unit.id!);
        await this.propertyService.incrementUnitCount(this.propertyId, -1);
        this.snackBar.open('Unidad eliminada.', 'OK', { duration: 3000 });
      }
    });
  }
}
