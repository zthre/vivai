import { Timestamp } from '@angular/fire/firestore';

export interface Property {
  id?: string;
  ownerId: string;
  name: string;
  address: string;
  type: 'apartamento' | 'casa' | 'local' | 'bodega';
  unitCount: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
