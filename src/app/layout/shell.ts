import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { DataService } from '../data.service';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
<div class="layout" [class.nav-open]="navOpen()">
  <aside>
    <header>
      <i>♬</i>
      <span><b>Cofradía</b><small>Repertorio</small></span>
    </header>
    <nav>
      <a routerLink="/repertorio" routerLinkActive="active" (click)="navOpen.set(false)">Repertorio</a>
      <p class="nav-label">Administración</p>
      <a class="nav-sub" routerLink="/administracion/canciones" routerLinkActive="active" (click)="navOpen.set(false)">Canciones</a>
      <a class="nav-sub" routerLink="/administracion/estudio" routerLinkActive="active" (click)="navOpen.set(false)">Estudio</a>
    </nav>
  </aside>

  <div class="scrim" (click)="navOpen.set(false)"></div>

  <main>
    <div class="topbar">
      <button type="button" class="icon-btn menu" (click)="navOpen.set(!navOpen())" aria-label="Menú">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <span class="topbar-title">Asociación de tambores y bombos</span>
      <button type="button" class="icon-btn user" (click)="logout()" title="Cerrar sesión" aria-label="Cerrar sesión">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"/></svg>
      </button>
    </div>
    <article><router-outlet /></article>
  </main>
</div>
  `,
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private data = inject(DataService);

  navOpen = signal(false);

  ngOnInit() {
    this.data.load().subscribe();
    // Cierra el menú al navegar (por si acaso) y al pasar a escritorio.
    this.router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.navOpen.set(false));
  }

  logout() {
    this.navOpen.set(false);
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
