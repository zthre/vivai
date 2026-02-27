import { Timestamp } from '@angular/fire/firestore';

export interface Payment {
  id?: string;
  unitId: string;
  propertyId: string;
  ownerId: string;
  amount: number;
  date: Timestamp;
  notes: string | null;
  createdAt?: Timestamp;
  createdBy: string;
}
