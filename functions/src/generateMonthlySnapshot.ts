/**
 * v1.0.0 — Generate Monthly Snapshot
 * - Cron: runs on the 1st of each month at 1:00 AM UTC-5.
 * - Callable: owner can trigger manually from analytics dashboard.
 *
 * For each owner's property, queries payments and expenses from the prior month,
 * checks occupancy status, and writes a monthlySnapshot document.
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function buildSnapshots(year: number, month: number, ownerId?: string): Promise<void> {
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
      generatedAt: Timestamp.now(),
      generatedBy: 'cron',
    };

    // Upsert — overwrite if exists (idempotent)
    const existingSnap = await db
      .collection('monthlySnapshots')
      .where('propertyId', '==', pid)
      .where('month', '==', monthKey)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      await existingSnap.docs[0].ref.update({ ...snapshotData, generatedBy: 'manual' });
    } else {
      await db.collection('monthlySnapshots').add(snapshotData);
    }
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
    await buildSnapshots(targetYear, m, request.auth.uid);
  }
});
