import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataService, Parte, ParteTrack, Song, TrackInfo, TRACKS, Track, TRACK_LABEL, TRACK_SHORT } from '../data.service';
import { RecorderDialog } from './recorder-dialog';
import { WaveformSelector } from './waveform-selector';
import { AudioEngine } from '../audio-engine';

const COLORS = ['#910000', '#6d28d9', '#0e7490', '#c2410c', '#15803d', '#a16207'];
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'subido', PROCESSING: 'preparando audio…', READY: 'listo ✓', FAILED: 'no se pudo procesar',
};

@Component({
  imports: [CommonModule, FormsModule, RecorderDialog, WaveformSelector],
  template: `
@if (!ready()) {
  <div class="no-parts">Cargando…</div>
} @else {
<a class="back" (click)="back()">← {{ song.title || 'Canción' }}</a>
<header class="head">
  <div>
    <p>ESTUDIO · PARTE{{ branchKey ? ' · RAMA' : '' }}</p>
    <h1>{{ isNew ? 'Nueva parte' : (partDraft.name || 'Parte') }}</h1>
  </div>
</header>

<section class="form-page">
  <div class="form-main">
    <section class="card section">
      <h2>Datos de la parte</h2>
      <label>Título<input [(ngModel)]="partDraft.name" placeholder="p. ej. Llamada"></label>
      <label>Descripción / nota<textarea [(ngModel)]="partDraft.note"></textarea></label>
      <div class="fields two">
        <label>Inicio <small>segundos</small><input [(ngModel)]="partDraft.start" type="number" min="0" [max]="song.duration"></label>
        <label>Fin <small>segundos</small><input [(ngModel)]="partDraft.end" type="number" min="0" [max]="song.duration"></label>
      </div>
      <fieldset class="part-flags">
        <legend>Indicativos</legend>
        <label><input [(ngModel)]="partDraft.question" type="checkbox"> Pregunta</label>
        <label><input [(ngModel)]="partDraft.answer" type="checkbox"> Respuesta</label>
        <label><input [(ngModel)]="partDraft.desfase" type="checkbox"> Desfase de bombos</label>
      </fieldset>
    </section>

    <section class="card section">
      <div class="section-title">
        <div>
          <h2>Grabación por pista</h2>
          <p class="section-help">Graba o sube el audio de cada pista que toca en la parte. Por defecto, «Todos juntos».</p>
        </div>
      </div>

      <div class="track-tabs part-track-tabs">
        @for (track of tracks; track track) {
        <button type="button" [class.active]="activeTab() === track" [class.assigned]="isAssigned(track)" (click)="activeTab.set(track)">
          <span>{{ shortLabel(track) }}</span>
          @if (isAssigned(track)) { <span class="tab-dot"></span> }
        </button>
        }
      </div>

      <div class="track-tab-body">
        <label class="assign-toggle">
          <input type="checkbox" [checked]="isAssigned(activeTab())" (change)="toggleTrack(activeTab())">
          {{ labels[activeTab()] }} — toca en esta parte
        </label>

        <div class="track-row">
          <label class="file-btn" [class.disabled]="uploadingTrack() === activeTab()">
            <input type="file" accept="audio/*,video/mp4,.mp4,.m4a" [disabled]="uploadingTrack() === activeTab()" (change)="setFile(activeTab(), $event)">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m0 0 4 4m-4-4-4 4M5 20h14"/></svg>
            Subir archivo
          </label>
          <button type="button" class="rec-btn" (click)="recordingFor.set(activeTab())">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 11a6 6 0 0 0 12 0M12 17v4"/></svg>
            Grabar
          </button>
        </div>

        @if (uploadingTrack() === activeTab()) { <small class="track-state" data-s="UPLOADING">Subiendo grabación…</small> }
        @else if (trackStates()[activeTab()]; as info) {
          <small class="track-state" [attr.data-s]="info.status">{{ info.filename }} · {{ statusLabel(info.status) }}</small>
        }
        @else { <small class="track-state" data-s="EMPTY">Sin audio todavía</small> }

        @if (isAssigned(activeTab())) {
          @if (rangeOf(activeTab()); as r) {
            <div class="wf-block">
              <span class="range-label">Recorte de la grabación <small>arrastra los bordes de la zona azul</small></span>
              <app-waveform-selector
                [buffer]="wfBuffer()"
                [fallbackDuration]="song.duration"
                [start]="r.start" [end]="r.end"
                [position]="engine.playing() ? engine.position() : null"
                (startChange)="setTrackRange(activeTab(), $event, r.end)"
                (endChange)="setTrackRange(activeTab(), r.start, $event)"
                (seek)="engine.seek($event)"></app-waveform-selector>
              <div class="range-transport">
                <button type="button" class="play" (click)="previewTrack(activeTab())" [disabled]="!trackHasAudio(activeTab())" title="Escuchar el recorte"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></button>
                <button type="button" (click)="engine.pause()" [disabled]="!trackHasAudio(activeTab())" title="Pausar"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg></button>
                <button type="button" (click)="engine.stop()" [disabled]="!trackHasAudio(activeTab())" title="Parar"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 6h12v12H6z"/></svg></button>
                <label class="range-num">Desde <input [ngModel]="r.start" (ngModelChange)="setTrackRange(activeTab(), $event, r.end)" type="number" min="0" step="0.1"></label>
                <label class="range-num">Hasta <input [ngModel]="r.end" (ngModelChange)="setTrackRange(activeTab(), r.start, $event)" type="number" min="0" step="0.1"></label>
              </div>
              @if (!trackHasAudio(activeTab())) { <small class="range-hint">Graba o sube el audio de {{ labels[activeTab()] | lowercase }} para ver la onda.</small> }
            </div>
          }
        }
      </div>
    </section>
  </div>

  <aside class="card notes-side">
    <h2>Resumen</h2>
    <p>Intervalo <b>{{ fmt(partDraft.start) }} — {{ fmt(partDraft.end) }}</b></p>
    <p><b>{{ partDraft.tracks.length }}</b> de {{ tracks.length }} pistas tocan</p>
    @if (partDraft.question || partDraft.answer || partDraft.desfase) {
      <p class="side-flags">
        @if (partDraft.question) { <em>Pregunta</em> }
        @if (partDraft.answer) { <em>Respuesta</em> }
        @if (partDraft.desfase) { <em class="pink">Desfase de bombos</em> }
      </p>
    }
    <p>Se guarda en MySQL mediante la API.</p>
  </aside>
</section>

@if (error()) { <div class="range-error">{{ error() }}</div> }
<div class="form-actions">
  <button type="button" class="outline" (click)="back()">Cancelar</button>
  <button type="button" class="primary-btn" (click)="savePart()" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar parte' }}</button>
</div>

@if (recordingFor(); as track) {
<app-recorder-dialog (accepted)="onRecorded(track, $event)" (dismissed)="recordingFor.set(null)"></app-recorder-dialog>
}
}
  `,
  styleUrl: './pages.scss',
})
export class EstudioParte implements OnInit, OnDestroy {
  data = inject(DataService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  readonly engine = inject(AudioEngine);

  tracks = TRACKS;
  labels = TRACK_LABEL;
  short = TRACK_SHORT;

  song!: Song;
  partDraft!: Parte;
  isNew = false;
  editingIndex: number | null = null;
  branchKey: string | null = null;
  /** Índice de inserción en la línea principal cuando se llega arrastrando «Añadir parte». */
  insertAt: number | null = null;

  ready = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  activeTab = signal<Track>('completa');
  trackStates = signal<Partial<Record<Track, TrackInfo>>>({});
  uploadingTrack = signal<Track | null>(null);
  recordingFor = signal<Track | null>(null);

  /** Buffer decodificado de la pista activa (para la onda). Reacciona a la carga de audio. */
  wfBuffer = computed(() => {
    this.engine.buffersVersion();
    return this.engine.getBuffer(this.activeTab()) ?? null;
  });

  constructor() {
    // cuando llega el audio real, ajusta los recortes que se pasan de la duración del clip
    effect(() => {
      this.engine.buffersVersion();
      for (const t of this.partDraft?.tracks ?? []) {
        const buf = this.engine.getBuffer(t.track);
        if (!buf) continue;
        const len = Math.round(buf.duration * 10) / 10;
        if (t.end > len) t.end = len;
        if (t.start >= t.end) t.start = 0;
      }
    });
  }

  private songId = 0;
  private poll?: number;

  ngOnInit() {
    this.poll = window.setInterval(() => this.refreshStatesIfNeeded(), 3000);
    this.songId = Number(this.route.snapshot.paramMap.get('id'));
    const pos = this.route.snapshot.paramMap.get('pos'); // "nueva" o índice
    this.branchKey = this.route.snapshot.queryParamMap.get('rama');
    const at = this.route.snapshot.queryParamMap.get('at');
    this.insertAt = at !== null && at !== '' ? Number(at) : null;
    this.data.refresh(this.songId).subscribe(song => {
      this.song = structuredClone(song);
      this.trackStates.set(song.tracks);
      const list = this.branchList();
      if (pos === 'nueva' || pos === null) {
        this.isNew = true;
        this.editingIndex = null;
        const prevEnd = list.reduce((m, p) => Math.max(m, p.end), 0);
        this.partDraft = {
          name: '', note: '',
          start: Math.max(0, Math.min(prevEnd, this.song.duration - 1)),
          end: this.song.duration,
          color: COLORS[list.length % COLORS.length], tracks: [],
        };
      } else {
        this.editingIndex = Number(pos);
        this.partDraft = structuredClone(list[this.editingIndex]);
      }
      this.ready.set(true);
      this.engine.release();
      this.engine.loadSong({ ...this.song, tracks: this.trackStates() }, t => this.data.audioUrl(this.songId, t));
    });
  }

  ngOnDestroy() {
    clearInterval(this.poll);
    this.engine.release();
  }

  statusLabel(s: string) { return STATUS_LABEL[s] ?? s; }

  private refreshStatesIfNeeded() {
    if (!this.songId) return;
    const busy = Object.values(this.trackStates()).some(t => t?.status === 'PROCESSING' || t?.status === 'PENDING');
    if (!busy) return;
    this.data.refresh(this.songId).subscribe(fresh => {
      this.trackStates.set(fresh.tracks);
      if (!Object.values(fresh.tracks).some(t => t?.status === 'PROCESSING' || t?.status === 'PENDING')) {
        this.engine.release();
        this.engine.loadSong({ ...this.song, tracks: fresh.tracks }, t => this.data.audioUrl(this.songId, t));
      }
    });
  }

  private branchList(): Parte[] {
    if (!this.branchKey) return this.song.partes;
    return this.song.ramas.find(r => r.id === this.branchKey)?.partes ?? [];
  }

  shortLabel(t: Track) { return TRACK_SHORT[t]; }

  // --- Audio ---

  setFile(track: Track, e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.upload(track, file, file.name);
  }

  onRecorded(track: Track, payload: { blob: Blob; ext: string }) {
    this.recordingFor.set(null);
    this.upload(track, payload.blob, `grabacion-${track}.${payload.ext}`);
  }

  private upload(track: Track, blob: Blob, filename: string) {
    if (!this.song.id) { this.error.set('Guarda la canción antes de subir audio.'); return; }
    this.uploadingTrack.set(track);
    this.engine.addLocalTrack(track, blob);
    this.data.uploadTrack(this.song.id, track, blob, filename).subscribe({
      next: t => {
        this.uploadingTrack.set(null);
        this.trackStates.update(s => ({ ...s, [track]: { type: track, filename: t.originalFilename, status: t.status, duration: t.durationSeconds, version: t.version } }));
      },
      error: () => { this.uploadingTrack.set(null); this.error.set('No se pudo subir el audio.'); },
    });
  }

  // --- Pistas de la parte ---

  isAssigned(track: Track) { return this.partDraft.tracks.some(t => t.track === track); }
  trackHasAudio(track: Track) { return this.engine.loadedTracks().includes(track); }
  rangeOf(track: Track): ParteTrack | undefined { return this.partDraft.tracks.find(t => t.track === track); }

  /** redondeo a décimas de segundo */
  private r1(n: number) { return Math.round(n * 10) / 10; }

  private clipLen(track: Track) {
    return this.r1(this.engine.getBuffer(track)?.duration ?? this.song.duration);
  }

  toggleTrack(track: Track) {
    if (this.isAssigned(track)) {
      this.partDraft.tracks = this.partDraft.tracks.filter(t => t.track !== track);
    } else {
      const buf = this.engine.getBuffer(track);
      const len = buf ? this.r1(buf.duration) : Math.max(1, this.r1(this.partDraft.end - this.partDraft.start));
      this.partDraft.tracks = [...this.partDraft.tracks, { track, start: 0, end: len }];
    }
  }

  setTrackRange(track: Track, start: number, end: number) {
    const t = this.rangeOf(track);
    if (!t) return;
    const max = Math.max(this.clipLen(track), this.r1(end), this.r1(start));
    t.start = Math.max(0, Math.min(this.r1(start), max - 0.1));
    t.end = Math.max(t.start + 0.1, Math.min(this.r1(end), max));
  }

  previewTrack(track: Track) {
    const r = this.rangeOf(track);
    if (!r || !this.trackHasAudio(track)) return;
    this.engine.play(r.start, r.end, [{ track, start: r.start, end: r.end }]);
  }

  fmt(n: number) {
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  }

  back() {
    this.engine.stop();
    this.router.navigate(['/administracion/estudio', this.songId]);
  }

  savePart() {
    const d = this.partDraft;
    if (!d.name.trim()) { this.error.set('Ponle un título a la parte.'); return; }
    d.start = Math.max(0, Math.round(d.start || 0));
    d.end = Math.min(this.song.duration, Math.round(d.end || 0));
    if (d.end <= d.start) { this.error.set('El fin de la parte debe ser posterior al inicio.'); return; }
    for (const t of d.tracks) {
      t.start = Math.max(0, this.r1(t.start || 0));
      t.end = Math.max(t.start + 0.1, this.r1(t.end || 0));
    }
    this.error.set(null);

    const list = this.branchList();
    if (this.editingIndex !== null) {
      list[this.editingIndex] = d;
    } else if (!this.branchKey && this.insertAt !== null && this.insertAt >= 0 && this.insertAt < list.length) {
      list.splice(this.insertAt, 0, d);
      for (const r of this.song.ramas) {
        if (r.desde >= this.insertAt) r.desde++;
        if (r.hasta >= this.insertAt) r.hasta++;
      }
    } else {
      list.push(d);
    }

    this.saving.set(true);
    this.data.update(this.song).subscribe({
      next: () => this.back(),
      error: () => { this.saving.set(false); this.error.set('No se pudo guardar.'); },
    });
  }
}
