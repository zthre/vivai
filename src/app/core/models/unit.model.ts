import { Timestamp } from '@angular/fire/firestore';

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
  rentPrice: number;
  salePrice?: number | null;
  status: 'ocupado' | 'disponible_renta' | 'disponible_venta';
  tenantEmail: string | null;
  tenantName: string | null;
  publicDescription?: string | null;
  contract?: ContractFile | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
