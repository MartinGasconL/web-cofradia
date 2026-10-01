import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DataService, Song } from '../data.service';

@Component({
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<header class="head">
  <div><p>SOCIOS</p><h1>Canciones</h1><span>Consulta, escucha y practica el repertorio.</span></div>
</header>

<section class="filters card">
  <input [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="⌕ Buscar canción...">
  <select [ngModel]="use()" (ngModelChange)="use.set($event)">
    <option value="todos">Todos los usos</option>
    <option value="procesion">Procesión</option>
    <option value="exhibicion">Exhibición</option>
  </select>
  <select [ngModel]="qa()" (ngModelChange)="qa.set($event)">
    <option value="todos">Pregunta / respuesta: todas</option>
    <option value="si">Pregunta / respuesta: sí</option>
    <option value="no">Pregunta / respuesta: no</option>
  </select>
  <select [ngModel]="desfase()" (ngModelChange)="desfase.set($event)">
    <option value="todos">Desfase de bombos: todos</option>
    <option value="si">Con desfase de bombos</option>
    <option value="no">Sin desfase de bombos</option>
  </select>
</section>

<section class="songs">
  @for (s of filtered(); track s.id) {
  <a class="card" [routerLink]="['/repertorio', s.id]">
    <i>♬</i>
    <div>
      <h2>{{ s.title }}</h2>
      <span>{{ s.description }}</span>
      <p>
        <b *ngIf="s.procesion">Procesión</b>
        <b *ngIf="s.exhibicion">Exhibición</b>
        <b class="tag-desfase" *ngIf="hasDesfase(s)">Desfase de bombos</b>
        <b class="pink" *ngIf="s.qa">Pregunta / respuesta</b>
      </p>
    </div>
    <aside><strong>{{ format(s.duration) }}</strong><small>{{ s.bpm }} BPM</small></aside>
    <em>›</em>
  </a>
  } @empty {
  <div class="card empty">No hay canciones con esos filtros.</div>
  }
</section>
  `,
  styleUrl: './pages.scss',
})
export class Repertorio {
  private data = inject(DataService);
  search = signal('');
  use = signal('todos');
  qa = signal('todos');
  desfase = signal('todos');

  filtered = computed(() => {
    const search = this.search().toLowerCase();
    const use = this.use();
    const qa = this.qa();
    const desfase = this.desfase();
    return this.data.songs().filter(s => {
      if (s.draft) return false;
      const u = use === 'todos' || (use === 'procesion' && s.procesion) || (use === 'exhibicion' && s.exhibicion);
      const q = qa === 'todos' || (qa === 'si') === s.qa;
      const d = desfase === 'todos' || (desfase === 'si') === this.hasDesfase(s);
      const text = !search || s.title.toLowerCase().includes(search);
      return u && q && d && text;
    });
  });

  hasDesfase(s: Song) {
    const parts = [...s.partes, ...(s.ramas ?? []).flatMap(r => r.partes)];
    return parts.some(p => p.desfase);
  }

  format(n: number) {
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  }
}
