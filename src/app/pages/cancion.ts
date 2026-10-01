import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService, Parte, Track, TRACKS, TRACK_LABEL, TRACK_SHORT } from '../data.service';
import { AudioEngine } from '../audio-engine';

@Component({
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
@if (song(); as s) {
<a class="back" routerLink="/repertorio">← Repertorio</a>
<header class="head"><div><p>CANCIÓN</p><h1>{{ s.title }}</h1><span>{{ s.description }}</span></div></header>

<section class="player card">
  <div>
    <button class="play" (click)="toggle()" [disabled]="!canPlay()">{{ engine.playing() ? 'Ⅱ' : '▶' }}</button>
    <button (click)="engine.stop()" [disabled]="!canPlay()">■</button>
    <strong>{{ fmt(engine.position()) }} / {{ fmt(engine.duration()) }}</strong>
  </div>

  <label>Pista
    <select [ngModel]="selectedTrack()" (ngModelChange)="selectedTrack.set($event)" [disabled]="!availableTracks().length">
      @for (t of availableTracks(); track t) {<option [ngValue]="t">{{ labels[t] }}</option>}
      @if (!availableTracks().length) {<option [ngValue]="null">Sin audio</option>}
    </select>
  </label>

  <label>Velocidad
    <select [ngModel]="engine.rate()" (ngModelChange)="engine.setRate($event)">
      <option [ngValue]="0.75">0,75×</option>
      <option [ngValue]="1">1×</option>
      <option [ngValue]="1.25">1,25×</option>
      <option [ngValue]="1.5">1,5×</option>
    </select>
  </label>

  <div class="progress" (click)="scrub($event)"><span [style.width.%]="pct()"></span></div>

  @if (engine.loading()) { <small>Cargando audio…</small> }
  @else if (converting()) { <small>Convirtiendo audio subido, estará disponible en unos segundos…</small> }
  @else if (engine.error()) { <small>{{ engine.error() }}</small> }
  @else { <small class="ok">Pulsa una parte del cronograma para escuchar ese fragmento.</small> }
</section>

<div class="tabs"><b>Canción</b><span>Práctica <em>Fase 2</em></span><span>Información</span></div>

<div class="song-detail-grid">
  <section class="timeline card">
    <header>
      <div><h2>Cronograma</h2><span>Pulsa una parte para escucharla.</span></div>
      <button type="button" class="bpm-btn" [class.on]="engine.metronomeOn()"
        (click)="engine.toggleMetronome(s.bpm)"
        [title]="engine.metronomeOn() ? 'Parar metrónomo' : 'Metrónomo a ' + s.bpm + ' BPM'">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="m12 3 6 17H6L12 3Zm0 3-3 9m3-9 1.5 4.5"/></svg>
        {{ s.bpm }} BPM
      </button>
    </header>
    @for (part of s.partes; track part.name) {
    <button class="part"
      [class.playing]="engine.position() >= part.start && engine.position() < part.end"
      [class.selected]="selectedPart() === part"
      [style.--c]="part.color" (click)="playPart(part)">
      <i><u></u></i>
      <div>
        <small>{{ fmt(part.start) }} — {{ fmt(part.end) }}</small>
        <strong>{{ part.name }}</strong>
        <span>{{ part.note }}</span>
        <p>
          @for (t of part.tracks; track t.track) { <em>{{ short[t.track] }}</em> }
          <em class="pink" *ngIf="part.question || part.answer">{{ part.question ? 'Pregunta' : 'Respuesta' }}</em>
          <em class="tag-desfase" *ngIf="part.desfase">Desfase</em>
        </p>
      </div>
    </button>
    }
  </section>

  <aside class="notes card">
    <header><div class="notes-icon">✎</div><div><p>NOTAS</p><h2>{{ selectedPart() ? selectedPart()!.name : 'Canción completa' }}</h2></div></header>
    @if (selectedPart(); as p) {
      <p class="note-time">{{ fmt(p.start) }} — {{ fmt(p.end) }}</p>
      <p>{{ p.note || 'Sin nota específica para esta parte.' }}</p>
    } @else {
      <p>{{ s.description || 'Sin nota general.' }}</p>
      <p>Selecciona una parte del cronograma para ver sus indicaciones concretas.</p>
    }
    <div class="note-tip">Las notas se editan desde Administración.</div>
  </aside>
</div>
}
  `,
  styleUrl: './pages.scss',
})
export class Cancion implements OnInit, OnDestroy {
  private data = inject(DataService);
  private route = inject(ActivatedRoute);
  readonly engine = inject(AudioEngine);

  labels = TRACK_LABEL;
  short = TRACK_SHORT;

  private id = Number(this.route.snapshot.paramMap.get('id'));
  song = computed(() => this.data.find(this.id));
  selectedPart = signal<Parte | null>(null);
  selectedTrack = signal<Track | null>(null);

  private poll?: number;

  converting = computed(() =>
    Object.values(this.song()?.tracks ?? {}).some(t => t?.status === 'PROCESSING' || t?.status === 'PENDING'));

  canPlay = computed(() => this.availableTracks().length > 0);

  /** Pistas con audio listo, en el orden fijo del MVP. */
  availableTracks = computed(() => {
    const loaded = this.engine.loadedTracks();
    return TRACKS.filter(t => loaded.includes(t));
  });

  constructor() {
    // Mantén una pista válida seleccionada.
    effect(() => {
      const avail = this.availableTracks();
      if (avail.length && !avail.includes(this.selectedTrack() as Track)) {
        this.selectedTrack.set(avail[0]);
      } else if (!avail.length && this.selectedTrack() !== null) {
        this.selectedTrack.set(null);
      }
    });
    // Solo suena la pista seleccionada.
    effect(() => {
      const t = this.selectedTrack();
      this.engine.setActiveTracks(t ? [t] : []);
    });
  }

  ngOnInit() {
    const load = () => {
      const s = this.song();
      if (s) this.engine.loadSong(s, t => this.data.audioUrl(s.id, t));
    };
    if (this.song()) load();
    else this.data.refresh(this.id).subscribe(load);

    this.poll = window.setInterval(() => {
      if (!this.converting()) return;
      this.data.refresh(this.id).subscribe(() => {
        if (!this.converting()) load();
      });
    }, 3000);
  }

  ngOnDestroy() {
    clearInterval(this.poll);
    this.engine.release();
  }

  toggle() {
    this.engine.playing() ? this.engine.pause() : this.engine.play();
  }

  playPart(part: Parte) {
    this.selectedPart.set(part);
    const track = this.selectedTrack();
    if (!track || !this.engine.loadedTracks().includes(track)) return;
    // Reproduce el tramo de esta parte en la pista elegida (su intervalo propio si lo tiene).
    const own = part.tracks.find(t => t.track === track);
    const from = own ? own.start : part.start;
    const to = own ? own.end : part.end;
    this.engine.play(from, to, [{ track, start: from, end: to }]);
  }

  scrub(event: MouseEvent) {
    const el = event.currentTarget as HTMLElement;
    const ratio = (event.clientX - el.getBoundingClientRect().left) / el.clientWidth;
    this.engine.seek(ratio * this.engine.duration());
  }

  pct() {
    const d = this.engine.duration();
    return d ? (this.engine.position() / d) * 100 : 0;
  }

  fmt(n: number) {
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  }
}
