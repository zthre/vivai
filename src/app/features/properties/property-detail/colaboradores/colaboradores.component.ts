import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  Firestore,
  doc,
  getDoc,
  collectionData,
  collection,
  query,
  where,
} from '@angular/fire/firestore';
import { PropertyService } from '../../../../core/services/property.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { Property } from '../../../../core/models/property.model';

interface ColaboradorInfo {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

@Component({
  selector: 'app-colaboradores',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="bg-white rounded-xl border border-warm-200 shadow-sm">
      <div class="px-5 py-4 border-b border-warm-100 flex items-center gap-2">
        <mat-icon class="text-warm-400 text-[20px]">group</mat-icon>
        <h2 class="font-semibold text-warm-900">Colaboradores</h2>
      </div>

      <div class="p-5 space-y-4">

        <!-- Active colaborators -->
        @if (colaboradores().length > 0) {
          <div class="space-y-2">
            @for (c of colaboradores(); track c.uid) {
              <div class="flex items-center gap-3 p-3 rounded-lg bg-warm-50">
                @if (c.photoURL) {
                  <img [src]="c.photoURL" class="w-8 h-8 rounded-full flex-shrink-0" alt="avatar">
                } @else {
                  <div class="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span class="text-primary-700 text-xs font-bold">{{ initial(c.displayName) }}</span>
                  </div>
                }
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-warm-800 truncate">{{ c.displayName || c.email }}</p>
                  @if (c.displayName) {
                    <p class="text-xs text-warm-400 truncate">{{ c.email }}</p>
                  }
                </div>
                @if (isOwner()) {
                  <button
                    (click)="removeColaborador(c.uid)"
                    [disabled]="loading()"
                    class="p-1.5 text-warm-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Quitar colaborador"
                  >
                    <mat-icon class="text-[18px]">person_remove</mat-icon>
                  </button>
                }
              </div>
            }
          </div>
        }

        <!-- Pending invitations -->
        @if (pendingEmails().length > 0) {
          <div>
            <p class="text-xs font-medium text-warm-500 uppercase tracking-wider mb-2">Invitaciones pendientes</p>
            <div class="space-y-2">
              @for (email of pendingEmails(); track email) {
                <div class="flex items-center gap-3 p-3 rounded-lg border border-dashed border-warm-300 bg-warm-50">
                  <div class="w-8 h-8 rounded-full bg-warm-200 flex items-center justify-center flex-shrink-0">
                    <mat-icon class="text-warm-500 text-[18px]">mail_outline</mat-icon>
                  </div>
                  <p class="flex-1 text-sm text-warm-600 truncate">{{ email }}</p>
                  @if (isOwner()) {
                    <button
                      (click)="cancelInvitation(email)"
                      [disabled]="loading()"
                      class="p-1.5 text-warm-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Cancelar invitación"
                    >
                      <mat-icon class="text-[18px]">close</mat-icon>
                    </button>
                  }
                </div>
              }
            </div>
          </div>
        }

        @if (colaboradores().length === 0 && pendingEmails().length === 0) {
          <p class="text-sm text-warm-400 text-center py-2">Sin colaboradores asignados</p>
        }

        <!-- Invite form (only for property owner) -->
        @if (isOwner()) {
          <div class="pt-2 border-t border-warm-100">
            <p class="text-xs font-medium text-warm-500 uppercase tracking-wider mb-2">Invitar colaborador</p>
            <div class="flex gap-2">
              <input
                [(ngModel)]="inviteEmail"
                type="email"
                placeholder="correo@ejemplo.com"
                class="flex-1 px-3 py-2 text-sm border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                (keyup.enter)="invite()"
              />
              <button
                (click)="invite()"
                [disabled]="!inviteEmail.trim() || loading()"
                class="flex items-center gap-1.5 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                @if (loading()) {
                  <mat-icon class="text-[16px] animate-spin">sync</mat-icon>
                } @else {
                  <mat-icon class="text-[16px]">person_add</mat-icon>
                }
                Invitar
              </button>
            </div>
          </div>
        }

      </div>
    </div>
  `,
})
export class ColaboradoresComponent implements OnInit {
  @Input() propertyId!: string;
  @Input() property: Property | null = null;

  private propertyService = inject(PropertyService);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private snackBar = inject(MatSnackBar);

  colaboradores = signal<ColaboradorInfo[]>([]);
  pendingEmails = signal<string[]>([]);
  loading = signal(false);
  inviteEmail = '';

  isOwner = () => this.property?.ownerId === this.authService.uid();

  initial(name: string | null): string {
    return name?.[0]?.toUpperCase() ?? '?';
  }

  ngOnInit() {
    this.loadColaboradores();
  }

  private loadColaboradores() {
    if (!this.property) return;

    const uids: string[] = this.property.collaboratorUids ?? [];
    const pending: string[] = this.property.pendingCollaboratorEmails ?? [];
    this.pendingEmails.set(pending);

    if (uids.length === 0) {
      this.colaboradores.set([]);
      return;
    }

    Promise.all(
      uids.map(async uid => {
        const snap = await getDoc(doc(this.firestore, `users/${uid}`));
        const data = snap.data();
        return {
          uid,
          displayName: data?.['displayName'] ?? null,
          email: data?.['email'] ?? null,
          photoURL: data?.['photoURL'] ?? null,
        } as ColaboradorInfo;
      })
    ).then(list => this.colaboradores.set(list));
  }

  async invite() {
    const email = this.inviteEmail.trim().toLowerCase();
    if (!email || this.loading()) return;

    this.loading.set(true);
    try {
      const result = await this.propertyService.addColaborador(this.propertyId, email);
      this.inviteEmail = '';
      if (result === 'assigned') {
        this.snackBar.open('Colaborador asignado correctamente.', 'OK', { duration: 3500 });
      } else {
        this.snackBar.open('Invitación enviada — se activará cuando el usuario se registre.', 'OK', { duration: 4500 });
      }
      // Reload the property to get updated collaboratorUids/pendingEmails
      this.propertyService.getById(this.propertyId).subscribe(p => {
        this.property = p;
        this.loadColaboradores();
      });
    } catch (err) {
      this.snackBar.open('Error al invitar. Verifica el correo e intenta de nuevo.', 'OK', { duration: 3500 });
    } finally {
      this.loading.set(false);
    }
  }

  async removeColaborador(uid: string) {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      await this.propertyService.removeColaborador(this.propertyId, uid);
      this.snackBar.open('Colaborador removido.', 'OK', { duration: 3000 });
      this.propertyService.getById(this.propertyId).subscribe(p => {
        this.property = p;
        this.loadColaboradores();
      });
    } catch {
      this.snackBar.open('Error al remover colaborador.', 'OK', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  async cancelInvitation(email: string) {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      await this.propertyService.removePendingColaborador(this.propertyId, email);
      this.snackBar.open('Invitación cancelada.', 'OK', { duration: 3000 });
      this.pendingEmails.update(emails => emails.filter(e => e !== email));
    } catch {
      this.snackBar.open('Error al cancelar invitación.', 'OK', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }
}
