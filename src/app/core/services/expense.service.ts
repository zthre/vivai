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
  Timestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Expense, ExpenseCreate } from '../models/expense.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getByMonth(startDate: Date, endDate: Date): Observable<Expense[]> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'expenses');
    const q = query(
      ref,
      where('ownerId', '==', uid),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Expense[]>;
  }

  async create(data: ExpenseCreate): Promise<void> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'expenses');
    await addDoc(ref, {
      ...data,
      date: Timestamp.fromDate(data.date),
      ownerId: uid,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
  }

  async update(id: string, data: Partial<ExpenseCreate>): Promise<void> {
    const ref = doc(this.firestore, `expenses/${id}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
