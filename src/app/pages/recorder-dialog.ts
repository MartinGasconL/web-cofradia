import { Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild, signal } from '@angular/core';

type Phase = 'idle' | 'recording' | 'paused' | 'recorded';

@Component({
  selector: 'app-recorder-dialog',
  template: `
<div class="modal-backdrop" (click)="onBackdrop($event)">
  <div class="recorder-modal" (click)="$event.stopPropagation()">
    <header>
      <div><p>GRABACIÓN</p><h2>Grabar pista desde el micrófono</h2></div>
      <button type="button" (click)="discard()">×</button>
    </header>

    @if (error()) { <div class="rec-error">{{ error() }}</div> }

    <div class="rec-stage">
      <div class="rec-dot" [class.live]="phase() === 'recording'"></div>
      <strong>{{ fmt(elapsed()) }}</strong>
      <span>{{ label() }}</span>
    </div>

    @if (phase() === 'recorded') {
      <audio #player [src]="url()" controls></audio>
      <div class="rec-seek">
        <button type="button" (click)="nudge(-5)">« 5s</button>
        <button type="button" (click)="nudge(5)">5s »</button>
      </div>
    }

    <div class="rec-controls">
      @switch (phase()) {
        @case ('idle') {
          <button type="button" class="primary" [disabled]="starting()" (click)="start()">
            <svg viewBox="0 0 24 24" width="13" height="13"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>
            {{ starting() ? 'Activando micrófono…' : 'Iniciar' }}
          </button>
        }
        @case ('recording') {
          <button type="button" (click)="pause()"><svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg> Pausar</button>
          <button type="button" class="primary" (click)="stop()"><svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M6 6h12v12H6z"/></svg> Detener</button>
        }
        @case ('paused') {
          <button type="button" (click)="resume()"><svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M8 5v14l11-7z"/></svg> Reanudar</button>
          <button type="button" class="primary" (click)="stop()"><svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M6 6h12v12H6z"/></svg> Detener</button>
        }
        @case ('recorded') {
          <button type="button" (click)="reset()"><svg viewBox="0 0 24 24" width="13" height="13"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 9a8 8 0 1 1-1 6"/><path fill="currentColor" d="M2 4v6h6z"/></svg> Repetir</button>
        }
      }
    </div>

    <footer>
      <button type="button" class="outline" (click)="discard()">Descartar</button>
      <button type="button" class="primary" [disabled]="phase() !== 'recorded'" (click)="accept()">Aceptar y subir</button>
    </footer>
  </div>
</div>
  `,
  styles: [`
    .recorder-modal{width:min(460px,100%);background:#fff;border-radius:14px;padding:22px;display:grid;gap:16px}
    .recorder-modal header{display:flex;justify-content:space-between;align-items:start}
    .recorder-modal header p{margin:0;font-size:10px;color:var(--blue);letter-spacing:1px;font-weight:bold}
    .recorder-modal h2{margin:3px 0 0;font-size:17px}
    .recorder-modal header>button{border:0;background:none;font-size:24px;cursor:pointer;line-height:1}
    .rec-error{background:#fef2f2;color:#b91c1c;border-radius:8px;padding:10px;font-size:12px}
    .rec-stage{display:grid;justify-items:center;gap:4px;padding:14px;background:#faf6f0;border-radius:10px}
    .rec-stage strong{font-size:28px;font-variant-numeric:tabular-nums}
    .rec-stage span{font-size:12px;color:var(--muted)}
    .rec-dot{width:14px;height:14px;border-radius:50%;background:#cbd5e1}
    .rec-dot.live{background:#dc2626;animation:recpulse 1s infinite}
    @keyframes recpulse{50%{opacity:.3}}
    .recorder-modal audio{width:100%}
    .rec-seek{display:flex;gap:8px;justify-content:center}
    .rec-controls{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
    .recorder-modal button:not(.primary):not(.outline){border:1px solid var(--border);background:#fff;color:var(--ink);padding:9px 13px;border-radius:8px;cursor:pointer}
    .recorder-modal .primary{border:0;background:var(--blue);color:#fff;padding:9px 13px;border-radius:8px;font-weight:bold;cursor:pointer}
    .recorder-modal .primary:disabled{opacity:.45;cursor:not-allowed}
    .recorder-modal .outline{border:1px solid var(--tint-border);background:#fff;color:var(--blue);padding:9px 13px;border-radius:8px;cursor:pointer}
    .recorder-modal footer{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--border);padding-top:14px}
  `],
})
export class RecorderDialog implements OnDestroy {
  @Output() accepted = new EventEmitter<{ blob: Blob; ext: string }>();
  @Output() dismissed = new EventEmitter<void>();
  @ViewChild('player') player?: ElementRef<HTMLAudioElement>;

  phase = signal<Phase>('idle');
  elapsed = signal(0);
  error = signal<string | null>(null);
  url = signal<string>('');
  starting = signal(false);

  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private blob?: Blob;
  private timer?: number;
  private mime = '';
  private closed = false;

  label() {
    return { idle: 'Listo para grabar', recording: 'Grabando…', paused: 'En pausa', recorded: 'Grabación lista' }[this.phase()];
  }

  fmt(seconds: number) {
    const s = Math.floor(seconds);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  async start() {
    if (this.starting() || this.phase() !== 'idle') return;
    this.error.set(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.error.set(window.isSecureContext
        ? 'Este navegador no permite grabar audio. Sube un archivo en su lugar.'
        : 'Para grabar en el móvil abre la app por HTTPS (https://…). Con http:// el navegador bloquea el micrófono. Mientras tanto, sube un archivo.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      this.error.set('Este navegador no soporta MediaRecorder. Sube un archivo en su lugar.');
      return;
    }
    this.starting.set(true);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const denied = (e as DOMException)?.name === 'NotAllowedError';
      this.error.set(denied
        ? 'Permiso de micrófono denegado. Actívalo en el candado de la barra de direcciones.'
        : 'No se pudo acceder al micrófono. ¿Hay alguno conectado?');
      this.starting.set(false);
      return;
    }
    if (this.closed) { this.stopStream(); return; }
    this.mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']
      .find(m => MediaRecorder.isTypeSupported(m)) ?? '';
    try {
      this.recorder = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    } catch {
      this.recorder = new MediaRecorder(this.stream);
      this.mime = this.recorder.mimeType || '';
    }
    this.chunks = [];
    this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.onerror = () => this.error.set('Fallo durante la grabación. Inténtalo de nuevo.');
    this.recorder.onstop = () => {
      this.stopStream();
      if (this.closed) return;
      if (!this.chunks.length) { this.error.set('La grabación salió vacía. Inténtalo de nuevo.'); this.phase.set('idle'); return; }
      this.blob = new Blob(this.chunks, { type: this.mime || 'audio/webm' });
      this.url.set(URL.createObjectURL(this.blob));
      this.phase.set('recorded');
    };
    this.recorder.start();
    this.starting.set(false);
    this.phase.set('recording');
    this.elapsed.set(0);
    this.tick();
  }

  pause() {
    this.recorder?.pause();
    this.phase.set('paused');
    clearInterval(this.timer);
  }

  resume() {
    this.recorder?.resume();
    this.phase.set('recording');
    this.tick();
  }

  stop() {
    clearInterval(this.timer);
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
  }

  reset() {
    this.revoke();
    this.chunks = [];
    this.blob = undefined;
    this.elapsed.set(0);
    this.phase.set('idle');
  }

  nudge(seconds: number) {
    const audio = this.player?.nativeElement;
    if (audio) audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds));
  }

  accept() {
    if (this.blob) this.accepted.emit({ blob: this.blob, ext: this.extension() });
    this.cleanup();
  }

  discard() {
    this.cleanup();
    this.dismissed.emit();
  }

  onBackdrop(_: MouseEvent) {
    // No cerrar por accidente si hay una grabación en curso o sin guardar.
    if (this.phase() === 'idle') this.discard();
  }

  ngOnDestroy() {
    this.cleanup();
  }

  extension() {
    return this.mime.includes('mp4') ? 'm4a' : this.mime.includes('ogg') ? 'ogg' : 'webm';
  }

  private tick() {
    this.timer = window.setInterval(() => this.elapsed.update(v => v + 0.2), 200);
  }

  private stopStream() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = undefined;
  }

  private revoke() {
    if (this.url()) URL.revokeObjectURL(this.url());
    this.url.set('');
  }

  private cleanup() {
    this.closed = true;
    clearInterval(this.timer);
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch { /* noop */ }
    }
    this.stopStream();
    this.revoke();
  }
}
