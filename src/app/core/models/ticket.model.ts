import { Timestamp } from '@angular/fire/firestore';

export interface StatusChange {
  status: 'pendiente' | 'en_proceso' | 'resuelto';
  changedAt: Timestamp;
  changedBy: string;
}

export interface Ticket {
  id?: string;
  propertyId: string;
  propertyName: string;
  ownerId: string;
  tenantUid: string;
  tenantName: string | null;
  title: string;
  description: string;
  category: 'plomeria' | 'electricidad' | 'estructura' | 'otro';
  status: 'pendiente' | 'en_proceso' | 'resuelto';
  photos: string[];
  statusHistory: StatusChange[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  resolvedAt: Timestamp | null;
}
