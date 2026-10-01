import { Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService, Parte, Rama, Song, TrackInfo, TRACKS, Track, TRACK_LABEL } from '../data.service';
import { SongGraph } from './song-graph';
import { AudioEngine } from '../audio-engine';

const COLORS = ['#910000', '#6d28d9', '#0e7490', '#c2410c', '#15803d', '#a16207'];

@Component({
  imports: [CommonModule, FormsModule, RouterLink, SongGraph],
  template: `
@if (!ready()) {
  <a class="back" routerLink="/administracion/estudio">← Estudio</a>
  <div class="no-parts">Cargando canción…</div>
} @else {
<a class="back" (click)="backToEstudio()" style="cursor:pointer">← Estudio</a>
<header class="head">
  <div>
    <p>ESTUDIO · {{ editing ? 'EDICIÓN' : 'ALTA' }}</p>
    <h1>{{ editing ? 'Editar canción' : 'Crear canción' }}</h1>
    <span>Se guarda solo mientras editas. El audio se graba dentro de cada parte.</span>
  </div>
  <small class="autosave-state">
    @if (autosaveError()) { <span class="err">⚠ {{ autosaveError() }}</span> }
    @else if (dirty()) { Guardando cambios… }
    @else if (lastSaved()) { ✓ Guardado {{ lastSaved()! | date:'HH:mm:ss' }} }
  </small>
</header>

<section class="form-page" (input)="markDirty()" (change)="markDirty()">
  <div class="form-main">
    <section class="card section">
      <h2>Información general</h2>
      @if (needsInfo()) {
        <p class="form-warn">Antes de crear partes, completa: {{ needsInfo() }}.</p>
      }
      <div class="fields two">
        <label [class.field-error]="missTitle()">Título
          <input [(ngModel)]="song.title" (ngModelChange)="missTitle.set(false)" required #titleInput>
        </label>
        <label>Tempo (BPM)
          <div class="bpm-field">
            <input [(ngModel)]="song.bpm" type="number">
            <button type="button" class="bpm-btn" [class.on]="engine.metronomeOn()" (click)="engine.toggleMetronome(song.bpm)"
              [title]="engine.metronomeOn() ? 'Parar metrónomo' : 'Metrónomo a ' + song.bpm + ' BPM'">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="m12 3 6 17H6L12 3Zm0 3-3 9m3-9 1.5 4.5"/></svg>
            </button>
          </div>
        </label>
      </div>
      <label>Descripción<textarea [(ngModel)]="song.description"></textarea></label>
      <label [class.field-error]="missDuration()">Duración <small>segundos</small>
        <input [(ngModel)]="song.duration" (ngModelChange)="missDuration.set(false)" type="number" min="1">
      </label>
      <div class="checks">
        <label><input [(ngModel)]="song.procesion" type="checkbox"> Procesión</label>
        <label><input [(ngModel)]="song.exhibicion" type="checkbox"> Exhibición</label>
      </div>
    </section>

    <section class="card section">
      <div class="section-title">
        <div><h2>Cronograma</h2><p class="section-help">Grafo de partes y ramas. El audio de cada pista se graba al abrir una parte.</p></div>
        <button type="button" class="outline" (click)="openPart()" [disabled]="navigatingToPart()">
          {{ navigatingToPart() ? 'Guardando…' : '＋ Añadir parte' }}
        </button>
      </div>
      @if (!song.partes.length) { <div class="no-parts">Aún no has añadido partes.</div> }
      @else {
        <div class="player mini">
          <div>
            <button type="button" class="play" (click)="togglePlay()" [disabled]="!availableTracks().length" [title]="engine.playing() ? 'Pausar' : 'Reproducir'">
              <svg viewBox="0 0 24 24" width="14" height="14">@if (engine.playing()) { <path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/> } @else { <path fill="currentColor" d="M8 5v14l11-7z"/> }</svg>
            </button>
            <button type="button" (click)="engine.stop()" [disabled]="!availableTracks().length" title="Parar"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 6h12v12H6z"/></svg></button>
            <strong>{{ fmt(engine.position()) }} / {{ fmt(engine.duration()) }}</strong>
          </div>
          <label>Pista
            <select [ngModel]="selectedTrack()" (ngModelChange)="selectedTrack.set($event)" [disabled]="!availableTracks().length">
              @for (t of availableTracks(); track t) { <option [ngValue]="t">{{ labels[t] }}</option> }
              @if (!availableTracks().length) { <option [ngValue]="null">Sin audio</option> }
            </select>
          </label>
          <label>Velocidad
            <select [ngModel]="engine.rate()" (ngModelChange)="engine.setRate($event)">
              <option [ngValue]="0.75">0,75×</option><option [ngValue]="1">1×</option>
              <option [ngValue]="1.25">1,25×</option><option [ngValue]="1.5">1,5×</option>
            </select>
          </label>
          <div class="progress" (click)="scrub($event)"><span [style.width.%]="pct()"></span></div>
          @if (playHint()) { <small class="err">{{ playHint() }}</small> }
          @else if (engine.loading()) { <small>Cargando audio…</small> }
          @else if (audioBusy()) { <small>Preparando audio subido…</small> }
          @else if (!availableTracks().length) { <small class="ok">Sin audio. Graba pistas dentro de las partes.</small> }
          @else { <small class="ok">Toca una parte del grafo para escucharla.</small> }
        </div>

        <app-song-graph [song]="song"
          (editPart)="onGraphEdit($event)"
          (menu)="onGraphMenu($event)"
          (playPart)="onGraphPlay($event)"
          (addPart)="openPart()"
          (insertPart)="onGraphInsert($event)"
          (changed)="markDirty()"></app-song-graph>
      }
    </section>
  </div>

  <aside class="card notes-side">
    <h2>Resumen</h2>
    <p><b>{{ song.partes.length }}</b> partes definidas</p>
    @if (song.ramas.length) { <p><b>{{ song.ramas.length }}</b> ramas alternativas</p> }
    <p>Se guarda en MySQL mediante la API.</p>
  </aside>
</section>

<div class="form-actions">
  @if (saveError()) { <small class="save-error">{{ saveError() }}</small> }
  <label class="draft-toggle"><input type="checkbox" [ngModel]="keepDraft()" (ngModelChange)="keepDraft.set($event)"> Mantener como borrador</label>
  <button type="button" class="primary-btn" (click)="save()" [disabled]="saving()">
    {{ saving() ? 'Guardando…' : (keepDraft() ? 'Guardar borrador' : 'Guardar y publicar') }}
  </button>
</div>

@if (ctxMenu(); as m) {
<div class="ctx-backdrop" (pointerdown)="ctxMenu.set(null)"></div>
<div class="ctx-menu" [style.left.px]="m.x" [style.top.px]="m.y">
  <button type="button" (click)="onGraphEdit(m); ctxMenu.set(null)">Editar parte</button>
  @if (!m.ramaId) {
    <button type="button" (click)="moveMain(m.index, -1)" [disabled]="m.index === 0">▲ Subir</button>
    <button type="button" (click)="moveMain(m.index, 1)" [disabled]="m.index === song.partes.length - 1">▼ Bajar</button>
    <button type="button" (click)="onGraphInsert({ index: m.index }); ctxMenu.set(null)">Insertar parte antes</button>
    <button type="button" (click)="onGraphInsert({ index: m.index + 1 }); ctxMenu.set(null)">Insertar parte después</button>
    <button type="button" (click)="addAlternative(m.index)">Crear parte alternativa</button>
  }
  @if (ramaOf(m.ramaId); as rama) {
    <button type="button" (click)="editRamaPart(m.ramaId!, 'nueva'); ctxMenu.set(null)">Añadir parte a la rama</button>
    <button type="button" (click)="toggleRamaActiva(m.ramaId!)">
      {{ rama.activa ? 'Volver a la versión original' : 'Usar esta versión alternativa' }}
    </button>
  }
  <button type="button" class="danger" (click)="deleteFromMenu(m)">Eliminar {{ m.ramaId ? 'parte de la rama' : 'parte' }}</button>
  @if (m.ramaId) {
    <button type="button" class="danger" (click)="removeRama(m.ramaId); ctxMenu.set(null)">Eliminar rama entera</button>
  }
</div>
}
}
  `,
  styleUrl: './pages.scss',
})
export class EstudioForm implements OnInit, OnDestroy {
  data = inject(DataService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  readonly engine = inject(AudioEngine);

  labels = TRACK_LABEL;
  editing = false;
  song!: Song;

  saving = signal(false);
  saveError = signal<string | null>(null);
  ready = signal(false);
  keepDraft = signal(true);

  // Reproductor
  trackStates = signal<Partial<Record<Track, TrackInfo>>>({});
  selectedTrack = signal<Track | null>(null);
  availableTracks = computed(() => {
    const loaded = this.engine.loadedTracks();
    return TRACKS.filter(t => loaded.includes(t));
  });
  audioBusy = computed(() => Object.values(this.trackStates()).some(t => t?.status === 'PROCESSING' || t?.status === 'PENDING'));

  // Autoguardado
  dirty = signal(false);
  lastSaved = signal<Date | null>(null);
  autosaveError = signal<string | null>(null);
  navigatingToPart = signal(false);

  // Campos que faltan para poder crear partes
  missTitle = signal(false);
  missDuration = signal(false);
  needsInfo = computed(() => {
    const f: string[] = [];
    if (this.missTitle()) f.push('el título');
    if (this.missDuration()) f.push('la duración en segundos');
    return f.join(' y ');
  });
  private titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  // Menú contextual del grafo
  ctxMenu = signal<{ ramaId: string | null; index: number; x: number; y: number } | null>(null);

  private autosaveTimer?: number;
  private createPromise?: Promise<number>;
  private poll?: number;

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const existing = id ? this.data.find(id) : undefined;
    this.editing = !!id;
    this.song = existing
      ? structuredClone(existing)
      : { id: 0, title: '', description: '', procesion: false, exhibicion: false, qa: false, bpm: 90, duration: 180, draft: true, info: '', tracks: {}, partes: [], ramas: [] };
    this.keepDraft.set(this.song.draft);
    if (existing) { this.trackStates.set(structuredClone(existing).tracks); }
    if (id && !existing) {
      this.data.refresh(id).subscribe(song => {
        this.song = structuredClone(song);
        this.keepDraft.set(song.draft);
        this.trackStates.set(song.tracks);
        this.ready.set(true);
        this.loadAudio();
      });
    } else {
      this.ready.set(true);
    }
    // mantén una pista válida seleccionada y solo esa suena
    effect(() => {
      const avail = this.availableTracks();
      if (avail.length && !avail.includes(this.selectedTrack() as Track)) this.selectedTrack.set(avail[0]);
      else if (!avail.length && this.selectedTrack() !== null) this.selectedTrack.set(null);
    });
    effect(() => {
      const t = this.selectedTrack();
      this.engine.setActiveTracks(t ? [t] : []);
    });
  }

  ngOnInit() {
    this.loadAudio();
    this.poll = window.setInterval(() => {
      if (!this.audioBusy() || !this.song.id) return;
      this.data.refresh(this.song.id).subscribe(fresh => {
        this.trackStates.set(fresh.tracks);
        if (!this.audioBusy()) this.loadAudio();
      });
    }, 3000);
  }

  private loadAudio() {
    if (!this.song.id) return;
    this.engine.release();
    this.engine.loadSong({ ...this.song, tracks: this.trackStates() }, t => this.data.audioUrl(this.song.id, t));
  }

  // --- Reproductor ---

  togglePlay() { this.engine.playing() ? this.engine.pause() : this.engine.play(); }

  scrub(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const r = (e.clientX - el.getBoundingClientRect().left) / el.clientWidth;
    this.engine.seek(r * this.engine.duration());
  }

  pct() {
    const d = this.engine.duration();
    return d ? (this.engine.position() / d) * 100 : 0;
  }

  fmt(n: number) {
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  }

  playHint = signal<string | null>(null);

  onGraphPlay(e: { ramaId: string | null; index: number }) {
    const list = e.ramaId ? (this.song.ramas.find(r => r.id === e.ramaId)?.partes ?? []) : this.song.partes;
    const part: Parte | undefined = list[e.index];
    if (!part) return;
    const track = this.selectedTrack();
    if (!track || !this.engine.loadedTracks().includes(track)) {
      this.playHint.set('Esta parte aún no tiene audio. Graba una pista al editarla.');
      setTimeout(() => this.playHint.set(null), 3500);
      return;
    }
    this.playHint.set(null);
    const own = part.tracks.find(t => t.track === track);
    const from = own ? own.start : part.start;
    const to = own ? own.end : part.end;
    this.engine.play(from, to, [{ track, start: from, end: to }]);
  }

  ngOnDestroy() {
    clearTimeout(this.autosaveTimer);
    clearInterval(this.poll);
    this.flushAutosave();
    this.engine.release();
  }

  // --- Autoguardado ---

  markDirty() {
    if (!this.song.title.trim()) return;
    this.dirty.set(true);
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => this.autosave(), 1000);
  }

  private autosave() {
    if (!this.dirty() || this.saving() || !this.song.title.trim()) return;
    this.dirty.set(false);
    this.autosaveError.set(null);
    if (!this.song.id) {
      this.ensureSongId().catch(err => { this.dirty.set(true); this.autosaveError.set(this.msg(err)); });
      return;
    }
    this.data.update(this.song).subscribe({
      next: () => this.lastSaved.set(new Date()),
      error: err => { this.dirty.set(true); this.autosaveError.set(this.msg(err)); },
    });
  }

  /** Garantiza que la canción existe en el backend; la crea si aún no tiene id. Deduplica llamadas simultáneas. */
  private ensureSongId(): Promise<number> {
    if (this.song.id) return Promise.resolve(this.song.id);
    if (this.createPromise) return this.createPromise;
    if (!this.song.title.trim()) return Promise.reject('Ponle un título a la canción para empezar.');
    clearTimeout(this.autosaveTimer);
    this.dirty.set(false);
    this.autosaveError.set(null);
    this.createPromise = new Promise<number>((resolve, reject) => {
      this.data.create(this.song).subscribe({
        next: saved => {
          this.song.id = saved.id;
          this.editing = true;
          this.lastSaved.set(new Date());
          resolve(saved.id);
        },
        error: err => { this.createPromise = undefined; reject(err); },
      });
    });
    return this.createPromise;
  }

  /** Persiste la canción (creándola si hace falta) y espera a que termine. Para antes de navegar a una parte. */
  private async saveNow(): Promise<number> {
    const id = await this.ensureSongId();
    if (this.dirty()) {
      clearTimeout(this.autosaveTimer);
      this.dirty.set(false);
      await new Promise<void>((resolve, reject) => this.data.update(this.song).subscribe({
        next: () => { this.lastSaved.set(new Date()); resolve(); },
        error: reject,
      }));
    }
    return id;
  }

  /** Guarda lo que haya pendiente al salir (aunque la canción aún no exista). Fire-and-forget. */
  private flushAutosave() {
    if (!this.dirty() || !this.song.title.trim()) return;
    if (this.song.id) {
      this.data.update(this.song).subscribe({ next: () => {}, error: () => {} });
    } else if (!this.createPromise) {
      this.data.create(this.song).subscribe({ next: () => {}, error: () => {} });
    }
  }

  /** Volver al listado del Estudio persistiendo antes el borrador (para que aparezca ya en la lista). */
  backToEstudio() {
    const go = () => this.router.navigate(['/administracion/estudio']);
    if (this.dirty() && this.song.title.trim()) {
      this.saveNow().then(go).catch(go);
    } else {
      go();
    }
  }

  openPart(index: number | null = null) {
    this.goToPart(index === null ? 'nueva' : index);
  }

  /** Arrastraste el nodo «＋» del grafo hasta un hueco: crear parte insertada en ese índice. */
  onGraphInsert(e: { index: number }) {
    this.goToPart('nueva', e.index);
  }

  /** Guarda la canción (autoguardado, creándola si aún no existe) y navega al editor de la parte. */
  private goToPart(pos: number | 'nueva', at?: number) {
    const noTitle = !this.song.title.trim();
    const noDuration = !(this.song.duration >= 1);
    this.missTitle.set(noTitle);
    this.missDuration.set(noDuration);
    if (noTitle || noDuration) {
      this.autosaveError.set('Faltan campos de la canción para poder crear partes.');
      const el = this.titleInput()?.nativeElement;
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (noTitle) el.focus(); }
      return;
    }
    this.navigatingToPart.set(true);
    this.saveNow().then(id => {
      this.engine.stop();
      const extras = at === undefined ? {} : { queryParams: { at } };
      this.router.navigate(['/administracion/estudio', id, 'parte', pos], extras);
    }).catch(err => {
      this.navigatingToPart.set(false);
      if (this.song.title.trim()) this.dirty.set(true);
      this.autosaveError.set(typeof err === 'string' ? err : this.msg(err));
    });
  }

  // --- Grafo del cronograma ---

  onGraphEdit(e: { ramaId: string | null; index: number | null }) {
    if (e.ramaId) this.editRamaPart(e.ramaId, e.index === null ? 'nueva' : e.index);
    else this.openPart(e.index);
  }

  onGraphMenu(m: { ramaId: string | null; index: number; x: number; y: number }) {
    this.ctxMenu.set(m);
  }

  /** Reordena una parte de la línea principal (menú, para móvil donde el arrastre no funciona). */
  moveMain(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= this.song.partes.length) return;
    const arr = [...this.song.partes];
    const [m] = arr.splice(index, 1);
    arr.splice(to, 0, m);
    this.song.partes = arr;
    for (const r of this.song.ramas) {
      r.desde = this.remapIdx(r.desde, index, to);
      r.hasta = this.remapIdx(r.hasta, index, to);
    }
    this.ctxMenu.set(null);
    this.markDirty();
  }

  private remapIdx(v: number, from: number, to: number) {
    if (v === from) return to;
    if (from < to && v > from && v <= to) return v - 1;
    if (from > to && v >= to && v < from) return v + 1;
    return v;
  }

  deleteFromMenu(m: { ramaId: string | null; index: number }) {
    if (m.ramaId) {
      const rama = this.song.ramas.find(r => r.id === m.ramaId);
      if (rama) {
        rama.partes = rama.partes.filter((_, i) => i !== m.index);
        if (!rama.partes.length) this.song.ramas = this.song.ramas.filter(r => r.id !== m.ramaId);
      }
    } else {
      this.song.partes = this.song.partes.filter((_, i) => i !== m.index);
      for (const r of this.song.ramas) {
        if (r.desde > m.index) r.desde--;
        if (r.hasta > m.index) r.hasta--;
      }
    }
    this.ctxMenu.set(null);
    this.markDirty();
  }

  /** Crea una rama alternativa a la parte `index`: bifurca TRAS la parte anterior y sustituye a la parte `index`. */
  addAlternative(index: number) {
    const replaced = this.song.partes[index];
    if (!replaced) return;
    const copy = structuredClone(replaced);
    copy.name = (replaced.name || 'Parte') + ' (alt)';
    copy.color = COLORS[(this.song.partes.length + this.song.ramas.length + 1) % COLORS.length];
    const rama: Rama = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nombre: `Rama ${this.song.ramas.length + 1}`,
      desde: Math.max(0, index - 1),          // nace de la parte anterior
      hasta: Math.min(index + 1, this.song.partes.length), // reconcilia en la siguiente (sustituye solo a `index`)
      activa: true,                           // al crearla, la canción pasa a seguir la alternativa
      partes: [copy],
    };
    // solo una alternativa activa por tramo solapado
    for (const other of this.song.ramas) {
      if (other.desde < rama.hasta && other.hasta > rama.desde) other.activa = false;
    }
    this.song.ramas = [...this.song.ramas, rama];
    this.ctxMenu.set(null);
    this.markDirty();
  }

  ramaOf(id: string | null): Rama | undefined {
    return id ? this.song.ramas.find(r => r.id === id) : undefined;
  }

  /** Alterna entre seguir la rama alternativa o la parte original, sin borrar ninguna de las dos. */
  toggleRamaActiva(id: string) {
    const rama = this.song.ramas.find(r => r.id === id);
    if (!rama) return;
    rama.activa = !rama.activa;
    if (rama.activa) {
      // solo una alternativa activa por tramo solapado
      for (const other of this.song.ramas) {
        if (other.id !== id && other.desde < rama.hasta && other.hasta > rama.desde) other.activa = false;
      }
    }
    this.song.ramas = [...this.song.ramas];
    this.ctxMenu.set(null);
    this.markDirty();
  }

  removeRama(id: string) {
    this.song.ramas = this.song.ramas.filter(r => r.id !== id);
    this.markDirty();
  }

  editRamaPart(ramaId: string, partIndex: number | 'nueva') {
    this.navigatingToPart.set(true);
    this.saveNow().then(id => {
      this.engine.stop();
      this.router.navigate(['/administracion/estudio', id, 'parte', partIndex], { queryParams: { rama: ramaId } });
    }).catch(err => {
      this.navigatingToPart.set(false);
      this.autosaveError.set(typeof err === 'string' ? err : this.msg(err));
    });
  }

  save() {
    this.saveError.set(null);
    if (!this.song.title.trim()) {
      this.saveError.set('Ponle un título a la canción.');
      return;
    }
    if (this.saving()) return;
    clearTimeout(this.autosaveTimer);
    this.dirty.set(false);
    this.saving.set(true);
    this.song.draft = this.keepDraft();
    const published = !this.song.draft;
    const request = this.song.id ? this.data.update(this.song) : this.data.create(this.song);
    request.subscribe({
      next: () => this.router.navigate([published ? '/administracion/canciones' : '/administracion/estudio']),
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
