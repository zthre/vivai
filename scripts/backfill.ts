/**
 * Backfill de campos denormalizados sobre Firestore.
 *
 * Herramienta compartida por las migraciones del plan de datos. Recorre una
 * colección en páginas, calcula los campos que falten y los escribe en lotes.
 *
 * SIEMPRE se corre primero en seco. Sin `--apply` no escribe nada: solo cuenta
 * cuántos documentos cambiarían y enseña una muestra, para poder comparar el
 * número esperado antes de tocar producción.
 *
 * Credenciales: sirve el login de gcloud
 *   (`gcloud auth application-default login --project vivai-now`) o un service
 *   account en GOOGLE_APPLICATION_CREDENTIALS. Lo primero evita descargar una
 *   llave al disco, que es una credencial permanente que hay que custodiar.
 *
 * Uso:
 *   cd scripts && npm install
 *   npx tsx backfill.ts period            # en seco
 *   npx tsx backfill.ts period --apply    # escribe
 *
 * Es idempotente: un documento que ya tiene el valor correcto no se toca, así
 * que volver a correrlo tras una interrupción retoma donde se quedó.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Firestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = process.env['FIREBASE_PROJECT'] ?? 'vivai-now';
const PAGE_SIZE = 400;
const BATCH_LIMIT = 500;

interface Migration {
  name: string;
  description: string;
  collections: string[];
  /**
   * Se ejecuta una vez antes de recorrer nada. Sirve para cargar en memoria lo
   * que `patch` necesite cruzar (p. ej. el círculo de cada propiedad), en vez de
   * hacer una lectura por documento.
   */
  prepare?(db: Firestore): Promise<void>;
  /** Devuelve los campos a escribir, o `null` si el documento ya está bien. */
  patch(data: FirebaseFirestore.DocumentData, collection: string): Record<string, unknown> | null;
}

/** 'YYYY-MM' de una fecha, en la zona horaria del proceso. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(x => set.has(x));
}

// ── Migraciones ─────────────────────────────────────────────────────────────

/** Índices que `memberUids.prepare()` deja listos para `patch()`. */
const propertyCircles = new Map<string, string[]>();
const ownerCircles = new Map<string, Set<string>>();
/** uid del colaborador → duenos para los que colabora. */
const collaboratorOwners = new Map<string, Set<string>>();
/** propertyId → uid de su dueno. */
const propertyOwners = new Map<string, string>();
/** serviceId → uids que lo comparten, deducidos de donde se usa. */
const serviceCircles = new Map<string, Set<string>>();

/** Fase 2: clave de mes en pagos y gastos, derivada de `date`. */
const period: Migration = {
  name: 'period',
  description: "Añade period ('YYYY-MM') a payments y expenses, derivado de date",
  collections: ['payments', 'expenses'],
  patch(data) {
    const date = data['date'];
    if (!(date instanceof Timestamp)) return null;
    const expected = monthKey(date.toDate());
    return data['period'] === expected ? null : { period: expected };
  },
};

/**
 * Fase 3: círculo de acceso denormalizado.
 *
 * Dos ámbitos, igual que en el trigger `syncMemberUids`:
 *   - por propiedad: pagos, gastos, recibos y tickets heredan el círculo de SU propiedad;
 *   - por dueño: servicios y códigos, que no cuelgan de una propiedad, toman el
 *     círculo entero del dueño.
 *
 * Un documento cuya propiedad ya no existe conserva `[ownerId]`: dejarlo con el
 * array vacío lo volvería ilegible para todos en cuanto las reglas dependan del campo.
 */
const memberUids: Migration = {
  name: 'memberUids',
  description: 'Añade memberUids ([ownerId, ...collaboratorUids]) a todas las colecciones',
  collections: [
    'properties',
    'payments',
    'expenses',
    'serviceReceipts',
    'tickets',
    'services',
    'serviceAssignments',
  ],

  async prepare(db) {
    const snap = await db.collection('properties').get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const ownerId = data['ownerId'] as string | undefined;
      if (!ownerId) continue;
      const collaborators = (data['collaboratorUids'] as string[] | undefined) ?? [];
      const circle = [...new Set([ownerId, ...collaborators])].filter(Boolean);

      propertyCircles.set(doc.id, circle);
      const owned = ownerCircles.get(ownerId) ?? new Set<string>([ownerId]);
      for (const uid of circle) owned.add(uid);
      ownerCircles.set(ownerId, owned);
    }
    console.log(
      `  (${propertyCircles.size} propiedades, ${ownerCircles.size} dueños en memoria)\n`
    );
  },

  patch(data, collection) {
    const ownerId = data['ownerId'] as string | undefined;
    if (!ownerId) return null;

    let expected: string[];
    if (collection === 'properties') {
      const collaborators = (data['collaboratorUids'] as string[] | undefined) ?? [];
      expected = [...new Set([ownerId, ...collaborators])].filter(Boolean);
    } else if (collection === 'services' || collection === 'serviceAssignments') {
      expected = [...(ownerCircles.get(ownerId) ?? new Set([ownerId]))];
    } else {
      const propertyId = data['propertyId'] as string | undefined;
      expected = (propertyId && propertyCircles.get(propertyId)) || [ownerId];
    }

    const current = (data['memberUids'] as string[] | undefined) ?? [];
    return sameSet(current, expected) ? null : { memberUids: expected };
  },
};

/**
 * `ownerUids` en el documento de usuario: los duenos para los que colabora.
 *
 * Es lo que permite al dueno leer el perfil de su colaborador (nombre y correo)
 * en la pantalla de Colaboradores. Sin esto, esa lectura se deniega.
 */
const ownerUids: Migration = {
  name: 'ownerUids',
  description: 'Anade ownerUids a users: los duenos para los que cada persona colabora',
  collections: ['users'],

  async prepare(db) {
    const snap = await db.collection('properties').get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const ownerId = data['ownerId'] as string | undefined;
      if (!ownerId) continue;
      for (const uid of ((data['collaboratorUids'] as string[] | undefined) ?? [])) {
        const owners = collaboratorOwners.get(uid) ?? new Set<string>();
        owners.add(ownerId);
        collaboratorOwners.set(uid, owners);
      }
    }
    console.log(`  (${collaboratorOwners.size} colaboradores en memoria)\n`);
  },

  patch(data) {
    const uid = data['uid'] as string | undefined;
    if (!uid) return null;
    const expected = [...(collaboratorOwners.get(uid) ?? [])];
    const current = (data['ownerUids'] as string[] | undefined) ?? [];
    // Un usuario que no colabora para nadie no necesita el campo.
    if (expected.length === 0 && current.length === 0) return null;
    return sameSet(current, expected) ? null : { ownerUids: expected };
  },
};

/**
 * Repara los codigos de distribucion mal atribuidos.
 *
 * `ServiceAssignmentService.save` ponia en `ownerId` el uid de quien pulsaba, no
 * el del dueno de las propiedades — al reves que pagos, gastos, recibos y
 * servicios. Un codigo creado por un colaborador quedaba con
 * `memberUids: [uidDelColaborador]`: invisible para el dueno, y suficiente para
 * denegar la consulta entera de codigos de ese servicio, porque basta un
 * documento que no pase las reglas para tumbar el listado completo.
 *
 * El dueno correcto se deduce de las propiedades del propio codigo.
 */
const serviceAssignmentOwner: Migration = {
  name: 'serviceAssignmentOwner',
  description: 'Reatribuye serviceAssignments al dueno de sus propiedades',
  collections: ['serviceAssignments'],

  async prepare(db) {
    const snap = await db.collection('properties').get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const ownerId = data['ownerId'] as string | undefined;
      if (!ownerId) continue;
      propertyOwners.set(doc.id, ownerId);

      const collaborators = (data['collaboratorUids'] as string[] | undefined) ?? [];
      const owned = ownerCircles.get(ownerId) ?? new Set<string>([ownerId]);
      for (const uid of [ownerId, ...collaborators]) owned.add(uid);
      ownerCircles.set(ownerId, owned);
    }
    console.log(`  (${propertyOwners.size} propiedades en memoria)\n`);
  },

  patch(data) {
    const propertyIds = (data['propertyIds'] as string[] | undefined) ?? [];

    // El dueno sale de la primera propiedad que aun exista. Si ninguna existe,
    // no hay de donde deducirlo y se deja como esta: mejor un documento con el
    // dueno viejo que uno sin dueno.
    const resolved = propertyIds.map(id => propertyOwners.get(id)).find(Boolean);
    if (!resolved) return null;

    const expectedMembers = [...(ownerCircles.get(resolved) ?? new Set([resolved]))];
    const currentMembers = (data['memberUids'] as string[] | undefined) ?? [];

    const ownerOk = data['ownerId'] === resolved;
    const membersOk = sameSet(currentMembers, expectedMembers);
    if (ownerOk && membersOk) return null;

    return { ownerId: resolved, memberUids: expectedMembers };
  },
};

/**
 * Ensancha el circulo de cada servicio hasta cubrir a todos los que lo comparten.
 *
 * Un servicio no cuelga de una propiedad, asi que al crearlo solo se sabe el
 * circulo de quien lo crea. Pero si luego se registra un recibo suyo sobre la
 * propiedad de OTRO dueno, ese dueno tambien tiene que poder verlo — y con el
 * circulo original no podia: el servicio le salia como «eliminado», con sus
 * recibos sueltos por debajo.
 *
 * El circulo correcto se deduce de donde se usa el servicio: las propiedades de
 * sus recibos y de sus codigos de distribucion.
 */
const serviceCircle: Migration = {
  name: 'serviceCircle',
  description: 'Ensancha memberUids de services al circulo de las propiedades donde se usan',
  collections: ['services'],

  async prepare(db) {
    const props = await db.collection('properties').get();
    for (const doc of props.docs) {
      const data = doc.data();
      const ownerId = data['ownerId'] as string | undefined;
      if (!ownerId) continue;
      const collaborators = (data['collaboratorUids'] as string[] | undefined) ?? [];
      propertyCircles.set(doc.id, [...new Set([ownerId, ...collaborators])].filter(Boolean));
    }

    const add = (serviceId: string | undefined, propertyId: string | undefined) => {
      if (!serviceId || !propertyId) return;
      const circle = propertyCircles.get(propertyId);
      if (!circle) return;
      const acc = serviceCircles.get(serviceId) ?? new Set<string>();
      for (const uid of circle) acc.add(uid);
      serviceCircles.set(serviceId, acc);
    };

    const receipts = await db.collection('serviceReceipts').get();
    for (const d of receipts.docs) {
      add(d.data()['serviceId'] as string, d.data()['propertyId'] as string);
    }

    const assignments = await db.collection('serviceAssignments').get();
    for (const d of assignments.docs) {
      const data = d.data();
      for (const pid of ((data['propertyIds'] as string[] | undefined) ?? [])) {
        add(data['serviceId'] as string, pid);
      }
    }

    console.log(`  (${serviceCircles.size} servicios con uso registrado)\n`);
  },

  patch(data, _collection) {
    const ownerId = data['ownerId'] as string | undefined;
    if (!ownerId) return null;
    const id = data['__id'] as string;

    // El dueno siempre dentro, aunque el servicio aun no se use en ninguna parte.
    const expected = [...new Set([ownerId, ...(serviceCircles.get(id) ?? [])])];
    const current = (data['memberUids'] as string[] | undefined) ?? [];
    return sameSet(current, expected) ? null : { memberUids: expected };
  },
};

const MIGRATIONS: Migration[] = [
  period, memberUids, ownerUids, serviceAssignmentOwner, serviceCircle,
];

// ── Motor ───────────────────────────────────────────────────────────────────

async function run(db: Firestore, migration: Migration, apply: boolean): Promise<void> {
  for (const collectionName of migration.collections) {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let scanned = 0;
    let changed = 0;
    const sample: string[] = [];

    for (;;) {
      let q = db.collection(collectionName).orderBy('__name__').limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);

      const snap = await q.get();
      if (snap.empty) break;

      let batch = db.batch();
      let inBatch = 0;

      for (const docSnap of snap.docs) {
        scanned++;
        // `__id` deja el id del documento al alcance de `patch`, que solo recibe
        // los campos. Lo necesita `serviceCircle` para cruzar por serviceId.
        const patch = migration.patch({ ...docSnap.data(), __id: docSnap.id }, collectionName);
        if (!patch) continue;

        changed++;
        if (sample.length < 5) {
          sample.push(`${docSnap.id} → ${JSON.stringify(patch)}`);
        }
        if (apply) {
          batch.update(docSnap.ref, patch);
          if (++inBatch >= BATCH_LIMIT) {
            await batch.commit();
            batch = db.batch();
            inBatch = 0;
          }
        }
      }

      if (apply && inBatch > 0) await batch.commit();

      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < PAGE_SIZE) break;
    }

    const verb = apply ? 'actualizados' : 'se actualizarían';
    console.log(`  ${collectionName}: ${scanned} revisados, ${changed} ${verb}`);
    for (const line of sample) console.log(`    ${line}`);
  }
}

async function main(): Promise<void> {
  const [name, ...flags] = process.argv.slice(2);
  const apply = flags.includes('--apply');

  const migration = MIGRATIONS.find(m => m.name === name);
  if (!migration) {
    console.error(`Migración desconocida: ${name ?? '(ninguna)'}`);
    console.error('Disponibles:');
    for (const m of MIGRATIONS) console.error(`  ${m.name} — ${m.description}`);
    process.exit(1);
  }

  // `applicationDefault()` resuelve, en este orden: GOOGLE_APPLICATION_CREDENTIALS
  // si está puesta, y si no el login de gcloud (ADC). No se exige ninguna de las
  // dos aquí: si faltan, el primer acceso falla con un mensaje claro y se
  // reconduce abajo.
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();

  console.log(`\n${migration.name} — ${migration.description}`);
  console.log(apply ? 'MODO ESCRITURA\n' : 'EN SECO (sin --apply no se escribe nada)\n');

  try {
    if (migration.prepare) await migration.prepare(db);
    await run(db, migration, apply);
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    if (/credential|authenticat|permission|PERMISSION_DENIED|Could not load/i.test(message)) {
      console.error(`\nNo se pudo acceder a ${PROJECT_ID}: ${message}\n`);
      console.error('Autentícate con la cuenta dueña del proyecto:');
      console.error(`  gcloud auth application-default login --project ${PROJECT_ID}\n`);
      console.error('O apunta a un service account:');
      console.error('  export GOOGLE_APPLICATION_CREDENTIALS=/ruta/al/service-account.json\n');
      process.exit(1);
    }
    throw err;
  }

  if (!apply) console.log('\nNada escrito. Repite con --apply cuando los números cuadren.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
