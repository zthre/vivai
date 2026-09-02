import { Timestamp } from '@angular/fire/firestore';

export interface ServiceAssignment {
  id?: string;
  ownerId: string;
  /**
   * Círculo del dueño: él y todos sus colaboradores. A diferencia de pagos o
   * recibos, un servicio no cuelga de una propiedad concreta, así que su ámbito
   * es el del dueño entero. Lo mantiene al día el trigger `syncMemberUids`.
   */
  memberUids?: string[];
  serviceId: string;
  serviceName: string;
  code?: string;           // e.g. "MED-101", "GAS-NORTE"
  description?: string;   // e.g. "Torre Norte pisos 1-5"
  propertyIds: string[];
  distributionMethod: 'por_persona' | 'partes_iguales' | 'manual';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
