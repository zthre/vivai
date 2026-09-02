import { Timestamp } from '@angular/fire/firestore';

/** Un precio de arriendo y desde cuándo rige. */
export interface LeasePriceChange {
  /** Desde cuándo se cobra este precio. */
  from: Timestamp;
  rentPrice: number;
  changedAt: Timestamp;
  changedBy: string;
}

/**
 * Un arrendamiento: quién vive en una propiedad, desde cuándo y a qué precio.
 *
 * Antes esto vivía dentro de `Property` —`tenantName`, `tenantRentPrice`,
 * `paymentDueDay`…—, así que al cambiar de inquilino se SOBRESCRIBÍA. Se perdía
 * quién vivía ahí y a cuánto, sin forma de reconstruirlo: los pagos de un año
 * anterior quedaban apuntando a una propiedad que ya decía otro nombre y otro
 * precio.
 *
 * Dos ejes de historia, porque las dos cosas pasan:
 *   - varios arrendamientos por propiedad, uno por inquilino;
 *   - dentro de cada uno, `priceHistory` para las subidas al mismo inquilino.
 *
 * `rentPrice` es el precio vigente, denormalizado de la última entrada de
 * `priceHistory`, para no tener que recorrerla en cada pantalla.
 */
export interface Lease {
  id?: string;
  propertyId: string;
  ownerId: string;
  /** Círculo de la propiedad. Ver `propertyMemberUids`. */
  memberUids: string[];

  tenantName: string | null;
  tenantPhone: string | null;
  tenantEmail: string | null;
  tenantUid: string | null;

  /** Precio vigente. Espejo de la última entrada de `priceHistory`. */
  rentPrice: number | null;
  priceHistory: LeasePriceChange[];

  residentCount: number;
  paymentDueDay: number | null;
  /** Inquilino sin cobro de arriendo. */
  paymentFree: boolean;

  startDate: Timestamp;
  /** `null` mientras esté vigente. */
  endDate: Timestamp | null;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** ¿Es el arrendamiento vigente? */
export function isLeaseActive(lease: Lease): boolean {
  return lease.endDate === null || lease.endDate === undefined;
}

/** Precio que regía en una fecha dada, según el historial. */
export function rentPriceAt(lease: Lease, date: Date): number | null {
  const applicable = (lease.priceHistory ?? [])
    .filter(p => p.from.toDate() <= date)
    .sort((a, b) => b.from.toMillis() - a.from.toMillis());
  return applicable[0]?.rentPrice ?? lease.rentPrice ?? null;
}
