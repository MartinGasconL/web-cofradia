import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, map, of, throwError } from 'rxjs';
import { DataService, Parte, ParteTrack, Song, TrackInfo, TRACKS, Track, TRACK_LABEL, TRACK_SHORT } from '../data.service';
import { RecorderDialog } from './recorder-dialog';
import { PartRangeBar, TimeRange } from './part-range-bar';
import { AudioEngine, TrackWindow } from '../audio-engine';
import { InfoEditor } from '../info/info-editor';

const COLORS = ['#910000', '#6d28d9', '#0e7490', '#c2410c', '#15803d', '#a16207'];
const LABEL = TRACK_LABEL;
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'sin subir', PROCESSING: 'Convirtiendo…', READY: 'Listo', FAILED: 'Error',
};

@Component({
  imports: [CommonModule, FormsModule, RouterLink, RecorderDialog, PartRangeBar, InfoEditor],
  template: `
@if (!ready()) {
  <a class="back" routerLink="/administracion/canciones">← Canciones</a>
  <div class="no-parts">Cargando canción…</div>
} @else {
<a class="back" routerLink="/administracion/canciones">← Canciones</a>
<header class="head">
  <div>
    <p>ADMINISTRACIÓN · {{ editing ? 'EDICIÓN' : 'ALTA' }}</p>
    <h1>{{ editing ? 'Editar canción' : 'Crear canción' }}</h1>
    <span>El audio se sube al seleccionarlo. La canción y las partes se guardan con el botón de abajo.</span>
  </div>
</header>

<section class="form-page">
  <div class="form-main">
    <section class="card section">
      <h2>Información general</h2>
      <div class="fields two">
        <label>Título<input [(ngModel)]="song.title" required></label>
        <label>Tempo (BPM)<input [(ngModel)]="song.bpm" type="number"></label>
      </div>
      <label>Descripción<textarea [(ngModel)]="song.description"></textarea></label>
      <label>Duración <small>segundos</small><input [(ngModel)]="song.duration" type="number"></label>
      <div class="checks">
        <label><input [(ngModel)]="song.procesion" type="checkbox"> Procesión</label>
        <label><input [(ngModel)]="song.exhibicion" type="checkbox"> Exhibición</label>
      </div>
    </section>

    <app-info-editor [(markdown)]="song.info" [ensureSong]="ensureSaved" />

    <section class="card section">
      <h2>Pistas</h2>
      <p class="section-help">Opcionales. Al seleccionar un fichero (MP3, WAV, M4A, MP4…) o grabar, se sube a la API al momento.</p>
      <div class="track-upload">
        @for (track of tracks; track track) {
        <div class="track-card">
          <span class="track-name">{{ labels[track] }}</span>
          <div class="track-row">
            <label class="file-btn" [class.disabled]="uploadingTrack() === track">
              <input type="file" accept="audio/*,video/mp4,.mp4,.m4a" [disabled]="uploadingTrack() === track" (change)="setTrack(track, $event)">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m0 0 4 4m-4-4-4 4M5 20h14"/></svg>
              Subir archivo
            </label>
            <button type="button" class="rec-btn" (click)="recordingFor.set(track)" title="Grabar desde el micrófono">
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 11a6 6 0 0 0 12 0M12 17v4"/></svg>
              Grabar
            </button>
          </div>
          @if (uploadingTrack() === track) {
            <small class="track-state" data-s="PROCESSING">Subiendo…</small>
          } @else if (trackStates()[track]; as info) {
            <small class="track-state" [attr.data-s]="info.status">
              {{ info.filename }} · {{ statusLabel(info.status) }}@if (info.status === 'PROCESSING') { (se actualiza solo) }
            </small>
          } @else {
            <small class="track-state" data-s="EMPTY">Sin fichero</small>
          }
        </div>
        }
      </div>
    </section>

    <section class="card section">
      <div class="section-title">
        <div><h2>Partes</h2><p class="section-help">Define los fragmentos y qué instrumentos intervienen.</p></div>
        <button class="outline" (click)="openPart()">+ Añadir parte</button>
      </div>
      @if (!song.partes.length) { <div class="no-parts">Aún no has añadido partes.</div> }
      @else {
      <div class="parts-list">
        @for (part of song.partes; track $index; let index = $index) {
        <button (click)="openPart(index)">
          <i [style.background]="part.color"></i>
          <span><b>{{ part.name }}</b><small>{{ fmt(part.start) }} — {{ fmt(part.end) }} · {{ part.note || 'Sin nota' }}</small></span>
          <em>{{ part.tracks.length }} pistas</em>
          <strong>Editar ›</strong>
        </button>
        }
      </div>
      }
    </section>

    <section class="card section">
      <h2>Distribución por pistas</h2>

      <div class="clone-row">
        <span>Clonar los intervalos de</span>
        <select [ngModel]="cloneFrom()" (ngModelChange)="cloneFrom.set($event)">
          @for (t of tracks; track t) { <option [ngValue]="t">{{ shortLabel(t) }}</option> }
        </select>
        <span>a</span>
        <select [ngModel]="cloneTo()" (ngModelChange)="cloneTo.set($event)">
          @for (t of tracks; track t) { <option [ngValue]="t">{{ shortLabel(t) }}</option> }
        </select>
        <button type="button" class="outline" (click)="cloneIntervals()" [disabled]="cloneFrom() === cloneTo()">Clonar en todas las partes</button>
        @if (cloneMsg()) { <small>{{ cloneMsg() }}</small> }
      </div>

      <div class="track-tabs">
        @for (track of tracks; track track) {
        <button [class.active]="selectedTrack() === track" (click)="selectedTrack.set(track)">{{ shortLabel(track) }}</button>
        }
      </div>
      <div class="track-map">
        <div class="map-label">{{ labels[selectedTrack()] }}</div>
        <div class="map-bar">
          @for (part of song.partes; track $index) {
          @let r = partTrackRange(part, selectedTrack());
          <button
            [class.available]="!!r"
            [style.left.%]="(r ? r.start : part.start) / song.duration * 100"
            [style.width.%]="((r ? r.end : part.end) - (r ? r.start : part.start)) / song.duration * 100"
            [style.--part-color]="part.color" (click)="openPart($index)">
            <span>{{ part.name }}</span>
          </button>
          }
        </div>
        <div class="map-bounds"><span>00:00</span><span>{{ fmt(song.duration) }}</span></div>
      </div>
    </section>
  </div>

  <aside class="card notes-side">
    <h2>Resumen</h2>
    <p><b>{{ song.partes.length }}</b> partes definidas</p>
    <p><b>{{ trackCount() }}</b> pistas subidas</p>
    <p>Se guarda en MySQL mediante la API.</p>
  </aside>
</section>

<div class="form-actions">
  @if (saveError()) { <small class="save-error">{{ saveError() }}</small> }
  <button type="button" class="primary-btn" (click)="save()" [disabled]="saving()">
    {{ saving() ? 'Guardando…' : 'Guardar canción' }}
  </button>
</div>

@if (showPopup()) {
<div class="modal-backdrop" (click)="closePart()">
  <form class="part-modal" (click)="$event.stopPropagation()" (ngSubmit)="savePart()">
    <header>
      <div><p>PARTE</p><h2>{{ editingPartIndex() === null ? 'Añadir parte' : 'Editar parte' }}</h2></div>
      <button type="button" (click)="closePart()">×</button>
    </header>
    <label>Título<input [(ngModel)]="partDraft.name" name="title" required></label>
    <label>Descripción / nota<textarea [(ngModel)]="partDraft.note" name="note"></textarea></label>

    <div class="part-tracks">
      <div class="part-tracks-head">
        <span class="range-label">Fragmentos de la parte</span>
        @if (partDraft.tracks.length) {
          <small>Parte: {{ fmt(spanStart()) }} — {{ fmt(spanEnd()) }}</small>
        }
      </div>
      <p class="section-help">Una pestaña por pista. Define en cada una el intervalo en el que esa pista toca durante la parte.</p>

      <div class="track-tabs part-track-tabs">
        @for (track of tracks; track track) {
        <button type="button" [class.active]="activeTab() === track" [class.assigned]="isAssigned(track)" (click)="activeTab.set(track)">
          <span>{{ shortLabel(track) }}</span>
          @if (isAssigned(track)) { <span class="tab-dot" title="Con intervalo definido"></span> }
        </button>
        }
      </div>

      <div class="track-tab-body">
        <label class="assign-toggle">
          <input type="checkbox" [checked]="isAssigned(activeTab())" (change)="toggleTrack(activeTab())">
          {{ labels[activeTab()] }} — toca en esta parte
        </label>
        @if (rangeOf(activeTab()); as r) {
          <div class="copy-from">
            Copiar intervalo de:
            @for (t of tracks; track t) {
              @if (t !== activeTab() && isAssigned(t)) {
                <button type="button" (click)="copyIntervalFrom(t)">{{ shortLabel(t) }}</button>
              }
            }
          </div>
          <app-part-range-bar
            [duration]="song.duration"
            [start]="r.start" [end]="r.end"
            [occupied]="trackOccupied(activeTab())"
            [position]="engine.position()"
            (startChange)="setTrackRange(activeTab(), $event, r.end)"
            (endChange)="setTrackRange(activeTab(), r.start, $event)"></app-part-range-bar>
          <div class="range-transport">
            <button type="button" class="play" (click)="previewTrack(activeTab())" [disabled]="!trackHasAudio(activeTab())" title="Reproducir solo esta pista"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></button>
            <button type="button" (click)="engine.pause()" [disabled]="!trackHasAudio(activeTab())" title="Pausar"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg></button>
            <button type="button" (click)="engine.stop()" [disabled]="!trackHasAudio(activeTab())" title="Parar"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M6 6h12v12H6z"/></svg></button>
            <label class="range-num">Inicio <input [ngModel]="r.start" (ngModelChange)="setTrackRange(activeTab(), $event, r.end)" name="tstart" type="number" min="0" [max]="song.duration"></label>
            <label class="range-num">Final <input [ngModel]="r.end" (ngModelChange)="setTrackRange(activeTab(), r.start, $event)" name="tend" type="number" min="0" [max]="song.duration"></label>
          </div>
          @if (!trackHasAudio(activeTab())) { <small class="range-hint">Sin audio para {{ labels[activeTab()] | lowercase }}.</small> }
        } @else {
          <p class="range-hint">Activa esta pista para definir su intervalo.</p>
        }
      </div>

      <div class="part-preview">
        <button type="button" class="play" (click)="previewPart()" [disabled]="!hasAudio() || !partDraft.tracks.length" title="Reproducir la parte completa">
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg> Escuchar la parte completa
        </button>
        <button type="button" (click)="engine.pause()" [disabled]="!hasAudio()" title="Pausar"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg></button>
        <button type="button" (click)="engine.stop()" [disabled]="!hasAudio()" title="Parar"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M6 6h12v12H6z"/></svg></button>
        @if (!hasAudio()) { <small class="range-hint">Sube audio de la canción para escuchar.</small> }
      </div>
    </div>
    <fieldset>
      <legend>Indicativos</legend>
      <label><input [(ngModel)]="partDraft.question" name="question" type="checkbox"> Pregunta</label>
      <label><input [(ngModel)]="partDraft.answer" name="answer" type="checkbox"> Respuesta</label>
      <label><input [(ngModel)]="partDraft.desfase" name="desfase" type="checkbox"> Desfase de bombos</label>
    </fieldset>
    @if (overlapError()) { <div class="range-error">{{ overlapError() }}</div> }
    <footer>
      <button type="button" class="outline" (click)="closePart()">Cancelar</button>
      <button>Guardar parte</button>
    </footer>
  </form>
</div>
}

@if (recordingFor(); as track) {
<app-recorder-dialog
  (accepted)="onRecorded(track, $event)"
  (dismissed)="recordingFor.set(null)"></app-recorder-dialog>
}
}
  `,
  styleUrl: './pages.scss',
})
export class CancionForm implements OnInit, OnDestroy {
  data = inject(DataService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  readonly engine = inject(AudioEngine);

  tracks = TRACKS;
  labels = LABEL;
  editing = false;
  song!: Song;

  trackStates = signal<Partial<Record<Track, TrackInfo>>>({});
  uploadingTrack = signal<Track | null>(null);
  selectedTrack = signal<Track>('tambor');
  showPopup = signal(false);
  editingPartIndex = signal<number | null>(null);
  partDraft!: Parte;
  recordingFor = signal<Track | null>(null);
  overlapError = signal<string | null>(null);
  saving = signal(false);
  saveError = signal<string | null>(null);
  activeTab = signal<Track>('tambor');
  ready = signal(false);
  cloneFrom = signal<Track>('tambor');
  cloneTo = signal<Track>('bombo');
  cloneMsg = signal<string | null>(null);

  private poll?: number;

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const existing = id ? this.data.find(id) : undefined;
    this.editing = !!id;
    this.song = existing
      ? structuredClone(existing)
      : { id: 0, title: '', description: '', procesion: false, exhibicion: false, qa: false, bpm: 90, duration: 180, draft: false, info: '', tracks: {}, partes: [], ramas: [] };
    if (existing) this.trackStates.set(structuredClone(existing).tracks);
    if (id && !existing) {
      this.data.refresh(id).subscribe(song => {
        this.song = structuredClone(song);
        this.trackStates.set(song.tracks);
        this.ready.set(true);
        this.loadAudio();
      });
    } else {
      this.ready.set(true);
    }
  }

  ngOnInit() {
    this.loadAudio();
    this.poll = window.setInterval(() => this.refreshStatesIfNeeded(), 3000);
  }

  ngOnDestroy() {
    clearInterval(this.poll);
    this.engine.release();
  }

  private loadAudio() {
    this.engine.release();
    if (this.song.id) {
      const snapshot = { ...this.song, tracks: this.trackStates() };
      this.engine.loadSong(snapshot, t => this.data.audioUrl(this.song.id, t));
    }
  }

  private refreshStatesIfNeeded() {
    if (!this.song.id) return;
    const processing = Object.values(this.trackStates()).some(t => t?.status === 'PROCESSING');
    if (!processing) return;
    this.data.refresh(this.song.id).subscribe(fresh => {
      this.trackStates.set(fresh.tracks);
      if (!Object.values(fresh.tracks).some(t => t?.status === 'PROCESSING')) this.loadAudio();
    });
  }

  shortLabel(t: Track) { return TRACK_SHORT[t]; }
  statusLabel(s: string) { return STATUS_LABEL[s] ?? s; }
  hasAudio() { return this.engine.loadedTracks().length > 0; }
  trackCount() { return Object.keys(this.trackStates()).length; }

  // --- Subida inmediata ---

  setTrack(track: Track, e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.upload(track, file, file.name);
  }

  onRecorded(track: Track, payload: { blob: Blob; ext: string }) {
    this.recordingFor.set(null);
    this.upload(track, payload.blob, `grabacion-${track}.${payload.ext}`);
  }

  /** Id de la canción; si es nueva la crea antes (para poder subir archivos incrustados a la información). */
  ensureSaved = (): Observable<number> => {
    if (this.song.id) return of(this.song.id);
    if (!this.song.title.trim()) return throwError(() => new Error('Ponle un título a la canción antes de subir archivos.'));
    return this.data.create(this.song).pipe(map(saved => {
      this.song.id = saved.id;
      this.editing = true;
      return saved.id;
    }));
  };

  private upload(track: Track, blob: Blob, filename: string) {
    this.saveError.set(null);
    const doUpload = () => {
      this.uploadingTrack.set(track);
      this.engine.addLocalTrack(track, blob);
      this.data.uploadTrack(this.song.id, track, blob, filename).subscribe({
        next: t => {
          this.uploadingTrack.set(null);
          this.trackStates.update(s => ({ ...s, [track]: { type: track, filename: t.originalFilename, status: t.status, duration: t.durationSeconds, version: t.version } }));
        },
        error: err => {
          this.uploadingTrack.set(null);
          this.saveError.set(`No se pudo subir ${LABEL[track].toLowerCase()}: ` + this.msg(err));
        },
      });
    };

    if (this.song.id) {
      doUpload();
      return;
    }
    // Canción nueva: hay que crearla antes de poder subir audio.
    if (!this.song.title.trim()) {
      this.saveError.set('Ponle un título a la canción antes de subir audio.');
      return;
    }
    this.uploadingTrack.set(track);
    this.data.create(this.song).subscribe({
      next: saved => {
        this.song.id = saved.id;
        this.editing = true;
        doUpload();
      },
      error: err => {
        this.uploadingTrack.set(null);
        this.saveError.set('No se pudo crear la canción: ' + this.msg(err));
      },
    });
  }

  fmt(n: number) {
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  }

  // --- Clonar intervalos entre pistas (todas las partes) ---

  cloneIntervals() {
    const from = this.cloneFrom();
    const to = this.cloneTo();
    if (from === to) return;
    let n = 0;
    for (const part of this.song.partes) {
      const src = part.tracks.find(t => t.track === from);
      if (!src) continue;
      const dst = part.tracks.find(t => t.track === to);
      if (dst) { dst.start = src.start; dst.end = src.end; }
      else part.tracks.push({ track: to, start: src.start, end: src.end });
      n++;
    }
    this.recomputeSpans();
    this.cloneMsg.set(n
      ? `Copiado a ${n} parte(s). Ajusta los segundos y guarda.`
      : `Ninguna parte tiene "${TRACK_SHORT[from]}" para copiar.`);
  }

  copyIntervalFrom(source: Track) {
    const src = this.rangeOf(source);
    const dst = this.rangeOf(this.activeTab());
    if (!src || !dst) return;
    dst.start = src.start;
    dst.end = src.end;
  }

  private recomputeSpans() {
    for (const part of this.song.partes) {
      if (part.tracks.length) {
        part.start = Math.min(...part.tracks.map(t => t.start));
        part.end = Math.max(...part.tracks.map(t => t.end));
      }
    }
  }

  // --- Editor de partes ---

  spanStart() {
    return this.partDraft.tracks.length ? Math.min(...this.partDraft.tracks.map(t => t.start)) : 0;
  }
  spanEnd() {
    return this.partDraft.tracks.length ? Math.max(...this.partDraft.tracks.map(t => t.end)) : 0;
  }

  openPart(index: number | null = null) {
    this.engine.stop();
    this.editingPartIndex.set(index);
    this.overlapError.set(null);
    this.activeTab.set('tambor');
    if (index === null) {
      this.partDraft = {
        name: '', note: '', start: 0, end: 0,
        color: COLORS[this.song.partes.length % COLORS.length], tracks: [],
      };
    } else {
      this.partDraft = structuredClone(this.song.partes[index]);
    }
    this.showPopup.set(true);
  }

  closePart() {
    this.engine.stop();
    this.showPopup.set(false);
  }

  isAssigned(track: Track) {
    return this.partDraft.tracks.some(t => t.track === track);
  }

  rangeOf(track: Track): ParteTrack | undefined {
    return this.partDraft.tracks.find(t => t.track === track);
  }

  trackHasAudio(track: Track) {
    return this.engine.loadedTracks().includes(track);
  }

  partTrackRange(part: Parte, track: Track): ParteTrack | null {
    return part.tracks.find(t => t.track === track) ?? null;
  }

  /** Intervalos de las demás partes para esta misma pista (grises, no se pueden pisar). */
  trackOccupied(track: Track): TimeRange[] {
    const editing = this.editingPartIndex();
    return this.song.partes
      .filter((_, i) => i !== editing)
      .flatMap(p => p.tracks.filter(t => t.track === track).map(t => ({ start: t.start, end: t.end })));
  }

  toggleTrack(track: Track) {
    if (this.isAssigned(track)) {
      this.partDraft.tracks = this.partDraft.tracks.filter(t => t.track !== track);
    } else {
      const slot = this.freeSlotForTrack(track);
      const w = Math.max(5, Math.min(30, Math.round((slot.end - slot.start) * 0.5)));
      this.partDraft.tracks = [...this.partDraft.tracks,
        { track, start: slot.start, end: Math.min(slot.start + w, slot.end) }];
    }
  }

  setTrackRange(track: Track, start: number, end: number) {
    const t = this.rangeOf(track);
    if (!t) return;
    t.start = Math.max(0, Math.round(start));
    t.end = Math.min(this.song.duration, Math.round(end));
  }

  /** El hueco libre MÁS GRANDE para esta pista (así una parte nueva no queda encajonada). */
  private freeSlotForTrack(track: Track): TimeRange {
    const occ = this.trackOccupied(track).slice().sort((a, b) => a.start - b.start);
    const gaps: TimeRange[] = [];
    let cursor = 0;
    for (const r of occ) {
      if (r.start - cursor >= 1) gaps.push({ start: cursor, end: r.start });
      cursor = Math.max(cursor, r.end);
    }
    if (this.song.duration - cursor >= 1) gaps.push({ start: cursor, end: this.song.duration });
    gaps.sort((a, b) => (b.end - b.start) - (a.end - a.start));
    return gaps[0] ?? { start: 0, end: this.song.duration };
  }

  previewPart() {
    const windows: TrackWindow[] = this.partDraft.tracks
      .filter(t => this.engine.loadedTracks().includes(t.track))
      .map(t => ({ track: t.track, start: t.start, end: t.end }));
    if (!this.hasAudio() || !windows.length) return;
    this.engine.play(this.spanStart(), this.spanEnd(), windows);
  }

  previewTrack(track: Track) {
    const r = this.rangeOf(track);
    if (!r || !this.trackHasAudio(track)) return;
    this.engine.play(r.start, r.end, [{ track, start: r.start, end: r.end }]);
  }

  savePart() {
    const d = this.partDraft;
    if (!d.tracks.length) {
      this.overlapError.set('Añade al menos una pista a la parte.');
      return;
    }
    for (const t of d.tracks) {
      t.start = Math.max(0, Math.round(t.start));
      t.end = Math.min(this.song.duration, Math.round(t.end));
      if (t.end <= t.start) {
        this.overlapError.set(`El intervalo de ${LABEL[t.track].toLowerCase()} no es válido.`);
        return;
      }
      if (this.trackOccupied(t.track).some(r => t.start < r.end && t.end > r.start)) {
        this.overlapError.set(`${LABEL[t.track]} se solapa con otra parte.`);
        return;
      }
    }
    d.start = this.spanStart();
    d.end = this.spanEnd();
    this.overlapError.set(null);
    const i = this.editingPartIndex();
    if (i === null) this.song.partes.push(d);
    else this.song.partes[i] = d;
    this.song.partes.sort((a, b) => a.start - b.start);
    this.closePart();
  }

  save() {
    this.saveError.set(null);
    if (!this.song.title.trim()) {
      this.saveError.set('Ponle un título a la canción.');
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    const request = this.song.id ? this.data.update(this.song) : this.data.create(this.song);
    request.subscribe({
      next: () => this.router.navigate(['/administracion/canciones']),
      error: err => {
        this.saving.set(false);
        this.saveError.set('No se pudo guardar: ' + this.msg(err));
      },
    });
  }

  private msg(err: unknown) {
    const e = err as { error?: { detail?: string; message?: string }; message?: string; status?: number };
    return e?.error?.detail || e?.error?.message || e?.message || (e?.status ? `HTTP ${e.status}` : 'error desconocido');
  }
}
