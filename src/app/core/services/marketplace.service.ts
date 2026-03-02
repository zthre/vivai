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

export interface UnitListing {
  kind: 'unit';
  property: Property;
  unit: Unit;
}

export interface PropertyListing {
  kind: 'property';
  property: Property;
}

export type ListingItem = UnitListing | PropertyListing;

export function listingPrice(item: ListingItem): number {
  if (item.kind === 'property') {
    return item.property.isForRent ? (item.property.rentPrice ?? 0) : (item.property.salePrice ?? 0);
  }
  // Primary price: rent if available, else sale
  return item.unit.isForRent ? (item.unit.rentPrice ?? 0) : (item.unit.salePrice ?? 0);
}

export function listingStatus(item: ListingItem): 'disponible_renta' | 'disponible_venta' {
  if (item.kind === 'property') {
    return item.property.isForRent ? 'disponible_renta' : 'disponible_venta';
  }
  return item.unit.isForRent ? 'disponible_renta' : 'disponible_venta';
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

        const streams = properties.map(prop => {
          // Property-level listing (renta o venta directa)
          const isDirectListing =
            (prop.isForSale && prop.salePrice) || (prop.isForRent && prop.rentPrice);
          const propListing$: Observable<ListingItem[]> = of(
            isDirectListing ? [{ kind: 'property' as const, property: prop }] : []
          );

          // Unit listings (isListed = isForRent || isForSale)
          const unitsRef = collection(this.firestore, 'units');
          const unitsQuery = query(
            unitsRef,
            where('propertyId', '==', prop.id!),
            where('isListed', '==', true)
          );
          const unitListings$ = (collectionData(unitsQuery, { idField: 'id' }) as Observable<Unit[]>).pipe(
            map(units => units.map(unit => ({ kind: 'unit' as const, unit, property: prop })))
          );

          return combineLatest([propListing$, unitListings$]).pipe(
            map(([pl, ul]) => [...pl, ...ul])
          );
        });

        return combineLatest(streams).pipe(map(results => results.flat()));
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
