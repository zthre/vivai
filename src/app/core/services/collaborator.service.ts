import { Injectable, inject, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable, of, switchMap } from 'rxjs';
import { Collaborator, collaboratorId } from '../models/collaborator.model';
import { ColaboradorPermission } from '../models/property.model';
import { collection$ } from './firestore-query.util';
import { loggedWrite } from './firestore-error.util';
import { AuthService } from '../auth/auth.service';

/**
 * Los permisos de colaborador, en su propia colección.
 *
 * Antes vivían replicados dentro de cada propiedad. Un colaborador en catorce
 * inmuebles eran catorce copias del mismo objeto, y cambiarle un permiso,
 * catorce escrituras sin atomicidad: un fallo a mitad lo dejaba con permisos
 * distintos según la propiedad, sin que nada avisara.
 *
 * En la práctica ya eran globales —la única pantalla que los editaba escribía en
 * todas las propiedades a la vez, y el método por propiedad no tenía ningún
 * llamador—, así que moverlos no quita ninguna capacidad.
 */
@Injectable({ providedIn: 'root' })
export class CollaboratorService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  /** Colaboradores de un dueño. */
  getByOwner(ownerId: string): Observable<Collaborator[]> {
    return collection$<Collaborator>(
      query(collection(this.firestore, 'collaborators'), where('ownerId', '==', ownerId)),
      {
        label: 'CollaboratorService.getByOwner',
        collection: 'collaborators',
        query: `ownerId == ${ownerId}`,
      }
    );
  }

  /**
   * Los permisos que el usuario en sesión tiene con cada dueño, como señal.
   *
   * `PermissionService` la consulta de forma síncrona dentro de `computed()`, así
   * que tiene que estar cargada y no ser una promesa. Se resuelve una vez por
   * sesión: son tan pocos documentos como dueños para los que se colabora.
   */
  readonly myPermissions = toSignal(
    this.auth.uid$.pipe(
      switchMap(uid =>
        collection$<Collaborator>(
          query(
            collection(this.firestore, 'collaborators'),
            where('collaboratorUid', '==', uid)
          ),
          {
            label: 'CollaboratorService.myPermissions',
            collection: 'collaborators',
            query: `collaboratorUid == ${uid}`,
          }
        )
      )
    ),
    { initialValue: [] as Collaborator[] }
  );

  /** Mapa `ownerId → permisos` del usuario en sesión. */
  readonly permissionsByOwner = computed(() => {
    const map = new Map<string, ColaboradorPermission>();
    for (const c of this.myPermissions()) map.set(c.ownerId, c.permissions ?? {});
    return map;
  });

  /** Da de alta (o actualiza) los permisos de un colaborador con un dueño. */
  async setPermissions(
    ownerId: string,
    collaboratorUid: string,
    permissions: ColaboradorPermission
  ): Promise<void> {
    const id = collaboratorId(ownerId, collaboratorUid);
    await loggedWrite(
      'CollaboratorService.setPermissions',
      () => setDoc(
        doc(this.firestore, `collaborators/${id}`),
        {
          ownerId,
          collaboratorUid,
          permissions,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      { collection: 'collaborators', query: `set collaborators/${id}` }
    );
  }

  /** Retira a un colaborador de un dueño. */
  async remove(ownerId: string, collaboratorUid: string): Promise<void> {
    const id = collaboratorId(ownerId, collaboratorUid);
    await deleteDoc(doc(this.firestore, `collaborators/${id}`)).catch(() => void 0);
  }
}
