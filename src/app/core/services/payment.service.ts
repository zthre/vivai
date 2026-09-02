import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
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
import { loggedWrite } from './firestore-error.util';
import { collection$ } from './firestore-query.util';
import { AuthService } from '../auth/auth.service';
import { PropertyService } from './property.service';
import { monthKey } from '../utils/month.util';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private properties = inject(PropertyService);

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
        return collection$<Payment>(q, {
          label: 'PaymentService.getByMonth',
          collection: 'payments',
          query: `ownerId == ${uid}, date entre ${startDate.toISOString()} y ${endDate.toISOString()}`,
        });
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
        return collection$<Payment>(q, {
          label: 'PaymentService.getRecent',
          collection: 'payments',
          query: `ownerId == ${uid}, orderBy createdAt desc, limit ${limitCount}`,
        });
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
    return collection$<Payment>(q, {
      label: 'PaymentService.getByProperty',
      collection: 'payments',
      query: `propertyId == ${propertyId}, orderBy date desc`,
    });
  }

  /**
   * Pagos del mes en todo el círculo del usuario: una consulta en lugar del
   * abanico de `getByProperty` por propiedad.
   *
   * Sustituye a la vez dos cosas: la consulta por `ownerId` —que no servía a los
   * colaboradores, y por eso las pantallas acabaron abriendo una consulta por
   * propiedad— y el filtro de mes en memoria sobre el historial completo.
   *
   * Depende de que todo documento tenga `memberUids` y `period`: uno sin ellos
   * queda fuera y las cifras salen de menos. El backfill los rellenó y los
   * triggers los mantienen, pero si algún día aparece un camino de escritura
   * nuevo, tiene que sellar ambos campos.
   */
  getByCircleAndPeriod(period: string): Observable<Payment[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const q = query(
          collection(this.firestore, 'payments'),
          where('memberUids', 'array-contains', uid),
          where('period', '==', period)
        );
        return collection$<Payment>(q, {
          label: 'PaymentService.getByCircleAndPeriod',
          collection: 'payments',
          query: `memberUids array-contains ${uid}, period == ${period}`,
        });
      })
    );
  }

  async create(data: { propertyId: string; amount: number; date: Date; notes: string | null }): Promise<void> {
    const uid = this.auth.uid()!;
    // Always attribute the payment to the property owner (not the colaborador who might be creating it)
    const ownerId = await this.properties.ownerIdOf(data.propertyId, uid);
    const memberUids = await this.properties.memberUidsOf(data.propertyId, ownerId);
    const ref = collection(this.firestore, 'payments');
    await loggedWrite(
      'PaymentService.create',
      () => addDoc(ref, {
        ...data,
        date: Timestamp.fromDate(data.date),
        period: monthKey(data.date),
        ownerId,
        memberUids,
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
        // `period` se deriva de `date`: si no se recalcula aquí, corregir la fecha
        // de un pago lo deja anotado en un mes y contando en otro.
        period: monthKey(data.date),
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
