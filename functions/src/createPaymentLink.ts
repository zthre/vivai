/**
 * v0.9.0 — Create Payment Link
 * Callable function: creates a Stripe Checkout Session for a property's rent payment.
 * Returns { url, linkId }.
 *
 * Required env vars (set via Firebase Functions config or .env.local):
 *   STRIPE_SECRET_KEY=sk_live_...
 *   APP_URL=https://vivai.app
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const createPaymentLink = onCall(async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

  const { propertyId, month } = request.data as { propertyId: string; month: string };
  if (!propertyId || !month) throw new HttpsError('invalid-argument', 'propertyId and month are required');

  const stripeKey = process.env['STRIPE_SECRET_KEY'];
  const appUrl = process.env['APP_URL'] ?? 'http://localhost:4200';
  if (!stripeKey) throw new HttpsError('failed-precondition', 'Stripe not configured');

  // Check for existing active link
  const existingSnap = await db
    .collection('paymentLinks')
    .where('propertyId', '==', propertyId)
    .where('month', '==', month)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (!existingSnap.empty) throw new HttpsError('already-exists', 'An active payment link already exists for this month');

  const propSnap = await db.collection('properties').doc(propertyId).get();
  if (!propSnap.exists) throw new HttpsError('not-found', 'Property not found');
  const property = propSnap.data()!;

  const propertyName = property['name'] ?? 'Propiedad';
  const amount: number = property['tenantRentPrice'] ?? 0;
  if (!amount) throw new HttpsError('invalid-argument', 'Property has no rent price configured');

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'cop',
        product_data: { name: `Arriendo ${propertyName} — ${month}` },
        unit_amount: amount * 100, // Stripe uses cents
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${appUrl}/tenant/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/tenant/pay`,
    customer_email: property['tenantEmail'] ?? undefined,
  });

  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));

  const linkRef = await db.collection('paymentLinks').add({
    propertyId,
    propertyName,
    ownerId: property['ownerId'],
    tenantEmail: property['tenantEmail'] ?? null,
    amount,
    month,
    status: 'active',
    gatewayProvider: 'stripe',
    externalId: session.id,
    externalUrl: session.url,
    createdAt: Timestamp.now(),
    expiresAt,
    paidAt: null,
  });

  return { url: session.url, linkId: linkRef.id };
});
