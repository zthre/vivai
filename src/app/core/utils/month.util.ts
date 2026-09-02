/**
 * Manejo de meses, en un solo sitio.
 *
 * `YYYY-MM` es la clave con la que se guardan los recibos de servicios, los
 * snapshots y los enlaces de pago, y con la que se navega por mes en casi todas
 * las pantallas. Antes cada componente traía su propia copia de `startOfMonth`,
 * `endOfMonth` y del `padStart(2, '0')` que arma la clave: siete y ocho copias
 * respectivamente, con diferencias sutiles (unas fijaban la hora, otras no).
 *
 * Todo lo de aquí trabaja en hora LOCAL, igual que las copias que reemplaza:
 * un recibo de agosto tiene que seguir siendo de agosto para quien lo registró,
 * no desplazarse por UTC.
 */

/** Clave de mes: 'YYYY-MM'. */
export type MonthKey = string;

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

/** Primer instante del mes de `d`. */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/** Último instante del mes de `d`. */
export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** El mes de `d` como 'YYYY-MM'. */
export function monthKey(d: Date): MonthKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** El mes en curso como 'YYYY-MM'. */
export function currentMonthKey(): MonthKey {
  return monthKey(new Date());
}

/** ¿Es una clave de mes bien formada? */
export function isMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value);
}

/** Primer día del mes que representa la clave, o `null` si no es válida. */
export function fromMonthKey(key: string): Date | null {
  if (!isMonthKey(key)) return null;
  const [y, m] = key.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(y, m - 1, 1);
}

/** Rango completo del mes de `d`, listo para consultas por `date`. */
export function monthRange(d: Date): { start: Date; end: Date } {
  return { start: startOfMonth(d), end: endOfMonth(d) };
}

/** Desplaza `n` meses (negativo hacia atrás), siempre al día 1. */
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** ¿`a` y `b` caen en el mismo mes calendario? */
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** ¿`d` es el mes en curso? */
export function isCurrentMonth(d: Date): boolean {
  return isSameMonth(d, new Date());
}

/** Etiqueta legible: 'septiembre de 2026'. */
export function monthLabel(d: Date): string {
  return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

/** La misma etiqueta, partiendo de una clave 'YYYY-MM'. */
export function monthLabelFromKey(key: string): string {
  const d = fromMonthKey(key);
  return d ? monthLabel(d) : key;
}

/**
 * Fecha con la que se registra un movimiento contable atribuido a un mes:
 * hoy si es el mes en curso, o el último día de ese mes en caso contrario, para
 * que caiga en el periodo correcto y no en el día en que se hizo el registro.
 */
export function accountingDateForMonth(key: MonthKey): Date {
  const [y, m] = key.split('-').map(Number);
  const now = new Date();
  if (now.getFullYear() === y && now.getMonth() + 1 === m) return now;
  return new Date(y, m, 0, 12, 0, 0);
}
