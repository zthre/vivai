import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  getDoc,
  Timestamp,
  Query,
  DocumentData,
} from '@angular/fire/firestore';
import { Observable, combineLatest, of, map, catchError } from 'rxjs';
import { ServiceReceipt } from '../models/service-receipt.model';
import { ServiceAssignment } from '../models/service-assignment.model';
import { Property } from '../models/property.model';
import { AuthService } from '../auth/auth.service';
import { ExpenseService } from './expense.service';

export interface ManualReceiptInput {
  propertyId: string;
  propertyName: string;
  serviceId: string;
  serviceName: string;
  serviceIcon?: string;
  /** 'YYYY-MM' */
  month: string;
  amount: number;
  notes?: string;
  /** Marcar como pagado en el mismo momento del registro */
  markPaid?: boolean;
}

/** Fecha con la que se registra el gasto asociado a un recibo. */
function expenseDateForMonth(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  const now = new Date();
  if (now.getFullYear() === y && now.getMonth() + 1 === m) return now;
  // Mes pasado o futuro: se ancla al último día de ese mes para que caiga en el periodo correcto
  return new Date(y, m, 0, 12, 0, 0);
}

@Injectable({ providedIn: 'root' })
export class ServiceReceiptService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private expenseService = inject(ExpenseService);

  /**
   * Una consulta caída no puede envenenar la señal que la consume: `toSignal`
   * relanza el error en cada lectura y eso aborta la detección de cambios de
   * toda la pantalla. Ante un fallo se degrada a lista vacía.
   */
  private safe(q: Query<DocumentData>, label: string): Observable<ServiceReceipt[]> {
    return (collectionData(q, { idField: 'id' }) as Observable<ServiceReceipt[]>).pipe(
      catchError(err => {
        console.error(`[ServiceReceiptService.${label}]`, err);
        return of([] as ServiceReceipt[]);
      })
    );
  }

  getByServiceAndMonth(serviceId: string, month: string): Observable<ServiceReceipt[]> {
    const ref = collection(this.firestore, 'serviceReceipts');
    return this.safe(
      query(ref, where('serviceId', '==', serviceId), where('month', '==', month)),
      'getByServiceAndMonth'
    );
  }

  getByAssignmentAndMonth(assignmentId: string, month: string): Observable<ServiceReceipt[]> {
    const ref = collection(this.firestore, 'serviceReceipts');
    return this.safe(
      query(ref, where('assignmentId', '==', assignmentId), where('month', '==', month)),
      'getByAssignmentAndMonth'
    );
  }

  getByPropertyAndMonth(propertyId: string, month: string): Observable<ServiceReceipt[]> {
    const ref = collection(this.firestore, 'serviceReceipts');
    return this.safe(
      query(ref, where('propertyId', '==', propertyId), where('month', '==', month)),
      'getByPropertyAndMonth'
    );
  }

  /**
   * Recibos de un mes para un conjunto de propiedades. Se consulta por propiedad
   * (no por ownerId) para que funcione igual para dueños y colaboradores.
   */
  getByPropertiesAndMonth(propertyIds: string[], month: string): Observable<ServiceReceipt[]> {
    if (propertyIds.length === 0) return of([] as ServiceReceipt[]);
    return combineLatest(
      propertyIds.map(pid => this.getByPropertyAndMonth(pid, month))
    ).pipe(map(arrays => arrays.flat()));
  }

  // ── Creación ──────────────────────────────────────────────────────────────

  /** Registra un servicio manualmente sobre una propiedad (sin código de distribución). */
  async createManual(input: ManualReceiptInput): Promise<string> {
    const ownerId = await this.ownerIdOf(input.propertyId);
    const receipt: ServiceReceipt = {
      ownerId,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      serviceIcon: input.serviceIcon ?? 'receipt_long',
      assignmentId: null,
      assignmentCode: '',
      propertyId: input.propertyId,
      propertyName: input.propertyName,
      month: input.month,
      origin: 'manual',
      totalAmount: input.amount,
      propertyAmount: input.amount,
      residentCount: 1,
      isPaid: false,
      paidAt: null,
      paidBy: null,
      expenseId: null,
      notes: input.notes ?? '',
    };

    const ref = collection(this.firestore, 'serviceReceipts');
    const docRef = await addDoc(ref, {
      ...receipt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as any);

    if (input.markPaid) {
      await this.setPaid({ ...receipt, id: docRef.id }, true);
    }
    return docRef.id;
  }

  async generateReceipts(
    assignment: ServiceAssignment,
    month: string,
    totalAmount: number
  ): Promise<void> {
    const properties: { id: string; name: string; residentCount: number; ownerId: string }[] = [];
    for (const pid of assignment.propertyIds) {
      const snap = await getDoc(doc(this.firestore, `properties/${pid}`));
      const data = snap.data() as Property | undefined;
      properties.push({
        id: pid,
        name: data?.name ?? pid,
        residentCount: data?.residentCount ?? 1,
        ownerId: data?.ownerId ?? this.auth.uid()!,
      });
    }

    const amounts: Record<string, number> = {};
    if (assignment.distributionMethod === 'por_persona') {
      const totalPersonas = properties.reduce((sum, p) => sum + p.residentCount, 0);
      for (const p of properties) {
        amounts[p.id] = totalPersonas > 0
          ? Math.round((totalAmount * p.residentCount / totalPersonas) * 100) / 100
          : 0;
      }
    } else if (assignment.distributionMethod === 'partes_iguales') {
      const perProperty = Math.round((totalAmount / properties.length) * 100) / 100;
      for (const p of properties) {
        amounts[p.id] = perProperty;
      }
    }

    await this.deleteByMonth(assignment.id!, month);

    const ref = collection(this.firestore, 'serviceReceipts');
    for (const p of properties) {
      await addDoc(ref, {
        ownerId: p.ownerId,
        serviceId: assignment.serviceId,
        serviceName: assignment.serviceName,
        assignmentId: assignment.id,
        assignmentCode: assignment.code ?? '',
        propertyId: p.id,
        propertyName: p.name,
        month,
        origin: 'distribucion',
        totalAmount,
        propertyAmount: amounts[p.id] ?? 0,
        residentCount: p.residentCount,
        isPaid: false,
        paidAt: null,
        paidBy: null,
        expenseId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);
    }
  }

  // ── Pago ──────────────────────────────────────────────────────────────────

  /**
   * Marca (o desmarca) un recibo como pagado. Al pagar se crea automáticamente un
   * gasto de categoría 'servicio'; al desmarcar se elimina ese gasto.
   */
  async setPaid(receipt: ServiceReceipt, paid: boolean): Promise<void> {
    const ref = doc(this.firestore, `serviceReceipts/${receipt.id}`);

    if (!paid) {
      if (receipt.expenseId) {
        await this.expenseService.delete(receipt.expenseId).catch(() => void 0);
      }
      await updateDoc(ref, {
        isPaid: false,
        paidAt: null,
        paidBy: null,
        expenseId: null,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // Ya tiene gasto asociado: no se duplica
    let expenseId = receipt.expenseId ?? null;
    if (!expenseId) {
      const propertyName = receipt.propertyName ?? (await this.propertyNameOf(receipt.propertyId));
      const code = receipt.assignmentCode ? ` · ${receipt.assignmentCode}` : '';
      expenseId = await this.expenseService.create({
        propertyId: receipt.propertyId,
        propertyName,
        category: 'servicio',
        description: `${receipt.serviceName}${code}`,
        amount: receipt.propertyAmount,
        date: expenseDateForMonth(receipt.month),
        notes: receipt.notes || null,
      });
    }

    await updateDoc(ref, {
      isPaid: true,
      paidAt: Timestamp.now(),
      paidBy: this.auth.uid() ?? null,
      expenseId,
      updatedAt: serverTimestamp(),
    });
  }

  /** Marca varios recibos como pagados en una sola operación. */
  async markManyPaid(receipts: ServiceReceipt[]): Promise<void> {
    for (const r of receipts.filter(r => !r.isPaid)) {
      await this.setPaid(r, true);
    }
  }

  // ── Edición y borrado ─────────────────────────────────────────────────────

  async update(id: string, data: Partial<ServiceReceipt>): Promise<void> {
    const ref = doc(this.firestore, `serviceReceipts/${id}`);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }

  /** Actualiza el monto de un recibo, propagándolo al gasto asociado si ya estaba pagado. */
  async updateAmount(receipt: ServiceReceipt, amount: number): Promise<void> {
    await this.update(receipt.id!, {
      propertyAmount: amount,
      ...(receipt.origin === 'manual' ? { totalAmount: amount } : {}),
    });
    if (receipt.isPaid && receipt.expenseId) {
      await this.expenseService.update(receipt.expenseId, { amount }).catch(() => void 0);
    }
  }

  async delete(receipt: ServiceReceipt): Promise<void> {
    if (receipt.expenseId) {
      await this.expenseService.delete(receipt.expenseId).catch(() => void 0);
    }
    await deleteDoc(doc(this.firestore, `serviceReceipts/${receipt.id}`));
  }

  async deleteByMonth(assignmentId: string, month: string): Promise<void> {
    const ref = collection(this.firestore, 'serviceReceipts');
    const q = query(ref, where('assignmentId', '==', assignmentId), where('month', '==', month));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(async d => {
      const expenseId = (d.data() as ServiceReceipt).expenseId;
      if (expenseId) await this.expenseService.delete(expenseId).catch(() => void 0);
      await deleteDoc(doc(this.firestore, `serviceReceipts/${d.id}`));
    }));
  }

  async deleteByServiceAndMonth(serviceId: string, month: string): Promise<void> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'serviceReceipts');
    const q = query(ref, where('ownerId', '==', uid), where('serviceId', '==', serviceId), where('month', '==', month));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(async d => {
      const expenseId = (d.data() as ServiceReceipt).expenseId;
      if (expenseId) await this.expenseService.delete(expenseId).catch(() => void 0);
      await deleteDoc(doc(this.firestore, `serviceReceipts/${d.id}`));
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async ownerIdOf(propertyId: string): Promise<string> {
    const snap = await getDoc(doc(this.firestore, `properties/${propertyId}`));
    return (snap.data() as Property | undefined)?.ownerId ?? this.auth.uid()!;
  }

  private async propertyNameOf(propertyId: string): Promise<string> {
    const snap = await getDoc(doc(this.firestore, `properties/${propertyId}`));
    return (snap.data() as Property | undefined)?.name ?? propertyId;
  }
}
