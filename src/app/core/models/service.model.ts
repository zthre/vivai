import { Timestamp } from '@angular/fire/firestore';

export interface Service {
  id?: string;
  ownerId: string;
  /**
   * Círculo del dueño: él y todos sus colaboradores. A diferencia de pagos o
   * recibos, un servicio no cuelga de una propiedad concreta, así que su ámbito
   * es el del dueño entero. Lo mantiene al día el trigger `syncMemberUids`.
   */
  memberUids?: string[];
  name: string;
  icon?: string;
  description?: string;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
