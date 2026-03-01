import { Routes } from '@angular/router';

export const MARKETPLACE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./listings/listings.component').then(m => m.ListingsComponent),
  },
  {
    path: 'u/:unitId',
    loadComponent: () =>
      import('./listing-detail/listing-detail.component').then(m => m.ListingDetailComponent),
  },
  {
    path: 'p/:propertyId',
    loadComponent: () =>
      import('./property-listing-detail/property-listing-detail.component').then(
        m => m.PropertyListingDetailComponent
      ),
  },
];
