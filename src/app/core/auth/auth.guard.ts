import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { from, switchMap, take, map } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  // authStateReady() resolves once Firebase has determined the initial auth state
  // (including processing any pending redirect result).
  // Without this, take(1) can capture the initial null before the redirect is handled.
  return from((auth as any).authStateReady()).pipe(
    switchMap(() => authState(auth).pipe(take(1))),
    map(user => user ? true : router.createUrlTree(['/login']))
  );
};
