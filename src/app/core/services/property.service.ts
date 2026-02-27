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
  docData,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Property } from '../models/property.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class PropertyService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getAll(): Observable<Property[]> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'properties');
    const q = query(ref, where('ownerId', '==', uid), orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<Property[]>;
  }

  getById(id: string): Observable<Property> {
    const ref = doc(this.firestore, `properties/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Property>;
  }

  async create(data: Omit<Property, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'properties');
    const docRef = await addDoc(ref, {
      ...data,
      ownerId: uid,
      unitCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async update(id: string, data: Partial<Property>): Promise<void> {
    const ref = doc(this.firestore, `properties/${id}`);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `properties/${id}`);
    await deleteDoc(ref);
  }

  async incrementUnitCount(id: string, delta: number): Promise<void> {
    const ref = doc(this.firestore, `properties/${id}`);
    const prop = await import('@angular/fire/firestore').then(m =>
      m.getDoc(ref)
    );
    const current = (prop.data() as Property)?.unitCount ?? 0;
    await updateDoc(ref, { unitCount: current + delta, updatedAt: serverTimestamp() });
  }
}
