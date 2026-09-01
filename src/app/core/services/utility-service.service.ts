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
import { Observable, of, switchMap, map, combineLatest } from 'rxjs';
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

        const ownerUids = [...new Set([uid, ...collabOwnerUids, ...collabWorkerUids])]
          .filter(Boolean);
        if (ownerUids.length === 0) return of([] as Service[]);

        // `in` admite como máximo 10 valores. Truncar ahí hacía desaparecer servicios
        // en silencio (y con ellos su tarjeta en /services, aunque sus recibos siguieran
        // existiendo y sumando). Se parte en lotes de 10 y se combinan los resultados.
        const chunks: string[][] = [];
        for (let i = 0; i < ownerUids.length; i += 10) {
          chunks.push(ownerUids.slice(i, i + 10));
        }

        const ref = collection(this.firestore, 'services');
        // Sin orderBy: `in` + orderBy sobre otro campo exigiría un índice compuesto.
        // El orden se resuelve en memoria.
        const queries = chunks.map(
          c => collectionData(query(ref, where('ownerId', 'in', c)), { idField: 'id' }) as Observable<Service[]>
        );

        return combineLatest(queries).pipe(
          map(arrays => {
            const seen = new Set<string>();
            const merged: Service[] = [];
            for (const s of arrays.flat()) {
              if (s.id && !seen.has(s.id)) {
                seen.add(s.id);
                merged.push(s);
              }
            }
            return merged.sort(
              (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
            );
          })
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

  async create(data: Partial<Service>): Promise<string> {
    const uid = this.auth.uid()!;
    const ownerId = await this.resolveOwnerId(uid);
    const ref = collection(this.firestore, 'services');
    const docRef = await loggedWrite(
      'UtilityServiceService.create',
      () => addDoc(ref, {
        ...data,
        ownerId,
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
