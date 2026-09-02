import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Query,
  DocumentData,
} from '@angular/fire/firestore';
import { Observable, switchMap } from 'rxjs';
import { ServiceAssignment } from '../models/service-assignment.model';
import { collection$ } from './firestore-query.util';
import { AuthService } from '../auth/auth.service';
import { PropertyService } from './property.service';

@Injectable({ providedIn: 'root' })
export class ServiceAssignmentService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private properties = inject(PropertyService);

  /** Degrada a lista vacía ante un fallo: un error propagado a `toSignal` rompe la vista. */
  private safe(q: Query<DocumentData>, label: string, queryDesc: string): Observable<ServiceAssignment[]> {
    return collection$<ServiceAssignment>(q, {
      label: `ServiceAssignmentService.${label}`,
      collection: 'serviceAssignments',
      query: queryDesc,
    });
  }

  /**
   * Códigos de un servicio, limitados al círculo del usuario.
   *
   * El filtro por `memberUids` no es solo eficiencia: sin él la consulta podía
   * devolver un documento ajeno, y en Firestore basta UNO que no pase las reglas
   * para denegar la consulta entera. Acotarla a lo que el usuario puede leer la
   * hace inmune a un documento roto o de otro dueño.
   */
  getByService(serviceId: string): Observable<ServiceAssignment[]> {
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'serviceAssignments');
        return this.safe(
          query(
            ref,
            where('memberUids', 'array-contains', uid),
            where('serviceId', '==', serviceId)
          ),
          'getByService',
          `memberUids array-contains ${uid}, serviceId == ${serviceId}`
        );
      })
    );
  }

  getByProperty(propertyId: string): Observable<ServiceAssignment[]> {
    const ref = collection(this.firestore, 'serviceAssignments');
    return this.safe(
      query(ref, where('propertyIds', 'array-contains', propertyId)),
      'getByProperty',
      `propertyIds array-contains ${propertyId}`
    );
  }

  async save(data: Partial<ServiceAssignment>, id?: string): Promise<string> {
    const uid = this.auth.uid()!;
    if (id) {
      const ref = doc(this.firestore, `serviceAssignments/${id}`);
      await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
      return id;
    }

    // Igual que en pagos, gastos, recibos y servicios: se atribuye al DUEÑO de
    // las propiedades, no a quien hace clic. Antes llevaba el uid de quien
    // pulsaba, así que un código creado por un colaborador quedaba fuera del
    // círculo del dueño — invisible para él, y suficiente para tumbar la
    // consulta entera de códigos de ese servicio.
    const propertyId = data.propertyIds?.[0];
    const ownerId = propertyId
      ? await this.properties.ownerIdOf(propertyId, uid)
      : uid;

    const ref = collection(this.firestore, 'serviceAssignments');
    const docRef = await addDoc(ref, {
      ...data,
      ownerId,
      memberUids: await this.properties.ownerCircle(ownerId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `serviceAssignments/${id}`);
    await deleteDoc(ref);
  }
}
