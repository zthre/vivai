import { Timestamp } from '@angular/fire/firestore';

export interface ColaboradorPermission {
  /** Crear, editar y eliminar unidades */
  inmueblesUnidades?: boolean;
  /** Registrar pagos */
  inmueblesPagos?: boolean;
  /** Fotos y contratos */
  inmueblesMedia?: boolean;
  /** Registrar y editar gastos */
  gastos?: boolean;
  /** Cambiar estado de tickets */
  tickets?: boolean;
}

export interface PhotoItem {
  url: string;
  storagePath: string;
  filename: string;
  uploadedAt: Timestamp;
}

export interface Property {
  id?: string;
  ownerId: string;
  name: string;
  address: string;
  type: 'apartamento' | 'casa' | 'local' | 'bodega';
  unitCount: number;
  photos?: PhotoItem[];
  /** Occupancy — only relevant for properties used as a single unit (no sub-units) */
  status?: 'disponible' | 'ocupado';
  tenantName?: string | null;
  tenantPhone?: string | null;
  tenantEmail?: string | null;
  /** What the current tenant pays per month — used for payment suggestions and financial tracking */
  tenantRentPrice?: number | null;
  isPublic?: boolean;
  whatsappPhone?: string | null;
  isForRent?: boolean;
  rentPrice?: number | null;
  isForSale?: boolean;
  salePrice?: number | null;
  publicDescription?: string | null;
  collaboratorUids?: string[];
  pendingCollaboratorEmails?: string[];
  collaboratorPermissions?: { [uid: string]: ColaboradorPermission };
  /** Purchase price for ROI calculation */
  purchasePrice?: number | null;
  purchaseDate?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
