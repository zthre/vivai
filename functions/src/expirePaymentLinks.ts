/**
 * v0.9.0 — Expire Payment Links
 * Runs daily. Marks as 'expired' any active payment links older than 3 days.
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const expirePaymentLinks = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'America/Bogota' },
  async () => {
    const now = Timestamp.now();
    const snap = await db
      .collection('paymentLinks')
      .where('status', '==', 'active')
      .where('expiresAt', '<=', now)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    snap.docs.forEach(doc => batch.update(doc.ref, { status: 'expired' }));
    await batch.commit();

    console.log(`Expired ${snap.size} payment links.`);
  }
);
