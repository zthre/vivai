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
  getDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, switchMap } from 'rxjs';
import { Expense, ExpenseCreate } from '../models/expense.model';
import { guardQuery, loggedWrite } from './firestore-error.util';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

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
        return (collectionData(q, { idField: 'id' }) as Observable<Expense[]>).pipe(
          guardQuery('ExpenseService.getByMonth', [] as Expense[], {
            collection: 'expenses',
            query: `ownerId == ${uid}, date entre ${startDate.toISOString()} y ${endDate.toISOString()}`,
          })
        );
      })
    );
  }

  /** Crea un gasto y devuelve su id. Se atribuye siempre al dueño de la propiedad. */
  async create(data: ExpenseCreate): Promise<string> {
    const uid = this.auth.uid()!;
    const propSnap = await getDoc(doc(this.firestore, `properties/${data.propertyId}`));
    const ownerId = propSnap.data()?.['ownerId'] ?? uid;
    const ref = collection(this.firestore, 'expenses');
    const docRef = await loggedWrite(
      'ExpenseService.create',
      () => addDoc(ref, {
        ...data,
        date: Timestamp.fromDate(data.date),
        ownerId,
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
    }
    await updateDoc(ref, updateData);
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `expenses/${id}`);
    await deleteDoc(ref);
  }
}
