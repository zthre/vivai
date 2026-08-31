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
  serverTimestamp,
  setDoc,
  getDoc,
  Query,
  DocumentData,
} from '@angular/fire/firestore';
import { Observable, of, switchMap, catchError } from 'rxjs';
import { ServiceAssignment } from '../models/service-assignment.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class ServiceAssignmentService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  /** Degrada a lista vacía ante un fallo: un error propagado a `toSignal` rompe la vista. */
  private safe(q: Query<DocumentData>, label: string): Observable<ServiceAssignment[]> {
    return (collectionData(q, { idField: 'id' }) as Observable<ServiceAssignment[]>).pipe(
      catchError(err => {
        console.error(`[ServiceAssignmentService.${label}]`, err);
        return of([] as ServiceAssignment[]);
      })
    );
  }

  getByService(serviceId: string): Observable<ServiceAssignment[]> {
    const ref = collection(this.firestore, 'serviceAssignments');
    return this.safe(query(ref, where('serviceId', '==', serviceId)), 'getByService');
  }

  getByProperty(propertyId: string): Observable<ServiceAssignment[]> {
    const ref = collection(this.firestore, 'serviceAssignments');
    return this.safe(
      query(ref, where('propertyIds', 'array-contains', propertyId)),
      'getByProperty'
    );
  }

  async save(data: Partial<ServiceAssignment>, id?: string): Promise<string> {
    const uid = this.auth.uid()!;
    if (id) {
      const ref = doc(this.firestore, `serviceAssignments/${id}`);
      await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
      return id;
    }
    const ref = collection(this.firestore, 'serviceAssignments');
    const docRef = await addDoc(ref, {
      ...data,
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `serviceAssignments/${id}`);
    await deleteDoc(ref);
  }
}
