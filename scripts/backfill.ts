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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

const MIGRATIONS: Migration[] = [period, memberUids];

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
        const patch = migration.patch(docSnap.data(), collectionName);
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

/**
 * Cloud Shell reubica el directorio de configuración de gcloud a un temporal
 * (`CLOUDSDK_CONFIG=/tmp/tmp.XXXX`), así que
 * `gcloud auth application-default login` NO escribe en la ruta estándar
 * `~/.config/gcloud/`. El SDK de Admin solo mira ahí, no encuentra nada, y se
 * cae a la identidad de la máquina — que no tiene permisos sobre Firestore.
 *
 * El síntoma es desconcertante: acabas de autenticarte y aun así te deniega.
 * Aquí se apunta la variable al fichero que gcloud escribió de verdad.
 */
function resolveCloudShellCredentials(): void {
  if (process.env['GOOGLE_APPLICATION_CREDENTIALS']) return;

  const configDir = process.env['CLOUDSDK_CONFIG'];
  if (!configDir) return;

  const adc = join(configDir, 'application_default_credentials.json');
  if (existsSync(adc)) {
    process.env['GOOGLE_APPLICATION_CREDENTIALS'] = adc;
    console.log(`  (credenciales de gcloud: ${adc})\n`);
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

  resolveCloudShellCredentials();

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
      console.error('Si ya lo hiciste y sigue fallando, gcloud pudo guardar las');
      console.error('credenciales fuera de la ruta estándar (pasa en Cloud Shell):');
      console.error('  export GOOGLE_APPLICATION_CREDENTIALS="$(gcloud info \\');
      console.error('    --format=\'value(config.paths.global_config_dir)\')/application_default_credentials.json"\n');
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
