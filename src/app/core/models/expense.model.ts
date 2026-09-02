import { Timestamp } from '@angular/fire/firestore';

export type ExpenseCategory = 'reparacion' | 'impuesto' | 'servicio' | 'otro';

export interface Expense {
  id?: string;
  ownerId: string;
  /** Círculo de la propiedad: `[ownerId, ...collaboratorUids]`. Ver `propertyMemberUids`. */
  memberUids?: string[];
  propertyId: string;
  propertyName: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: Timestamp;
  /** Mes al que pertenece el gasto, 'YYYY-MM', derivado de `date`. Ver `Payment.period`. */
  period?: string;
  notes: string | null;
  createdAt?: Timestamp;
  createdBy: string;
}

export interface ExpenseCreate {
  propertyId: string;
  propertyName: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: Date;
  notes: string | null;
}
