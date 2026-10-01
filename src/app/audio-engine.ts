import { Injectable, signal } from '@angular/core';
import { Song, Track } from './data.service';

/** Ventana de reproducción de una pista concreta dentro de un fragmento. */
export interface TrackWindow {
  track: Track;
  start: number;
  end: number;
}

/**
 * Motor de reproducción real basado en Web Audio API.
 *
 * Descarga cada pista una vez, la decodifica a AudioBuffer y reproduce varias a la vez
 * con arranque sincronizado a nivel de muestra (imprescindible para escuchar tambor + bombo
 * cuadrados). Soporta play/pause/stop, velocidad y reproducción de un fragmento (una parte).
 */
@Injectable({ providedIn: 'root' })
export class AudioEngine {
  readonly loading = signal(false);
  readonly playing = signal(false);
  readonly position = signal(0);
  readonly duration = signal(0);
  readonly rate = signal(1);
  readonly error = signal<string | null>(null);
  readonly loadedTracks = signal<Track[]>([]);
  readonly metronomeOn = signal(false);

  private ctx?: AudioContext;
  private master?: GainNode;
  private metroTimer = 0;
  private metroNext = 0;
  private buffers = new Map<Track, AudioBuffer>();
  private sources: AudioBufferSourceNode[] = [];
  private desired: Track[] = [];
  private windows: TrackWindow[] | null = null;
  private startedAtCtx = 0;
  private startedAtPos = 0;
  private segmentEnd: number | null = null;
  private ticker = 0;
  private token = 0;

  hasTrack(track: Track) {
    return this.buffers.has(track);
  }

  /** AudioBuffer decodificado de una pista (para dibujar la onda). undefined si aún no está. */
  getBuffer(track: Track): AudioBuffer | undefined {
    return this.buffers.get(track);
  }

  /** Nº de versiones de buffers cargados; sube cada vez que se añade/reemplaza uno (para signals). */
  readonly buffersVersion = signal(0);

  /** Descarga y decodifica las pistas READY de la canción. */
  async loadSong(song: Song, audioUrl: (track: Track) => string) {
    const run = ++this.token;
    this.stop();
    this.buffers.clear();
    this.loadedTracks.set([]);
    this.buffersVersion.update(v => v + 1);
    this.error.set(null);
    this.duration.set(song.duration || 0);

    const ready = (Object.values(song.tracks) as { type: Track; status: string }[])
      .filter(t => t && t.status === 'READY')
      .map(t => t.type);

    if (!ready.length) {
      this.error.set('No hay audio disponible para esta canción. Súbelo desde Administración.');
      return;
    }

    this.loading.set(true);
    const ctx = this.context();
    try {
      await Promise.all(ready.map(async track => {
        const res = await fetch(audioUrl(track), { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(bytes);
        if (run !== this.token) return;
        this.buffers.set(track, buffer);
      }));
      if (run !== this.token) return;
      const longest = Math.max(song.duration || 0, ...[...this.buffers.values()].map(b => b.duration));
      this.duration.set(Math.round(longest));
      this.loadedTracks.set([...this.buffers.keys()]);
      this.buffersVersion.update(v => v + 1);
      if (!this.buffers.size) {
        this.error.set('No se pudo cargar el audio de esta canción.');
      }
    } catch (e) {
      if (run === this.token) this.error.set('No se pudo cargar el audio: ' + (e as Error).message);
    } finally {
      if (run === this.token) this.loading.set(false);
    }
  }

  /**
   * Añade una pista desde un fichero/grabación local aún sin subir, para poder previsualizarla.
   * Best-effort: si el navegador no sabe decodificar el formato, se ignora.
   */
  async addLocalTrack(track: Track, blob: Blob) {
    try {
      const ctx = this.context();
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      this.buffers.set(track, decoded);
      this.loadedTracks.set([...this.buffers.keys()]);
      this.duration.set(Math.round(Math.max(this.duration(), decoded.duration)));
      this.buffersVersion.update(v => v + 1);
      this.error.set(null);
    } catch {
      /* formato no decodificable en este navegador */
    }
  }

  /** Pistas que deben sonar. Se filtran a las realmente cargadas en el momento de reproducir. */
  setActiveTracks(tracks: Track[]) {
    this.desired = [...tracks];
    if (this.playing()) this.restart(this.position());
  }

  /**
   * @param windows si se pasa, cada pista suena solo en su ventana [start,end] (con arranque
   *                escalonado). Si no se pasa, se reproduce toda la pista activa desde `from`
   *                (y se descarta cualquier ventana anterior).
   */
  play(from?: number, to?: number, windows?: TrackWindow[]) {
    if (!this.buffers.size) return;
    if (this.metronomeOn()) this.stopMetronome();
    this.windows = windows && windows.length ? windows : null;
    const playable = this.windows
      ? this.windows.some(w => this.buffers.has(w.track))
      : this.desired.some(t => this.buffers.has(t));
    if (!playable) {
      this.error.set('No hay audio disponible para lo seleccionado.');
      return;
    }
    this.error.set(null);
    const ctx = this.context();
    if (ctx.state === 'suspended') ctx.resume();
    let start = from ?? this.position();
    const limit = to ?? this.duration();
    if (start >= limit - 0.05) start = from ?? 0;
    this.segmentEnd = to ?? null;
    this.restart(start);
    this.playing.set(true);
    this.startTicker();
  }

  pause() {
    this.position.set(this.currentPosition());
    this.teardownSources();
    this.playing.set(false);
    clearInterval(this.ticker);
  }

  stop() {
    this.teardownSources();
    this.playing.set(false);
    this.segmentEnd = null;
    this.windows = null;
    this.position.set(0);
    clearInterval(this.ticker);
  }

  seek(seconds: number) {
    const t = Math.max(0, Math.min(seconds, this.duration()));
    if (this.playing()) this.restart(t);
    else this.position.set(t);
  }

  setRate(rate: number) {
    this.rate.set(rate);
    if (this.playing()) {
      this.startedAtPos = this.currentPosition();
      this.startedAtCtx = this.context().currentTime;
      for (const s of this.sources) s.playbackRate.value = rate;
    }
  }

  /** Libera todo (llamar al salir de la ficha). */
  release() {
    this.token++;
    this.stop();
    this.stopMetronome();
    this.buffers.clear();
    this.loadedTracks.set([]);
    this.buffersVersion.update(v => v + 1);
    this.error.set(null);
  }

  // --- Metrónomo ---

  /** Alterna el metrónomo. Si estaba sonando el reproductor, lo pausa. */
  toggleMetronome(bpm: number) {
    if (this.metronomeOn()) { this.stopMetronome(); return; }
    if (this.playing()) this.pause();
    const ctx = this.context();
    if (ctx.state === 'suspended') ctx.resume();
    const interval = 60 / Math.max(20, Math.min(300, bpm));
    this.metroNext = ctx.currentTime + 0.1;
    let beat = 0;
    this.metroTimer = window.setInterval(() => {
      while (this.metroNext < ctx.currentTime + 0.25) {
        this.tickClick(this.metroNext, beat % 4 === 0);
        this.metroNext += interval;
        beat++;
      }
    }, 50);
    this.metronomeOn.set(true);
  }

  stopMetronome() {
    clearInterval(this.metroTimer);
    this.metronomeOn.set(false);
  }

  private tickClick(time: number, accent: boolean) {
    const ctx = this.context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1050;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.32, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  private restart(fromPosition: number) {
    this.teardownSources();
    const ctx = this.context();
    const rate = this.rate();
    const wins: TrackWindow[] = this.windows
      ? this.windows.filter(w => this.buffers.has(w.track) && fromPosition < w.end)
      : this.desired.filter(t => this.buffers.has(t)).map(t => ({ track: t, start: 0, end: this.duration() }));

    for (const w of wins) {
      const buffer = this.buffers.get(w.track)!;
      const bufferOffset = Math.max(fromPosition, w.start);
      if (bufferOffset >= buffer.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      src.connect(this.master!);
      const delay = Math.max(0, w.start - fromPosition) / rate;
      src.start(ctx.currentTime + delay, bufferOffset);
      const stopAt = Math.min(w.end, this.segmentEnd ?? w.end);
      if (stopAt > fromPosition) src.stop(ctx.currentTime + (stopAt - fromPosition) / rate);
      this.sources.push(src);
    }
    this.startedAtCtx = ctx.currentTime;
    this.startedAtPos = fromPosition;
    this.position.set(fromPosition);
  }

  // setInterval en vez de requestAnimationFrame: rAF se pausa cuando la pestaña
  // no está visible y el audio (Web Audio) sigue sonando; el reloj se quedaría parado.
  private startTicker() {
    clearInterval(this.ticker);
    this.ticker = window.setInterval(() => this.tick(), 100);
  }

  private tick() {
    const pos = this.currentPosition();
    const limit = this.segmentEnd ?? this.duration();
    if (pos >= limit - 0.02) {
      this.teardownSources();
      this.playing.set(false);
      clearInterval(this.ticker);
      this.position.set(this.segmentEnd ? limit : 0);
      this.segmentEnd = null;
      this.windows = null;
      return;
    }
    this.position.set(pos);
  }

  private currentPosition() {
    if (!this.playing() && !this.sources.length) return this.position();
    return this.startedAtPos + (this.context().currentTime - this.startedAtCtx) * this.rate();
  }

  private teardownSources() {
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
      s.disconnect();
    }
    this.sources = [];
  }

  private context() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }
}
