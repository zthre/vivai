import { Timestamp } from '@angular/fire/firestore';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  roles: Array<'owner' | 'tenant' | 'colaborador'>;
  unitIds: string[];
  collaboratingPropertyIds: string[];
  createdAt?: Timestamp;
}
