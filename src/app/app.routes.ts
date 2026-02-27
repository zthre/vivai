import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'properties',
        loadComponent: () =>
          import('./features/properties/properties-list/properties-list.component').then(
            m => m.PropertiesListComponent
          ),
      },
      {
        path: 'properties/new',
        loadComponent: () =>
          import('./features/properties/property-form/property-form.component').then(
            m => m.PropertyFormComponent
          ),
      },
      {
        path: 'properties/:id/edit',
        loadComponent: () =>
          import('./features/properties/property-form/property-form.component').then(
            m => m.PropertyFormComponent
          ),
      },
      {
        path: 'properties/:id',
        loadComponent: () =>
          import('./features/properties/property-detail/property-detail.component').then(
            m => m.PropertyDetailComponent
          ),
      },
      {
        path: 'properties/:propertyId/units/new',
        loadComponent: () =>
          import('./features/units/unit-form/unit-form.component').then(
            m => m.UnitFormComponent
          ),
      },
      {
        path: 'properties/:propertyId/units/:unitId/edit',
        loadComponent: () =>
          import('./features/units/unit-form/unit-form.component').then(
            m => m.UnitFormComponent
          ),
      },
      {
        path: 'properties/:propertyId/units/:unitId',
        loadComponent: () =>
          import('./features/units/unit-detail/unit-detail.component').then(
            m => m.UnitDetailComponent
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
