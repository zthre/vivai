/**
 * v0.8.0 — Scheduled Payment Reminder
 * Runs daily at 9:00 AM UTC-5 (America/Bogota).
 * Checks occupied units with notificationsEnabled=true and paymentDueDay set.
 * If the due date falls within the next 5 days and no payment exists for this month,
 * sends a reminder email via the 'mail' collection (Firebase Trigger Email extension).
 * If the due date has already passed and no payment exists, sends an overdue alert.
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const scheduledPaymentReminder = onSchedule(
  { schedule: '0 14 * * *', timeZone: 'America/Bogota' }, // 14:00 UTC = 9:00 AM UTC-5
  async () => {
    const today = new Date();
    const month = currentMonthKey();

    // Get all occupied units with notifications enabled
    const unitsSnap = await db
      .collection('units')
      .where('status', '==', 'ocupado')
      .where('notificationsEnabled', '==', true)
      .get();

    for (const unitDoc of unitsSnap.docs) {
      const unit = unitDoc.data();
      const paymentDueDay: number | undefined = unit['paymentDueDay'];
      const tenantEmail: string | undefined = unit['tenantEmail'];

      if (!paymentDueDay || !tenantEmail) continue;

      // Check if payment already exists for this month (query by date range)
      const monthStart = Timestamp.fromDate(new Date(today.getFullYear(), today.getMonth(), 1));
      const monthEnd = Timestamp.fromDate(new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59));
      const paymentsSnap = await db
        .collection('payments')
        .where('unitId', '==', unitDoc.id)
        .where('date', '>=', monthStart)
        .where('date', '<=', monthEnd)
        .limit(1)
        .get();

      if (!paymentsSnap.empty) continue; // Already paid

      // Calculate days until due
      const dueDate = new Date(today.getFullYear(), today.getMonth(), paymentDueDay);
      const diffMs = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const propertySnap = await db.collection('properties').doc(unit['propertyId']).get();
      const propertyName = propertySnap.data()?.['name'] ?? 'tu inmueble';

      let notificationType: 'payment_reminder' | 'payment_overdue';
      let subject: string;
      let html: string;

      if (diffDays < 0) {
        // Overdue
        notificationType = 'payment_overdue';
        subject = `Pago vencido — ${propertyName} ${month}`;
        html = `
          <p>Hola,</p>
          <p>Tu pago de arriendo de <strong>${propertyName}</strong> para el mes de <strong>${month}</strong> está vencido.</p>
          <p><strong>Monto:</strong> $${unit['tenantRentPrice']?.toLocaleString('es-CO') ?? '—'}</p>
          <p>Por favor contacta a tu administrador para regularizar el pago.</p>
        `;
      } else if (diffDays <= 5) {
        // Upcoming reminder
        notificationType = 'payment_reminder';
        subject = `Recordatorio de pago — ${propertyName}`;
        html = `
          <p>Hola,</p>
          <p>Tu pago de arriendo de <strong>${propertyName}</strong> vence el <strong>día ${paymentDueDay}</strong> de este mes.</p>
          <p><strong>Monto:</strong> $${unit['tenantRentPrice']?.toLocaleString('es-CO') ?? '—'}</p>
          <p>Este es un recordatorio automático.</p>
        `;
      } else {
        continue; // Due date is more than 5 days away
      }

      const batch = db.batch();

      // Write to 'mail' collection (Firebase Trigger Email Extension)
      const mailRef = db.collection('mail').doc();
      batch.set(mailRef, {
        to: [tenantEmail],
        message: { subject, html },
        createdAt: Timestamp.now(),
      });

      // Log notification
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        unitId: unitDoc.id,
        propertyId: unit['propertyId'],
        tenantEmail,
        ownerId: unit['ownerId'],
        type: notificationType,
        channel: 'email',
        status: 'sent',
        sentAt: Timestamp.now(),
        viewedByOwner: false,
        metadata: {
          amount: unit['tenantRentPrice'] ?? null,
          daysUntilDue: diffDays,
          unitNumber: unit['number'],
          propertyName,
        },
      });

      await batch.commit();
    }
  }
);
