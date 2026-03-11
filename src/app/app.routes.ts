import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { ownerGuard } from './core/auth/owner.guard';
import { tenantGuard } from './core/auth/tenant.guard';
import { rolesGuard } from './core/auth/roles.guard';

export const routes: Routes = [
  // Marketplace (public, no auth)
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/marketplace/listings/listings.component').then(m => m.ListingsComponent),
  },
  {
    path: 'inmueble/:propertyId',
    loadComponent: () =>
      import('./features/marketplace/listing-detail/listing-detail.component').then(m => m.ListingDetailComponent),
  },
  // Authenticated shell
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      // Owner + colaborador routes
      {
        path: 'dashboard',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'properties',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/properties/properties-list/properties-list.component').then(
            m => m.PropertiesListComponent
          ),
      },
      {
        path: 'properties/new',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/properties/property-form/property-form.component').then(
            m => m.PropertyFormComponent
          ),
      },
      {
        path: 'properties/:id/edit',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/properties/property-form/property-form.component').then(
            m => m.PropertyFormComponent
          ),
      },
      {
        path: 'properties/:id',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/properties/property-detail/property-detail.component').then(
            m => m.PropertyDetailComponent
          ),
      },
      {
        path: 'properties/:id/payment-link',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/payments/payment-link-generator.component').then(
            m => m.PaymentLinkGeneratorComponent
          ),
      },
      {
        path: 'reminders',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/reminders/reminders.component').then(m => m.RemindersComponent),
      },
      {
        path: 'colaboradores',
        canActivate: [rolesGuard(['owner'])],
        loadComponent: () =>
          import('./features/colaboradores/colaboradores-page.component').then(
            m => m.ColaboradoresPageComponent
          ),
      },
      {
        path: 'notifications',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/notifications/notifications-list.component').then(
            m => m.NotificationsListComponent
          ),
      },
      {
        path: 'settings/notifications',
        canActivate: [rolesGuard(['owner'])],
        loadComponent: () =>
          import('./features/notifications/notification-settings.component').then(
            m => m.NotificationSettingsComponent
          ),
      },
      {
        path: 'analytics',
        canActivate: [rolesGuard(['owner'])],
        loadChildren: () =>
          import('./features/analytics/analytics.routes').then(m => m.ANALYTICS_ROUTES),
      },
      {
        path: 'finances',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/finances/finances-dashboard/finances-dashboard.component').then(
            m => m.FinancesDashboardComponent
          ),
      },
      {
        path: 'tickets',
        loadChildren: () =>
          import('./features/tickets/tickets.routes').then(m => m.TICKETS_ROUTES),
      },
      // Tenant routes
      {
        path: 'tenant',
        loadChildren: () =>
          import('./features/tenant-portal/tenant-portal.routes').then(
            m => m.TENANT_PORTAL_ROUTES
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
