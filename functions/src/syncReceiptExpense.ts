/**
 * Sincroniza el gasto asociado a un recibo de servicio.
 *
 * Marcar un recibo como pagado crea un `Expense` de categoria 'servicio' con el
 * mismo monto. Eran dos documentos que deben cuadrar y el vinculo se mantenia a
 * mano en cinco metodos del cliente (`setPaid`, `updateAmount`, `changeMonth`,
 * `delete`, `deleteByMonth`), cada uno con su `.catch(() => void 0)`: cualquier
 * fallo silencioso dejaba un gasto huerfano sumando en Finanzas, o un recibo
 * pagado sin gasto. Aqui la consistencia deja de depender de que el cliente
 * termine la secuencia.
 *
 * Convergencia con el cliente:
 *   - Los recibos nuevos usan el id determinista `expense_{receiptId}`, el mismo
 *     que calcula este trigger, asi que ambos escriben el MISMO documento y no
 *     se duplica nada mientras convivan.
 *   - Un recibo antiguo que ya apunta a un gasto con id automatico conserva ese
 *     gasto: se respeta `receipt.expenseId` cuando existe. Crear el determinista
 *     al lado seria justamente el duplicado que se quiere evitar.
 *
 * Cuando se verifique en produccion, se puede retirar la logica del cliente.
 */

import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';

if (!admin.apps.length) admin.initializeApp();

/**
 * Región de los triggers de Firestore.
 *
 * No es libre: un trigger v2 tiene que vivir en una región compatible con la
 * ubicación de la base de datos, o su creación falla con «Failed to create
 * function ... in region». Se lee del entorno para poder ajustarla sin tocar
 * código:
 *
 *   FUNCTIONS_REGION=southamerica-east1 firebase deploy --only functions
 *
 * El valor correcto sale de:
 *   gcloud firestore databases describe --format="value(locationId)"
 * Una multi-región como `nam5` admite `us-central1`; una región concreta exige
 * la suya.
 */
const REGION = process.env['FUNCTIONS_REGION'] ?? 'us-central1';

/**
 * Fecha con la que se registra el gasto: hoy si el recibo es del mes en curso, o
 * el ultimo dia de su mes en caso contrario, para que caiga en el periodo
 * correcto y no en el dia en que se marco.
 */
function accountingDateForMonth(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  const now = new Date();
  if (now.getFullYear() === y && now.getMonth() + 1 === m) return now;
  return new Date(y, m, 0, 12, 0, 0);
}

function describe(data: FirebaseFirestore.DocumentData): string {
  const code = data['assignmentCode'] ? ` · ${data['assignmentCode']}` : '';
  return `${data['serviceName'] ?? 'Servicio'}${code}`;
}

export const syncReceiptExpense = onDocumentWritten(
  { document: 'serviceReceipts/{receiptId}', region: REGION },
  async event => {
    const receiptId = event.params['receiptId'];
    const before = event.data?.before;
    const after = event.data?.after;
    const db = admin.firestore();

    // Recibo borrado: se lleva su gasto. Un gasto que sobrevive a su recibo
    // sigue sumando en Finanzas sin nada que lo explique.
    if (!after?.exists) {
      const staleId = (before?.data()?.['expenseId'] as string | undefined)
        ?? `expense_${receiptId}`;
      await db.collection('expenses').doc(staleId).delete().catch(() => void 0);
      return;
    }

    const data = after.data()!;
    // Se respeta el gasto ya vinculado; solo los recibos sin vinculo estrenan
    // el id determinista.
    const expenseId = (data['expenseId'] as string | undefined) || `expense_${receiptId}`;
    const expenseRef = db.collection('expenses').doc(expenseId);

    if (!data['isPaid']) {
      await expenseRef.delete().catch(() => void 0);
      if (data['expenseId']) await after.ref.update({ expenseId: null });
      return;
    }

    const month = (data['month'] as string) ?? '';
    const date = accountingDateForMonth(month);

    await expenseRef.set(
      {
        ownerId: data['ownerId'],
        memberUids: data['memberUids'] ?? [data['ownerId']],
        propertyId: data['propertyId'],
        propertyName: data['propertyName'] ?? data['propertyId'],
        category: 'servicio',
        description: describe(data),
        amount: data['propertyAmount'] ?? 0,
        date: Timestamp.fromDate(date),
        period: month,
        notes: data['notes'] || null,
        createdBy: data['paidBy'] ?? data['ownerId'],
        createdAt: data['createdAt'] ?? Timestamp.now(),
      },
      { merge: true }
    );

    // Deja el vinculo anotado en el recibo. Esta escritura vuelve a disparar el
    // trigger una vez; en esa segunda pasada el id ya coincide y no se escribe
    // nada mas, asi que el ciclo termina.
    if (data['expenseId'] !== expenseId) {
      await after.ref.update({ expenseId });
      logger.info(`syncReceiptExpense: recibo ${receiptId} vinculado a ${expenseId}`);
    }
  }
);
