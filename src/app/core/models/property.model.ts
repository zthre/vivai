import { Timestamp } from '@angular/fire/firestore';

export interface PhotoItem {
  url: string;
  storagePath: string;
  filename: string;
  uploadedAt: Timestamp;
}

export interface Property {
  id?: string;
  ownerId: string;
  name: string;
  address: string;
  type: 'apartamento' | 'casa' | 'local' | 'bodega';
  unitCount: number;
  photos?: PhotoItem[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
