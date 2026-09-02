import { Timestamp } from '@angular/fire/firestore';

export interface Payment {
  id?: string;
  propertyId: string;
  ownerId: string;
  /** Círculo de la propiedad: `[ownerId, ...collaboratorUids]`. Ver `propertyMemberUids`. */
  memberUids?: string[];
  amount: number;
  date: Timestamp;
  /**
   * Mes al que pertenece el pago, 'YYYY-MM', derivado de `date`.
   *
   * Denormalizado a propósito: sin él, «lo del mes X» se preguntaba de tres
   * formas distintas —rango de Timestamp, filtro en memoria, igualdad de
   * string— y ninguna se podía reutilizar. Los recibos de servicio ya usaban
   * esta clave; ahora pagos y gastos hablan el mismo idioma.
   *
   * Opcional mientras queden documentos anteriores al backfill.
   */
  period?: string;
  notes: string | null;
  /** 'manual' = registered by owner/admin; 'gateway' = processed via payment gateway */
  source?: 'manual' | 'gateway';
  gatewayTransactionId?: string | null;
  paymentLinkId?: string | null;
  createdAt?: Timestamp;
  createdBy: string;
}
