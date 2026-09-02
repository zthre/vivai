import { collectionData, DocumentData, Query } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { guardQuery } from './firestore-error.util';

/**
 * Una consulta de listado protegida: añade el `id` a cada documento y, ante un
 * fallo, registra el error con contexto y degrada a lista vacía.
 *
 * Lo segundo no es cosmético: un error que llega a `toSignal` se relanza en cada
 * lectura de la señal y aborta la detección de cambios de la pantalla completa.
 *
 * `ServiceReceiptService` y `ServiceAssignmentService` tenían cada uno su método
 * `safe()` privado con este mismo cuerpo, y el resto de servicios repetía el
 * `collectionData(...).pipe(guardQuery(...))` a mano en cada método.
 */
export function collection$<T>(
  q: Query<DocumentData>,
  context: { label: string; collection: string; query: string }
): Observable<T[]> {
  return (collectionData(q, { idField: 'id' }) as Observable<T[]>).pipe(
    guardQuery(context.label, [] as T[], {
      collection: context.collection,
      query: context.query,
    })
  );
}
