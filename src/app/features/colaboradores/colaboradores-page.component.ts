import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PropertyService } from '../../core/services/property.service';
import { AuthService } from '../../core/auth/auth.service';
import { Property, ColaboradorPermission } from '../../core/models/property.model';
import { PermisoColaboradorDialogComponent } from '../properties/property-detail/colaboradores/permiso-colaborador-dialog.component';

interface ColaboradorInfo {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  permissions: ColaboradorPermission;
}

const DEFAULT_PERMISSION: ColaboradorPermission = {
  inmueblesUnidades: true,
  inmueblesPagos: true,
  inmueblesMedia: true,
  gastos: true,
  tickets: true,
};

@Component({
  selector: 'app-colaboradores-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatDialogModule, MatSnackBarModule],
  template: `
    <div class="space-y-4">

      <!-- Invite form -->
      <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
        <p class="text-sm font-medium text-warm-700 mb-3">Invitar colaborador</p>
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
            [disabled]="!inviteEmail.trim() || actionLoading()"
            class="flex items-center gap-1.5 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            @if (actionLoading()) {
              <mat-icon class="text-[16px] animate-spin">sync</mat-icon>
            } @else {
              <mat-icon class="text-[16px]">person_add</mat-icon>
            }
            Invitar
          </button>
        </div>
        <p class="text-xs text-warm-400 mt-2">
          Se añadirá a las {{ ownedProperties().length }} propiedad(es) con todos los permisos habilitados
        </p>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-2 border-warm-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      } @else {

        <!-- Empty state -->
        @if (colaboradores().length === 0 && pendingEmails().length === 0) {
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-12 text-center">
            <mat-icon class="text-warm-300 text-[56px]">group</mat-icon>
            <h3 class="text-warm-700 font-semibold mt-3">Sin colaboradores</h3>
            <p class="text-warm-400 text-sm mt-1">Invita a personas para que te ayuden a gestionar tus propiedades</p>
          </div>
        }

        <!-- Active collaborators -->
        @for (c of colaboradores(); track c.uid) {
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm overflow-hidden">

            <!-- Header row -->
            <div class="flex items-center gap-3 p-4 border-b border-warm-100">
              @if (c.photoURL) {
                <img [src]="c.photoURL" class="w-10 h-10 rounded-full flex-shrink-0" alt="avatar">
              } @else {
                <div class="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span class="text-primary-700 font-bold">{{ initial(c.displayName) }}</span>
                </div>
              }
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-warm-900 truncate">{{ c.displayName || c.email }}</p>
                @if (c.displayName) {
                  <p class="text-xs text-warm-400 truncate">{{ c.email }}</p>
                }
              </div>
              <button
                (click)="remove(c.uid)"
                [disabled]="actionLoading()"
                class="p-1.5 text-warm-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Quitar colaborador"
              >
                <mat-icon class="text-[18px]">person_remove</mat-icon>
              </button>
            </div>

            <!-- Properties with access (toggleable) -->
            <div class="px-4 py-3 bg-warm-50 border-b border-warm-100">
              <div class="flex items-center justify-between mb-2">
                <p class="text-[11px] font-semibold text-warm-500 uppercase tracking-wider">Acceso a propiedades</p>
                @if (propertiesFor(c.uid).length < ownedProperties().length) {
                  <button
                    (click)="addToAllProperties(c.uid)"
                    [disabled]="actionLoading()"
                    class="text-[11px] font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
                  >
                    + Agregar todas
                  </button>
                } @else {
                  <button
                    (click)="removeFromAllProperties(c.uid)"
                    [disabled]="actionLoading()"
                    class="text-[11px] font-medium text-warm-400 hover:text-red-500 disabled:opacity-50"
                  >
                    Quitar todas
                  </button>
                }
              </div>
              <div class="flex flex-wrap gap-1.5">
                @for (prop of ownedProperties(); track prop.id) {
                  <button
                    (click)="toggleProperty(c.uid, prop.id!)"
                    [disabled]="actionLoading()"
                    class="text-xs px-2.5 py-1 rounded-full font-medium transition-colors border disabled:opacity-50"
                    [class.bg-primary-100]="hasAccess(c.uid, prop.id!)"
                    [class.text-primary-700]="hasAccess(c.uid, prop.id!)"
                    [class.border-primary-300]="hasAccess(c.uid, prop.id!)"
                    [class.bg-white]="!hasAccess(c.uid, prop.id!)"
                    [class.text-warm-400]="!hasAccess(c.uid, prop.id!)"
                    [class.border-warm-200]="!hasAccess(c.uid, prop.id!)"
                    [class.hover:border-primary-400]="!hasAccess(c.uid, prop.id!)"
                  >
                    @if (hasAccess(c.uid, prop.id!)) {
                      <span class="inline-flex items-center gap-0.5">
                        <mat-icon class="text-[12px] leading-none">check</mat-icon>
                        {{ prop.name }}
                      </span>
                    } @else {
                      <span class="inline-flex items-center gap-0.5">
                        <mat-icon class="text-[12px] leading-none">add</mat-icon>
                        {{ prop.name }}
                      </span>
                    }
                  </button>
                }
              </div>
            </div>

            <!-- Permissions summary + manage button -->
            <div class="px-4 py-3 flex items-center justify-between gap-3">
              <div class="flex flex-wrap gap-1.5">
                @for (entry of permSummary(c.permissions); track entry.label) {
                  <span
                    class="text-xs px-2 py-0.5 rounded-full font-medium"
                    [class.bg-primary-100]="entry.enabled"
                    [class.text-primary-700]="entry.enabled"
                    [class.bg-warm-100]="!entry.enabled"
                    [class.text-warm-400]="!entry.enabled"
                    [class.line-through]="!entry.enabled"
                  >{{ entry.label }}</span>
                }
              </div>
              <button
                (click)="openPermisos(c)"
                class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-warm-600 rounded-lg hover:bg-warm-100 border border-warm-200 transition-colors"
              >
                <mat-icon class="text-[16px]">tune</mat-icon>
                Permisos
              </button>
            </div>
          </div>
        }

        <!-- Pending invitations -->
        @if (pendingEmails().length > 0) {
          <div class="bg-white rounded-xl border border-warm-200 shadow-sm p-5">
            <p class="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3">Invitaciones pendientes</p>
            <div class="space-y-2">
              @for (email of pendingEmails(); track email) {
                <div class="flex items-center gap-3 p-3 rounded-lg border border-dashed border-warm-300 bg-warm-50">
                  <div class="w-8 h-8 rounded-full bg-warm-200 flex items-center justify-center flex-shrink-0">
                    <mat-icon class="text-warm-500 text-[18px]">mail_outline</mat-icon>
                  </div>
                  <p class="flex-1 text-sm text-warm-600 truncate">{{ email }}</p>
                  <button
                    (click)="cancelInvitation(email)"
                    [disabled]="actionLoading()"
                    class="p-1.5 text-warm-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Cancelar invitación"
                  >
                    <mat-icon class="text-[18px]">close</mat-icon>
                  </button>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class ColaboradoresPageComponent {
  private propertyService = inject(PropertyService);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  ownedProperties = signal<Property[]>([]);
  colaboradores = signal<ColaboradorInfo[]>([]);
  pendingEmails = signal<string[]>([]);
  loading = signal(true);
  actionLoading = signal(false);
  inviteEmail = '';

  constructor() {
    this.propertyService.getAll()
      .pipe(takeUntilDestroyed())
      .subscribe(all => {
        const uid = this.authService.uid();
        const owned = all.filter(p => p.ownerId === uid);
        this.ownedProperties.set(owned);
        void this.loadProfiles(owned);
      });
  }

  private async loadProfiles(owned: Property[]) {
    const uids = [...new Set(owned.flatMap(p => p.collaboratorUids ?? []))];
    const pending = [...new Set(owned.flatMap(p => p.pendingCollaboratorEmails ?? []))];
    this.pendingEmails.set(pending);

    if (uids.length === 0) {
      this.colaboradores.set([]);
      this.loading.set(false);
      return;
    }

    // Use permissions from the first property where the collaborator appears
    const permMap: Record<string, ColaboradorPermission> = {};
    for (const prop of owned) {
      for (const uid of (prop.collaboratorUids ?? [])) {
        if (!permMap[uid] && prop.collaboratorPermissions?.[uid]) {
          permMap[uid] = prop.collaboratorPermissions[uid];
        }
      }
    }

    const profiles = await Promise.all(
      uids.map(async uid => {
        const snap = await getDoc(doc(this.firestore, `users/${uid}`));
        const data = snap.data();
        return {
          uid,
          displayName: data?.['displayName'] ?? null,
          email: data?.['email'] ?? null,
          photoURL: data?.['photoURL'] ?? null,
          permissions: { ...DEFAULT_PERMISSION, ...(permMap[uid] ?? {}) },
        } as ColaboradorInfo;
      })
    );

    this.colaboradores.set(profiles);
    this.loading.set(false);
  }

  propertiesFor(uid: string): Property[] {
    return this.ownedProperties().filter(p => p.collaboratorUids?.includes(uid));
  }

  hasAccess(uid: string, propertyId: string): boolean {
    const prop = this.ownedProperties().find(p => p.id === propertyId);
    return prop?.collaboratorUids?.includes(uid) ?? false;
  }

  async toggleProperty(uid: string, propertyId: string) {
    if (this.actionLoading()) return;
    this.actionLoading.set(true);
    try {
      if (this.hasAccess(uid, propertyId)) {
        await this.propertyService.removeColaboradorFromProperty(propertyId, uid);
        this.snackBar.open('Acceso removido.', 'OK', { duration: 2000 });
      } else {
        await this.propertyService.addColaboradorToProperty(propertyId, uid);
        this.snackBar.open('Acceso concedido.', 'OK', { duration: 2000 });
      }
    } catch {
      this.snackBar.open('Error al actualizar acceso.', 'OK', { duration: 3000 });
    } finally {
      this.actionLoading.set(false);
    }
  }

  async addToAllProperties(uid: string) {
    if (this.actionLoading()) return;
    this.actionLoading.set(true);
    try {
      const missing = this.ownedProperties().filter(p => !p.collaboratorUids?.includes(uid));
      await Promise.all(missing.map(p => this.propertyService.addColaboradorToProperty(p.id!, uid)));
      this.snackBar.open('Agregado a todas las propiedades.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al agregar a todas.', 'OK', { duration: 3000 });
    } finally {
      this.actionLoading.set(false);
    }
  }

  async removeFromAllProperties(uid: string) {
    if (this.actionLoading()) return;
    this.actionLoading.set(true);
    try {
      const assigned = this.propertiesFor(uid);
      await Promise.all(assigned.map(p => this.propertyService.removeColaboradorFromProperty(p.id!, uid)));
      this.snackBar.open('Removido de todas las propiedades.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al remover de todas.', 'OK', { duration: 3000 });
    } finally {
      this.actionLoading.set(false);
    }
  }

  permSummary(perms: ColaboradorPermission): { label: string; enabled: boolean }[] {
    return [
      { label: 'Propiedades', enabled: perms.inmueblesUnidades !== false },
      { label: 'Pagos', enabled: perms.inmueblesPagos !== false },
      { label: 'Media', enabled: perms.inmueblesMedia !== false },
      { label: 'Gastos', enabled: perms.gastos !== false },
      { label: 'Tickets', enabled: perms.tickets !== false },
      { label: 'Servicios', enabled: perms.servicios !== false },
    ];
  }

  initial(name: string | null): string {
    return name?.[0]?.toUpperCase() ?? '?';
  }

  openPermisos(c: ColaboradorInfo) {
    const ref = this.dialog.open(PermisoColaboradorDialogComponent, {
      data: { collaborator: c },
      width: '540px',
      maxWidth: '95vw',
    });
    ref.afterClosed().subscribe((updatedPerms: ColaboradorPermission | undefined) => {
      if (updatedPerms) {
        this.colaboradores.update(list =>
          list.map(item => item.uid === c.uid ? { ...item, permissions: updatedPerms } : item)
        );
      }
    });
  }

  async invite() {
    const email = this.inviteEmail.trim().toLowerCase();
    if (!email || this.actionLoading()) return;
    this.actionLoading.set(true);
    try {
      const result = await this.propertyService.addGlobalColaborador(email);
      this.inviteEmail = '';
      if (result === 'assigned') {
        this.snackBar.open('Colaborador asignado a todas tus propiedades.', 'OK', { duration: 3500 });
      } else {
        this.snackBar.open('Invitación enviada — se activará cuando el usuario se registre.', 'OK', { duration: 4500 });
      }
    } catch {
      this.snackBar.open('Error al invitar. Verifica el correo e intenta de nuevo.', 'OK', { duration: 3500 });
    } finally {
      this.actionLoading.set(false);
    }
  }

  async remove(uid: string) {
    if (this.actionLoading()) return;
    this.actionLoading.set(true);
    try {
      await this.propertyService.removeGlobalColaborador(uid);
      this.snackBar.open('Colaborador removido de todas las propiedades.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al remover colaborador.', 'OK', { duration: 3000 });
    } finally {
      this.actionLoading.set(false);
    }
  }

  async cancelInvitation(email: string) {
    if (this.actionLoading()) return;
    this.actionLoading.set(true);
    try {
      await this.propertyService.removePendingGlobalColaborador(email);
      this.pendingEmails.update(emails => emails.filter(e => e !== email));
      this.snackBar.open('Invitación cancelada.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al cancelar invitación.', 'OK', { duration: 3000 });
    } finally {
      this.actionLoading.set(false);
    }
  }
}
