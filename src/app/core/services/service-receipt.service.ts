import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  query,
  where,
  serverTimestamp,
  Timestamp,
  Query,
  DocumentData,
} from '@angular/fire/firestore';
import { Observable, combineLatest, of, map, switchMap } from 'rxjs';
import { loggedWrite } from './firestore-error.util';
import { collection$ } from './firestore-query.util';
import { ServiceReceipt } from '../models/service-receipt.model';
import { ServiceAssignment } from '../models/service-assignment.model';
import { ServiceBill, serviceBillId, distribute } from '../models/service-bill.model';
import { Property, propertyMemberUids } from '../models/property.model';
import { AuthService } from '../auth/auth.service';
import { PropertyService } from './property.service';
import { isMonthKey } from '../utils/month.util';

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

/** Añade una línea a las notas sin perder lo que ya había. */
function appendNote(existing: string | undefined, line: string): string {
  return existing ? `${existing}\n${line}` : line;
}

@Injectable({ providedIn: 'root' })
export class ServiceReceiptService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private properties = inject(PropertyService);

  private safe(q: Query<DocumentData>, label: string, queryDesc: string): Observable<ServiceReceipt[]> {
    return collection$<ServiceReceipt>(q, {
      label: `ServiceReceiptService.${label}`,
      collection: 'serviceReceipts',
      query: queryDesc,
    });
  }

  /**
   * Los tres cortes de un mes —por servicio, por código, por propiedad— se
   * derivan de `getByCircleAndMonth` y se filtran en memoria.
   *
   * Consultar `serviceId == X, month == Y` directamente parecía lo natural, pero
   * NO acota a lo que el usuario puede leer: bastaba un recibo de otro círculo
   * para denegar la consulta entera. El síntoma engañaba —los recibos aparecían
   * y desaparecían a los milisegundos— porque la caché local los servía antes de
   * que el servidor denegara.
   *
   * Acotar cada consulta por separado habría exigido un índice compuesto por
   * cada corte. Derivarlas de una sola reutiliza su índice y su caché, y el
   * filtro es sobre los recibos de UN mes: nunca es un volumen que importe.
   */
  getByServiceAndMonth(serviceId: string, month: string): Observable<ServiceReceipt[]> {
    return this.getByCircleAndMonth(month).pipe(
      map(list => list.filter(r => r.serviceId === serviceId))
    );
  }

  getByAssignmentAndMonth(assignmentId: string, month: string): Observable<ServiceReceipt[]> {
    return this.getByCircleAndMonth(month).pipe(
      map(list => list.filter(r => r.assignmentId === assignmentId))
    );
  }

  getByPropertyAndMonth(propertyId: string, month: string): Observable<ServiceReceipt[]> {
    return this.getByCircleAndMonth(month).pipe(
      map(list => list.filter(r => r.propertyId === propertyId))
    );
  }

  /**
   * Recibos del mes en todo el círculo del usuario: UNA consulta en lugar de
   * combinar una por propiedad.
   */
  getByCircleAndMonth(month: string): Observable<ServiceReceipt[]> {
    // Sobre `uid$`, no sobre `uid()`: leer la señal aquí captura el valor del
    // instante de la suscripción, y si la vista se monta antes de que resuelva
    // la sesión se queda con lista vacía para siempre. `uid$` filtra los nulos
    // y vuelve a emitir al cambiar de sesión.
    return this.auth.uid$.pipe(
      switchMap(uid => {
        const ref = collection(this.firestore, 'serviceReceipts');
        return this.safe(
          query(ref, where('memberUids', 'array-contains', uid), where('month', '==', month)),
          'getByCircleAndMonth',
          `memberUids array-contains ${uid}, month == ${month}`
        );
      })
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

    const amounts = distribute(totalAmount, assignment.distributionMethod, properties);

    // La factura es la fuente del total; los recibos guardan su parte.
    const billId = serviceBillId(assignment.id!, month);
    await setDoc(
      doc(this.firestore, `serviceBills/${billId}`),
      {
        assignmentId: assignment.id,
        serviceId: assignment.serviceId,
        ownerId: properties[0].ownerId,
        memberUids: properties[0].memberUids,
        month,
        totalAmount,
        distributionMethod: assignment.distributionMethod,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await this.deleteByMonth(assignment.id!, month);

    const ref = collection(this.firestore, 'serviceReceipts');
    for (const p of properties) {
      await addDoc(ref, {
        ownerId: p.ownerId,
        memberUids: p.memberUids,
        serviceId: assignment.serviceId,
        serviceName: assignment.serviceName,
        assignmentId: assignment.id,
        billId,
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

  /**
   * Corrige el total de una factura y recalcula los montos EN SITIO.
   *
   * Antes esto se hacía regenerando: borrar todos los recibos del mes y volver a
   * crearlos. Eso se llevaba por delante los que ya estaban pagados —con su gasto
   * asociado— solo por corregir un dígito mal tecleado.
   *
   * Aquí los recibos conservan su id, su estado de pago y su gasto; solo cambia
   * el monto. Y el gasto lo arrastra el trigger, porque cambia `propertyAmount`.
   */
  async updateBillTotal(bill: ServiceBill, totalAmount: number): Promise<void> {
    const receipts = await getDocs(
      query(
        collection(this.firestore, 'serviceReceipts'),
        where('memberUids', 'array-contains', this.auth.uid()!),
        where('month', '==', bill.month)
      )
    );

    const mine = receipts.docs
      .map(d => ({ id: d.id, ...d.data() } as ServiceReceipt))
      .filter(r => r.assignmentId === bill.assignmentId);

    const amounts = distribute(
      totalAmount,
      bill.distributionMethod,
      mine.map(r => ({ id: r.propertyId, residentCount: r.residentCount ?? 1 }))
    );

    await loggedWrite(
      'ServiceReceiptService.updateBillTotal',
      async () => {
        await updateDoc(doc(this.firestore, `serviceBills/${bill.id}`), {
          totalAmount,
          updatedAt: serverTimestamp(),
        });
        await Promise.all(
          mine.map(r =>
            updateDoc(doc(this.firestore, `serviceReceipts/${r.id}`), {
              totalAmount,
              // En 'manual' los montos los puso una persona: no se recalculan.
              ...(bill.distributionMethod === 'manual'
                ? {}
                : { propertyAmount: amounts[r.propertyId] ?? r.propertyAmount }),
              updatedAt: serverTimestamp(),
            })
          )
        );
      },
      { collection: 'serviceBills', query: `updateBillTotal ${bill.id}` }
    );
  }

  /** La factura de un código en un mes, si existe. */
  getBill(assignmentId: string, month: string): Observable<ServiceBill | null> {
    return this.auth.uid$.pipe(
      switchMap(uid =>
        collection$<ServiceBill>(
          query(
            collection(this.firestore, 'serviceBills'),
            where('memberUids', 'array-contains', uid),
            where('month', '==', month)
          ),
          {
            label: 'ServiceReceiptService.getBill',
            collection: 'serviceBills',
            query: `memberUids array-contains ${uid}, month == ${month}`,
          }
        )
      ),
      map(list => list.find(b => b.assignmentId === assignmentId) ?? null)
    );
  }

  /**
   * Traslada parte del monto de un recibo a otras propiedades, en partes iguales.
   *
   * El caso: la luz del 401 incluye zonas comunes, así que se le quitan $20.000 y
   * se reparten entre otros cuatro apartamentos, $5.000 cada uno.
   *
   * El reparto se hace de forma que la suma cuadre EXACTAMENTE con lo que se
   * quitó. Repartir 20.000 entre 3 da 6.666,67 por cabeza, que multiplicado por 3
   * son 20.000,01: el céntimo sobrante se ajusta en el último, o el dinero
   * aparecería de la nada.
   *
   * Una propiedad que aún no tenga recibo de ese servicio ese mes recibe uno
   * nuevo; las que ya lo tengan, lo ven aumentar.
   *
   * Todo va en un lote atómico: un reparto a medias descuadraría las cuentas sin
   * dejar rastro de por qué.
   */
  async amortize(
    source: ServiceReceipt,
    amount: number,
    targetPropertyIds: string[]
  ): Promise<void> {
    if (amount <= 0) throw new Error('El monto a repartir debe ser mayor que cero.');
    if (amount > (source.propertyAmount ?? 0)) {
      throw new Error('No puedes repartir más de lo que tiene el recibo.');
    }
    const targets = targetPropertyIds.filter(id => id !== source.propertyId);
    if (targets.length === 0) throw new Error('Selecciona al menos una propiedad.');

    // Reparto que cuadra al céntimo: el resto se le añade al último.
    const round = (n: number) => Math.round(n * 100) / 100;
    const share = round(amount / targets.length);
    const shares = targets.map(() => share);
    shares[shares.length - 1] = round(amount - share * (targets.length - 1));

    // Recibos que ya existen para ese servicio y mes, para saber a cuáles sumar.
    const existing = await getDocs(
      query(
        collection(this.firestore, 'serviceReceipts'),
        where('memberUids', 'array-contains', this.auth.uid()!),
        where('month', '==', source.month)
      )
    );
    const byProperty = new Map<string, { id: string; amount: number }>();
    for (const d of existing.docs) {
      const r = d.data() as ServiceReceipt;
      if (r.serviceId === source.serviceId && r.propertyId !== source.propertyId) {
        byProperty.set(r.propertyId, { id: d.id, amount: r.propertyAmount ?? 0 });
      }
    }

    const batch = writeBatch(this.firestore);
    const sourceName = source.propertyName ?? source.propertyId;

    // El origen baja, con constancia de a dónde fue el dinero.
    batch.update(doc(this.firestore, `serviceReceipts/${source.id}`), {
      propertyAmount: round((source.propertyAmount ?? 0) - amount),
      notes: appendNote(
        source.notes,
        `Se repartieron $${amount.toLocaleString('es-CO')} entre ${targets.length} propiedad(es).`
      ),
      updatedAt: serverTimestamp(),
    });

    for (let i = 0; i < targets.length; i++) {
      const propertyId = targets[i];
      const part = shares[i];
      const note = `Incluye $${part.toLocaleString('es-CO')} trasladados de ${sourceName}.`;
      const hit = byProperty.get(propertyId);

      if (hit) {
        batch.update(doc(this.firestore, `serviceReceipts/${hit.id}`), {
          propertyAmount: round(hit.amount + part),
          notes: appendNote(undefined, note),
          updatedAt: serverTimestamp(),
        });
        continue;
      }

      // Sin recibo previo: se crea uno por su parte.
      const prop = await this.properties.snapshot(propertyId);
      const ownerId = prop?.ownerId ?? source.ownerId;
      batch.set(doc(collection(this.firestore, 'serviceReceipts')), {
        ownerId,
        memberUids: prop ? propertyMemberUids(prop) : (source.memberUids ?? [ownerId]),
        serviceId: source.serviceId,
        serviceName: source.serviceName,
        serviceIcon: source.serviceIcon ?? 'receipt_long',
        assignmentId: null,
        assignmentCode: '',
        propertyId,
        propertyName: prop?.name ?? propertyId,
        month: source.month,
        origin: 'manual',
        totalAmount: part,
        propertyAmount: part,
        residentCount: prop?.residentCount ?? 1,
        isPaid: false,
        paidAt: null,
        paidBy: null,
        expenseId: null,
        notes: note,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await loggedWrite(
      'ServiceReceiptService.amortize',
      () => batch.commit(),
      {
        collection: 'serviceReceipts',
        query: `amortize ${amount} de ${source.id} entre ${targets.length}`,
      }
    );
  }

  // ── Pago ──────────────────────────────────────────────────────────────────

  /**
   * Marca (o desmarca) un recibo como pagado.
   *
   * El gasto asociado lo crea, actualiza y borra el trigger `syncReceiptExpense`.
   * Aquí solo se registra el pago.
   *
   * Antes esa correspondencia se mantenía también desde el cliente, repartida en
   * cinco métodos y cada uno con su `.catch(() => void 0)`. Cualquier fallo
   * silencioso dejaba un gasto huérfano sumando en Finanzas, o un recibo pagado
   * sin gasto — y no había forma de enterarse hasta cuadrar las cuentas.
   */
  async setPaid(receipt: ServiceReceipt, paid: boolean): Promise<void> {
    const ref = doc(this.firestore, `serviceReceipts/${receipt.id}`);

    await loggedWrite(
      'ServiceReceiptService.setPaid',
      () => updateDoc(ref, paid
        ? {
            isPaid: true,
            paidAt: Timestamp.now(),
            paidBy: this.auth.uid() ?? null,
            updatedAt: serverTimestamp(),
          }
        : {
            isPaid: false,
            paidAt: null,
            paidBy: null,
            updatedAt: serverTimestamp(),
          }),
      { collection: 'serviceReceipts', query: `setPaid(${paid}) serviceReceipts/${receipt.id}` }
    );
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

  /** Actualiza el monto de un recibo. El gasto lo arrastra el trigger. */
  async updateAmount(receipt: ServiceReceipt, amount: number): Promise<void> {
    await this.update(receipt.id!, {
      propertyAmount: amount,
      ...(receipt.origin === 'manual' ? { totalAmount: amount } : {}),
    });
  }

  /**
   * Mueve un recibo a otro mes, para corregir uno anotado donde no iba.
   *
   * La fecha del gasto la arrastra el trigger; si no, el recibo quedaría en un
   * mes y el gasto seguiría contando en el otro.
   */
  async changeMonth(receipt: ServiceReceipt, newMonth: string): Promise<void> {
    if (!isMonthKey(newMonth)) {
      throw new Error(`Mes inválido: ${newMonth}. Se espera 'YYYY-MM'.`);
    }
    if (newMonth === receipt.month) return;
    await this.update(receipt.id!, { month: newMonth });
  }

  /** Borra un recibo. Su gasto se va con él, por el trigger. */
  async delete(receipt: ServiceReceipt): Promise<void> {
    await deleteDoc(doc(this.firestore, `serviceReceipts/${receipt.id}`));
  }

  /** Borra los recibos de un código en un mes. Sus gastos se van con ellos. */
  async deleteByMonth(assignmentId: string, month: string): Promise<void> {
    await this.deleteWhere(month, r => r.assignmentId === assignmentId);
  }

  /** Borra los recibos de un servicio en un mes. Sus gastos se van con ellos. */
  async deleteByServiceAndMonth(serviceId: string, month: string): Promise<void> {
    await this.deleteWhere(month, r => r.serviceId === serviceId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Borra los recibos de un mes que cumplan `match`. El gasto de cada uno se va
   * con él por el trigger — un gasto que sobrevive a su recibo seguiría sumando
   * en Finanzas sin nada que lo explique.
   */
  private async deleteWhere(
    month: string,
    match: (r: ServiceReceipt) => boolean
  ): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    // Acotado al círculo por el mismo motivo que las lecturas: una consulta que
    // puede devolver un documento ajeno se deniega entera.
    const snap = await getDocs(
      query(
        collection(this.firestore, 'serviceReceipts'),
        where('memberUids', 'array-contains', uid),
        where('month', '==', month)
      )
    );

    await Promise.all(
      snap.docs
        .filter(d => match({ id: d.id, ...d.data() } as ServiceReceipt))
        .map(d => deleteDoc(doc(this.firestore, `serviceReceipts/${d.id}`)))
    );
  }

  private ownerIdOf(propertyId: string): Promise<string> {
    return this.properties.ownerIdOf(propertyId, this.auth.uid()!);
  }

}
