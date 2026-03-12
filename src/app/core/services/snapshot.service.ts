import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  orderBy,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MonthlySnapshot } from '../models/monthly-snapshot.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class SnapshotService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private auth = inject(AuthService);

  getByYear(year: number, propertyId?: string | null): Observable<MonthlySnapshot[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'monthlySnapshots');
        const q = query(
          ref,
          where('ownerId', '==', uid),
          where('month', '>=', `${year}-01`),
          where('month', '<=', `${year}-12`),
          orderBy('month', 'asc')
        );
        return (collectionData(q, { idField: 'id' }) as Observable<MonthlySnapshot[]>).pipe(
          catchError(() => of([]))
        );
      })
    );
  }

  async regenerateSnapshots(year: number): Promise<void> {
    const fn = httpsCallable<{ year: number }, void>(this.functions, 'generateMonthlySnapshotManual');
    await fn({ year });
  }

  async exportReport(params: {
    startMonth: string;
    endMonth: string;
    propertyId?: string | null;
    format: 'csv' | 'xlsx';
  }): Promise<string> {
    const fn = httpsCallable<typeof params, { url: string }>(this.functions, 'exportReport');
    const result = await fn(params);
    return result.data.url;
  }
}
