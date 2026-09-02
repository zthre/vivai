import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
  Query,
  QueryConstraint,
  DocumentData,
} from '@angular/fire/firestore';
import { Observable, combineLatest, of, map } from 'rxjs';
import { loggedWrite } from './firestore-error.util';
import { collection$ } from './firestore-query.util';
import { ServiceReceipt } from '../models/service-receipt.model';
import { ServiceAssignment } from '../models/service-assignment.model';
import { Property, propertyMemberUids } from '../models/property.model';
import { AuthService } from '../auth/auth.service';
import { ExpenseService } from './expense.service';
import { PropertyService } from './property.service';
import { accountingDateForMonth, isMonthKey } from '../utils/month.util';

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

@Injectable({ providedIn: 'root' })
export class ServiceReceiptService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private expenseService = inject(ExpenseService);
  private properties = inject(PropertyService);

  private safe(q: Query<DocumentData>, label: string, queryDesc: string): Observable<ServiceReceipt[]> {
    return collection$<ServiceReceipt>(q, {
      label: `ServiceReceiptService.${label}`,
      collection: 'serviceReceipts',
      query: queryDesc,
    });
  }

  getByServiceAndMonth(serviceId: string, month: string): Observable<ServiceReceipt[]> {
    const ref = collection(this.firestore, 'serviceReceipts');
    return this.safe(
      query(ref, where('serviceId', '==', serviceId), where('month', '==', month)),
      'getByServiceAndMonth',
      `serviceId == ${serviceId}, month == ${month}`
    );
  }

  getByAssignmentAndMonth(assignmentId: string, month: string): Observable<ServiceReceipt[]> {
    const ref = collection(this.firestore, 'serviceReceipts');
    return this.safe(
      query(ref, where('assignmentId', '==', assignmentId), where('month', '==', month)),
      'getByAssignmentAndMonth',
      `assignmentId == ${assignmentId}, month == ${month}`
    );
  }

  getByPropertyAndMonth(propertyId: string, month: string): Observable<ServiceReceipt[]> {
    const ref = collection(this.firestore, 'serviceReceipts');
    return this.safe(
      query(ref, where('propertyId', '==', propertyId), where('month', '==', month)),
      'getByPropertyAndMonth',
      `propertyId == ${propertyId}, month == ${month}`
    );
  }

  /**
   * Recibos del mes en todo el círculo del usuario: UNA consulta en lugar de
   * combinar una por propiedad, que es lo que hace `getByPropertiesAndMonth`.
   *
   * TODAVÍA SIN USAR: depende de que el backfill de `memberUids` haya terminado.
   * Ver el plan, fase 3.
   */
  getByCircleAndMonth(month: string): Observable<ServiceReceipt[]> {
    const uid = this.auth.uid();
    if (!uid) return of([] as ServiceReceipt[]);
    const ref = collection(this.firestore, 'serviceReceipts');
    return this.safe(
      query(ref, where('memberUids', 'array-contains', uid), where('month', '==', month)),
      'getByCircleAndMonth',
      `memberUids array-contains ${uid}, month == ${month}`
    );
  }

  /**
   * Recibos de un mes para un conjunto de propiedades. Se consulta por propiedad
   * (no por ownerId) para que funcione igual para dueños y colaboradores.
   *
   * Abre una consulta por propiedad. `getByCircleAndMonth` lo reemplaza en cuanto
   * el backfill termine.
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
    const memberUids = await this.properties.memberUidsOf(input.propertyId, ownerId);
    const receipt: ServiceReceipt = {
      ownerId,
      memberUids,
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
    const docRef = await loggedWrite(
      'ServiceReceiptService.createManual',
      () => addDoc(ref, {
        ...receipt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any),
      {
        collection: 'serviceReceipts',
        query: `create manual sobre propertyId ${input.propertyId} (ownerId ${ownerId}), mes ${input.month}`,
      }
    );

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
    const properties: {
      id: string;
      name: string;
      residentCount: number;
      ownerId: string;
      memberUids: string[];
    }[] = [];
    for (const pid of assignment.propertyIds) {
      const data: Property | null = await this.properties.snapshot(pid);

      // Una propiedad borrada que sigue referenciada en propertyIds falseaba el
      // reparto: entraba al cálculo y se llevaba su parte, así que las propiedades
      // reales recibían de menos (con 'partes iguales' entre 2 donde solo queda 1,
      // cada una salía al 50%). Se omite del reparto y no genera recibo.
      if (!data) continue;

      properties.push({
        id: pid,
        name: data.name ?? pid,
        residentCount: data.residentCount ?? 1,
        ownerId: data.ownerId ?? this.auth.uid()!,
        memberUids: propertyMemberUids(data),
      });
    }

    if (properties.length === 0) {
      throw new Error(
        'Ninguna de las propiedades de este código existe ya. Edita el código y selecciona propiedades vigentes.'
      );
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
        memberUids: p.memberUids,
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
        date: accountingDateForMonth(receipt.month),
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
    await loggedWrite(
      'ServiceReceiptService.update',
      () => updateDoc(ref, { ...data, updatedAt: serverTimestamp() }),
      { collection: 'serviceReceipts', query: `update serviceReceipts/${id}` }
    );
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

  /**
   * Mueve un recibo a otro mes (para corregir uno anotado en el mes equivocado).
   * Si ya está pagado, arrastra la fecha de su gasto asociado, porque si no
   * el recibo quedaría en un mes y el gasto seguiría contando en el otro.
   */
  async changeMonth(receipt: ServiceReceipt, newMonth: string): Promise<void> {
    if (!isMonthKey(newMonth)) {
      throw new Error(`Mes inválido: ${newMonth}. Se espera 'YYYY-MM'.`);
    }
    if (newMonth === receipt.month) return;

    await this.update(receipt.id!, { month: newMonth });

    if (receipt.expenseId) {
      await this.expenseService
        .update(receipt.expenseId, { date: accountingDateForMonth(newMonth) })
        .catch(() => void 0);
    }
  }

  async delete(receipt: ServiceReceipt): Promise<void> {
    if (receipt.expenseId) {
      await this.expenseService.delete(receipt.expenseId).catch(() => void 0);
    }
    await deleteDoc(doc(this.firestore, `serviceReceipts/${receipt.id}`));
  }

  /** Borra los recibos de un código en un mes, con sus gastos asociados. */
  async deleteByMonth(assignmentId: string, month: string): Promise<void> {
    await this.deleteWhere(
      where('assignmentId', '==', assignmentId),
      where('month', '==', month)
    );
  }

  /** Borra los recibos de un servicio en un mes, con sus gastos asociados. */
  async deleteByServiceAndMonth(serviceId: string, month: string): Promise<void> {
    await this.deleteWhere(
      where('ownerId', '==', this.auth.uid()!),
      where('serviceId', '==', serviceId),
      where('month', '==', month)
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Borra los recibos que cumplan los filtros, arrastrando el gasto de cada uno.
   *
   * Un gasto que sobrevive a su recibo sigue sumando en Finanzas sin nada que lo
   * explique, así que se borra primero; si esa parte falla, el recibo se borra
   * igual y el gasto queda visible y editable a mano, que es el mal menor.
   */
  private async deleteWhere(...filters: QueryConstraint[]): Promise<void> {
    const snap = await getDocs(
      query(collection(this.firestore, 'serviceReceipts'), ...filters)
    );
    await Promise.all(snap.docs.map(async d => {
      const expenseId = (d.data() as ServiceReceipt).expenseId;
      if (expenseId) await this.expenseService.delete(expenseId).catch(() => void 0);
      await deleteDoc(doc(this.firestore, `serviceReceipts/${d.id}`));
    }));
  }

  private ownerIdOf(propertyId: string): Promise<string> {
    return this.properties.ownerIdOf(propertyId, this.auth.uid()!);
  }

  private propertyNameOf(propertyId: string): Promise<string> {
    return this.properties.nameOf(propertyId);
  }
}
