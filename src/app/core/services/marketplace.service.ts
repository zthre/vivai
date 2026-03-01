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
import { Observable, combineLatest, of, switchMap, map } from 'rxjs';
import { Property } from '../models/property.model';
import { Unit } from '../models/unit.model';

export interface ListingItem {
  unit: Unit;
  property: Property;
}

@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private firestore = inject(Firestore);

  getListings(): Observable<ListingItem[]> {
    const propsRef = collection(this.firestore, 'properties');
    const propsQuery = query(propsRef, where('isPublic', '==', true));

    return (collectionData(propsQuery, { idField: 'id' }) as Observable<Property[]>).pipe(
      switchMap(properties => {
        if (properties.length === 0) return of([]);

        const unitStreams = properties.map(prop => {
          const unitsRef = collection(this.firestore, 'units');
          const unitsQuery = query(
            unitsRef,
            where('propertyId', '==', prop.id!),
            where('status', 'in', ['disponible_renta', 'disponible_venta'])
          );
          return (collectionData(unitsQuery, { idField: 'id' }) as Observable<Unit[]>).pipe(
            map(units => units.map(unit => ({ unit, property: prop })))
          );
        });

        return combineLatest(unitStreams).pipe(map(results => results.flat()));
      })
    );
  }

  getUnitById(id: string): Observable<Unit> {
    const ref = doc(this.firestore, `units/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Unit>;
  }

  getPropertyById(id: string): Observable<Property> {
    const ref = doc(this.firestore, `properties/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Property>;
  }
}
