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
} from '@angular/fire/firestore';
import { Observable, switchMap } from 'rxjs';
import { ServiceReceipt } from '../models/service-receipt.model';
import { ServiceAssignment } from '../models/service-assignment.model';
import { Property } from '../models/property.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class ServiceReceiptService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getByServiceAndMonth(serviceId: string, month: string): Observable<ServiceReceipt[]> {
    const ref = collection(this.firestore, 'serviceReceipts');
    const q = query(ref, where('serviceId', '==', serviceId), where('month', '==', month));
    return collectionData(q, { idField: 'id' }) as Observable<ServiceReceipt[]>;
  }

  getByAssignmentAndMonth(assignmentId: string, month: string): Observable<ServiceReceipt[]> {
    const ref = collection(this.firestore, 'serviceReceipts');
    const q = query(ref, where('assignmentId', '==', assignmentId), where('month', '==', month));
    return collectionData(q, { idField: 'id' }) as Observable<ServiceReceipt[]>;
  }

  getByPropertyAndMonth(propertyId: string, month: string): Observable<ServiceReceipt[]> {
    const ref = collection(this.firestore, 'serviceReceipts');
    const q = query(ref, where('propertyId', '==', propertyId), where('month', '==', month));
    return collectionData(q, { idField: 'id' }) as Observable<ServiceReceipt[]>;
  }

  async generateReceipts(
    assignment: ServiceAssignment,
    month: string,
    totalAmount: number
  ): Promise<void> {
    const uid = this.auth.uid()!;

    const properties: { id: string; name: string; residentCount: number }[] = [];
    for (const pid of assignment.propertyIds) {
      const snap = await getDoc(doc(this.firestore, `properties/${pid}`));
      const data = snap.data() as Property | undefined;
      properties.push({
        id: pid,
        name: data?.name ?? pid,
        residentCount: data?.residentCount ?? 1,
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
        ownerId: uid,
        serviceId: assignment.serviceId,
        serviceName: assignment.serviceName,
        assignmentId: assignment.id,
        assignmentCode: assignment.code ?? '',
        propertyId: p.id,
        month,
        totalAmount,
        propertyAmount: amounts[p.id] ?? 0,
        residentCount: p.residentCount,
        isPaid: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);
    }
  }

  async update(id: string, data: Partial<ServiceReceipt>): Promise<void> {
    const ref = doc(this.firestore, `serviceReceipts/${id}`);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }

  async deleteByMonth(assignmentId: string, month: string): Promise<void> {
    const ref = collection(this.firestore, 'serviceReceipts');
    const q = query(ref, where('assignmentId', '==', assignmentId), where('month', '==', month));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(doc(this.firestore, `serviceReceipts/${d.id}`))));
  }

  async deleteByServiceAndMonth(serviceId: string, month: string): Promise<void> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'serviceReceipts');
    const q = query(ref, where('ownerId', '==', uid), where('serviceId', '==', serviceId), where('month', '==', month));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(doc(this.firestore, `serviceReceipts/${d.id}`))));
  }
}
