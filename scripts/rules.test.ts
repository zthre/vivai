/**
 * Pruebas de las reglas de Firestore contra el emulador.
 *
 * Existen por un paso concreto del plan de datos: retirar
 * `allow read: if request.auth != null` de `services` y `serviceReceipts` y
 * dejar solo `isMember()`. Es el paso que cierra el agujero de lectura y, a la
 * vez, el unico que puede dejar pantallas en blanco si algun documento se quedo
 * sin `memberUids`.
 *
 * Por eso la suite corre DOS veces sobre el mismo fixture:
 *   1. con las reglas tal como estan en firestore.rules (aditivas), y
 *   2. con las sustituciones pendientes ya aplicadas.
 *
 * Si (2) pasa, endurecer es seguro. Si falla, dice que acceso legitimo se rompe.
 *
 * Habla con el emulador por REST y firma tokens `alg: none` —que es lo que el
 * emulador acepta— en vez de usar `@firebase/rules-unit-testing`: asi no hace
 * falta instalar nada, y el registro npm del proyecto bloquea ese paquete.
 *
 * Uso:
 *   npx firebase-tools@13 emulators:exec --only firestore --project demo-vivai \
 *     "npx tsx scripts/rules.test.ts"
 */

import { readFileSync } from 'node:fs';

const PROJECT = 'demo-vivai';
const HOST = process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

const OWNER = 'uid-owner';
const COLLAB = 'uid-collab';
const TENANT = 'uid-tenant';
const STRANGER = 'uid-stranger';
const INVITED_TENANT = 'uid-invited-tenant';
const INVITED_COLLAB = 'uid-invited-collab';
const INVITED_TENANT_EMAIL = 'invitado@example.com';
const INVITED_COLLAB_EMAIL = 'pendiente@example.com';

const PROPERTY = 'prop-1';
const LEGACY_PROPERTY = 'prop-legacy';
const INVITE_PROPERTY = 'prop-invite';
const CIRCLE = [OWNER, COLLAB];

let passes = 0;
let failures = 0;

// ── Tokens ──────────────────────────────────────────────────────────────────

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * Token sin firma. El emulador los acepta tal cual: es exactamente lo que hace
 * `@firebase/rules-unit-testing` por dentro.
 */
function token(uid: string, email?: string): string {
  const header = b64url({ alg: 'none', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: uid,
    user_id: uid,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    email: email ?? null,
    email_verified: !!email,
    firebase: { sign_in_provider: 'custom', identities: {} },
  });
  return `${header}.${payload}.`;
}

/** `owner` es el bearer con el que el emulador se salta las reglas. */
const ADMIN = 'owner';

// ── Serializacion de valores Firestore ──────────────────────────────────────

function toValue(v: unknown): unknown {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  throw new Error(`Valor no soportado: ${String(v)}`);
}

function toFields(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
}

// ── Operaciones ─────────────────────────────────────────────────────────────

async function put(path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) throw new Error(`seed ${path}: ${res.status} ${await res.text()}`);
}

async function read(as: string, path: string): Promise<number> {
  const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${as}` } });
  return res.status;
}

async function listByMember(as: string, collection: string, uid: string): Promise<number> {
  const res = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${as}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'memberUids' },
            op: 'ARRAY_CONTAINS',
            value: { stringValue: uid },
          },
        },
      },
    }),
  });
  return res.status;
}

async function setRules(source: string): Promise<void> {
  const res = await fetch(
    `http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: source }] } }),
    }
  );
  if (!res.ok) throw new Error(`No se pudieron cargar las reglas: ${await res.text()}`);
}

async function clear(): Promise<void> {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

// ── Aserciones ──────────────────────────────────────────────────────────────

function record(ok: boolean, label: string, detail: string): void {
  if (ok) {
    passes++;
    console.log(`    ok   ${label}`);
  } else {
    failures++;
    console.log(`    FALLA ${label} — ${detail}`);
  }
}

async function allowed(label: string, status: Promise<number>): Promise<void> {
  const s = await status;
  record(s === 200, label, `esperaba 200, llego ${s}`);
}

async function denied(label: string, status: Promise<number>): Promise<void> {
  const s = await status;
  record(s === 403, label, `esperaba 403 (denegado), llego ${s}`);
}

// ── Fixture ─────────────────────────────────────────────────────────────────

/**
 * Documentos LEGADOS: exactamente como estan hoy en produccion, sin `memberUids`.
 *
 * Es el escenario del despliegue: las reglas nuevas salen antes que el backfill,
 * asi que durante un rato conviven los dos formatos. Si estas comprobaciones
 * pasan, publicar las reglas aditivas no rompe nada.
 */
async function seedLegacy(): Promise<void> {
  await put(`properties/${LEGACY_PROPERTY}`, {
    ownerId: OWNER, collaboratorUids: [COLLAB],
    tenantUid: TENANT, name: 'Apto 202 (legado)', isPublic: false,
  });
  await put('payments/pay-legacy', {
    ownerId: OWNER, propertyId: LEGACY_PROPERTY, amount: 900,
  });
  await put('expenses/exp-legacy', {
    ownerId: OWNER, propertyId: LEGACY_PROPERTY, amount: 40,
  });
  await put('serviceReceipts/rec-legacy', {
    ownerId: OWNER, propertyId: LEGACY_PROPERTY, month: '2026-08', propertyAmount: 25,
  });
  await put('tickets/tic-legacy', {
    ownerId: OWNER, propertyId: LEGACY_PROPERTY, tenantUid: TENANT, status: 'pendiente',
  });
}

/**
 * Propiedad con invitaciones por correo aun sin vincular.
 *
 * Es el estado en el que el dueno ya escribio el correo del inquilino o del
 * colaborador, pero esa persona todavia no ha entrado por primera vez: no tiene
 * `tenantUid` puesto ni figura en `collaboratorUids`.
 *
 * `AuthService` busca justo esto al iniciar sesion —properties por `tenantEmail`
 * y por `pendingCollaboratorEmails`— para vincularse. Si las reglas no dejan
 * LEER esa propiedad, la consulta se deniega y el vinculo nunca ocurre.
 */
async function seedUsers(): Promise<void> {
  await put(`users/${COLLAB}`, {
    uid: COLLAB, email: 'colab@example.com', displayName: 'Ana Colaboradora',
    roles: ['colaborador'], collaboratingPropertyIds: [PROPERTY],
    ownerUids: [OWNER],
  });
  await put(`users/${STRANGER}`, {
    uid: STRANGER, email: 'ajeno@example.com', displayName: 'Nadie',
    roles: ['owner'], collaboratingPropertyIds: [],
  });
}

async function seedInvites(): Promise<void> {
  await put(`properties/${INVITE_PROPERTY}`, {
    ownerId: OWNER,
    collaboratorUids: [],
    memberUids: [OWNER],
    tenantEmail: INVITED_TENANT_EMAIL,
    pendingCollaboratorEmails: [INVITED_COLLAB_EMAIL],
    name: 'Apto 303 (invitaciones sin vincular)',
    isPublic: false,
  });
}

/** Todo lleva `memberUids`, que es el estado despues del backfill. */
async function seed(): Promise<void> {
  await put(`properties/${PROPERTY}`, {
    ownerId: OWNER, collaboratorUids: [COLLAB], memberUids: CIRCLE,
    tenantUid: TENANT, name: 'Apto 101', isPublic: false,
  });
  await put('payments/pay-1', {
    ownerId: OWNER, propertyId: PROPERTY, memberUids: CIRCLE, amount: 1000, period: '2026-09',
  });
  await put('expenses/exp-1', {
    ownerId: OWNER, propertyId: PROPERTY, memberUids: CIRCLE, amount: 50, period: '2026-09',
  });
  await put('serviceReceipts/rec-1', {
    ownerId: OWNER, propertyId: PROPERTY, memberUids: CIRCLE, month: '2026-09', propertyAmount: 30,
  });
  await put('tickets/tic-1', {
    ownerId: OWNER, propertyId: PROPERTY, memberUids: CIRCLE, tenantUid: TENANT, status: 'pendiente',
  });
  await put('services/svc-1', { ownerId: OWNER, memberUids: CIRCLE, name: 'Agua', isActive: true });
  await put('serviceAssignments/asg-1', {
    ownerId: OWNER, serviceId: 'svc-1', memberUids: CIRCLE, propertyIds: [PROPERTY],
  });
}

/** Aplica las sustituciones que firestore.rules deja marcadas como pendientes. */
function tighten(rules: string): string {
  const out = rules
    .replace(/allow read: if isMember\(\) \|\| request\.auth != null;/g,
             'allow read: if isMember();')
    .replace(/allow create, update, delete: if request\.auth != null;/g,
             'allow create: if willBeMember();\n      allow update, delete: if isMember();');
  if (out === rules) throw new Error('tighten() no sustituyo nada — revisa firestore.rules');
  return out;
}

// ── Suite ───────────────────────────────────────────────────────────────────

const CIRCLE_PATHS = [
  'payments/pay-1', 'expenses/exp-1', 'serviceReceipts/rec-1',
  'tickets/tic-1', 'services/svc-1', 'serviceAssignments/asg-1',
];

async function suite(strict: boolean): Promise<void> {
  const owner = token(OWNER);
  const collab = token(COLLAB);
  const tenant = token(TENANT, 'tenant@example.com');
  const stranger = token(STRANGER);

  for (const [who, as, uid] of [['dueño', owner, OWNER], ['colaborador', collab, COLLAB]] as const) {
    await allowed(`${who} lee su propiedad`, read(as, `properties/${PROPERTY}`));
    for (const path of CIRCLE_PATHS) {
      await allowed(`${who} lee ${path}`, read(as, path));
    }
    await allowed(`${who} lista recibos por memberUids`,
      listByMember(as, 'serviceReceipts', uid));
  }

  await allowed('inquilino lee su propiedad', read(tenant, `properties/${PROPERTY}`));
  await allowed('inquilino lee su pago', read(tenant, 'payments/pay-1'));
  await allowed('inquilino lee su ticket', read(tenant, 'tickets/tic-1'));
  await denied('inquilino NO lee gastos', read(tenant, 'expenses/exp-1'));

  for (const path of ['payments/pay-1', 'expenses/exp-1', 'tickets/tic-1', `properties/${PROPERTY}`]) {
    await denied(`extraño NO lee ${path}`, read(stranger, path));
  }

  // ── Documentos legados, sin `memberUids` ────────────────────────────────
  // Con las reglas aditivas tienen que seguir resolviendo por el camino viejo.
  // Con las endurecidas, `services`/`serviceReceipts` dejan de leerse: es el
  // motivo por el que ese paso va DESPUES del backfill y no antes.
  for (const [who, as] of [['dueño', owner], ['colaborador', collab]] as const) {
    await allowed(`${who} lee propiedad legada`, read(as, `properties/${LEGACY_PROPERTY}`));
    await allowed(`${who} lee pago legado`, read(as, 'payments/pay-legacy'));
    await allowed(`${who} lee gasto legado`, read(as, 'expenses/exp-legacy'));
    await allowed(`${who} lee ticket legado`, read(as, 'tickets/tic-legacy'));
  }
  await allowed('inquilino lee su pago legado', read(tenant, 'payments/pay-legacy'));
  await denied('extraño NO lee pago legado', read(stranger, 'payments/pay-legacy'));

  await (strict ? denied : allowed)(
    `dueño ${strict ? 'PIERDE' : 'conserva'} el recibo legado`,
    read(owner, 'serviceReceipts/rec-legacy')
  );

  // ── Vinculacion por correo en el primer inicio de sesion ────────────────
  // Sin esto, `AuthService` no puede encontrar la propiedad a la que fue
  // invitado y la consulta revienta con permission-denied en cada login.
  const invitedTenant = token(INVITED_TENANT, INVITED_TENANT_EMAIL);
  const invitedCollab = token(INVITED_COLLAB, INVITED_COLLAB_EMAIL);

  await allowed('inquilino invitado lee la propiedad para vincularse',
    read(invitedTenant, `properties/${INVITE_PROPERTY}`));
  await allowed('colaborador pendiente lee la propiedad para vincularse',
    read(invitedCollab, `properties/${INVITE_PROPERTY}`));
  await denied('extraño sin invitación NO lee esa propiedad',
    read(stranger, `properties/${INVITE_PROPERTY}`));

  // ── Perfil de un colaborador ────────────────────────────────────────────
  // La pantalla de Colaboradores lee users/{uid} de cada colaborador para
  // mostrar su nombre y correo. Sin esto se queda cargando para siempre.
  await allowed('dueño lee el perfil de su colaborador',
    read(owner, `users/${COLLAB}`));
  await allowed('colaborador lee su propio perfil',
    read(collab, `users/${COLLAB}`));
  await denied('dueño NO lee el perfil de un usuario ajeno',
    read(owner, `users/${STRANGER}`));

  // El motivo de esta suite: hoy pasan, endurecidas deben denegar.
  const assertFn = strict ? denied : allowed;
  const verb = strict ? 'NO lee' : 'lee (agujero actual)';
  await assertFn(`extraño ${verb} serviceReceipts`, read(stranger, 'serviceReceipts/rec-1'));
  await assertFn(`extraño ${verb} services`, read(stranger, 'services/svc-1'));
}

async function main(): Promise<void> {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  for (const [label, source, strict] of [
    ['reglas actuales (aditivas)', rules, false],
    ['reglas endurecidas (paso pendiente)', tighten(rules), true],
  ] as const) {
    console.log(`\n  ${label}`);
    await setRules(source);
    await clear();
    await seed();
    await seedLegacy();
    await seedInvites();
    await seedUsers();
    await suite(strict);
  }

  console.log(`\n  ${passes} ok, ${failures} fallos\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
