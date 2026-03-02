import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { from, switchMap, take, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserRole } from './auth.service';

export function rolesGuard(allowedRoles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(Auth);
    const firestore = inject(Firestore);
    const router = inject(Router);

    return from((auth as any).authStateReady()).pipe(
      switchMap(() => authState(auth).pipe(take(1))),
      switchMap(user => {
        if (!user) return of(router.createUrlTree(['/login']));
        return from(getDoc(doc(firestore, `users/${user.uid}`))).pipe(
          map(snap => {
            const data = snap.data();
            // Support both new roles[] and legacy role field
            let roles: UserRole[] = [];
            if (Array.isArray(data?.['roles'])) {
              roles = data!['roles'] as UserRole[];
            } else if (data?.['role']) {
              roles = [data['role'] as UserRole];
            } else {
              // No role yet — treat as owner (backwards compat)
              roles = ['owner'];
            }

            const hasAccess = allowedRoles.some(r => roles.includes(r));
            if (hasAccess) return true;

            // Redirect based on user's first role
            const firstRole = roles[0];
            if (firstRole === 'tenant') return router.createUrlTree(['/tenant']);
            return router.createUrlTree(['/dashboard']);
          })
        );
      })
    );
  };
}
