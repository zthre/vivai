import { Timestamp } from '@angular/fire/firestore';

export interface ServiceAssignment {
  id?: string;
  ownerId: string;
  serviceId: string;
  serviceName: string;
  propertyIds: string[];
  distributionMethod: 'por_persona' | 'partes_iguales' | 'manual';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
