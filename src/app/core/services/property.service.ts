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
import { Observable, combineLatest, map, switchMap, startWith } from 'rxjs';
import { Property, PhotoItem, ColaboradorPermission, ContractFile } from '../models/property.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class PropertyService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getAll(): Observable<Property[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'properties');
        const ownerQuery = query(ref, where('ownerId', '==', uid), orderBy('createdAt', 'desc'));
        const collabQuery = query(ref, where('collaboratorUids', 'array-contains', uid));

        return combineLatest([
          (collectionData(ownerQuery, { idField: 'id' }) as Observable<Property[]>).pipe(startWith([] as Property[])),
          (collectionData(collabQuery, { idField: 'id' }) as Observable<Property[]>).pipe(startWith([] as Property[])),
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
      })
    );
  }

  getAllOccupied(): Observable<Property[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'properties');
        const q = query(ref, where('ownerId', '==', uid), where('status', '==', 'ocupado'));
        return collectionData(q, { idField: 'id' }) as Observable<Property[]>;
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
   * Remove tenant from a property and clean up the tenant's user document.
   */
  async removeTenant(propertyId: string): Promise<void> {
    const propRef = doc(this.firestore, `properties/${propertyId}`);
    const propSnap = await getDoc(propRef);
    const propData = propSnap.data() as Property | undefined;
    const tenantUid = propData?.tenantUid;

    await updateDoc(propRef, {
      tenantName: null,
      tenantPhone: null,
      tenantEmail: null,
      tenantUid: null,
      tenantRentPrice: null,
      status: 'disponible',
      updatedAt: serverTimestamp(),
    });

    if (tenantUid) {
      const userRef = doc(this.firestore, `users/${tenantUid}`);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      if (userData) {
        const currentPropertyIds: string[] = Array.isArray(userData['propertyIds'])
          ? userData['propertyIds']
          : [];
        const newPropertyIds = currentPropertyIds.filter(id => id !== propertyId);

        const currentRoles: string[] = Array.isArray(userData['roles'])
          ? userData['roles']
          : [];
        const newRoles = newPropertyIds.length > 0
          ? currentRoles
          : currentRoles.filter(r => r !== 'tenant');

        await updateDoc(userRef, {
          propertyIds: newPropertyIds,
          roles: newRoles,
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  /**
   * Assign a tenant to a property. If the tenant email matches an existing user,
   * links them automatically.
   */
  async assignTenant(
    propertyId: string,
    tenant: { name: string; phone?: string; email?: string; rentPrice?: number; residentCount?: number }
  ): Promise<'linked' | 'saved'> {
    const propRef = doc(this.firestore, `properties/${propertyId}`);

    const payload: any = {
      tenantName: tenant.name || null,
      tenantPhone: tenant.phone || null,
      tenantEmail: tenant.email || null,
      tenantRentPrice: tenant.rentPrice || null,
      residentCount: tenant.residentCount || 1,
      status: 'ocupado',
      updatedAt: serverTimestamp(),
    };

    if (tenant.email) {
      const usersSnap = await getDocs(
        query(collection(this.firestore, 'users'), where('email', '==', tenant.email), limit(1))
      );
      if (!usersSnap.empty) {
        const userDoc = usersSnap.docs[0];
        const targetUid = userDoc.id;
        payload.tenantUid = targetUid;

        const userData = userDoc.data();
        const existingRoles: string[] = Array.isArray(userData['roles'])
          ? userData['roles']
          : userData['role'] ? [userData['role']] : ['owner'];
        const updatedRoles = existingRoles.includes('tenant')
          ? existingRoles
          : [...existingRoles, 'tenant'];

        await updateDoc(doc(this.firestore, `users/${targetUid}`), {
          propertyIds: arrayUnion(propertyId),
          roles: updatedRoles,
          updatedAt: serverTimestamp(),
        });

        await updateDoc(propRef, payload);
        return 'linked';
      }
    }

    await updateDoc(propRef, payload);
    return 'saved';
  }

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
