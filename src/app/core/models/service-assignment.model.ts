import { Timestamp } from '@angular/fire/firestore';

export interface ServiceAssignment {
  id?: string;
  ownerId: string;
  serviceId: string;
  serviceName: string;
  code?: string;           // e.g. "MED-101", "GAS-NORTE"
  description?: string;   // e.g. "Torre Norte pisos 1-5"
  propertyIds: string[];
  distributionMethod: 'por_persona' | 'partes_iguales' | 'manual';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
