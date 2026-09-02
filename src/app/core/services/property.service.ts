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
  writeBatch,
  WriteBatch,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, combineLatest, map, of, switchMap, startWith, shareReplay } from 'rxjs';
import { guardQuery } from './firestore-error.util';
import {
  Property,
  PhotoItem,
  ColaboradorPermission,
  ContractFile,
  propertyMemberUids,
} from '../models/property.model';
import { AuthService } from '../auth/auth.service';
import { LeaseService } from './lease.service';
import { CollaboratorService } from './collaborator.service';
import { logFirestoreError } from './firestore-error.util';
import { DEFAULT_COLABORADOR_PERMISSIONS } from '../auth/permissions';
import { listingExpiryFrom } from './listing.util';

/** Tope de operaciones por lote en Firestore. */
const BATCH_LIMIT = 500;

/** Ventana de memoización de `snapshot()`: cubre la ráfaga de una acción, no más. */
const SNAPSHOT_TTL_MS = 5_000;

@Injectable({ providedIn: 'root' })
export class PropertyService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private leases = inject(LeaseService);
  private collaborators = inject(CollaboratorService);

  private snapshotCache = new Map<string, { value: Property | null; at: number }>();

  /**
   * Fuente única de las propiedades visibles para el usuario en sesión.
   *
   * `getAll()` se invoca desde dieciocho sitios. Sin compartir, cada componente
   * abría su propio par de listeners sobre `properties` y volvía a pagar las
   * lecturas: navegar Dashboard → Inmuebles → Finanzas abría y cerraba seis
   * suscripciones sobre la misma colección.
   *
   * `refCount: false` mantiene viva la suscripción entre navegaciones —que es
   * justo el caso que se quiere evitar—, y por eso `buildAll()` se apoya en
   * `uidOrNull$`: al cerrar sesión hay que SOLTAR los listeners, no dejarlos
   * consultando con el uid anterior.
   */
  private readonly properties$: Observable<Property[]> = this.buildAll().pipe(
    shareReplay({ bufferSize: 1, refCount: false })
  );

  getAll(): Observable<Property[]> {
    return this.properties$;
  }

  private buildAll(): Observable<Property[]> {
    return this.auth.uidOrNull$.pipe(
      switchMap(uid => {
        // Sesión cerrada: se devuelve lista vacía, y eso cancela las consultas
        // anteriores. Sin esto, los listeners seguían vivos con el uid de la
        // sesión anterior y Firestore los denegaba al perderse el token.
        if (!uid) return of([] as Property[]);

        const ref = collection(this.firestore, 'properties');
        const ownerQuery = query(ref, where('ownerId', '==', uid), orderBy('createdAt', 'desc'));
        const collabQuery = query(ref, where('collaboratorUids', 'array-contains', uid));

        // Si una de las dos consultas falla, la otra debe seguir sirviendo:
        // un error propagado hasta `toSignal` rompe la pantalla completa.
        const owned$: Observable<Property[]> = (
          collectionData(ownerQuery, { idField: 'id' }) as Observable<Property[]>
        ).pipe(
          guardQuery('PropertyService.getAll:owned', [] as Property[], {
            collection: 'properties',
            query: `ownerId == ${uid}, orderBy createdAt desc`,
          }),
          startWith([] as Property[])
        );

        const collab$: Observable<Property[]> = (
          collectionData(collabQuery, { idField: 'id' }) as Observable<Property[]>
        ).pipe(
          guardQuery('PropertyService.getAll:collab', [] as Property[], {
            collection: 'properties',
            query: `collaboratorUids array-contains ${uid}`,
          }),
          startWith([] as Property[])
        );

        return combineLatest([owned$, collab$]).pipe(
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

  /**
   * Lectura puntual de una propiedad, memoizada durante unos segundos.
   *
   * Pagos, gastos, recibos y servicios necesitan resolver el dueño (y a veces el
   * nombre) de la propiedad antes de escribir, y cada uno lo hacía con su propio
   * `getDoc`: registrar un recibo pagado leía la misma propiedad tres veces
   * seguidas. La ventana es corta a propósito — resuelve la ráfaga de una acción
   * sin llegar a servir datos rancios en la siguiente.
   */
  async snapshot(id: string): Promise<Property | null> {
    const cached = this.snapshotCache.get(id);
    if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.value;

    const snap = await getDoc(doc(this.firestore, `properties/${id}`));
    const value = snap.exists() ? ({ id: snap.id, ...snap.data() } as Property) : null;
    this.snapshotCache.set(id, { value, at: Date.now() });
    return value;
  }

  /** Dueño de una propiedad, o `fallback` si ya no existe. */
  async ownerIdOf(propertyId: string, fallback: string): Promise<string> {
    return (await this.snapshot(propertyId))?.ownerId ?? fallback;
  }

  /**
   * Círculo de una propiedad, para sellarlo en los documentos que cuelgan de ella.
   *
   * Si la propiedad ya no existe se cae al uid de quien escribe: mejor un documento
   * legible solo por su autor que uno con `memberUids` vacío, que sería ilegible
   * para todos en cuanto las reglas dependan del campo.
   */
  async memberUidsOf(propertyId: string, fallback: string): Promise<string[]> {
    const prop = await this.snapshot(propertyId);
    return prop ? propertyMemberUids(prop) : [fallback];
  }

  /**
   * Círculo del dueño: él y todos sus colaboradores, en cualquiera de sus
   * propiedades.
   *
   * Es el ámbito de los documentos que NO cuelgan de una propiedad concreta
   * —`services` y `serviceAssignments`—, que por eso no podían expresarse en las
   * reglas y acabaron con lectura abierta a cualquier autenticado.
   */
  async ownerCircle(ownerId: string): Promise<string[]> {
    const snap = await getDocs(
      query(collection(this.firestore, 'properties'), where('ownerId', '==', ownerId))
    );
    const uids = new Set<string>([ownerId]);
    for (const d of snap.docs) {
      for (const uid of ((d.data() as Property).collaboratorUids ?? [])) uids.add(uid);
    }
    return [...uids].filter(Boolean);
  }

  /** Nombre de una propiedad, o su id si ya no existe. */
  async nameOf(propertyId: string): Promise<string> {
    return (await this.snapshot(propertyId))?.name ?? propertyId;
  }

  /** Invalida la memoización tras escribir sobre una propiedad. */
  private forget(id: string): void {
    this.snapshotCache.delete(id);
  }

  async create(data: Omit<Property, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'properties');
    const docRef = await addDoc(ref, {
      ...data,
      ownerId: uid,
      collaboratorUids: [],
      memberUids: [uid],
      pendingCollaboratorEmails: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async update(id: string, data: Partial<Property>): Promise<void> {
    const ref = doc(this.firestore, `properties/${id}`);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    this.forget(id);
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `properties/${id}`);
    await deleteDoc(ref);
    this.forget(id);
  }

  /**
   * Publica (o republica) la propiedad en el marketplace por LISTING_DURATION_DAYS días.
   * No hay renovación automática: siempre es una acción explícita del usuario.
   */
  async republishListing(id: string): Promise<void> {
    const now = new Date();
    await updateDoc(doc(this.firestore, `properties/${id}`), {
      isPublic: true,
      publishedAt: Timestamp.fromDate(now),
      listingExpiresAt: Timestamp.fromDate(listingExpiryFrom(now)),
      listingExpiredAt: null,
      updatedAt: serverTimestamp(),
    });
  }

  /** Retira la publicación del marketplace sin borrar la propiedad. */
  async unpublishListing(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, `properties/${id}`), {
      isPublic: false,
      listingExpiredAt: Timestamp.now(),
      updatedAt: serverTimestamp(),
    });
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

    // El arrendamiento se cierra con la fecha de hoy y queda en el historial.
    await this.leases.closeActive(propertyId).catch(err =>
      logFirestoreError('PropertyService.removeTenant', err, {
        collection: 'leases',
        query: `closeActive propertyId ${propertyId}`,
      })
    );

    await updateDoc(propRef, {
      tenantName: null,
      tenantPhone: null,
      tenantEmail: null,
      tenantUid: null,
      tenantRentPrice: null,
      activeLeaseId: null,
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
        await this.openLease(propertyId, tenant, targetUid);
        return 'linked';
      }
    }

    await updateDoc(propRef, payload);
    await this.openLease(propertyId, tenant, null);
    return 'saved';
  }

  /**
   * Abre el arrendamiento correspondiente a la asignación y lo enlaza.
   *
   * `LeaseService` cierra solo el anterior, así que asignar un inquilino nuevo
   * termina el que hubiera — que es como ya funcionaba, solo que ahora el
   * anterior queda registrado en vez de desaparecer.
   *
   * Si esto falla, la asignación NO se deshace: el inquilino queda bien puesto en
   * la propiedad y solo se pierde la entrada de historial, que es el mal menor.
   */
  private async openLease(
    propertyId: string,
    tenant: { name: string; phone?: string; email?: string; rentPrice?: number; residentCount?: number },
    tenantUid: string | null
  ): Promise<void> {
    try {
      const prop = await this.snapshot(propertyId);
      const ownerId = prop?.ownerId ?? this.auth.uid()!;
      const leaseId = await this.leases.open({
        propertyId,
        ownerId,
        memberUids: prop ? propertyMemberUids(prop) : [ownerId],
        tenantName: tenant.name || null,
        tenantPhone: tenant.phone || null,
        tenantEmail: tenant.email || null,
        tenantUid,
        rentPrice: tenant.rentPrice ?? null,
        residentCount: tenant.residentCount ?? 1,
        paymentDueDay: prop?.paymentDueDay ?? null,
        paymentFree: prop?.paymentFree ?? false,
      });
      await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
        activeLeaseId: leaseId,
        updatedAt: serverTimestamp(),
      });
      this.forget(propertyId);
    } catch (err) {
      logFirestoreError('PropertyService.openLease', err, {
        collection: 'leases',
        query: `open sobre propertyId ${propertyId}`,
      });
    }
  }

  // ── Colaboradores ─────────────────────────────────────────────────────────

  async addColaborador(propertyId: string, email: string): Promise<'assigned' | 'pending'> {
    const targetUid = await this.uidByEmail(email);

    if (!targetUid) {
      await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
        pendingCollaboratorEmails: arrayUnion(email),
        updatedAt: serverTimestamp(),
      });
      return 'pending';
    }

    await this.addColaboradorToProperty(propertyId, targetUid);
    await this.grantColaboradorRole(targetUid);
    return 'assigned';
  }

  async addColaboradorToProperty(propertyId: string, targetUid: string): Promise<void> {
    const ownerId = await this.ownerIdOf(propertyId, this.auth.uid()!);
    await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
      collaboratorUids: arrayUnion(targetUid),
      // El círculo completo, NO `arrayUnion(targetUid)`: sobre una propiedad
      // anterior al backfill, que aún no tiene el campo, `arrayUnion` lo crearía
      // con solo el colaborador dentro y dejaría fuera al dueño.
      memberUids: await this.circleWith(propertyId, targetUid),
      updatedAt: serverTimestamp(),
    });
    await this.collaborators.setPermissions(
      ownerId, targetUid, DEFAULT_COLABORADOR_PERMISSIONS
    );
    await updateDoc(doc(this.firestore, `users/${targetUid}`), {
      collaboratingPropertyIds: arrayUnion(propertyId),
      // El dueño de ESTA propiedad, no quien ejecuta la acción: un colaborador
      // con permiso puede estar dando de alta a otro.
      ownerUids: arrayUnion(await this.ownerIdOf(propertyId, this.auth.uid()!)),
    });
    this.forget(propertyId);
  }

  async removeColaboradorFromProperty(propertyId: string, uid: string): Promise<void> {
    const ownerId = await this.ownerIdOf(propertyId, this.auth.uid()!);
    await updateDoc(doc(this.firestore, `properties/${propertyId}`), {
      collaboratorUids: arrayRemove(uid),
      // Igual que al añadir: se escribe el círculo entero. `arrayRemove` sobre un
      // documento sin el campo lo dejaría en `[]`, sin el dueño.
      memberUids: await this.circleWithout(propertyId, uid),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(this.firestore, `users/${uid}`), {
      collaboratingPropertyIds: arrayRemove(propertyId),
    });
    this.forget(propertyId);
    await this.dropOwnerIfLastProperty(uid, ownerId);
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
    this.forget(propertyId);
  }

  // ── Colaboradores globales ────────────────────────────────────────────────
  //
  // Un colaborador se da de alta sobre todas las propiedades del dueño a la vez.
  // Antes cada uno de estos métodos recorría las propiedades con `updateDoc`
  // sueltos —y dos de ellos en un `for` secuencial—: con veinte inmuebles eran
  // cuarenta escrituras sin atomicidad, y un fallo a mitad de camino dejaba al
  // colaborador con permisos distintos según la propiedad, sin aviso. Ahora van
  // en lotes atómicos y el documento del usuario se toca una sola vez.

  /**
   * Cambia los permisos de un colaborador. UNA escritura.
   *
   * Antes recorría todas las propiedades del dueño escribiendo el mismo objeto
   * en cada una: con catorce inmuebles, catorce escrituras que además podían
   * quedarse a medias.
   */
  async updateGlobalCollaboradorPermissions(
    collaboratorUid: string,
    permissions: ColaboradorPermission
  ): Promise<void> {
    await this.collaborators.setPermissions(this.auth.uid()!, collaboratorUid, permissions);
  }

  async addGlobalColaborador(email: string): Promise<'assigned' | 'pending'> {
    const ownerUid = this.auth.uid()!;
    const ids = await this.ownedPropertyIds();
    const targetUid = await this.uidByEmail(email);

    if (!targetUid) {
      await this.batched(ids, (batch, id) =>
        batch.update(doc(this.firestore, `properties/${id}`), {
          pendingCollaboratorEmails: arrayUnion(email),
          updatedAt: serverTimestamp(),
        })
      );
      return 'pending';
    }

    await this.batched(ids, (batch, id) =>
      batch.update(doc(this.firestore, `properties/${id}`), {
        collaboratorUids: arrayUnion(targetUid),
        // Se incluye al dueño explícitamente: en una propiedad anterior al
        // backfill el campo no existe, y `arrayUnion(targetUid)` a secas lo
        // crearía sin él.
        memberUids: arrayUnion(ownerUid, targetUid),
        updatedAt: serverTimestamp(),
      })
    );
    await this.collaborators.setPermissions(
      ownerUid, targetUid, DEFAULT_COLABORADOR_PERMISSIONS
    );

    // `arrayUnion` admite varios valores: una escritura en vez de una por propiedad.
    await this.grantColaboradorRole(targetUid, ids, ownerUid);
    ids.forEach(id => this.forget(id));
    return 'assigned';
  }

  async removeGlobalColaborador(collaboratorUid: string): Promise<void> {
    const ownerUid = this.auth.uid()!;
    const ids = await this.ownedPropertyIds();
    await this.batched(ids, (batch, id) =>
      batch.update(doc(this.firestore, `properties/${id}`), {
        collaboratorUids: arrayRemove(collaboratorUid),
        memberUids: arrayRemove(collaboratorUid),
        updatedAt: serverTimestamp(),
      })
    );
    await this.collaborators.remove(ownerUid, collaboratorUid);
    if (ids.length > 0) {
      await updateDoc(doc(this.firestore, `users/${collaboratorUid}`), {
        collaboratingPropertyIds: arrayRemove(...ids),
        // Se le retira de todas las propiedades de este dueño a la vez, así que
        // el dueño deja de poder ver su perfil.
        ownerUids: arrayRemove(ownerUid),
      });
    }
    ids.forEach(id => this.forget(id));
  }

  async removePendingGlobalColaborador(email: string): Promise<void> {
    const ids = await this.ownedPropertyIds();
    await this.batched(ids, (batch, id) =>
      batch.update(doc(this.firestore, `properties/${id}`), {
        pendingCollaboratorEmails: arrayRemove(email),
        updatedAt: serverTimestamp(),
      })
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Si `uid` ya no colabora en ninguna propiedad de `ownerId`, le quita ese dueño
   * de `ownerUids` — y con ello el acceso del dueño a su perfil.
   */
  private async dropOwnerIfLastProperty(uid: string, ownerId: string): Promise<void> {
    const snap = await getDocs(
      query(
        collection(this.firestore, 'properties'),
        where('ownerId', '==', ownerId),
        where('collaboratorUids', 'array-contains', uid)
      )
    );
    if (!snap.empty) return;
    await updateDoc(doc(this.firestore, `users/${uid}`), {
      ownerUids: arrayRemove(ownerId),
    }).catch(() => void 0);
  }

  /** Círculo de una propiedad con `uid` añadido. */
  private async circleWith(propertyId: string, uid: string): Promise<string[]> {
    const prop = await this.snapshot(propertyId);
    const base = prop ? propertyMemberUids(prop) : [];
    return [...new Set([...base, uid])].filter(Boolean);
  }

  /** Círculo de una propiedad sin `uid`. El dueño nunca sale, aunque se pida. */
  private async circleWithout(propertyId: string, uid: string): Promise<string[]> {
    const prop = await this.snapshot(propertyId);
    if (!prop) return [];
    return propertyMemberUids(prop).filter(u => u === prop.ownerId || u !== uid);
  }

  /** Ids de las propiedades de las que el usuario en sesión es dueño. */
  private async ownedPropertyIds(): Promise<string[]> {
    const ownerUid = this.auth.uid()!;
    const snap = await getDocs(
      query(collection(this.firestore, 'properties'), where('ownerId', '==', ownerUid))
    );
    return snap.docs.map(d => d.id);
  }

  /** Uid del usuario con ese correo, o `null` si aún no se ha registrado. */
  private async uidByEmail(email: string): Promise<string | null> {
    const snap = await getDocs(
      query(collection(this.firestore, 'users'), where('email', '==', email), limit(1))
    );
    return snap.empty ? null : snap.docs[0].id;
  }

  /**
   * Añade el rol `colaborador` al usuario (sin quitarle los que ya tenga) y, si
   * se indican, las propiedades en las que colabora.
   *
   * Contempla los documentos antiguos con `role` en singular, que el resto de la
   * app ya migra al iniciar sesión.
   */
  private async grantColaboradorRole(
    targetUid: string,
    propertyIds: string[] = [],
    ownerUid?: string
  ): Promise<void> {
    const userSnap = await getDoc(doc(this.firestore, `users/${targetUid}`));
    const userData = userSnap.data() ?? {};
    const existingRoles: string[] = Array.isArray(userData['roles'])
      ? userData['roles']
      : userData['role'] ? [userData['role']] : ['owner'];
    const roles = existingRoles.includes('colaborador')
      ? existingRoles
      : [...existingRoles, 'colaborador'];

    const payload: Record<string, any> = { roles, updatedAt: serverTimestamp() };
    if (propertyIds.length > 0) {
      payload['collaboratingPropertyIds'] = arrayUnion(...propertyIds);
    }
    if (ownerUid) payload['ownerUids'] = arrayUnion(ownerUid);
    await updateDoc(doc(this.firestore, `users/${targetUid}`), payload);
  }

  /** Aplica la misma operación a muchos documentos, en lotes atómicos. */
  private async batched<T>(
    items: readonly T[],
    apply: (batch: WriteBatch, item: T) => void
  ): Promise<void> {
    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.firestore);
      for (const item of items.slice(i, i + BATCH_LIMIT)) apply(batch, item);
      await batch.commit();
    }
  }
}
