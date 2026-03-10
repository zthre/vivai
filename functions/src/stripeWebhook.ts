/**
 * v0.9.0 — Stripe Webhook
 * HTTP trigger that receives Stripe events.
 * On checkout.session.completed:
 *   1. Validates the signature
 *   2. Finds the paymentLink by externalId
 *   3. Creates a payment document in Firestore
 *   4. Updates paymentLink status to 'paid'
 *   5. Sends receipt email via 'mail' collection
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY=sk_live_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 */

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const stripeWebhook = onRequest(
  { invoker: 'public' },
  async (req, res) => {
    const stripeKey = process.env['STRIPE_SECRET_KEY'];
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];

    if (!stripeKey || !webhookSecret) {
      res.status(500).json({ error: 'Stripe not configured' });
      return;
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    const sig = req.headers['stripe-signature'];

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig as string, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    if (event.type !== 'checkout.session.completed') {
      res.json({ received: true });
      return;
    }

    const session = event.data.object as Stripe.Checkout.Session;

    // Find the paymentLink
    const linkSnap = await db
      .collection('paymentLinks')
      .where('externalId', '==', session.id)
      .limit(1)
      .get();

    if (linkSnap.empty) {
      console.error('No paymentLink found for session', session.id);
      res.status(404).json({ error: 'Payment link not found' });
      return;
    }

    const linkDoc = linkSnap.docs[0];
    const link = linkDoc.data();

    if (link['status'] === 'paid') {
      // Already processed — idempotent
      res.json({ received: true });
      return;
    }

    const now = Timestamp.now();
    const batch = db.batch();

    // Create payment document
    const paymentRef = db.collection('payments').doc();
    batch.set(paymentRef, {
      propertyId: link['propertyId'],
      ownerId: link['ownerId'],
      amount: link['amount'],
      date: now,
      notes: `Pago online — ${link['month']}`,
      source: 'gateway',
      gatewayTransactionId: session.payment_intent ?? session.id,
      paymentLinkId: linkDoc.id,
      createdAt: now,
      createdBy: 'stripe-webhook',
    });

    // Update paymentLink to paid
    batch.update(linkDoc.ref, { status: 'paid', paidAt: now });

    // Send receipt email
    if (link['tenantEmail']) {
      const mailRef = db.collection('mail').doc();
      batch.set(mailRef, {
        to: [link['tenantEmail']],
        message: {
          subject: `Recibo de pago — ${link['propertyName']} ${link['month']}`,
          html: `
            <p>Hola,</p>
            <p>Tu pago de arriendo fue confirmado exitosamente.</p>
            <ul>
              <li><strong>Inmueble:</strong> ${link['propertyName']}</li>
              <li><strong>Mes:</strong> ${link['month']}</li>
              <li><strong>Monto:</strong> $${link['amount']?.toLocaleString('es-CO')}</li>
              <li><strong>Fecha:</strong> ${now.toDate().toLocaleDateString('es-CO')}</li>
            </ul>
            <p>Gracias por tu pago.</p>
          `,
        },
        createdAt: now,
      });
    }

    try {
      await batch.commit();
    } catch (err) {
      console.error('Firestore batch failed:', err);
      res.status(500).json({ error: 'Database write failed' });
      return;
    }

    res.json({ received: true });
  }
);
