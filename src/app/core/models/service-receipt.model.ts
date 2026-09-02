import { Timestamp } from '@angular/fire/firestore';

/**
 * Un recibo de un servicio, de una propiedad, de un mes.
 * - `manual`: registrado directamente sobre la propiedad (no tiene assignmentId).
 * - `distribucion`: generado a partir de un ServiceAssignment repartiendo una factura.
 */
export type ServiceReceiptOrigin = 'manual' | 'distribucion';

export interface ServiceReceipt {
  id?: string;
  ownerId: string;
  /** Círculo de la propiedad: `[ownerId, ...collaboratorUids]`. Ver `propertyMemberUids`. */
  memberUids?: string[];
  serviceId: string;
  serviceName: string;
  serviceIcon?: string;
  /** null en recibos manuales */
  assignmentId?: string | null;
  assignmentCode?: string; // denormalized from ServiceAssignment.code
  /** Factura de la que sale este recibo. Ver `ServiceBill`. */
  billId?: string | null;
  propertyId: string;
  propertyName?: string;
  month: string; // 'YYYY-MM'
  origin?: ServiceReceiptOrigin; // undefined = 'distribucion' (compat)
  totalAmount: number;
  propertyAmount: number;
  residentCount: number;
  isPaid: boolean;
  paidAt?: Timestamp | null;
  paidBy?: string | null;
  /** Expense creado automáticamente al marcar el recibo como pagado */
  expenseId?: string | null;
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
