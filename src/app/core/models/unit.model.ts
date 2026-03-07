import { Timestamp } from '@angular/fire/firestore';
import { PhotoItem } from './property.model';

export interface ContractFile {
  url: string;
  storagePath: string;
  filename: string;
  sizeBytes: number;
  uploadedAt: Timestamp;
}

export interface Unit {
  id?: string;
  propertyId: string;
  ownerId: string;
  number: string;
  /** Marketplace listing rent price (asking price for public listing) */
  rentPrice?: number | null;
  salePrice?: number | null;
  /** What the current tenant pays per month — used for payment suggestions and financial tracking */
  tenantRentPrice?: number | null;
  /** Occupancy: 'disponible' (vacant) | 'ocupado' (tenant) */
  status: 'ocupado' | 'disponible';
  isForRent: boolean;
  isForSale: boolean;
  /** Computed: isForRent || isForSale — used for Firestore marketplace query */
  isListed: boolean;
  tenantName: string | null;
  tenantPhone: string | null;
  tenantEmail: string | null;
  tenantUid?: string | null;
  publicDescription?: string | null;
  photos?: PhotoItem[];
  contract?: ContractFile | null;
  /** Day of month when payment is due (1-28) — used for automated reminders */
  paymentDueDay?: number | null;
  /** Whether automated payment reminders are enabled for this unit */
  notificationsEnabled?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
