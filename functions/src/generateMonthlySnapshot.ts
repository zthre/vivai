/**
 * Generate Monthly Snapshot
 * - Cron: runs on the 1st of each month at 1:00 AM UTC-5.
 * - Callable: owner can trigger manually from analytics dashboard.
 *
 * For each owner's property, queries payments and expenses from the prior month,
 * checks occupancy status, and writes a monthlySnapshot document.
 *
 * El id del snapshot es determinista: `{ownerId}_{propertyId}_{month}`. Antes se
 * buscaba por consulta y se hacia `add()` si no habia nada, asi que dos corridas
 * concurrentes —el cron y un «Regenerar» manual— creaban documentos duplicados.
 * Y Analytics SUMA los snapshots de un mes para agregar sus propiedades, asi que
 * un duplicado no se ignora: se cuenta dos veces. Con id determinista no puede
 * haber duplicados, y los que ya existan se limpian en la siguiente corrida.
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/** Id estable de un snapshot. Dos corridas escriben el mismo documento. */
function snapshotId(ownerId: string, propertyId: string, monthKey: string): string {
  return `${ownerId}_${propertyId}_${monthKey}`;
}

async function buildSnapshots(
  year: number,
  month: number,
  ownerId?: string,
  generatedBy: 'cron' | 'manual' = 'cron'
): Promise<void> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const propsQuery = ownerId
    ? db.collection('properties').where('ownerId', '==', ownerId)
    : db.collection('properties');
  const propsSnap = await propsQuery.get();

  for (const propDoc of propsSnap.docs) {
    const prop = propDoc.data();
    const pid = propDoc.id;
    const ownerUid = prop['ownerId'];

    // Get payments for this property/month
    const paymentsSnap = await db
      .collection('payments')
      .where('propertyId', '==', pid)
      .where('date', '>=', Timestamp.fromDate(startDate))
      .where('date', '<=', Timestamp.fromDate(endDate))
      .get();
    const totalCollected = paymentsSnap.docs.reduce((s, d) => s + (d.data()['amount'] ?? 0), 0);

    // Get expenses for this property/month
    const expensesSnap = await db
      .collection('expenses')
      .where('propertyId', '==', pid)
      .where('date', '>=', Timestamp.fromDate(startDate))
      .where('date', '<=', Timestamp.fromDate(endDate))
      .get();
    const totalExpenses = expensesSnap.docs.reduce((s, d) => s + (d.data()['amount'] ?? 0), 0);

    // Check occupancy — property is the rentable unit
    const isOccupied = prop['status'] === 'ocupado';

    const snapshotData = {
      propertyId: pid,
      ownerId: ownerUid,
      month: monthKey,
      totalCollected,
      totalExpenses,
      netBalance: totalCollected - totalExpenses,
      isOccupied,
      // El modelo y Analytics esperan `occupancyRate` (0-100); aqui solo se
      // escribia `isOccupied`, asi que el KPI de ocupacion salia NaN
      // (`Math.max(0, undefined)`). Una propiedad esta ocupada o no lo esta:
      // 100 o 0, y Analytics promedia entre propiedades.
      occupancyRate: isOccupied ? 100 : 0,
      generatedAt: Timestamp.now(),
      generatedBy,
    };

    const id = snapshotId(ownerUid, pid, monthKey);
    await db.collection('monthlySnapshots').doc(id).set(snapshotData, { merge: true });

    // Limpieza de los duplicados que dejo el esquema anterior de ids automaticos.
    // Sin esto, escribir el documento determinista SUMARIA uno mas en vez de
    // reemplazarlos, porque Analytics agrega por mes sumando.
    const stale = await db
      .collection('monthlySnapshots')
      .where('propertyId', '==', pid)
      .where('month', '==', monthKey)
      .get();
    await Promise.all(
      stale.docs.filter(d => d.id !== id).map(d => d.ref.delete())
    );
  }
}

// Scheduled: runs 1st of each month at 1:00 AM UTC-5 for previous month
export const generateMonthlySnapshot = onSchedule(
  { schedule: '0 6 1 * *', timeZone: 'America/Bogota' }, // 6:00 UTC = 1:00 AM UTC-5
  async () => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    await buildSnapshots(prevMonth.getFullYear(), prevMonth.getMonth() + 1);
  }
);

// Callable: owner triggers manually for a given year
export const generateMonthlySnapshotCallable = onCall(async request => {
  if (!request.auth) throw new Error('Unauthenticated');
  const { year } = request.data as { year: number };
  const targetYear = year ?? new Date().getFullYear();

  const currentMonth = new Date().getMonth() + 1;
  const endMonth = targetYear === new Date().getFullYear() ? currentMonth : 12;

  for (let m = 1; m <= endMonth; m++) {
    await buildSnapshots(targetYear, m, request.auth.uid, 'manual');
  }
});
