import { Timestamp } from '@angular/fire/firestore';

export interface MonthlySnapshot {
  id?: string;
  propertyId: string;
  ownerId: string;
  /** "YYYY-MM" */
  month: string;
  totalCollected: number;
  totalExpenses: number;
  netBalance: number;
  /** 0-100 */
  occupancyRate: number;
  generatedAt: Timestamp;
  generatedBy: 'cron' | 'manual';
}
