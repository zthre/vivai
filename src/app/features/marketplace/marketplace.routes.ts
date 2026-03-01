import { Routes } from '@angular/router';

export const MARKETPLACE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./listings/listings.component').then(m => m.ListingsComponent),
  },
  {
    path: ':unitId',
    loadComponent: () =>
      import('./listing-detail/listing-detail.component').then(m => m.ListingDetailComponent),
  },
];
