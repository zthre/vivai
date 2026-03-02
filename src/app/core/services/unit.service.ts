import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
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
import { Unit, ContractFile } from '../models/unit.model';
import { PhotoItem } from '../models/property.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class UnitService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getAllOccupied(): Observable<Unit[]> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'units');
    const q = query(ref, where('ownerId', '==', uid), where('status', '==', 'ocupado'));
    return collectionData(q, { idField: 'id' }) as Observable<Unit[]>;
  }

  getByProperty(propertyId: string): Observable<Unit[]> {
    const ref = collection(this.firestore, 'units');
    const q = query(ref, where('propertyId', '==', propertyId), orderBy('number'));
    return collectionData(q, { idField: 'id' }) as Observable<Unit[]>;
  }

  getById(id: string): Observable<Unit> {
    const ref = doc(this.firestore, `units/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Unit>;
  }

  async create(data: Omit<Unit, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'units');
    const docRef = await addDoc(ref, {
      ...data,
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async update(id: string, data: Partial<Unit>): Promise<void> {
    const ref = doc(this.firestore, `units/${id}`);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `units/${id}`);
    await deleteDoc(ref);
  }

  async setContract(unitId: string, contract: ContractFile | null): Promise<void> {
    const ref = doc(this.firestore, `units/${unitId}`);
    await updateDoc(ref, { contract: contract ?? null, updatedAt: serverTimestamp() });
  }

  async addPhoto(unitId: string, photo: PhotoItem): Promise<void> {
    const ref = doc(this.firestore, `units/${unitId}`);
    const snap = await getDoc(ref);
    const current: PhotoItem[] = (snap.data() as any)?.photos ?? [];
    await updateDoc(ref, { photos: [...current, photo], updatedAt: serverTimestamp() });
  }

  async removePhoto(unitId: string, remaining: PhotoItem[]): Promise<void> {
    const ref = doc(this.firestore, `units/${unitId}`);
    await updateDoc(ref, { photos: remaining, updatedAt: serverTimestamp() });
  }
}
