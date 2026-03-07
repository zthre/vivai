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
  /** 'manual' = registered by owner/admin; 'gateway' = processed via payment gateway */
  source?: 'manual' | 'gateway';
  gatewayTransactionId?: string | null;
  paymentLinkId?: string | null;
  createdAt?: Timestamp;
  createdBy: string;
}
