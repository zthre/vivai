import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  doc,
  getDocs,
} from '@angular/fire/firestore';
import { Observable, map, switchMap } from 'rxjs';
import { AppNotification } from '../models/notification.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getAll(propertyId?: string | null, month?: string | null): Observable<AppNotification[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'notifications');
        const q = query(ref, where('ownerId', '==', uid), orderBy('sentAt', 'desc'));
        return (collectionData(q, { idField: 'id' }) as Observable<AppNotification[]>).pipe(
          map(list => {
            let result = list;
            if (propertyId) result = result.filter(n => n.propertyId === propertyId);
            if (month) {
              result = result.filter(n => {
                const d = n.sentAt.toDate();
                const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                return m === month;
              });
            }
            return result;
          })
        );
      })
    );
  }

  getRecent(count = 5): Observable<AppNotification[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'notifications');
        const q = query(ref, where('ownerId', '==', uid), orderBy('sentAt', 'desc'), limit(count));
        return collectionData(q, { idField: 'id' }) as Observable<AppNotification[]>;
      })
    );
  }

  getUnreadCount(): Observable<number> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'notifications');
        const q = query(ref, where('ownerId', '==', uid), where('viewedByOwner', '==', false));
        return (collectionData(q, { idField: 'id' }) as Observable<AppNotification[]>).pipe(
          map(list => list.length)
        );
      })
    );
  }

  async markAllRead(): Promise<void> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'notifications');
    const q = query(
      ref,
      where('ownerId', '==', uid),
      where('viewedByOwner', '==', false),
      limit(50)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(this.firestore);
    snap.docs.forEach(d =>
      batch.update(doc(this.firestore, `notifications/${d.id}`), { viewedByOwner: true })
    );
    await batch.commit();
  }
}
