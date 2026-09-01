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
  getDoc,
} from '@angular/fire/firestore';
import { Observable, switchMap } from 'rxjs';
import { Payment } from '../models/payment.model';
import { guardQuery, loggedWrite } from './firestore-error.util';
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
        return (collectionData(q, { idField: 'id' }) as Observable<Payment[]>).pipe(
          guardQuery('PaymentService.getByMonth', [] as Payment[], {
            collection: 'payments',
            query: `ownerId == ${uid}, date entre ${startDate.toISOString()} y ${endDate.toISOString()}`,
          })
        );
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
        return (collectionData(q, { idField: 'id' }) as Observable<Payment[]>).pipe(
          guardQuery('PaymentService.getRecent', [] as Payment[], {
            collection: 'payments',
            query: `ownerId == ${uid}, orderBy createdAt desc, limit ${limitCount}`,
          })
        );
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
    return (collectionData(q, { idField: 'id' }) as Observable<Payment[]>).pipe(
      guardQuery('PaymentService.getByProperty', [] as Payment[], {
        collection: 'payments',
        query: `propertyId == ${propertyId}, orderBy date desc`,
      })
    );
  }

  async create(data: { propertyId: string; amount: number; date: Date; notes: string | null }): Promise<void> {
    const uid = this.auth.uid()!;
    // Always attribute the payment to the property owner (not the colaborador who might be creating it)
    const propSnap = await getDoc(doc(this.firestore, `properties/${data.propertyId}`));
    const ownerId = propSnap.data()?.['ownerId'] ?? uid;
    const ref = collection(this.firestore, 'payments');
    await loggedWrite(
      'PaymentService.create',
      () => addDoc(ref, {
        ...data,
        date: Timestamp.fromDate(data.date),
        ownerId,
        createdBy: uid,
        createdAt: serverTimestamp(),
      }),
      { collection: 'payments', query: `create sobre propertyId ${data.propertyId} (ownerId ${ownerId})` }
    );
  }

  async update(id: string, data: { amount: number; date: Date; notes: string | null }): Promise<void> {
    const ref = doc(this.firestore, `payments/${id}`);
    await loggedWrite(
      'PaymentService.update',
      () => updateDoc(ref, {
        amount: data.amount,
        date: Timestamp.fromDate(data.date),
        notes: data.notes,
      }),
      { collection: 'payments', query: `update payments/${id}` }
    );
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `payments/${id}`);
    await loggedWrite(
      'PaymentService.delete',
      () => deleteDoc(ref),
      { collection: 'payments', query: `delete payments/${id}` }
    );
  }
}
