/**
 * v1.3.0 — Expire marketplace listings
 * - Cron: runs daily at 3:00 AM UTC-5.
 * - Callable: owner can force a pass manually.
 *
 * Las publicaciones del marketplace duran LISTING_DURATION_DAYS días. Pasada la fecha
 * de vencimiento se apaga `isPublic` (lo que además corta la lectura pública en las
 * reglas de Firestore) y se sella `listingExpiredAt`. No hay renovación automática:
 * el usuario debe publicar de nuevo.
 *
 * Las publicaciones antiguas sin `listingExpiresAt` se caducan de inmediato.
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/**
 * Apaga las publicaciones vencidas.
 *
 * Se consulta solo por `isPublic == true` y el vencimiento se evalúa en memoria:
 * combinarlo con un rango sobre `listingExpiresAt` exigiría un índice compuesto,
 * y este proyecto no despliega índices por CLI.
 */
async function expireStaleListings(ownerId?: string): Promise<number> {
  const now = Timestamp.now();
  let query = db.collection('properties').where('isPublic', '==', true);
  if (ownerId) query = query.where('ownerId', '==', ownerId);

  const snap = await query.get();
  const stale = snap.docs.filter(doc => {
    const expiresAt = doc.get('listingExpiresAt') as Timestamp | undefined;
    // Sin fecha = publicación anterior a la vigencia de 30 días → vence ya
    if (!expiresAt) return true;
    return expiresAt.toMillis() <= now.toMillis();
  });

  if (stale.length === 0) return 0;

  // Firestore admite 500 escrituras por lote
  for (let i = 0; i < stale.length; i += 400) {
    const batch = db.batch();
    for (const doc of stale.slice(i, i + 400)) {
      batch.update(doc.ref, {
        isPublic: false,
        isListed: false,
        listingExpiredAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
  }

  logger.info(`expireListings: ${stale.length} publicación(es) caducada(s)`);
  return stale.length;
}

export const expireListings = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'America/Bogota' },
  async () => {
    await expireStaleListings();
  }
);

export const expireListingsManual = onCall(async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  const expired = await expireStaleListings(request.auth.uid);
  return { expired };
});
