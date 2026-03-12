import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
} from '@angular/fire/firestore';
import { Observable, switchMap } from 'rxjs';
import { Payment } from '../models/payment.model';
import { AuthService } from '../auth/auth.service';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getByMonth(startDate: Date, endDate: Date): Observable<Payment[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'payments');
        const q = query(
          ref,
          where('ownerId', '==', uid),
          where('date', '>=', Timestamp.fromDate(startDate)),
          where('date', '<=', Timestamp.fromDate(endDate)),
          orderBy('date', 'desc')
        );
        return collectionData(q, { idField: 'id' }) as Observable<Payment[]>;
      })
    );
  }

  getRecent(limitCount = 5): Observable<Payment[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'payments');
        const q = query(
          ref,
          where('ownerId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
        return collectionData(q, { idField: 'id' }) as Observable<Payment[]>;
      })
    );
  }

  getByProperty(propertyId: string): Observable<Payment[]> {
    const ref = collection(this.firestore, 'payments');
    const q = query(
      ref,
      where('propertyId', '==', propertyId),
      orderBy('date', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Payment[]>;
  }

  async create(data: { propertyId: string; amount: number; date: Date; notes: string | null }): Promise<void> {
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

  async update(id: string, data: { amount: number; date: Date; notes: string | null }): Promise<void> {
    const ref = doc(this.firestore, `payments/${id}`);
    await updateDoc(ref, {
      amount: data.amount,
      date: Timestamp.fromDate(data.date),
      notes: data.notes,
    });
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `payments/${id}`);
    await deleteDoc(ref);
  }
}
