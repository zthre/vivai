import { Timestamp } from '@angular/fire/firestore';

export type DistributionMethod = 'por_persona' | 'partes_iguales' | 'manual';

/**
 * La factura de un servicio para un código y un mes: el total que llegó y cómo
 * se reparte.
 *
 * Ese total vivía copiado en `totalAmount` dentro de CADA recibo del reparto. Con
 * seis propiedades eran seis copias del mismo número, y corregir un dígito mal
 * tecleado obligaba a regenerar los recibos — es decir, a borrarlos y recrearlos,
 * incluidos los que ya estaban pagados, con su gasto asociado.
 *
 * Con la factura aparte, corregir el total recalcula los montos EN SITIO: los
 * recibos conservan su id, su estado de pago y su gasto.
 *
 * El id es determinista, `{assignmentId}_{month}`: un código y un mes tienen una
 * sola factura.
 */
export interface ServiceBill {
  id?: string;
  assignmentId: string;
  serviceId: string;
  ownerId: string;
  /** Círculo de acceso, como en el resto de colecciones. */
  memberUids: string[];
  /** 'YYYY-MM' */
  month: string;
  totalAmount: number;
  distributionMethod: DistributionMethod;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** Id determinista de la factura de un código en un mes. */
export function serviceBillId(assignmentId: string, month: string): string {
  return `${assignmentId}_${month}`;
}

/**
 * Reparte un total entre propiedades según el método.
 *
 * Vive aquí, y no dentro del servicio, para que el reparto inicial y la
 * corrección posterior del total usen exactamente el mismo cálculo — si se
 * duplicara, corregir daría cifras distintas a generar.
 */
export function distribute(
  total: number,
  method: DistributionMethod,
  properties: { id: string; residentCount: number }[]
): Record<string, number> {
  const amounts: Record<string, number> = {};
  const round = (n: number) => Math.round(n * 100) / 100;

  if (method === 'por_persona') {
    const people = properties.reduce((sum, p) => sum + p.residentCount, 0);
    for (const p of properties) {
      amounts[p.id] = people > 0 ? round((total * p.residentCount) / people) : 0;
    }
  } else if (method === 'partes_iguales') {
    const each = properties.length > 0 ? round(total / properties.length) : 0;
    for (const p of properties) amounts[p.id] = each;
  }
  // 'manual': los montos los pone la persona, no se calculan.

  return amounts;
}
