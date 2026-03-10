import { Routes } from '@angular/router';
import { tenantGuard } from '../../core/auth/tenant.guard';

export const TENANT_PORTAL_ROUTES: Routes = [
  {
    path: '',
    canActivate: [tenantGuard],
    loadComponent: () =>
      import('./my-lease/my-lease.component').then(m => m.MyLeaseComponent),
  },
  {
    path: 'payments',
    canActivate: [tenantGuard],
    loadComponent: () =>
      import('./payment-history/payment-history.component').then(m => m.PaymentHistoryComponent),
  },
  {
    path: 'tickets/new',
    canActivate: [tenantGuard],
    loadComponent: () =>
      import('./ticket-form/ticket-form.component').then(m => m.TicketFormComponent),
  },
  {
    path: 'tickets',
    canActivate: [tenantGuard],
    loadComponent: () =>
      import('./my-tickets/my-tickets.component').then(m => m.MyTicketsComponent),
  },
  {
    path: 'pay',
    canActivate: [tenantGuard],
    loadComponent: () =>
      import('./payment-status/payment-status.component').then(m => m.PaymentStatusComponent),
  },
  {
    path: 'pay/success',
    canActivate: [tenantGuard],
    loadComponent: () =>
      import('./payment-success/payment-success.component').then(m => m.PaymentSuccessComponent),
  },
];
