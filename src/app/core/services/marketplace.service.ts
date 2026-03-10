import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Property } from '../models/property.model';

export function listingPrice(property: Property): number {
  return property.isForRent ? (property.rentPrice ?? 0) : (property.salePrice ?? 0);
}

export function listingStatus(property: Property): 'disponible_renta' | 'disponible_venta' {
  return property.isForRent ? 'disponible_renta' : 'disponible_venta';
}

@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private firestore = inject(Firestore);

  getListings(): Observable<Property[]> {
    const ref = collection(this.firestore, 'properties');
    const q = query(ref, where('isListed', '==', true), where('isPublic', '==', true));
    return collectionData(q, { idField: 'id' }) as Observable<Property[]>;
  }

  getPropertyById(id: string): Observable<Property> {
    const ref = doc(this.firestore, `properties/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Property>;
  }
}
