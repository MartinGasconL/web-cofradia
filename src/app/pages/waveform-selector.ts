import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy,
  Output, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Onda de sonido de un clip con selección de un recorte [start, end] (segundos).
 *
 * - Dibuja la forma de onda del `AudioBuffer` en un canvas.
 * - Región azul arrastrable (límites por separado o el cuerpo entero) = el trozo que se usa.
 * - `position` pinta el cabezal de reproducción. Click en la onda = `seek`.
 */
@Component({
  selector: 'app-waveform-selector',
  imports: [CommonModule],
  template: `
<div class="wfs">
  <div class="wfs-track" #track (pointerdown)="onTrackDown($event)">
    <canvas #cv class="wfs-canvas"></canvas>
    <div class="wfs-shade" [style.left.%]="0" [style.width.%]="pct(start)"></div>
    <div class="wfs-shade" [style.left.%]="pct(end)" [style.right.%]="0"></div>
    <div class="wfs-region" [style.left.%]="pct(start)" [style.width.%]="pct(end - start)"
         (pointerdown)="down($event, 'body')">
      <span class="wfs-handle l" (pointerdown)="down($event, 'l')"></span>
      <span class="wfs-handle r" (pointerdown)="down($event, 'r')"></span>
    </div>
    @if (showHead()) { <div class="wfs-head" [style.left.%]="pct(position ?? 0)"></div> }
  </div>
  <div class="wfs-ruler">
    <span>00:00</span>
    <b>{{ fmt(start) }} — {{ fmt(end) }} · {{ fmt(end - start) }}</b>
    <span>{{ fmt(clip()) }}</span>
  </div>
</div>
  `,
  styles: [`
    .wfs{display:grid;gap:6px;user-select:none}
    .wfs-track{position:relative;height:76px;border-radius:8px;background:#faf3f0;border:1px solid var(--border);overflow:hidden;touch-action:none;cursor:crosshair}
    .wfs-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
    .wfs-shade{position:absolute;top:0;bottom:0;background:#ffffffb0}
    .wfs-region{position:absolute;top:0;bottom:0;background:#9100001f;border-left:2px solid var(--blue);border-right:2px solid var(--blue);cursor:grab}
    .wfs-region:active{cursor:grabbing}
    .wfs-handle{position:absolute;top:0;bottom:0;width:12px;background:var(--blue);cursor:ew-resize}
    .wfs-handle.l{left:-2px}
    .wfs-handle.r{right:-2px}
    .wfs-head{position:absolute;top:0;bottom:0;width:2px;background:var(--gold);box-shadow:0 0 0 1px var(--navy)}
    .wfs-ruler{display:flex;justify-content:space-between;font-size:11px;color:var(--muted)}
    .wfs-ruler b{color:var(--blue);font-variant-numeric:tabular-nums}
  `],
})
export class WaveformSelector implements AfterViewInit, OnChanges, OnDestroy {
  @Input() buffer: AudioBuffer | null = null;
  /** duración a mostrar si no hay buffer (p. ej. la duración de la canción). */
  @Input() fallbackDuration = 0;
  @Input() start = 0;
  @Input() end = 0;
  @Input() position: number | null = null;

  @Output() startChange = new EventEmitter<number>();
  @Output() endChange = new EventEmitter<number>();
  @Output() seek = new EventEmitter<number>();

  @ViewChild('track', { static: true }) trackRef!: ElementRef<HTMLElement>;
  @ViewChild('cv', { static: true }) cvRef!: ElementRef<HTMLCanvasElement>;

  private readonly gap = 0.1;
  private drag?: { mode: 'l' | 'r' | 'body'; x0: number; s0: number; e0: number; width: number };
  private ro?: ResizeObserver;

  clip() {
    return this.buffer ? this.buffer.duration : this.fallbackDuration;
  }

  pct(seconds: number) {
    const d = this.clip();
    return d > 0 ? Math.max(0, Math.min(100, (seconds / d) * 100)) : 0;
  }

  fmt(n: number) {
    const t = Math.max(0, n);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  }

  showHead() {
    return this.position != null && this.position > 0 && this.position <= this.clip();
  }

  ngAfterViewInit() {
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.trackRef.nativeElement);
    this.draw();
  }

  ngOnChanges() {
    // el buffer puede llegar tras el primer render
    queueMicrotask(() => this.draw());
  }

  ngOnDestroy() {
    this.ro?.disconnect();
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
  }

  private draw() {
    const cv = this.cvRef?.nativeElement;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, rect.width, rect.height);

    const buf = this.buffer;
    const W = rect.width, H = rect.height, mid = H / 2;
    if (!buf) {
      g.strokeStyle = '#d8a3a3';
      g.beginPath(); g.moveTo(0, mid); g.lineTo(W, mid); g.stroke();
      return;
    }
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / W));
    g.fillStyle = '#b06a6a';
    for (let x = 0; x < W; x++) {
      let min = 1, max = -1;
      const base = x * step;
      for (let i = 0; i < step; i++) {
        const s = data[base + i];
        if (s === undefined) break;
        if (s < min) min = s;
        if (s > max) max = s;
      }
      const y = mid + min * mid;
      g.fillRect(x, y, 1, Math.max(1, (max - min) * mid));
    }
  }

  onTrackDown(e: PointerEvent) {
    if (this.drag) return;
    const rect = this.trackRef.nativeElement.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * this.clip();
    this.seek.emit(Math.max(0, Math.min(t, this.clip())));
  }

  down(event: PointerEvent, mode: 'l' | 'r' | 'body') {
    event.stopPropagation();
    event.preventDefault();
    this.drag = { mode, x0: event.clientX, s0: this.start, e0: this.end, width: this.end - this.start };
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
  }

  private move = (event: PointerEvent) => {
    const d = this.drag, dur = this.clip();
    if (!d || !dur) return;
    const rectW = this.trackRef.nativeElement.getBoundingClientRect().width;
    const delta = ((event.clientX - d.x0) / rectW) * dur;
    if (d.mode === 'l') {
      this.startChange.emit(clamp(r1(d.s0 + delta), 0, this.end - this.gap));
    } else if (d.mode === 'r') {
      this.endChange.emit(clamp(r1(d.e0 + delta), this.start + this.gap, dur));
    } else {
      const s = clamp(r1(d.s0 + delta), 0, dur - d.width);
      this.startChange.emit(s);
      this.endChange.emit(r1(s + d.width));
    }
  };

  private up = () => {
    this.drag = undefined;
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

/** redondea a décimas de segundo */
function r1(n: number) {
  return Math.round(n * 10) / 10;
}
