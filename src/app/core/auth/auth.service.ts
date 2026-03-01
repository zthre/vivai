import { Injectable, inject, computed, effect } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  user,
  User,
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);

  readonly currentUser = toSignal(user(this.auth), { initialValue: null });
  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly uid = computed(() => this.currentUser()?.uid ?? null);

  constructor() {
    // Handle redirect result after Google login
    getRedirectResult(this.auth).then(async result => {
      if (result?.user) {
        await this.saveUserToFirestore(result.user);
        await this.router.navigate(['/dashboard']);
      }
    }).catch(() => {});
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(this.auth, provider);
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    await this.router.navigate(['/login']);
  }

  private async saveUserToFirestore(user: User): Promise<void> {
    const ref = doc(this.firestore, `users/${user.uid}`);
    await setDoc(
      ref,
      {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}
