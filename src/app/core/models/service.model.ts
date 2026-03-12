import { Timestamp } from '@angular/fire/firestore';

export interface Service {
  id?: string;
  ownerId: string;
  name: string;
  icon?: string;
  description?: string;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
