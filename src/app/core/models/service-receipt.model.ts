import { Timestamp } from '@angular/fire/firestore';

export interface ServiceReceipt {
  id?: string;
  ownerId: string;
  serviceId: string;
  serviceName: string;
  assignmentId: string;
  assignmentCode?: string; // denormalized from ServiceAssignment.code
  propertyId: string;
  month: string; // 'YYYY-MM'
  totalAmount: number;
  propertyAmount: number;
  residentCount: number;
  isPaid: boolean;
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
