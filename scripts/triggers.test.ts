/**
 * Pruebas de los triggers contra los emuladores de Firestore y Functions.
 *
 * Un trigger que escribe en Firestore y ademas actualiza el documento que lo
 * disparo es exactamente la clase de cosa que se descontrola sin probar: puede
 * duplicar documentos o entrar en bucle. Estas pruebas comprueban las dos cosas.
 *
 * Escribe con el bearer `owner`, que se salta las reglas, porque lo que se
 * verifica aqui es el comportamiento de los triggers, no los permisos (eso lo
 * cubre rules.test.ts).
 *
 * Uso:
 *   cd functions && npm run build && cd ..
 *   npx firebase-tools@13 emulators:exec --only firestore,functions \
 *     --project demo-vivai "npx tsx scripts/triggers.test.ts"
 */

const PROJECT = 'demo-vivai';
const HOST = process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const ADMIN = 'owner';

const OWNER = 'uid-owner';
const COLLAB = 'uid-collab';
const PROPERTY = 'prop-1';

let passes = 0;
let failures = 0;

// ── Utilidades ──────────────────────────────────────────────────────────────

function toValue(v: unknown): unknown {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  throw new Error(`Valor no soportado: ${String(v)}`);
}

function fromValue(v: any): unknown {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  return undefined;
}

/**
 * Escritura parcial (merge).
 *
 * El `updateMask` no es opcional: sin el, un PATCH REST REEMPLAZA el documento
 * entero por los campos enviados. Actualizar solo `propertyAmount` borraba de
 * paso `isPaid`, y entonces el trigger hacia lo correcto —quitar el gasto de un
 * recibo que ya no consta como pagado— por el motivo equivocado.
 */
async function write(path: string, data: Record<string, unknown>): Promise<void> {
  const mask = Object.keys(data)
    .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const res = await fetch(`${BASE}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, toValue(v)])
    ) }),
  });
  if (!res.ok) throw new Error(`write ${path}: ${res.status} ${await res.text()}`);
}

async function remove(path: string): Promise<void> {
  await fetch(`${BASE}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ADMIN}` },
  });
}

async function get(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${ADMIN}` } });
  if (res.status === 404) return null;
  const body = await res.json() as any;
  return Object.fromEntries(
    Object.entries(body.fields ?? {}).map(([k, v]) => [k, fromValue(v)])
  );
}

async function listIds(collection: string): Promise<string[]> {
  const res = await fetch(`${BASE}/${collection}?pageSize=100`, {
    headers: { Authorization: `Bearer ${ADMIN}` },
  });
  const body = await res.json() as any;
  return (body.documents ?? []).map((d: any) => String(d.name).split('/').pop());
}

/** Los triggers son asincronos: se sondea hasta que la condicion se cumple. */
async function until<T>(
  label: string,
  fn: () => Promise<T>,
  ok: (v: T) => boolean,
  timeoutMs = 15000
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null = null;
  while (Date.now() < deadline) {
    last = await fn();
    if (ok(last)) return last;
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`         (agotado el tiempo esperando: ${label})`);
  return last;
}

function record(ok: boolean, label: string, detail = ''): void {
  if (ok) {
    passes++;
    console.log(`    ok   ${label}`);
  } else {
    failures++;
    console.log(`    FALLA ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── Pruebas ─────────────────────────────────────────────────────────────────

async function testReceiptExpense(): Promise<void> {
  console.log('\n  syncReceiptExpense');

  await write(`properties/${PROPERTY}`, {
    ownerId: OWNER, collaboratorUids: [COLLAB], memberUids: [OWNER, COLLAB],
    name: 'Apto 101', status: 'ocupado',
  });

  // Recibo sin pagar: no debe existir gasto.
  await write('serviceReceipts/rec-1', {
    ownerId: OWNER, memberUids: [OWNER, COLLAB], propertyId: PROPERTY,
    propertyName: 'Apto 101', serviceId: 'svc-1', serviceName: 'Agua',
    month: '2026-09', propertyAmount: 30000, isPaid: false,
  });
  await new Promise(r => setTimeout(r, 1500));
  record(await get('expenses/expense_rec-1') === null, 'recibo sin pagar no crea gasto');

  // Al marcarlo pagado aparece el gasto, con el id determinista.
  await write('serviceReceipts/rec-1', {
    ownerId: OWNER, memberUids: [OWNER, COLLAB], propertyId: PROPERTY,
    propertyName: 'Apto 101', serviceId: 'svc-1', serviceName: 'Agua',
    month: '2026-09', propertyAmount: 30000, isPaid: true, paidBy: OWNER,
  });
  const expense = await until('gasto creado', () => get('expenses/expense_rec-1'), v => v !== null);
  record(expense !== null, 'marcar pagado crea el gasto');
  record(expense?.['amount'] === 30000, 'el gasto lleva el monto del recibo',
    `amount=${String(expense?.['amount'])}`);
  record(expense?.['category'] === 'servicio', "el gasto es de categoría 'servicio'");
  record(expense?.['period'] === '2026-09', 'el gasto lleva el periodo del recibo');
  record(
    Array.isArray(expense?.['memberUids']) && (expense?.['memberUids'] as string[]).includes(COLLAB),
    'el gasto hereda memberUids del recibo'
  );

  // El trigger anota el vinculo en el recibo, y eso NO puede volverse un bucle.
  const linked = await until('vínculo anotado',
    () => get('serviceReceipts/rec-1'), v => v?.['expenseId'] === 'expense_rec-1');
  record(linked?.['expenseId'] === 'expense_rec-1', 'el recibo queda vinculado al gasto');

  await new Promise(r => setTimeout(r, 3000));
  const afterSettle = await listIds('expenses');
  record(afterSettle.length === 1, 'no hay bucle: un solo gasto tras estabilizarse',
    `hay ${afterSettle.length}`);

  // Cambiar el monto lo propaga.
  await write('serviceReceipts/rec-1', { propertyAmount: 45000 });
  const updated = await until('monto propagado',
    () => get('expenses/expense_rec-1'), v => v?.['amount'] === 45000);
  record(updated?.['amount'] === 45000, 'cambiar el monto del recibo actualiza el gasto');

  // Desmarcarlo borra el gasto.
  await write('serviceReceipts/rec-1', { isPaid: false });
  const gone = await until('gasto borrado', () => get('expenses/expense_rec-1'), v => v === null);
  record(gone === null, 'desmarcar el pago borra el gasto');

  // Borrar el recibo pagado se lleva su gasto.
  await write('serviceReceipts/rec-2', {
    ownerId: OWNER, memberUids: [OWNER], propertyId: PROPERTY, propertyName: 'Apto 101',
    serviceId: 'svc-1', serviceName: 'Luz', month: '2026-09',
    propertyAmount: 12000, isPaid: true, paidBy: OWNER,
  });
  await until('gasto de rec-2', () => get('expenses/expense_rec-2'), v => v !== null);
  await remove('serviceReceipts/rec-2');
  const orphan = await until('gasto huérfano', () => get('expenses/expense_rec-2'), v => v === null);
  record(orphan === null, 'borrar el recibo se lleva su gasto');

  // Un recibo antiguo que ya apunta a un gasto con id automatico NO estrena
  // otro: se respeta el vinculo o se duplicaria el gasto.
  await write('expenses/legacy-expense-id', {
    ownerId: OWNER, propertyId: PROPERTY, propertyName: 'Apto 101',
    category: 'servicio', description: 'Gas', amount: 8000, period: '2026-08',
  });
  await write('serviceReceipts/rec-legacy', {
    ownerId: OWNER, memberUids: [OWNER], propertyId: PROPERTY, propertyName: 'Apto 101',
    serviceId: 'svc-2', serviceName: 'Gas', month: '2026-08',
    propertyAmount: 9000, isPaid: true, expenseId: 'legacy-expense-id',
  });
  const legacy = await until('gasto legado actualizado',
    () => get('expenses/legacy-expense-id'), v => v?.['amount'] === 9000);
  record(legacy?.['amount'] === 9000, 'un recibo antiguo actualiza SU gasto, no crea otro');
  record(await get('expenses/expense_rec-legacy') === null,
    'no aparece un gasto determinista al lado del legado');
}

async function testMemberUids(): Promise<void> {
  console.log('\n  syncMemberUids');

  await write('payments/pay-1', {
    ownerId: OWNER, propertyId: PROPERTY, memberUids: [OWNER, COLLAB],
    amount: 1000, period: '2026-09',
  });

  // Quitar al colaborador de la propiedad lo quita de sus documentos hijos.
  await write(`properties/${PROPERTY}`, {
    ownerId: OWNER, collaboratorUids: [], memberUids: [OWNER],
    name: 'Apto 101', status: 'ocupado',
  });
  const payment = await until('colaborador retirado',
    () => get('payments/pay-1'),
    v => Array.isArray(v?.['memberUids']) && !(v!['memberUids'] as string[]).includes(COLLAB));
  record(
    Array.isArray(payment?.['memberUids']) && !(payment!['memberUids'] as string[]).includes(COLLAB),
    'retirar un colaborador lo saca de los pagos de esa propiedad'
  );
  record(
    Array.isArray(payment?.['memberUids']) && (payment!['memberUids'] as string[]).includes(OWNER),
    'el dueño sigue en memberUids'
  );

  // Y volver a añadirlo lo devuelve.
  await write(`properties/${PROPERTY}`, {
    ownerId: OWNER, collaboratorUids: [COLLAB], memberUids: [OWNER, COLLAB],
    name: 'Apto 101', status: 'ocupado',
  });
  const back = await until('colaborador devuelto',
    () => get('payments/pay-1'),
    v => Array.isArray(v?.['memberUids']) && (v!['memberUids'] as string[]).includes(COLLAB));
  record(
    Array.isArray(back?.['memberUids']) && (back!['memberUids'] as string[]).includes(COLLAB),
    'volver a añadirlo lo devuelve a los documentos hijos'
  );
}

async function main(): Promise<void> {
  await testReceiptExpense();
  await testMemberUids();
  console.log(`\n  ${passes} ok, ${failures} fallos\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
