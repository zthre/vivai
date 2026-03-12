import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Service } from '../models/service.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class UtilityServiceService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getAll(): Observable<Service[]> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'services');
    const q = query(ref, where('ownerId', '==', uid), orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<Service[]>;
  }

  getById(id: string): Observable<Service> {
    const ref = doc(this.firestore, `services/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Service>;
  }

  async create(data: Partial<Service>): Promise<string> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'services');
    const docRef = await addDoc(ref, {
      ...data,
      ownerId: uid,
      isActive: data.isActive ?? true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async update(id: string, data: Partial<Service>): Promise<void> {
    const ref = doc(this.firestore, `services/${id}`);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `services/${id}`);
    await deleteDoc(ref);
  }
}
