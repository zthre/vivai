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
  serverTimestamp,
  Query,
  DocumentData,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { ServiceAssignment } from '../models/service-assignment.model';
import { collection$ } from './firestore-query.util';
import { AuthService } from '../auth/auth.service';
import { PropertyService } from './property.service';

@Injectable({ providedIn: 'root' })
export class ServiceAssignmentService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private properties = inject(PropertyService);

  /** Degrada a lista vacía ante un fallo: un error propagado a `toSignal` rompe la vista. */
  private safe(q: Query<DocumentData>, label: string, queryDesc: string): Observable<ServiceAssignment[]> {
    return collection$<ServiceAssignment>(q, {
      label: `ServiceAssignmentService.${label}`,
      collection: 'serviceAssignments',
      query: queryDesc,
    });
  }

  getByService(serviceId: string): Observable<ServiceAssignment[]> {
    const ref = collection(this.firestore, 'serviceAssignments');
    return this.safe(
      query(ref, where('serviceId', '==', serviceId)),
      'getByService',
      `serviceId == ${serviceId}`
    );
  }

  getByProperty(propertyId: string): Observable<ServiceAssignment[]> {
    const ref = collection(this.firestore, 'serviceAssignments');
    return this.safe(
      query(ref, where('propertyIds', 'array-contains', propertyId)),
      'getByProperty',
      `propertyIds array-contains ${propertyId}`
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
      memberUids: await this.properties.ownerCircle(uid),
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
