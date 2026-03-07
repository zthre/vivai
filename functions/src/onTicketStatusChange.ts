/**
 * v0.8.0 — On Ticket Status Change
 * Triggered when a ticket document is updated.
 * If the status field changes, sends an email notification to the tenant.
 */

import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { Timestamp } from 'firebase-admin/firestore';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

export const onTicketStatusChange = onDocumentUpdated('tickets/{ticketId}', async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;
  if (before['status'] === after['status']) return; // No status change

  const unitId: string = after['unitId'];
  if (!unitId) return;

  const unitSnap = await db.collection('units').doc(unitId).get();
  const tenantEmail: string | undefined = unitSnap.data()?.['tenantEmail'];
  if (!tenantEmail) return;

  const propertyName = after['propertyName'] ?? 'tu inmueble';
  const ticketTitle = after['title'] ?? 'Tu solicitud';
  const newStatusLabel = STATUS_LABELS[after['status']] ?? after['status'];

  const subject = `Actualización de ticket — ${ticketTitle}`;
  const html = `
    <p>Hola,</p>
    <p>Tu solicitud de mantenimiento "<strong>${ticketTitle}</strong>" en <strong>${propertyName}</strong>
    ha cambiado de estado a: <strong>${newStatusLabel}</strong>.</p>
    <p>Puedes revisar el detalle en el portal de inquilinos.</p>
  `;

  const batch = db.batch();

  // Mail
  batch.set(db.collection('mail').doc(), {
    to: [tenantEmail],
    message: { subject, html },
    createdAt: Timestamp.now(),
  });

  // Notification log
  batch.set(db.collection('notifications').doc(), {
    unitId,
    propertyId: after['propertyId'] ?? '',
    tenantEmail,
    ownerId: after['ownerId'] ?? '',
    type: 'ticket_update',
    channel: 'email',
    status: 'sent',
    sentAt: Timestamp.now(),
    viewedByOwner: false,
    metadata: {
      ticketTitle,
      ticketStatus: after['status'],
      propertyName,
      unitNumber: unitSnap.data()?.['number'] ?? null,
    },
  });

  await batch.commit();
});
