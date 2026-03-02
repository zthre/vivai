import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Payment } from '../models/payment.model';
import { AuthService } from '../auth/auth.service';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getByMonth(startDate: Date, endDate: Date): Observable<Payment[]> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'payments');
    const q = query(
      ref,
      where('ownerId', '==', uid),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Payment[]>;
  }

  getByUnit(unitId: string): Observable<Payment[]> {
    const ref = collection(this.firestore, 'payments');
    const q = query(ref, where('unitId', '==', unitId), orderBy('date', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<Payment[]>;
  }

  getRecent(limitCount = 5): Observable<Payment[]> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'payments');
    const q = query(
      ref,
      where('ownerId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    return collectionData(q, { idField: 'id' }) as Observable<Payment[]>;
  }

  getByProperty(propertyId: string): Observable<Payment[]> {
    const ref = collection(this.firestore, 'payments');
    // No orderBy here — composite index (propertyId + unitId + date) may not exist.
    // Sort client-side to avoid silent query failure.
    const q = query(
      ref,
      where('propertyId', '==', propertyId),
      where('unitId', '==', null)
    );
    return (collectionData(q, { idField: 'id' }) as Observable<Payment[]>).pipe(
      map(payments => payments.sort((a, b) => {
        const aMs = (a.date as any)?.toMillis?.() ?? 0;
        const bMs = (b.date as any)?.toMillis?.() ?? 0;
        return bMs - aMs;
      }))
    );
  }

  async create(data: { unitId: string | null; propertyId: string; amount: number; date: Date; notes: string | null }): Promise<void> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'payments');
    await addDoc(ref, {
      ...data,
      date: Timestamp.fromDate(data.date),
      ownerId: uid,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
  }
}
