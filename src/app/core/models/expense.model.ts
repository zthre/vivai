import { Timestamp } from '@angular/fire/firestore';

export type ExpenseCategory = 'reparacion' | 'impuesto' | 'servicio' | 'otro';

export interface Expense {
  id?: string;
  ownerId: string;
  propertyId: string;
  propertyName: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: Timestamp;
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
