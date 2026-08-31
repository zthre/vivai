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
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable, of, switchMap, map, catchError } from 'rxjs';
import { Service } from '../models/service.model';
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
      catchError(err => {
        console.error('[UtilityServiceService.getAll]', err);
        return of([] as Service[]);
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
}
