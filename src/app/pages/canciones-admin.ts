import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService, Song } from '../data.service';

@Component({
  imports: [CommonModule, RouterLink],
  template: `
<header class="head">
  <div>
    <p>ADMINISTRACIÓN</p>
    <h1>Canciones</h1>
    <span>Gestiona el repertorio oficial, sus pistas y sus partes.</span>
  </div>
  <a routerLink="/administracion/canciones/nueva">+ Crear canción</a>
</header>

<section class="admin-list card">
  <header><span>Título</span><span>Uso</span><span>Tempo</span><span>Pistas</span><span></span></header>
  @for (song of songs(); track song.id) {
  <a [routerLink]="['/administracion/canciones', song.id]">
    <div><i>♬</i><span><b>{{ song.title }}</b><small>{{ song.description || 'Sin descripción' }}</small></span></div>
    <span><em *ngIf="song.procesion">Procesión</em><em *ngIf="song.exhibicion">Exhibición</em></span>
    <span>{{ song.bpm }} BPM</span>
    <span>{{ trackCount(song) }} pistas</span>
    <span class="row-end">
      @if (confirmId() === song.id) {
        <button type="button" class="danger-link" (click)="doDelete(song.id, $event)" [disabled]="busy()">Quitar</button>
        <button type="button" class="link-btn" (click)="cancel($event)">No</button>
      } @else {
        <strong>Editar ›</strong>
        <button type="button" class="row-del" title="Quitar del repertorio" (click)="ask(song.id, $event)">
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
        </button>
      }
    </span>
  </a>
  }
</section>
@if (!songs().length) { <div class="no-parts">Aún no hay canciones oficiales.</div> }
  `,
  styleUrl: './pages.scss',
})
export class CancionesAdmin {
  data = inject(DataService);
  songs = computed(() => this.data.songs().filter(s => !s.draft));
  confirmId = signal<number | null>(null);
  busy = signal(false);

  trackCount(s: Song) {
    return Object.keys(s.tracks).length;
  }

  ask(id: number, e: Event) { e.preventDefault(); e.stopPropagation(); this.confirmId.set(id); }
  cancel(e: Event) { e.preventDefault(); e.stopPropagation(); this.confirmId.set(null); }

  doDelete(id: number, e: Event) {
    e.preventDefault(); e.stopPropagation();
    if (this.busy()) return;
    this.busy.set(true);
    this.data.remove(id).subscribe({
      next: () => { this.busy.set(false); this.confirmId.set(null); },
      error: () => { this.busy.set(false); this.confirmId.set(null); },
    });
  }
}
