import { Timestamp } from '@angular/fire/firestore';

export interface ColaboradorPermission {
  /** Editar propiedad */
  inmueblesUnidades?: boolean;
  /** Registrar pagos */
  inmueblesPagos?: boolean;
  /** Fotos y contratos */
  inmueblesMedia?: boolean;
  /** Registrar y editar gastos */
  gastos?: boolean;
  /** Cambiar estado de tickets */
  tickets?: boolean;
  /** Acceso a servicios */
  servicios?: boolean;
}

export interface PhotoItem {
  url: string;
  storagePath: string;
  filename: string;
  uploadedAt: Timestamp;
}

export interface ContractFile {
  url: string;
  storagePath: string;
  filename: string;
  sizeBytes: number;
  uploadedAt: Timestamp;
}

/**
 * Quiénes forman el círculo de una propiedad: su dueño y sus colaboradores.
 *
 * Este array se denormaliza como `memberUids` en cada documento que cuelga de la
 * propiedad (pagos, gastos, recibos, tickets) y en la propiedad misma. Es lo que
 * permite a las reglas decidir con `uid in resource.data.memberUids`, sin un
 * `get()` por documento —que tiene tope por consulta y tumba listados enteros—,
 * y a las consultas pedir «todo lo de mi círculo» de una vez en lugar de abrir
 * una consulta por propiedad.
 *
 * NO incluye al inquilino: su acceso es más estrecho (ve sus pagos y sus tickets,
 * no los gastos ni los recibos) y se resuelve con sus propias cláusulas.
 */
export function propertyMemberUids(
  property: Pick<Property, 'ownerId' | 'collaboratorUids'>
): string[] {
  return [...new Set([property.ownerId, ...(property.collaboratorUids ?? [])])].filter(Boolean);
}

export interface Property {
  id?: string;
  ownerId: string;
  /**
   * `[ownerId, ...collaboratorUids]`, denormalizado. Lo mantiene al día el
   * trigger `syncMemberUids`; no lo edites a mano fuera de `create`.
   */
  memberUids?: string[];
  name: string;
  address: string;
  type: 'apartamento' | 'casa' | 'local' | 'bodega';
  photos?: PhotoItem[];

  // Estado y marketplace
  status: 'disponible' | 'ocupado';
  isForRent: boolean;
  isForSale: boolean;
  rentPrice?: number | null;
  salePrice?: number | null;
  publicDescription?: string | null;

  // Inquilino
  //
  // Estos campos siguen siendo la fuente que leen las pantallas, pero la HISTORIA
  // vive en `leases`: al cambiar de inquilino aquí se sobrescriben, y antes eso
  // borraba para siempre quién vivía y a cuánto. `activeLeaseId` apunta al
  // arrendamiento vigente, que es el mismo dato con fecha de inicio y fin.
  /** Arrendamiento vigente. `null` si la propiedad está disponible. */
  activeLeaseId?: string | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  tenantEmail?: string | null;
  tenantUid?: string | null;
  tenantRentPrice?: number | null;

  // Contrato
  contract?: ContractFile | null;

  // Pagos
  paymentFree?: boolean;        // Inquilino sin cobro de arriendo (no aparece como pendiente)
  paymentDueDay?: number | null;
  notificationsEnabled?: boolean;

  // Marketplace / público
  isPublic?: boolean;
  whatsappPhone?: string | null;
  tags?: string[];

  /** Momento en que se publicó (o republicó) en el marketplace */
  publishedAt?: Timestamp | null;
  /** publishedAt + LISTING_DURATION_DAYS. Pasada esta fecha la publicación deja de mostrarse */
  listingExpiresAt?: Timestamp | null;
  /** Momento en que la publicación fue caducada (por el cron o manualmente) */
  listingExpiredAt?: Timestamp | null;

  // Colaboradores
  collaboratorUids?: string[];
  pendingCollaboratorEmails?: string[];
  collaboratorPermissions?: { [uid: string]: ColaboradorPermission };

  // Residentes
  residentCount?: number;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
