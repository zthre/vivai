import { Timestamp } from '@angular/fire/firestore';

export interface Unit {
  id?: string;
  propertyId: string;
  ownerId: string;
  number: string;
  rentPrice: number;
  status: 'ocupado' | 'disponible';
  tenantEmail: string | null;
  tenantName: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
