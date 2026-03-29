import { Component, signal, inject, computed, HostListener, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, combineLatest, filter, map, startWith } from 'rxjs';
import { AuthService, UserRole } from '../../core/auth/auth.service';
import { TicketService } from '../../core/services/ticket.service';
import { PropertyService } from '../../core/services/property.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: () => number;
  external?: boolean;
  trailingIcon?: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatTooltipModule],
  template: `
    <div class="flex h-screen bg-warm-50 overflow-hidden">

      <!-- Mobile overlay -->
      @if (isMobile() && sidebarOpen()) {
        <div
          class="fixed inset-0 bg-black/50 z-40 lg:hidden"
          (click)="sidebarOpen.set(false)"
        ></div>
      }

      <!-- Sidebar -->
      <aside
        class="flex flex-col bg-warm-900 text-white transition-all duration-300 flex-shrink-0"
        [class.fixed]="isMobile()"
        [class.inset-y-0]="isMobile()"
        [class.left-0]="isMobile()"
        [class.z-50]="isMobile()"
        [class.w-64]="sidebarOpen()"
        [class.w-16]="!sidebarOpen() && !isMobile()"
        [class.-translate-x-full]="isMobile() && !sidebarOpen()"
        [class.translate-x-0]="!isMobile() || sidebarOpen()"
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
          @if (isMobile() && sidebarOpen()) {
            <button
              (click)="sidebarOpen.set(false)"
              class="ml-auto p-1.5 rounded-lg text-warm-400 hover:text-white hover:bg-warm-700 transition-colors"
            >
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>

        <!-- Role toggle -->
        @if (effectiveRoles().length > 1) {
          <div class="px-2 py-2 border-b border-warm-700">
            @if (sidebarOpen()) {
              <button
                (click)="cycleRole()"
                class="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-warm-800 hover:bg-warm-700 transition-colors cursor-pointer"
              >
                <!-- Left role label -->
                <span
                  class="text-[11px] font-medium transition-colors duration-200"
                  [class.text-white]="activeRole() === effectiveRoles()[0]"
                  [class.text-warm-500]="activeRole() !== effectiveRoles()[0]"
                >{{ roleLabel(effectiveRoles()[0]) }}</span>

                <!-- Toggle track -->
                <div class="flex-shrink-0 w-9 h-[20px] rounded-full relative transition-colors duration-200 bg-warm-700">
                  <div
                    class="absolute top-[3px] w-[14px] h-[14px] rounded-full bg-primary-400 transition-all duration-200"
                    [ngClass]="activeRole() === effectiveRoles()[0] ? 'left-[3px]' : 'left-[19px]'"
                  ></div>
                </div>

                <!-- Right role label -->
                <span
                  class="text-[11px] font-medium transition-colors duration-200"
                  [class.text-white]="activeRole() !== effectiveRoles()[0]"
                  [class.text-warm-500]="activeRole() === effectiveRoles()[0]"
                >{{ roleLabel(effectiveRoles()[1]) }}</span>
              </button>
            } @else {
              <button
                (click)="cycleRole()"
                class="flex items-center justify-center w-full p-2 rounded-lg bg-warm-800 hover:bg-warm-700 text-primary-400 transition-colors"
                [matTooltip]="roleLabel(activeRole())"
                matTooltipPosition="right"
              >
                <mat-icon class="text-[20px]">{{ roleIcon(activeRole()) }}</mat-icon>
              </button>
            }
          </div>
        }

        <!-- Nav items -->
        <nav class="flex-1 py-4 space-y-1 overflow-y-auto">
          @for (item of navItems(); track item.route) {
            @if (item.external) {
              <a
                [href]="item.route"
                target="_blank"
                rel="noopener"
                class="relative flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-warm-300 hover:bg-warm-700 hover:text-white transition-colors"
                [matTooltip]="!sidebarOpen() ? item.label : ''"
                matTooltipPosition="right"
              >
                <mat-icon class="flex-shrink-0 text-[20px]">{{ item.icon }}</mat-icon>
                @if (sidebarOpen()) {
                  <span class="text-sm font-medium truncate flex-1">{{ item.label }}</span>
                  @if (item.trailingIcon) {
                    <mat-icon class="flex-shrink-0 text-[16px] text-warm-500">{{ item.trailingIcon }}</mat-icon>
                  }
                }
              </a>
            } @else {
              <a
                [routerLink]="item.route"
                routerLinkActive="bg-primary-600 text-white"
                [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' || item.route === '/tenant' }"
                class="relative flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-warm-300 hover:bg-warm-700 hover:text-white transition-colors"
                [matTooltip]="!sidebarOpen() ? item.label : ''"
                matTooltipPosition="right"
                (click)="onNavClick()"
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
          }
        </nav>

        <!-- Version -->
        @if (sidebarOpen()) {
          <div class="px-4 pb-2">
            <span class="text-xs text-warm-600 font-mono">v1.2.2</span>
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
        <header class="h-14 bg-white border-b border-warm-200 flex items-center px-4 gap-3 flex-shrink-0">
          <button
            (click)="sidebarOpen.set(!sidebarOpen())"
            class="p-1.5 rounded-lg text-warm-500 hover:bg-warm-100 transition-colors"
          >
            <mat-icon>{{ sidebarOpen() && !isMobile() ? 'menu_open' : 'menu' }}</mat-icon>
          </button>

          <div class="flex items-baseline gap-2 min-w-0">
            <h1 class="text-sm font-bold text-warm-900 truncate">{{ pageTitle() }}</h1>
            @if (pageSubtitle()) {
              <span class="text-[11px] text-warm-400 truncate hidden sm:inline">{{ pageSubtitle() }}</span>
            }
          </div>

          <div class="flex-1"></div>
        </header>

        <!-- Page content -->
        <main class="flex-1 overflow-y-auto p-4 sm:p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent implements OnInit {
  private authService = inject(AuthService);
  private ticketService = inject(TicketService);
  private propertyService = inject(PropertyService);
  private router = inject(Router);

  isMobile = signal(false);
  sidebarOpen = signal(true);

  private currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map((e: any) => e.urlAfterRedirects as string),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );

  private static routeMeta: Record<string, { title?: string; subtitle?: string }> = {
    '/properties': { title: 'Propiedades', subtitle: 'Gestiona tus inmuebles' },
    '/finances': { title: 'Finanzas', subtitle: 'Ingresos y gastos de tu portafolio' },
    '/services': { title: 'Servicios', subtitle: 'Distribúyelos entre tus propiedades' },
    '/analytics': { title: 'Analytics', subtitle: 'Inteligencia de negocio' },
    '/reminders': { title: 'Recordatorios', subtitle: 'Mensajes automáticos a inquilinos' },
    '/colaboradores': { title: 'Colaboradores', subtitle: 'Accesos y permisos' },
    '/tickets': { title: 'Tickets', subtitle: 'Mantenimiento y soporte' },
    '/notifications': { title: 'Notificaciones', subtitle: 'Alertas automáticas' },
    '/tenant': { title: 'Mi Arriendo' },
    '/tenant/payments': { title: 'Mis Pagos' },
    '/tenant/tickets': { title: 'Soporte' },
  };

  private matchedRoute = computed(() => {
    const url = this.currentUrl();
    if (ShellComponent.routeMeta[url]) return { url, meta: ShellComponent.routeMeta[url] };
    // Longest prefix match (e.g. /properties/abc → /properties)
    const key = Object.keys(ShellComponent.routeMeta)
      .filter(k => url.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    return key ? { url: key, meta: ShellComponent.routeMeta[key] } : null;
  });

  pageTitle = computed(() => {
    const url = this.currentUrl();
    if (url === '/dashboard' || url.startsWith('/dashboard')) {
      const name = this.authService.currentUser()?.displayName?.split(' ')[0] ?? '';
      return `Hola, ${name} 👋`;
    }
    return this.matchedRoute()?.meta.title ?? '';
  });

  pageSubtitle = computed(() => {
    const url = this.currentUrl();
    if (url === '/dashboard' || url.startsWith('/dashboard')) return 'Resumen de tu portafolio';
    return this.matchedRoute()?.meta.subtitle ?? '';
  });

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

  private uid$ = toObservable(this.authService.uid).pipe(filter((uid): uid is string => !!uid));
  private role$ = toObservable(this.authService.activeRole).pipe(filter((r): r is NonNullable<typeof r> => !!r));

  pendingTicketsCount = toSignal(
    combineLatest([this.uid$, this.role$]).pipe(
      switchMap(([uid, role]) => {
        if (role === 'owner') return this.ticketService.getPendingCount$(uid);
        if (role === 'colaborador') {
          return this.uid$.pipe(
            switchMap(() => this.propertyService.getAll()),
            switchMap(properties => {
              const propertyIds = properties.map(p => p.id!).filter(Boolean);
              if (propertyIds.length === 0) return of(0);
              return this.ticketService.getByPropertyIds$(propertyIds).pipe(
                map(tickets => tickets.filter(t => t.status === 'pendiente').length)
              );
            })
          );
        }
        return of(0);
      })
    ),
    { initialValue: 0 }
  );

  private ownerNavItems: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { label: 'Propiedades', icon: 'apartment', route: '/properties' },
    { label: 'Finanzas', icon: 'bar_chart', route: '/finances' },
    { label: 'Servicios', icon: 'receipt_long', route: '/services' },
    { label: 'Analytics', icon: 'insights', route: '/analytics' },
    { label: 'Recordatorios', icon: 'chat', route: '/reminders' },
    { label: 'Colaboradores', icon: 'group', route: '/colaboradores' },
    { label: 'Marketplace', icon: 'storefront', route: '/', external: true, trailingIcon: 'open_in_new' },
    { label: 'Tickets', icon: 'build_circle', route: '/tickets', badge: () => this.pendingTicketsCount() },
  ];

  private colaboradorNavItems: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { label: 'Propiedades', icon: 'apartment', route: '/properties' },
    { label: 'Finanzas', icon: 'bar_chart', route: '/finances' },
    { label: 'Servicios', icon: 'receipt_long', route: '/services' },
    { label: 'Marketplace', icon: 'storefront', route: '/', external: true, trailingIcon: 'open_in_new' },
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

  ngOnInit() {
    this.checkMobile();
    // Close sidebar on navigation in mobile
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe(() => {
      if (this.isMobile()) {
        this.sidebarOpen.set(false);
      }
    });
  }

  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  private checkMobile() {
    const mobile = window.innerWidth < 1024;
    this.isMobile.set(mobile);
    if (mobile && this.sidebarOpen()) {
      this.sidebarOpen.set(false);
    }
  }

  onNavClick() {
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    }
  }

  selectRole(role: UserRole): void {
    this.authService.setActiveRole(role);
  }

  cycleRole(): void {
    const roles = this.effectiveRoles();
    const current = this.activeRole();
    const idx = roles.indexOf(current!);
    const next = roles[(idx + 1) % roles.length];
    this.authService.setActiveRole(next);
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
