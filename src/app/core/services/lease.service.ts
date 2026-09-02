import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, switchMap, map } from 'rxjs';
import { Lease, LeasePriceChange, isLeaseActive } from '../models/lease.model';
import { collection$ } from './firestore-query.util';
import { loggedWrite } from './firestore-error.util';
import { AuthService } from '../auth/auth.service';

/**
 * Datos con los que se abre un arrendamiento.
 *
 * `ownerId` y `memberUids` los resuelve QUIEN LLAMA, no este servicio. No es
 * capricho: `PropertyService` abre arrendamientos al asignar un inquilino, así
 * que si `LeaseService` dependiera de él habría un ciclo de inyección —que
 * TypeScript no detecta y Angular revienta en tiempo de ejecución—. Quien llama
 * ya tiene la propiedad delante, así que pasarlos sale gratis.
 */
export interface LeaseInput {
  propertyId: string;
  ownerId: string;
  memberUids: string[];
  tenantName: string | null;
  tenantPhone?: string | null;
  tenantEmail?: string | null;
  tenantUid?: string | null;
  rentPrice?: number | null;
  residentCount?: number;
  paymentDueDay?: number | null;
  paymentFree?: boolean;
  /** Por defecto, hoy. */
  startDate?: Date;
}

@Injectable({ providedIn: 'root' })
export class LeaseService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  /**
   * Arrendamientos de una propiedad, del más reciente al más antiguo.
   *
   * Acotado por `memberUids` como todo lo demás: una consulta que puede devolver
   * un documento ajeno se deniega entera.
   */
  getByProperty(propertyId: string): Observable<Lease[]> {
    return this.auth.uid$.pipe(
      switchMap(uid =>
        collection$<Lease>(
          query(
            collection(this.firestore, 'leases'),
            where('memberUids', 'array-contains', uid),
            where('propertyId', '==', propertyId)
          ),
          {
            label: 'LeaseService.getByProperty',
            collection: 'leases',
            query: `memberUids array-contains ${uid}, propertyId == ${propertyId}`,
          }
        )
      ),
      map(list =>
        [...list].sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis())
      )
    );
  }

  /** El arrendamiento vigente de una propiedad, o `null` si está disponible. */
  getActive(propertyId: string): Observable<Lease | null> {
    return this.getByProperty(propertyId).pipe(
      map(list => list.find(isLeaseActive) ?? null)
    );
  }

  /**
   * Abre un arrendamiento, cerrando antes el que estuviera vigente.
   *
   * El cierre es automático —asignar un inquilino nuevo termina el anterior— y la
   * fecha de fin es el día anterior al inicio del nuevo, para que los dos no se
   * solapen ni dejen un hueco.
   */
  async open(input: LeaseInput): Promise<string> {
    const uid = this.auth.uid()!;
    const start = input.startDate ?? new Date();

    await this.closeActive(input.propertyId, dayBefore(start));

    const rentPrice = input.rentPrice ?? null;

    const priceHistory: LeasePriceChange[] = rentPrice === null ? [] : [{
      from: Timestamp.fromDate(start),
      rentPrice,
      changedAt: Timestamp.now(),
      changedBy: uid,
    }];

    const docRef = await loggedWrite(
      'LeaseService.open',
      () => addDoc(collection(this.firestore, 'leases'), {
        propertyId: input.propertyId,
        ownerId: input.ownerId,
        memberUids: input.memberUids,
        tenantName: input.tenantName ?? null,
        tenantPhone: input.tenantPhone ?? null,
        tenantEmail: input.tenantEmail ?? null,
        tenantUid: input.tenantUid ?? null,
        rentPrice,
        priceHistory,
        residentCount: input.residentCount ?? 1,
        paymentDueDay: input.paymentDueDay ?? null,
        paymentFree: input.paymentFree ?? false,
        startDate: Timestamp.fromDate(start),
        endDate: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      { collection: 'leases', query: `open sobre propertyId ${input.propertyId}` }
    );

    return docRef.id;
  }

  /** Cierra el arrendamiento vigente de una propiedad, si lo hay. */
  async closeActive(propertyId: string, endDate: Date = new Date()): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    const snap = await getDocs(
      query(
        collection(this.firestore, 'leases'),
        where('memberUids', 'array-contains', uid),
        where('propertyId', '==', propertyId),
        where('endDate', '==', null)
      )
    );

    await Promise.all(
      snap.docs.map(d =>
        updateDoc(d.ref, {
          endDate: Timestamp.fromDate(endDate),
          updatedAt: serverTimestamp(),
        })
      )
    );
  }

  /**
   * Registra una subida (o bajada) de precio sobre el arrendamiento vigente.
   *
   * No sobrescribe: añade una entrada al historial y actualiza el precio vigente.
   * Así se puede responder qué se cobraba en una fecha dada, que es justo lo que
   * antes se perdía.
   */
  async changePrice(lease: Lease, rentPrice: number, from: Date = new Date()): Promise<void> {
    const uid = this.auth.uid()!;
    const entry: LeasePriceChange = {
      from: Timestamp.fromDate(from),
      rentPrice,
      changedAt: Timestamp.now(),
      changedBy: uid,
    };

    await loggedWrite(
      'LeaseService.changePrice',
      () => updateDoc(doc(this.firestore, `leases/${lease.id}`), {
        rentPrice,
        priceHistory: [...(lease.priceHistory ?? []), entry],
        updatedAt: serverTimestamp(),
      }),
      { collection: 'leases', query: `changePrice leases/${lease.id}` }
    );
  }

  async update(id: string, data: Partial<Lease>): Promise<void> {
    await loggedWrite(
      'LeaseService.update',
      () => updateDoc(doc(this.firestore, `leases/${id}`), {
        ...data,
        updatedAt: serverTimestamp(),
      }),
      { collection: 'leases', query: `update leases/${id}` }
    );
  }
}

/** El día anterior a `date`, al final del día. */
function dayBefore(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  d.setHours(23, 59, 59, 999);
  return d;
}
