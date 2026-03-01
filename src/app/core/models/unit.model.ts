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
  status: 'ocupado' | 'disponible';
  tenantEmail: string | null;
  tenantName: string | null;
  contract?: ContractFile | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
