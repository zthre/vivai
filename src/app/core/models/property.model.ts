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

export interface Property {
  id?: string;
  ownerId: string;
  name: string;
  address: string;
  type: 'apartamento' | 'casa' | 'local' | 'bodega';
  photos?: PhotoItem[];

  // Estado y marketplace
  status: 'disponible' | 'ocupado';
  isForRent: boolean;
  isForSale: boolean;
  isListed: boolean;
  rentPrice?: number | null;
  salePrice?: number | null;
  publicDescription?: string | null;

  // Inquilino
  tenantName?: string | null;
  tenantPhone?: string | null;
  tenantEmail?: string | null;
  tenantUid?: string | null;
  tenantRentPrice?: number | null;

  // Contrato
  contract?: ContractFile | null;

  // Notificaciones
  paymentDueDay?: number | null;
  notificationsEnabled?: boolean;

  // Marketplace / público
  isPublic?: boolean;
  whatsappPhone?: string | null;
  tags?: string[];

  // Colaboradores
  collaboratorUids?: string[];
  pendingCollaboratorEmails?: string[];
  collaboratorPermissions?: { [uid: string]: ColaboradorPermission };

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
