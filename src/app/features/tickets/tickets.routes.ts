import { Routes } from '@angular/router';
import { ownerGuard } from '../../core/auth/owner.guard';
import { authGuard } from '../../core/auth/auth.guard';

export const TICKETS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [ownerGuard],
    loadComponent: () =>
      import('./tickets-board/tickets-board.component').then(m => m.TicketsBoardComponent),
  },
  {
    path: ':id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./ticket-detail/ticket-detail.component').then(m => m.TicketDetailComponent),
  },
];
