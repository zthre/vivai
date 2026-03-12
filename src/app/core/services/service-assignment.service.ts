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
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { ServiceAssignment } from '../models/service-assignment.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class ServiceAssignmentService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getByService(serviceId: string): Observable<ServiceAssignment[]> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'serviceAssignments');
    const q = query(ref, where('ownerId', '==', uid), where('serviceId', '==', serviceId));
    return collectionData(q, { idField: 'id' }) as Observable<ServiceAssignment[]>;
  }

  getByProperty(propertyId: string): Observable<ServiceAssignment[]> {
    const ref = collection(this.firestore, 'serviceAssignments');
    const q = query(ref, where('propertyIds', 'array-contains', propertyId));
    return collectionData(q, { idField: 'id' }) as Observable<ServiceAssignment[]>;
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
