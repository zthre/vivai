import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore, Query } from 'firebase-admin/firestore';

if (!admin.apps.length) admin.initializeApp();

const REGION = 'us-central1';
const BATCH_LIMIT = 500;

/**
 * Propagación de `memberUids`.
 *
 * `memberUids` = `[ownerId, ...collaboratorUids]` denormalizado en cada documento.
 * Es lo que permite a las reglas resolver el acceso mirando el propio documento
 * (`uid in resource.data.memberUids`) en lugar de un `get()` sobre la propiedad
 * —que tiene tope de accesos por consulta y basta un documento que lo exceda para
 * denegar un listado entero—, y a las consultas pedir «todo lo de mi círculo» de
 * una vez en lugar de abrir una consulta por propiedad.
 *
 * Un campo denormalizado sin quien lo mantenga es peor que no tenerlo: quedaría
 * concediendo acceso a un colaborador ya retirado, o negándoselo a uno nuevo.
 * Este trigger es esa pieza.
 *
 * Dos ámbitos distintos:
 *   - Por propiedad (`payments`, `expenses`, `serviceReceipts`, `tickets`):
 *     el círculo de esa propiedad.
 *   - Por dueño (`services`, `serviceAssignments`): el dueño y TODOS sus
 *     colaboradores, porque estos documentos no cuelgan de una propiedad concreta.
 */

/** Colecciones cuyo ámbito es una propiedad concreta. */
const PROPERTY_SCOPED = ['payments', 'expenses', 'serviceReceipts', 'tickets'] as const;

/** Colecciones cuyo ámbito es el dueño entero. */
const OWNER_SCOPED = ['services', 'serviceAssignments'] as const;

function circleOf(data: FirebaseFirestore.DocumentData | undefined): string[] {
  if (!data) return [];
  const owner = data['ownerId'] as string | undefined;
  const collaborators = (data['collaboratorUids'] as string[] | undefined) ?? [];
  return [...new Set([owner, ...collaborators].filter((u): u is string => !!u))];
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(uid => set.has(uid));
}

/** Recorre una consulta en páginas y escribe `memberUids` donde difiera. */
async function applyTo(
  db: Firestore,
  baseQuery: Query,
  memberUids: string[],
  label: string
): Promise<number> {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let updated = 0;

  for (;;) {
    let q = baseQuery.orderBy('__name__').limit(BATCH_LIMIT);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    let inBatch = 0;

    for (const doc of snap.docs) {
      const current = (doc.data()['memberUids'] as string[] | undefined) ?? [];
      if (sameSet(current, memberUids)) continue;
      batch.update(doc.ref, { memberUids });
      inBatch++;
    }

    if (inBatch > 0) {
      await batch.commit();
      updated += inBatch;
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH_LIMIT) break;
  }

  if (updated > 0) logger.info(`memberUids: ${updated} documentos en ${label}`);
  return updated;
}

/** Recalcula y propaga el círculo del dueño a `services` y `serviceAssignments`. */
async function syncOwnerScoped(db: Firestore, ownerId: string): Promise<number> {
  const props = await db.collection('properties').where('ownerId', '==', ownerId).get();
  const circle = new Set<string>([ownerId]);
  for (const p of props.docs) {
    for (const uid of ((p.data()['collaboratorUids'] as string[] | undefined) ?? [])) {
      circle.add(uid);
    }
  }
  const memberUids = [...circle];

  let total = 0;
  for (const collectionName of OWNER_SCOPED) {
    total += await applyTo(
      db,
      db.collection(collectionName).where('ownerId', '==', ownerId),
      memberUids,
      `${collectionName} (dueño ${ownerId})`
    );
  }
  return total;
}

/**
 * Cuando cambia el dueño o los colaboradores de una propiedad, propaga el nuevo
 * círculo a todo lo que cuelga de ella y recalcula el del dueño.
 *
 * Se sale temprano si el círculo no cambió: la propiedad se escribe en cada
 * edición (fotos, precios, publicación en el marketplace) y sin esta guarda cada
 * una dispararía un recorrido completo de sus pagos, gastos, recibos y tickets.
 */
export const syncMemberUids = onDocumentWritten(
  { document: 'properties/{propertyId}', region: REGION },
  async event => {
    const before = event.data?.before;
    const after = event.data?.after;
    const propertyId = event.params['propertyId'];

    // Propiedad borrada: los documentos hijos se conservan como histórico y
    // mantienen el último círculo conocido. Quitárselo los dejaría ilegibles.
    if (!after?.exists) return;

    const beforeCircle = circleOf(before?.exists ? before.data() : undefined);
    const afterCircle = circleOf(after.data());

    if (before?.exists && sameSet(beforeCircle, afterCircle)) return;

    const db = getFirestore();

    // La propiedad misma, por si se creó o editó sin pasar por el cliente.
    const currentOnProperty = (after.data()?.['memberUids'] as string[] | undefined) ?? [];
    if (!sameSet(currentOnProperty, afterCircle)) {
      await after.ref.update({ memberUids: afterCircle });
    }

    for (const collectionName of PROPERTY_SCOPED) {
      await applyTo(
        db,
        db.collection(collectionName).where('propertyId', '==', propertyId),
        afterCircle,
        `${collectionName} (propiedad ${propertyId})`
      );
    }

    const ownerId = after.data()?.['ownerId'] as string | undefined;
    if (ownerId) await syncOwnerScoped(db, ownerId);
  }
);

/**
 * Reconciliación manual para el dueño que la invoca.
 *
 * Sirve para el backfill inicial y para reparar sin desplegar nada si el trigger
 * falló en alguna escritura.
 */
export const syncMemberUidsManual = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Inicia sesión.');

  const db = getFirestore();
  const props = await db.collection('properties').where('ownerId', '==', uid).get();

  let updated = 0;
  for (const prop of props.docs) {
    const circle = circleOf(prop.data());

    const current = (prop.data()['memberUids'] as string[] | undefined) ?? [];
    if (!sameSet(current, circle)) {
      await prop.ref.update({ memberUids: circle });
      updated++;
    }

    for (const collectionName of PROPERTY_SCOPED) {
      updated += await applyTo(
        db,
        db.collection(collectionName).where('propertyId', '==', prop.id),
        circle,
        `${collectionName} (propiedad ${prop.id})`
      );
    }
  }

  updated += await syncOwnerScoped(db, uid);

  logger.info(`syncMemberUidsManual: ${updated} documentos actualizados para ${uid}`);
  return { updated, properties: props.size };
});
