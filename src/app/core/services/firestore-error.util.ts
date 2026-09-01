import { Observable, of, catchError } from 'rxjs';

/**
 * Logging centralizado de errores de Firestore.
 *
 * Un error de Firestore que llega crudo a la consola no dice qué colección ni qué
 * consulta lo produjo, y si viaja dentro de un observable consumido por `toSignal`
 * se relanza en cada lectura y aborta la detección de cambios de la pantalla.
 * Aquí se etiqueta, se explica y se degrada a un valor seguro.
 */

export interface FirestoreErrorDetails {
  /** Colección consultada */
  collection?: string;
  /** Forma de la consulta, p. ej. "propertyId == abc123, month == 2026-08" */
  query?: string;
  [key: string]: unknown;
}

interface FirebaseLikeError {
  code?: string;
  message?: string;
}

/** Qué hacer ante cada código de error, en lenguaje accionable. */
function hintFor(code: string, details?: FirestoreErrorDetails): string {
  const col = details?.collection ? `\`${details.collection}\`` : 'la colección';
  switch (code) {
    case 'permission-denied':
      return `Las reglas de ${col} deniegan esta lectura/escritura. Revisa firestore.rules. ` +
        `Ojo: en un listado basta UN documento que no pase para denegar la consulta entera, ` +
        `y un get() sobre un path inválido (ID vacío o documento borrado) también deniega.`;
    case 'failed-precondition':
      return `Falta un índice compuesto. Firestore incluye la URL para crearlo en el mensaje de abajo; ` +
        `ábrela y dale a "Crear índice", o reescribe la consulta para no necesitarlo.`;
    case 'unauthenticated':
      return 'No hay sesión válida. La sesión pudo expirar: vuelve a iniciar sesión.';
    case 'not-found':
      return 'El documento no existe. Puede ser una referencia huérfana a algo ya borrado.';
    case 'resource-exhausted':
      return 'Cuota de Firestore agotada, o la consulta excedió el tope de accesos a documentos.';
    case 'unavailable':
      return 'Firestore no respondió (red o caída del servicio). Suele resolverse reintentando.';
    default:
      return 'Error no clasificado de Firestore.';
  }
}

/**
 * Imprime un error de Firestore con contexto suficiente para actuar:
 * dónde ocurrió, qué colección, qué consulta, el código y qué hacer.
 */
export function logFirestoreError(
  context: string,
  err: unknown,
  details?: FirestoreErrorDetails
): void {
  const e = err as FirebaseLikeError;
  const code = e?.code ?? 'unknown';

  console.error(
    `%c[Firestore] ${context} → ${code}`,
    'color:#dc2626;font-weight:bold',
    {
      codigo: code,
      coleccion: details?.collection ?? '(sin especificar)',
      consulta: details?.query ?? '(sin especificar)',
      queHacer: hintFor(code, details),
      mensaje: e?.message ?? String(err),
      error: err,
    }
  );
}

/**
 * Protege un observable de consulta: registra el error y degrada al valor de
 * respaldo en vez de propagarlo. Sin esto, `toSignal` relanza el error en cada
 * lectura de la señal y rompe la vista completa.
 */
export function guardQuery<T>(
  context: string,
  fallback: T,
  details?: FirestoreErrorDetails
): (source: Observable<T>) => Observable<T> {
  return (source: Observable<T>) =>
    source.pipe(
      catchError(err => {
        logFirestoreError(context, err, details);
        return of(fallback);
      })
    );
}

/**
 * Envuelve una escritura: registra el error con contexto y lo vuelve a lanzar,
 * para que la UI siga mostrando su mensaje al usuario.
 */
export async function loggedWrite<T>(
  context: string,
  fn: () => Promise<T>,
  details?: FirestoreErrorDetails
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logFirestoreError(context, err, details);
    throw err;
  }
}
