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
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, switchMap } from 'rxjs';
import { Expense, ExpenseCreate } from '../models/expense.model';
import { loggedWrite } from './firestore-error.util';
import { collection$ } from './firestore-query.util';
import { AuthService } from '../auth/auth.service';
import { PropertyService } from './property.service';
import { monthKey } from '../utils/month.util';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private properties = inject(PropertyService);

  getByMonth(startDate: Date, endDate: Date): Observable<Expense[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'expenses');
        const q = query(
          ref,
          where('ownerId', '==', uid),
          where('date', '>=', Timestamp.fromDate(startDate)),
          where('date', '<=', Timestamp.fromDate(endDate)),
          orderBy('date', 'desc')
        );
        return collection$<Expense>(q, {
          label: 'ExpenseService.getByMonth',
          collection: 'expenses',
          query: `ownerId == ${uid}, date entre ${startDate.toISOString()} y ${endDate.toISOString()}`,
        });
      })
    );
  }

  /**
   * Gastos del mes en todo el círculo. Ver `PaymentService.getByCircleAndPeriod`:
   * todavía sin usar, depende del backfill.
   */
  getByCircleAndPeriod(period: string): Observable<Expense[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const q = query(
          collection(this.firestore, 'expenses'),
          where('memberUids', 'array-contains', uid),
          where('period', '==', period)
        );
        return collection$<Expense>(q, {
          label: 'ExpenseService.getByCircleAndPeriod',
          collection: 'expenses',
          query: `memberUids array-contains ${uid}, period == ${period}`,
        });
      })
    );
  }

  /** Crea un gasto y devuelve su id. Se atribuye siempre al dueño de la propiedad. */
  async create(data: ExpenseCreate): Promise<string> {
    const uid = this.auth.uid()!;
    const ownerId = await this.properties.ownerIdOf(data.propertyId, uid);
    const memberUids = await this.properties.memberUidsOf(data.propertyId, ownerId);
    const ref = collection(this.firestore, 'expenses');
    const docRef = await loggedWrite(
      'ExpenseService.create',
      () => addDoc(ref, {
        ...data,
        date: Timestamp.fromDate(data.date),
        period: monthKey(data.date),
        ownerId,
        memberUids,
        createdBy: uid,
        createdAt: serverTimestamp(),
      }),
      { collection: 'expenses', query: `create sobre propertyId ${data.propertyId} (ownerId ${ownerId})` }
    );
    return docRef.id;
  }

  async update(id: string, data: Partial<ExpenseCreate>): Promise<void> {
    const ref = doc(this.firestore, `expenses/${id}`);
    const updateData: any = { ...data };
    if (data.date) {
      updateData['date'] = Timestamp.fromDate(data.date);
      // `period` se deriva de `date`. Importa especialmente aquí: cuando se mueve
      // de mes un recibo de servicio ya pagado, esto es lo que arrastra su gasto.
      updateData['period'] = monthKey(data.date);
    }
    await updateDoc(ref, updateData);
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `expenses/${id}`);
    await deleteDoc(ref);
  }
}
