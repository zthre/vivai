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
  getDocs,
  limit,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable, switchMap, map } from 'rxjs';
import { Service } from '../models/service.model';
import { loggedWrite } from './firestore-error.util';
import { collection$ } from './firestore-query.util';
import { AuthService } from '../auth/auth.service';
import { PropertyService } from './property.service';

@Injectable({ providedIn: 'root' })
export class UtilityServiceService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private propertyService = inject(PropertyService);

  /**
   * Servicios del círculo del usuario.
   *
   * Antes se reconstruía el círculo en el cliente —dueños de las propiedades
   * colaboradas, colaboradores de las propias— y se consultaba `ownerId in [...]`
   * en lotes de 10, porque `in` no admite más.
   *
   * Eso tenía dos problemas. El de fondo: la consulta NO estaba acotada a lo que
   * el usuario puede leer, y en Firestore basta un documento que no pase las
   * reglas para denegar el listado entero — un solo servicio de otro círculo
   * dejaba la pantalla en «Sin servicios», con sus recibos apareciendo como si el
   * servicio se hubiera eliminado. El otro: el círculo del cliente y el
   * `memberUids` del documento podían no coincidir.
   *
   * Preguntando por `memberUids` desaparecen los dos, y con ellos el troceado,
   * la deduplicación y la dependencia de `PropertyService`.
   */
  getAll(): Observable<Service[]> {
    return this.auth.uid$.pipe(
      switchMap(uid =>
        collection$<Service>(
          query(
            collection(this.firestore, 'services'),
            where('memberUids', 'array-contains', uid)
          ),
          {
            label: 'UtilityServiceService.getAll',
            collection: 'services',
            query: `memberUids array-contains ${uid}`,
          }
        )
      ),
      // Sin `orderBy`: combinarlo con `array-contains` exigiría un índice
      // compuesto para algo que se resuelve igual de bien en memoria.
      map(list =>
        [...list].sort(
          (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
        )
      )
    );
  }

  getById(id: string): Observable<Service> {
    const ref = doc(this.firestore, `services/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Service>;
  }

  /**
   * Resuelve a quién pertenece un servicio nuevo.
   *
   * Igual que en pagos, gastos y recibos: se atribuye al DUEÑO de las propiedades,
   * no a quien hace clic. Si no, un servicio creado por un colaborador lleva su uid
   * en `ownerId` y el dueño no puede editarlo ni eliminarlo.
   */
  private async resolveOwnerId(uid: string): Promise<string> {
    const props = collection(this.firestore, 'properties');

    // ¿Es dueño de alguna propiedad? Entonces el servicio es suyo.
    const owned = await getDocs(query(props, where('ownerId', '==', uid), limit(1)));
    if (!owned.empty) return uid;

    // Si no, es colaborador: el servicio pertenece al dueño para el que trabaja.
    const collab = await getDocs(
      query(props, where('collaboratorUids', 'array-contains', uid), limit(1))
    );
    return (collab.docs[0]?.data()?.['ownerId'] as string | undefined) ?? uid;
  }

  /** Cuántas propiedades caben en una cláusula `in` de Firestore. */
  private static readonly IN_LIMIT = 10;

  async create(data: Partial<Service>): Promise<string> {
    const uid = this.auth.uid()!;
    const ownerId = await this.resolveOwnerId(uid);
    const memberUids = await this.propertyService.ownerCircle(ownerId);
    const ref = collection(this.firestore, 'services');
    const docRef = await loggedWrite(
      'UtilityServiceService.create',
      () => addDoc(ref, {
        ...data,
        ownerId,
        memberUids,
        createdBy: uid,
        isActive: data.isActive ?? true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      { collection: 'services', query: `create (ownerId ${ownerId}, createdBy ${uid})` }
    );
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

  /** Cuántos recibos existen para un servicio, en cualquier mes. */
  async countReceipts(serviceId: string): Promise<number> {
    const q = query(
      collection(this.firestore, 'serviceReceipts'),
      where('serviceId', '==', serviceId)
    );
    return (await getDocs(q)).size;
  }

  /**
   * Elimina un servicio y sus códigos de distribución.
   *
   * Los recibos ya generados **se conservan**: son histórico contable y pueden
   * tener un gasto asociado en Finanzas. Como `serviceName` va denormalizado en
   * cada recibo, siguen mostrándose bien aunque el servicio ya no exista.
   * Al borrar los códigos, no se vuelve a generar ningún recibo nuevo.
   */
  async deleteWithAssignments(
    serviceId: string
  ): Promise<{ assignmentsDeleted: number; receiptsKept: number }> {
    const receiptsKept = await this.countReceipts(serviceId);

    const assignmentsSnap = await getDocs(
      query(collection(this.firestore, 'serviceAssignments'), where('serviceId', '==', serviceId))
    );
    await loggedWrite(
      'UtilityServiceService.deleteWithAssignments:assignments',
      () => Promise.all(
        assignmentsSnap.docs.map(d =>
          deleteDoc(doc(this.firestore, `serviceAssignments/${d.id}`))
        )
      ),
      { collection: 'serviceAssignments', query: `delete donde serviceId == ${serviceId}` }
    );

    await loggedWrite(
      'UtilityServiceService.deleteWithAssignments:service',
      () => deleteDoc(doc(this.firestore, `services/${serviceId}`)),
      { collection: 'services', query: `delete services/${serviceId}` }
    );

    return { assignmentsDeleted: assignmentsSnap.size, receiptsKept };
  }
}
