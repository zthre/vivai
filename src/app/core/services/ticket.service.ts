import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Ticket } from '../models/ticket.model';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  getByOwner$(ownerId: string): Observable<Ticket[]> {
    const ref = collection(this.firestore, 'tickets');
    const q = query(ref, where('ownerId', '==', ownerId));
    return (collectionData(q, { idField: 'id' }) as Observable<Ticket[]>).pipe(
      map(tickets =>
        tickets.sort((a, b) => {
          const aMs = (a.createdAt as any)?.toMillis?.() ?? 0;
          const bMs = (b.createdAt as any)?.toMillis?.() ?? 0;
          return bMs - aMs;
        })
      )
    );
  }

  getByTenant$(tenantUid: string): Observable<Ticket[]> {
    const ref = collection(this.firestore, 'tickets');
    const q = query(ref, where('tenantUid', '==', tenantUid));
    return (collectionData(q, { idField: 'id' }) as Observable<Ticket[]>).pipe(
      map(tickets =>
        tickets.sort((a, b) => {
          const aMs = (a.createdAt as any)?.toMillis?.() ?? 0;
          const bMs = (b.createdAt as any)?.toMillis?.() ?? 0;
          return bMs - aMs;
        })
      )
    );
  }

  getPendingCount$(ownerId: string): Observable<number> {
    const ref = collection(this.firestore, 'tickets');
    const q = query(ref, where('ownerId', '==', ownerId), where('status', '==', 'pendiente'));
    return (collectionData(q, { idField: 'id' }) as Observable<Ticket[]>).pipe(
      map(t => t.length)
    );
  }

  getById$(ticketId: string): Observable<Ticket | null> {
    const ref = doc(this.firestore, `tickets/${ticketId}`);
    return docData(ref, { idField: 'id' }) as Observable<Ticket | null>;
  }

  async create(data: {
    propertyId: string;
    propertyName: string;
    ownerId: string;
    tenantName: string | null;
    title: string;
    description: string;
    category: Ticket['category'];
  }): Promise<string> {
    const uid = this.auth.uid()!;
    const ref = collection(this.firestore, 'tickets');
    const initialStatus = 'pendiente';
    const docRef = await addDoc(ref, {
      ...data,
      tenantUid: uid,
      status: initialStatus,
      photos: [],
      statusHistory: [{ status: initialStatus, changedAt: Timestamp.now(), changedBy: uid }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      resolvedAt: null,
    });
    return docRef.id;
  }

  async updateStatus(
    ticketId: string,
    status: Ticket['status'],
    changedBy: string
  ): Promise<void> {
    const ref = doc(this.firestore, `tickets/${ticketId}`);
    const change = { status, changedAt: Timestamp.now(), changedBy };
    const update: Record<string, any> = {
      status,
      updatedAt: serverTimestamp(),
      statusHistory: arrayUnion(change),
    };
    if (status === 'resuelto') {
      update['resolvedAt'] = serverTimestamp();
    }
    await updateDoc(ref, update);
  }
}
