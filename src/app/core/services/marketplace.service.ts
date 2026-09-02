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
import { Observable, map } from 'rxjs';
import { Property } from '../models/property.model';
import { isListingActive } from './listing.util';
import { collection$ } from './firestore-query.util';

export function listingPrice(property: Property): number {
  return property.isForRent ? (property.rentPrice ?? 0) : (property.salePrice ?? 0);
}

export function listingStatus(property: Property): 'disponible_renta' | 'disponible_venta' {
  return property.isForRent ? 'disponible_renta' : 'disponible_venta';
}

@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private firestore = inject(Firestore);

  /**
   * Publicaciones visibles en el marketplace. El filtro de vencimiento se hace en
   * memoria: combinar `isPublic == true` con un rango sobre `listingExpiresAt`
   * exigiría un índice compuesto. El cron `expireListings` apaga `isPublic` a diario,
   * así que este filtro solo cubre la ventana entre el vencimiento y la siguiente corrida.
   */
  getListings(): Observable<Property[]> {
    const ref = collection(this.firestore, 'properties');
    const q = query(ref, where('isPublic', '==', true));
    return collection$<Property>(q, {
      label: 'MarketplaceService.getListings',
      collection: 'properties',
      query: 'isPublic == true',
    }).pipe(map(props => props.filter(p => isListingActive(p))));
  }

  getPropertyById(id: string): Observable<Property> {
    const ref = doc(this.firestore, `properties/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Property>;
  }
}
