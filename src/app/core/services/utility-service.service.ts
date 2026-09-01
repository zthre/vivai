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
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable, of, switchMap, map } from 'rxjs';
import { Service } from '../models/service.model';
import { guardQuery, loggedWrite } from './firestore-error.util';
import { AuthService } from '../auth/auth.service';
import { PropertyService } from './property.service';

@Injectable({ providedIn: 'root' })
export class UtilityServiceService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private propertyService = inject(PropertyService);

  getAll(): Observable<Service[]> {
    return this.propertyService.getAll().pipe(
      switchMap(properties => {
        const uid = this.auth.uid();
        if (!uid) return of([] as Service[]);

        // UIDs de propietarios de propiedades colaboradas (para que colaboradores vean servicios del dueño)
        const collabOwnerUids = properties.filter(p => p.ownerId !== uid).map(p => p.ownerId);
        // UIDs de colaboradores en propiedades propias (para que el dueño vea servicios creados por colaboradores)
        const collabWorkerUids = properties
          .filter(p => p.ownerId === uid)
          .flatMap(p => p.collaboratorUids ?? []);

        // `in` admite como máximo 10 valores y falla en seco con un array vacío.
        // El uid propio va primero para que nunca se pierda al truncar.
        const ownerUids = [...new Set([uid, ...collabOwnerUids, ...collabWorkerUids])]
          .filter(Boolean)
          .slice(0, 10);

        const ref = collection(this.firestore, 'services');
        // Sin orderBy: `in` + orderBy sobre otro campo exigiría un índice compuesto.
        // El orden se resuelve en memoria.
        const q = query(ref, where('ownerId', 'in', ownerUids));
        return (collectionData(q, { idField: 'id' }) as Observable<Service[]>).pipe(
          map(services =>
            [...services].sort(
              (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
            )
          )
        );
      }),
      // Una consulta caída no puede envenenar la señal: `toSignal` relanzaría el
      // error en cada lectura y rompería la detección de cambios de la pantalla.
      guardQuery('UtilityServiceService.getAll', [] as Service[], {
        collection: 'services',
        query: "ownerId in [uid + colaboradores + otros dueños] (máx. 10)",
      })
    );
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
