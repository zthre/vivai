import { Timestamp } from '@angular/fire/firestore';

export interface Payment {
  id?: string;
  /** null when the payment belongs to a property used without units */
  unitId: string | null;
  propertyId: string;
  ownerId: string;
  amount: number;
  date: Timestamp;
  notes: string | null;
  createdAt?: Timestamp;
  createdBy: string;
}
