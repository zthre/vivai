import { Timestamp } from '@angular/fire/firestore';

export type NotificationType = 'payment_reminder' | 'payment_overdue' | 'ticket_update';

export interface AppNotification {
  id?: string;
  unitId: string;
  propertyId: string;
  tenantEmail: string;
  ownerId: string;
  type: NotificationType;
  channel: 'email';
  status: 'sent' | 'failed';
  sentAt: Timestamp;
  viewedByOwner: boolean;
  metadata?: {
    amount?: number;
    daysUntilDue?: number;
    ticketTitle?: string;
    ticketStatus?: string;
    unitNumber?: string;
    propertyName?: string;
  };
}
