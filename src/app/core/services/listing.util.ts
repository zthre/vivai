import { Property } from '../models/property.model';

/** Duración de una publicación en el marketplace. Para renovar hay que publicar de nuevo. */
export const LISTING_DURATION_DAYS = 30;

/** Días restantes por debajo de los cuales se avisa que la publicación está por vencer. */
export const LISTING_EXPIRING_SOON_DAYS = 5;

export type ListingState =
  | 'none'      // no está publicada
  | 'active'    // publicada y vigente
  | 'expiring'  // vigente pero le quedan pocos días
  | 'expired';  // venció (o es una publicación antigua sin fecha)

export function listingExpiryFrom(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + LISTING_DURATION_DAYS);
  return d;
}

function expiresAt(property: Property): Date | null {
  const ts = property.listingExpiresAt;
  return ts?.toDate ? ts.toDate() : null;
}

/**
 * Una publicación está vigente solo si es pública y su fecha de vencimiento no pasó.
 * Las publicaciones antiguas sin `listingExpiresAt` se consideran vencidas.
 */
export function isListingActive(property: Property, now: Date = new Date()): boolean {
  if (!property.isPublic) return false;
  const exp = expiresAt(property);
  return !!exp && exp.getTime() > now.getTime();
}

export function listingDaysLeft(property: Property, now: Date = new Date()): number | null {
  const exp = expiresAt(property);
  if (!exp) return null;
  const ms = exp.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function listingState(property: Property, now: Date = new Date()): ListingState {
  if (!property.isPublic && !property.listingExpiredAt) return 'none';
  if (!isListingActive(property, now)) return property.isPublic || property.listingExpiredAt ? 'expired' : 'none';
  const days = listingDaysLeft(property, now) ?? 0;
  return days <= LISTING_EXPIRING_SOON_DAYS ? 'expiring' : 'active';
}
