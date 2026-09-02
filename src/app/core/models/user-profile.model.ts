import { Timestamp } from '@angular/fire/firestore';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  roles: Array<'owner' | 'tenant' | 'colaborador'>;
  propertyIds: string[];
  collaboratingPropertyIds: string[];
  /**
   * Dueños para los que esta persona colabora. Es lo que permite al dueño leer
   * este perfil (nombre y correo) en la pantalla de Colaboradores, sin abrir la
   * colección `users` a cualquiera.
   */
  ownerUids?: string[];
  createdAt?: Timestamp;
}
