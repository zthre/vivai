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
import { Property, PhotoItem, ColaboradorPermission, ContractFile } from '../models/property.model';
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

  getAllOccupied(): Observable<Property[]> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'properties');
    const q = query(ref, where('ownerId', '==', uid), where('status', '==', 'ocupado'));
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

  async setContract(propertyId: string, contract: ContractFile | null): Promise<void> {
    const ref = doc(this.firestore, `properties/${propertyId}`);
    await updateDoc(ref, { contract: contract ?? null, updatedAt: serverTimestamp() });
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

      const defaultPermission: ColaboradorPermission = {
        inmueblesUnidades: true,
        inmueblesPagos: true,
        inmueblesMedia: true,
        gastos: true,
        tickets: true,
      };

      await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
        collaboratorUids: arrayUnion(targetUid),
        [`collaboratorPermissions.${targetUid}`]: defaultPermission,
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

  /** Add an existing collaborator (by uid) to a single property. */
  async addColaboradorToProperty(propertyId: string, targetUid: string): Promise<void> {
    const defaultPermission: ColaboradorPermission = {
      inmueblesUnidades: true,
      inmueblesPagos: true,
      inmueblesMedia: true,
      gastos: true,
      tickets: true,
    };
    await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
      collaboratorUids: arrayUnion(targetUid),
      [`collaboratorPermissions.${targetUid}`]: defaultPermission,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(this.firestore, `users/${targetUid}`), {
      collaboratingPropertyIds: arrayUnion(propertyId),
    });
  }

  /** Remove a collaborator from a single property. */
  async removeColaboradorFromProperty(propertyId: string, uid: string): Promise<void> {
    await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
      collaboratorUids: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(this.firestore, `users/${uid}`), {
      collaboratingPropertyIds: arrayRemove(propertyId),
    });
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

  async updateColaboradorPermissions(
    propertyId: string,
    uid: string,
    permissions: ColaboradorPermission
  ): Promise<void> {
    await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
      [`collaboratorPermissions.${uid}`]: permissions,
      updatedAt: serverTimestamp(),
    });
  }

  /** Update permissions for a collaborator on ALL of the current owner's properties at once. */
  async updateGlobalCollaboradorPermissions(
    collaboratorUid: string,
    permissions: ColaboradorPermission
  ): Promise<void> {
    const ownerUid = this.auth.uid()!;
    const snap = await getDocs(
      query(collection(this.firestore, 'properties'), where('ownerId', '==', ownerUid))
    );
    await Promise.all(
      snap.docs.map(d =>
        updateDoc(doc(this.firestore, `properties/${d.id}`), {
          [`collaboratorPermissions.${collaboratorUid}`]: permissions,
          updatedAt: serverTimestamp(),
        })
      )
    );
  }

  /** Invite a collaborator globally — adds them to ALL of the current owner's properties. */
  async addGlobalColaborador(email: string): Promise<'assigned' | 'pending'> {
    const ownerUid = this.auth.uid()!;
    const propsSnap = await getDocs(
      query(collection(this.firestore, 'properties'), where('ownerId', '==', ownerUid))
    );

    const defaultPermission: ColaboradorPermission = {
      inmueblesUnidades: true,
      inmueblesPagos: true,
      inmueblesMedia: true,
      gastos: true,
      tickets: true,
    };

    const usersSnap = await getDocs(
      query(collection(this.firestore, 'users'), where('email', '==', email), limit(1))
    );

    if (!usersSnap.empty) {
      const userDoc = usersSnap.docs[0];
      const targetUid = userDoc.id;

      await Promise.all(
        propsSnap.docs.map(d =>
          updateDoc(doc(this.firestore, `properties/${d.id}`), {
            collaboratorUids: arrayUnion(targetUid),
            [`collaboratorPermissions.${targetUid}`]: defaultPermission,
            updatedAt: serverTimestamp(),
          })
        )
      );

      const userData = userDoc.data();
      const existingRoles: string[] = Array.isArray(userData['roles'])
        ? userData['roles']
        : userData['role'] ? [userData['role']] : ['owner'];
      const updatedRoles = existingRoles.includes('colaborador')
        ? existingRoles
        : [...existingRoles, 'colaborador'];

      await updateDoc(doc(this.firestore, `users/${targetUid}`), {
        roles: updatedRoles,
        updatedAt: serverTimestamp(),
      });
      for (const d of propsSnap.docs) {
        await updateDoc(doc(this.firestore, `users/${targetUid}`), {
          collaboratingPropertyIds: arrayUnion(d.id),
        });
      }
      return 'assigned';
    }

    // Pending: add email to all owned properties
    await Promise.all(
      propsSnap.docs.map(d =>
        updateDoc(doc(this.firestore, `properties/${d.id}`), {
          pendingCollaboratorEmails: arrayUnion(email),
          updatedAt: serverTimestamp(),
        })
      )
    );
    return 'pending';
  }

  /** Remove a collaborator from ALL of the current owner's properties. */
  async removeGlobalColaborador(collaboratorUid: string): Promise<void> {
    const ownerUid = this.auth.uid()!;
    const snap = await getDocs(
      query(collection(this.firestore, 'properties'), where('ownerId', '==', ownerUid))
    );
    await Promise.all(
      snap.docs.map(d =>
        updateDoc(doc(this.firestore, `properties/${d.id}`), {
          collaboratorUids: arrayRemove(collaboratorUid),
          updatedAt: serverTimestamp(),
        })
      )
    );
    for (const d of snap.docs) {
      await updateDoc(doc(this.firestore, `users/${collaboratorUid}`), {
        collaboratingPropertyIds: arrayRemove(d.id),
      });
    }
  }

  /** Cancel a pending invitation globally — removes email from ALL owned properties. */
  async removePendingGlobalColaborador(email: string): Promise<void> {
    const ownerUid = this.auth.uid()!;
    const snap = await getDocs(
      query(collection(this.firestore, 'properties'), where('ownerId', '==', ownerUid))
    );
    await Promise.all(
      snap.docs.map(d =>
        updateDoc(doc(this.firestore, `properties/${d.id}`), {
          pendingCollaboratorEmails: arrayRemove(email),
          updatedAt: serverTimestamp(),
        })
      )
    );
  }
}
