import { Routes } from '@angular/router';

export const SERVICES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./service-list/service-list.component').then(m => m.ServiceListComponent),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./service-form/service-form.component').then(m => m.ServiceFormComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./service-detail/service-detail.component').then(m => m.ServiceDetailComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./service-form/service-form.component').then(m => m.ServiceFormComponent),
  },
  {
    path: ':id/receipts',
    loadComponent: () =>
      import('./service-receipts/service-receipts.component').then(m => m.ServiceReceiptsComponent),
  },
];
