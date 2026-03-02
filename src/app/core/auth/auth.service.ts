import { Injectable, inject, computed, signal } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  user,
  User,
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  limit,
  serverTimestamp,
  arrayUnion,
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

export type UserRole = 'owner' | 'tenant' | 'colaborador';

const ACTIVE_ROLE_KEY = 'vivai_active_role';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);

  readonly currentUser = toSignal(user(this.auth), { initialValue: null });
  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly uid = computed(() => this.currentUser()?.uid ?? null);
  readonly redirectChecked = signal(true);

  private _userRoles = signal<UserRole[]>([]);
  private _activeRole = signal<UserRole | null>(null);
  private _tenantUnitIds = signal<string[]>([]);
  private _collaboratingPropertyIds = signal<string[]>([]);

  readonly userRoles = this._userRoles.asReadonly();
  readonly activeRole = this._activeRole.asReadonly();
  // Backwards compat with existing code using userRole() and tenantUnitId()
  readonly userRole = computed(() => this._activeRole());
  readonly tenantUnitId = computed(() => this._tenantUnitIds()[0] ?? null);

  constructor() {
    user(this.auth).subscribe(async firebaseUser => {
      if (!firebaseUser) {
        this._userRoles.set([]);
        this._activeRole.set(null);
        this._tenantUnitIds.set([]);
        this._collaboratingPropertyIds.set([]);
        return;
      }

      const snap = await getDoc(doc(this.firestore, `users/${firebaseUser.uid}`));
      const data = snap.data();
      if (!data) return;

      // Backwards compat: migrate singular role to array
      let roles: UserRole[] = [];
      if (Array.isArray(data['roles'])) {
        roles = data['roles'] as UserRole[];
      } else if (data['role']) {
        roles = [data['role'] as UserRole];
      }

      const unitIds: string[] = Array.isArray(data['unitIds'])
        ? data['unitIds']
        : data['unitId'] ? [data['unitId']] : [];

      const collaboratingPropertyIds: string[] = Array.isArray(data['collaboratingPropertyIds'])
        ? data['collaboratingPropertyIds']
        : [];

      this._userRoles.set(roles);
      this._tenantUnitIds.set(unitIds);
      this._collaboratingPropertyIds.set(collaboratingPropertyIds);

      // Check for pending colaborator assignments
      if (firebaseUser.email) {
        const pendingProps = await getDocs(
          query(
            collection(this.firestore, 'properties'),
            where('pendingCollaboratorEmails', 'array-contains', firebaseUser.email)
          )
        );
        if (!pendingProps.empty) {
          for (const propDoc of pendingProps.docs) {
            const propId = propDoc.id;
            // Assign this user as colaborador on the property
            await updateDoc(doc(this.firestore, `properties/${propId}`), {
              collaboratorUids: arrayUnion(firebaseUser.uid),
              pendingCollaboratorEmails: (propDoc.data()['pendingCollaboratorEmails'] as string[]).filter(
                e => e !== firebaseUser.email
              ),
            });
          }
          // Update user roles
          if (!roles.includes('colaborador')) {
            roles = [...roles, 'colaborador'];
          }
          const newCollabIds = [
            ...collaboratingPropertyIds,
            ...pendingProps.docs.map(d => d.id).filter(id => !collaboratingPropertyIds.includes(id)),
          ];
          await updateDoc(doc(this.firestore, `users/${firebaseUser.uid}`), {
            roles,
            collaboratingPropertyIds: newCollabIds,
          });
          this._userRoles.set(roles);
          this._collaboratingPropertyIds.set(newCollabIds);
        }
      }

      // Restore active role from localStorage (only if valid)
      const saved = localStorage.getItem(ACTIVE_ROLE_KEY) as UserRole | null;
      if (saved && roles.includes(saved)) {
        this._activeRole.set(saved);
      } else if (roles.length > 0) {
        // Default: prefer 'owner' if available, else first role
        const defaultRole = roles.includes('owner') ? 'owner' : roles[0];
        this._activeRole.set(defaultRole);
      }
    });
  }

  setActiveRole(role: UserRole): void {
    if (this._userRoles().includes(role)) {
      this._activeRole.set(role);
      localStorage.setItem(ACTIVE_ROLE_KEY, role);
    }
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(this.auth, provider);
    if (result.user) {
      const activeRole = await this.handlePostLogin(result.user);
      await this.router.navigate([activeRole === 'tenant' ? '/tenant' : '/dashboard']);
    }
  }

  async logout(): Promise<void> {
    localStorage.removeItem(ACTIVE_ROLE_KEY);
    await signOut(this.auth);
    await this.router.navigate(['/login']);
  }

  private async handlePostLogin(firebaseUser: User): Promise<UserRole> {
    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);
    const snap = await getDoc(userRef);
    const existingData = snap.data();

    const profileBase = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
    };

    // Existing user with new multi-role format
    if (existingData?.['roles'] && Array.isArray(existingData['roles'])) {
      const roles = existingData['roles'] as UserRole[];
      const unitIds: string[] = existingData['unitIds'] ?? [];
      const collaboratingPropertyIds: string[] = existingData['collaboratingPropertyIds'] ?? [];

      this._userRoles.set(roles);
      this._tenantUnitIds.set(unitIds);
      this._collaboratingPropertyIds.set(collaboratingPropertyIds);

      await setDoc(userRef, profileBase, { merge: true });

      const saved = localStorage.getItem(ACTIVE_ROLE_KEY) as UserRole | null;
      const activeRole = saved && roles.includes(saved)
        ? saved
        : (roles.includes('owner') ? 'owner' : roles[0]);
      this._activeRole.set(activeRole);
      return activeRole;
    }

    // Backwards compat: migrate singular role to array format
    if (existingData?.['role']) {
      const oldRole = existingData['role'] as 'owner' | 'tenant';
      const oldUnitId = existingData['unitId'] as string | null;
      const roles: UserRole[] = [oldRole];
      const unitIds = oldUnitId ? [oldUnitId] : [];

      await setDoc(userRef, {
        ...profileBase,
        roles,
        unitIds,
        collaboratingPropertyIds: [],
      }, { merge: true });

      this._userRoles.set(roles);
      this._tenantUnitIds.set(unitIds);
      this._collaboratingPropertyIds.set([]);
      this._activeRole.set(oldRole);
      return oldRole;
    }

    // New user: detect roles from Firestore data
    const email = firebaseUser.email;
    const detectedRoles: UserRole[] = [];
    let unitIds: string[] = [];
    let collaboratingPropertyIds: string[] = [];

    if (email) {
      // Check if tenant by email match in units
      const unitsSnap = await getDocs(
        query(collection(this.firestore, 'units'), where('tenantEmail', '==', email))
      );
      if (!unitsSnap.empty) {
        detectedRoles.push('tenant');
        unitIds = unitsSnap.docs.map(d => d.id);
        // Link tenantUid on all matched units
        for (const unitDoc of unitsSnap.docs) {
          await updateDoc(doc(this.firestore, `units/${unitDoc.id}`), {
            tenantUid: firebaseUser.uid,
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Check if pending colaborador on any property
      const pendingPropsSnap = await getDocs(
        query(
          collection(this.firestore, 'properties'),
          where('pendingCollaboratorEmails', 'array-contains', email)
        )
      );
      if (!pendingPropsSnap.empty) {
        if (!detectedRoles.includes('colaborador')) detectedRoles.push('colaborador');
        collaboratingPropertyIds = pendingPropsSnap.docs.map(d => d.id);
        for (const propDoc of pendingPropsSnap.docs) {
          await updateDoc(doc(this.firestore, `properties/${propDoc.id}`), {
            collaboratorUids: arrayUnion(firebaseUser.uid),
            pendingCollaboratorEmails: (propDoc.data()['pendingCollaboratorEmails'] as string[]).filter(
              e => e !== email
            ),
          });
        }
      }
    }

    // Default to owner if no other roles detected
    if (detectedRoles.length === 0) {
      detectedRoles.push('owner');
    }

    await setDoc(userRef, {
      ...profileBase,
      roles: detectedRoles,
      unitIds,
      collaboratingPropertyIds,
      createdAt: serverTimestamp(),
    }, { merge: true });

    this._userRoles.set(detectedRoles);
    this._tenantUnitIds.set(unitIds);
    this._collaboratingPropertyIds.set(collaboratingPropertyIds);

    // Set active role: prefer owner, else tenant, else first
    const activeRole = detectedRoles.includes('owner')
      ? 'owner'
      : detectedRoles.includes('tenant')
      ? 'tenant'
      : detectedRoles[0];
    this._activeRole.set(activeRole);
    return activeRole;
  }
}
