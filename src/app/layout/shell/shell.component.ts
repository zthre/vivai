import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
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

        <!-- Nav items -->
        <nav class="flex-1 py-4 space-y-1 overflow-y-auto">
          @for (item of navItems; track item.route) {
            <a
              [routerLink]="item.route"
              routerLinkActive="bg-primary-600 text-white"
              [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
              class="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-warm-300 hover:bg-warm-700 hover:text-white transition-colors"
              [matTooltip]="!sidebarOpen() ? item.label : ''"
              matTooltipPosition="right"
            >
              <mat-icon class="flex-shrink-0 text-[20px]">{{ item.icon }}</mat-icon>
              @if (sidebarOpen()) {
                <span class="text-sm font-medium truncate">{{ item.label }}</span>
              }
            </a>
          }
        </nav>

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
                <p class="text-xs text-warm-400 truncate">{{ user()?.email }}</p>
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

  sidebarOpen = signal(true);
  user = this.authService.currentUser;

  userInitial = () => this.user()?.displayName?.[0]?.toUpperCase() ?? 'U';

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { label: 'Inmuebles', icon: 'apartment', route: '/properties' },
  ];

  logout() {
    this.authService.logout();
  }
}
