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
  limit,
  serverTimestamp,
  docData,
  getDoc,
  getDocs,
  arrayUnion,
  arrayRemove,
} from '@angular/fire/firestore';
import { Observable, combineLatest, map } from 'rxjs';
import { Property, PhotoItem } from '../models/property.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class PropertyService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getAll(): Observable<Property[]> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'properties');

    const ownerQuery = query(ref, where('ownerId', '==', uid), orderBy('createdAt', 'desc'));
    const collabQuery = query(ref, where('collaboratorUids', 'array-contains', uid));

    return combineLatest([
      collectionData(ownerQuery, { idField: 'id' }) as Observable<Property[]>,
      collectionData(collabQuery, { idField: 'id' }) as Observable<Property[]>,
    ]).pipe(
      map(([owned, collab]) => {
        const seen = new Set<string>();
        const result: Property[] = [];
        for (const p of [...owned, ...collab]) {
          if (!seen.has(p.id!)) {
            seen.add(p.id!);
            result.push(p);
          }
        }
        return result;
      })
    );
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
      collaboratorUids: [],
      pendingCollaboratorEmails: [],
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

  async addPhoto(propertyId: string, photo: PhotoItem): Promise<void> {
    const ref = doc(this.firestore, `properties/${propertyId}`);
    const snap = await getDoc(ref);
    const current = ((snap.data() as Property)?.photos ?? []) as PhotoItem[];
    await updateDoc(ref, { photos: [...current, photo] });
  }

  async removePhoto(propertyId: string, remainingPhotos: PhotoItem[]): Promise<void> {
    const ref = doc(this.firestore, `properties/${propertyId}`);
    await updateDoc(ref, { photos: remainingPhotos });
  }

  async incrementUnitCount(id: string, delta: number): Promise<void> {
    const ref = doc(this.firestore, `properties/${id}`);
    const prop = await getDoc(ref);
    const current = (prop.data() as Property)?.unitCount ?? 0;
    await updateDoc(ref, { unitCount: current + delta, updatedAt: serverTimestamp() });
  }

  /**
   * Invite a collaborator by email. If the user already has an account,
   * assigns them immediately. Otherwise, queues as pending invitation.
   * Returns 'assigned' if immediately linked, 'pending' if queued.
   */
  async addColaborador(propertyId: string, email: string): Promise<'assigned' | 'pending'> {
    const usersSnap = await getDocs(
      query(collection(this.firestore, 'users'), where('email', '==', email), limit(1))
    );

    if (!usersSnap.empty) {
      const userDoc = usersSnap.docs[0];
      const targetUid = userDoc.id;

      await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
        collaboratorUids: arrayUnion(targetUid),
        updatedAt: serverTimestamp(),
      });

      const userData = userDoc.data();
      const existingRoles: string[] = Array.isArray(userData['roles'])
        ? userData['roles']
        : userData['role'] ? [userData['role']] : ['owner'];

      const updatedRoles = existingRoles.includes('colaborador')
        ? existingRoles
        : [...existingRoles, 'colaborador'];

      await updateDoc(doc(this.firestore, `users/${targetUid}`), {
        collaboratingPropertyIds: arrayUnion(propertyId),
        roles: updatedRoles,
        updatedAt: serverTimestamp(),
      });

      return 'assigned';
    }

    await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
      pendingCollaboratorEmails: arrayUnion(email),
      updatedAt: serverTimestamp(),
    });
    return 'pending';
  }

  async removeColaborador(propertyId: string, uid: string): Promise<void> {
    await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
      collaboratorUids: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(this.firestore, `users/${uid}`), {
      collaboratingPropertyIds: arrayRemove(propertyId),
    });
  }

  async removePendingColaborador(propertyId: string, email: string): Promise<void> {
    await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
      pendingCollaboratorEmails: arrayRemove(email),
      updatedAt: serverTimestamp(),
    });
  }
}
