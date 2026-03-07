import { Timestamp } from '@angular/fire/firestore';

export interface PaymentLink {
  id?: string;
  unitId: string;
  unitNumber: string;
  propertyId: string;
  propertyName: string;
  ownerId: string;
  tenantEmail: string | null;
  amount: number;
  /** "YYYY-MM" */
  month: string;
  status: 'active' | 'paid' | 'expired';
  gatewayProvider: 'stripe';
  /** Stripe Checkout Session ID */
  externalId: string | null;
  /** Stripe checkout URL */
  externalUrl: string | null;
  createdAt: Timestamp;
  /** createdAt + 3 days */
  expiresAt: Timestamp;
  paidAt: Timestamp | null;
}
