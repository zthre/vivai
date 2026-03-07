/**
 * v1.0.0 — Export Report (Callable)
 * Generates CSV or Excel report of payments + expenses for a date range.
 * Uploads to Firebase Storage (temp path, expires in 1 hour) and returns a signed URL.
 *
 * Input: { startMonth: "YYYY-MM", endMonth: "YYYY-MM", propertyId?: string, format: "csv" | "xlsx" }
 * Output: { url: string }
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

export const exportReport = onCall(async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

  const { startMonth, endMonth, propertyId, format } = request.data as {
    startMonth: string;
    endMonth: string;
    propertyId?: string;
    format: 'csv' | 'xlsx';
  };

  const uid = request.auth.uid;
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  const startDate = new Date(sy, sm - 1, 1);
  const endDate = new Date(ey, em, 0, 23, 59, 59);

  // Load property names
  const propsSnap = await db.collection('properties').where('ownerId', '==', uid).get();
  const propMap = new Map<string, string>(propsSnap.docs.map(d => [d.id, d.data()['name']]));

  // Load unit numbers
  const unitsSnap = await db.collection('units').where('ownerId', '==', uid).get();
  const unitMap = new Map<string, string>(unitsSnap.docs.map(d => [d.id, d.data()['number']]));

  const rows: Record<string, unknown>[] = [];

  // Payments
  let pq: admin.firestore.Query = db
    .collection('payments')
    .where('ownerId', '==', uid)
    .where('date', '>=', Timestamp.fromDate(startDate))
    .where('date', '<=', Timestamp.fromDate(endDate));
  if (propertyId) pq = pq.where('propertyId', '==', propertyId);
  const paymentsSnap = await pq.get();
  paymentsSnap.forEach(d => {
    const p = d.data();
    rows.push({
      Fecha: (p['date'] as Timestamp).toDate().toLocaleDateString('es-CO'),
      Inmueble: propMap.get(p['propertyId']) ?? p['propertyId'],
      Unidad: unitMap.get(p['unitId']) ?? (p['unitId'] ?? '—'),
      Concepto: `Pago${p['notes'] ? ': ' + p['notes'] : ''}`,
      Categoría: 'Ingreso',
      Monto: p['amount'],
      Fuente: p['source'] ?? 'manual',
    });
  });

  // Expenses
  let eq: admin.firestore.Query = db
    .collection('expenses')
    .where('ownerId', '==', uid)
    .where('date', '>=', Timestamp.fromDate(startDate))
    .where('date', '<=', Timestamp.fromDate(endDate));
  if (propertyId) eq = eq.where('propertyId', '==', propertyId);
  const expensesSnap = await eq.get();
  expensesSnap.forEach(d => {
    const e = d.data();
    rows.push({
      Fecha: (e['date'] as Timestamp).toDate().toLocaleDateString('es-CO'),
      Inmueble: propMap.get(e['propertyId']) ?? e['propertyId'],
      Unidad: '—',
      Concepto: e['description'],
      Categoría: e['category'],
      Monto: -e['amount'],
      Fuente: 'manual',
    });
  });

  rows.sort((a, b) => String(a['Fecha']).localeCompare(String(b['Fecha'])));

  let fileBuffer: Buffer;
  let fileName: string;
  let contentType: string;

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    fileBuffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    fileName = `reports/${uid}/reporte-${startMonth}-${endMonth}-${Date.now()}.xlsx`;
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else {
    const header = 'Fecha,Inmueble,Unidad,Concepto,Categoría,Monto,Fuente\n';
    const body = rows
      .map(r =>
        ['Fecha', 'Inmueble', 'Unidad', 'Concepto', 'Categoría', 'Monto', 'Fuente']
          .map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    fileBuffer = Buffer.from('\uFEFF' + header + body, 'utf-8');
    fileName = `reports/${uid}/reporte-${startMonth}-${endMonth}-${Date.now()}.csv`;
    contentType = 'text/csv';
  }

  const bucket = storage.bucket();
  const file = bucket.file(fileName);
  await file.save(fileBuffer, { contentType });

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  });

  return { url };
});
