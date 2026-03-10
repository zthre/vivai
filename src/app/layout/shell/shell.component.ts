import { Component, signal, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { AuthService, UserRole } from '../../core/auth/auth.service';
import { TicketService } from '../../core/services/ticket.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: () => number;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatTooltipModule],
  template: `
    <div class="flex h-screen bg-warm-50 overflow-hidden">

      <!-- Sidebar -->
      <aside
        class="flex flex-col bg-warm-900 text-white transition-all duration-300"
        [class.w-64]="sidebarOpen()"
        [class.w-16]="!sidebarOpen()"
      >
        <!-- Logo -->
        <div class="flex items-center h-16 px-4 border-b border-warm-700">
          <div class="flex items-center gap-3 min-w-0">
            <div class="flex-shrink-0 w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold text-sm">V</span>
            </div>
            @if (sidebarOpen()) {
              <span class="text-lg font-semibold tracking-tight truncate">vivai</span>
            }
          </div>
        </div>

        <!-- Role selector (only when user has multiple effective roles) -->
        @if (effectiveRoles().length > 1) {
          <div class="px-2 py-2 border-b border-warm-700 relative">
            <!-- Trigger button -->
            <button
              (click)="roleDropdownOpen.set(!roleDropdownOpen())"
              class="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-warm-800 text-warm-200 hover:bg-warm-700 transition-colors"
              [matTooltip]="!sidebarOpen() ? roleLabel(activeRole()) : ''"
              matTooltipPosition="right"
            >
              <mat-icon class="text-[18px] flex-shrink-0">{{ roleIcon(activeRole()) }}</mat-icon>
              @if (sidebarOpen()) {
                <span class="text-xs font-medium flex-1 text-left">{{ roleLabel(activeRole()) }}</span>
                <mat-icon class="text-[16px]">{{ roleDropdownOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
              }
            </button>

            <!-- Dropdown panel -->
            @if (roleDropdownOpen() && sidebarOpen()) {
              <!-- Backdrop -->
              <div class="fixed inset-0 z-40" (click)="roleDropdownOpen.set(false)"></div>
              <div class="absolute left-2 right-2 top-full mt-1 bg-warm-800 border border-warm-600 rounded-lg shadow-xl z-50 overflow-hidden">
                @for (role of effectiveRoles(); track role) {
                  <button
                    (click)="selectRole(role)"
                    class="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-warm-700 transition-colors"
                    [class.bg-warm-700]="role === activeRole()"
                  >
                    <mat-icon class="text-[18px] flex-shrink-0"
                      [class.text-primary-400]="role === activeRole()"
                      [class.text-warm-400]="role !== activeRole()"
                    >{{ roleIcon(role) }}</mat-icon>
                    <span class="text-sm flex-1"
                      [class.text-white]="role === activeRole()"
                      [class.text-warm-300]="role !== activeRole()"
                    >{{ roleLabel(role) }}</span>
                    @if (role === activeRole()) {
                      <mat-icon class="text-[16px] text-primary-400">check</mat-icon>
                    }
                  </button>
                }
              </div>
            }
          </div>
        }

        <!-- Nav items -->
        <nav class="flex-1 py-4 space-y-1 overflow-y-auto">
          @for (item of navItems(); track item.route) {
            <a
              [routerLink]="item.route"
              routerLinkActive="bg-primary-600 text-white"
              [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' || item.route === '/tenant' }"
              class="relative flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-warm-300 hover:bg-warm-700 hover:text-white transition-colors"
              [matTooltip]="!sidebarOpen() ? item.label : ''"
              matTooltipPosition="right"
            >
              <mat-icon class="flex-shrink-0 text-[20px]">{{ item.icon }}</mat-icon>
              @if (sidebarOpen()) {
                <span class="text-sm font-medium truncate flex-1">{{ item.label }}</span>
              }
              @if (item.badge && item.badge() > 0) {
                <span
                  class="flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full"
                  [class.absolute]="!sidebarOpen()"
                  [class.top-1]="!sidebarOpen()"
                  [class.right-1]="!sidebarOpen()"
                >
                  {{ item.badge()! > 99 ? '99+' : item.badge() }}
                </span>
              }
            </a>
          }
        </nav>

        <!-- Version -->
        @if (sidebarOpen()) {
          <div class="px-4 pb-2">
            <span class="text-xs text-warm-600 font-mono">v1.0.0</span>
          </div>
        }

        <!-- User info + logout -->
        <div class="border-t border-warm-700 p-4">
          @if (sidebarOpen()) {
            <div class="flex items-center gap-3 mb-3 min-w-0">
              @if (user()?.photoURL) {
                <img [src]="user()!.photoURL!" class="w-8 h-8 rounded-full flex-shrink-0" alt="avatar">
              } @else {
                <div class="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                  <span class="text-white text-xs font-bold">{{ userInitial() }}</span>
                </div>
              }
              <div class="min-w-0">
                <p class="text-sm font-medium text-white truncate">{{ user()?.displayName }}</p>
                <!-- Show role label instead of email -->
                <p class="text-xs text-warm-400 truncate">{{ roleLabel(activeRole()) }}</p>
              </div>
            </div>
          }
          <button
            (click)="logout()"
            class="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-warm-400 hover:text-white hover:bg-warm-700 transition-colors"
            [matTooltip]="!sidebarOpen() ? 'Cerrar sesión' : ''"
            matTooltipPosition="right"
          >
            <mat-icon class="flex-shrink-0 text-[20px]">logout</mat-icon>
            @if (sidebarOpen()) {
              <span class="text-sm">Cerrar sesión</span>
            }
          </button>
        </div>
      </aside>

      <!-- Main content -->
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">

        <!-- Top bar -->
        <header class="h-16 bg-white border-b border-warm-200 flex items-center px-4 gap-3 flex-shrink-0">
          <button
            (click)="sidebarOpen.set(!sidebarOpen())"
            class="p-1.5 rounded-lg text-warm-500 hover:bg-warm-100 transition-colors"
          >
            <mat-icon>{{ sidebarOpen() ? 'menu_open' : 'menu' }}</mat-icon>
          </button>

          <div class="flex-1"></div>
        </header>

        <!-- Page content -->
        <main class="flex-1 overflow-y-auto p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent {
  private authService = inject(AuthService);
  private ticketService = inject(TicketService);

  sidebarOpen = signal(true);
  roleDropdownOpen = signal(false);

  user = this.authService.currentUser;
  activeRole = this.authService.activeRole;
  userRoles = this.authService.userRoles;

  userInitial = () => this.user()?.displayName?.[0]?.toUpperCase() ?? 'U';

  // Only show 'colaborador' if user actually has collaborating properties
  effectiveRoles = computed(() =>
    this.userRoles().filter(r =>
      r !== 'colaborador' || this.authService.collaboratingPropertyIds().length > 0
    )
  );

  pendingTicketsCount = toSignal(
    toObservable(this.authService.uid).pipe(
      switchMap(uid => {
        const role = this.authService.activeRole();
        return uid && (role === 'owner' || role === 'colaborador')
          ? this.ticketService.getPendingCount$(uid)
          : of(0);
      })
    ),
    { initialValue: 0 }
  );

  private ownerNavItems: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { label: 'Inmuebles', icon: 'apartment', route: '/properties' },
    { label: 'Finanzas', icon: 'bar_chart', route: '/finances' },
    { label: 'Analytics', icon: 'insights', route: '/analytics' },
    { label: 'Recordatorios', icon: 'chat', route: '/reminders' },
    { label: 'Colaboradores', icon: 'group', route: '/colaboradores' },
    { label: 'Marketplace', icon: 'storefront', route: '/inmuebles' },
    { label: 'Tickets', icon: 'build_circle', route: '/tickets', badge: () => this.pendingTicketsCount() },
  ];

  private colaboradorNavItems: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { label: 'Inmuebles', icon: 'apartment', route: '/properties' },
    { label: 'Finanzas', icon: 'bar_chart', route: '/finances' },
    { label: 'Marketplace', icon: 'storefront', route: '/inmuebles' },
    { label: 'Tickets', icon: 'build_circle', route: '/tickets', badge: () => this.pendingTicketsCount() },
  ];

  private tenantNavItems: NavItem[] = [
    { label: 'Mi Arriendo', icon: 'home', route: '/tenant' },
    { label: 'Mis Pagos', icon: 'receipt_long', route: '/tenant/payments' },
    { label: 'Soporte', icon: 'build_circle', route: '/tenant/tickets' },
  ];

  navItems = computed(() => {
    if (this.activeRole() === 'tenant') return this.tenantNavItems;
    if (this.activeRole() === 'colaborador') return this.colaboradorNavItems;
    return this.ownerNavItems;
  });

  selectRole(role: UserRole): void {
    this.authService.setActiveRole(role);
    this.roleDropdownOpen.set(false);
  }

  roleLabel(role: UserRole | null): string {
    switch (role) {
      case 'owner': return 'Propietario';
      case 'tenant': return 'Inquilino';
      case 'colaborador': return 'Colaborador';
      default: return 'Sin rol';
    }
  }

  roleIcon(role: UserRole | null): string {
    switch (role) {
      case 'owner': return 'manage_accounts';
      case 'tenant': return 'home';
      case 'colaborador': return 'group';
      default: return 'person';
    }
  }

  logout() {
    this.authService.logout();
  }
}
