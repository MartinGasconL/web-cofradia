import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TimeRange { start: number; end: number; }

/**
 * Barra de reproducción para delimitar una parte sobre el eje temporal de la canción.
 *
 * - La barra completa mide `duration` segundos (azul).
 * - Las regiones de otras partes salen en gris y no se pueden pisar.
 * - Se arrastra cada límite por separado, o el cuerpo de la región para mover ambos a la vez.
 * - `position` (si llega) pinta el cabezal de reproducción.
 */
@Component({
  selector: 'app-part-range-bar',
  imports: [CommonModule],
  template: `
<div class="prb">
  <div class="prb-track" #track (pointerdown)="onTrackDown($event)">
    <div class="prb-fill"></div>
    @for (b of occupied; track $index) {
      <div class="prb-blocked" [style.left.%]="pct(b.start)" [style.width.%]="pct(b.end - b.start)"></div>
    }
    <div class="prb-region" [style.left.%]="pct(start)" [style.width.%]="pct(end - start)"
         (pointerdown)="down($event, 'body')">
      <span class="prb-handle l" (pointerdown)="down($event, 'l')"></span>
      <span class="prb-handle r" (pointerdown)="down($event, 'r')"></span>
    </div>
    @if (showHead()) { <div class="prb-head" [style.left.%]="pct(position ?? 0)"></div> }
  </div>
  <div class="prb-ruler">
    <span>00:00</span>
    <b>{{ fmt(start) }} — {{ fmt(end) }}</b>
    <span>{{ fmt(duration) }}</span>
  </div>
</div>
  `,
  styles: [`
    .prb{display:grid;gap:6px;user-select:none}
    .prb-track{position:relative;height:44px;border-radius:8px;background:var(--tint);overflow:hidden;touch-action:none}
    .prb-fill{position:absolute;inset:0;background:linear-gradient(#fdeeee,var(--tint))}
    .prb-blocked{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(45deg,#cbd5e1,#cbd5e1 6px,#b8c2d0 6px,#b8c2d0 12px);border-left:1px solid #94a3b8;border-right:1px solid #94a3b8}
    .prb-region{position:absolute;top:0;bottom:0;background:var(--blue);opacity:.9;border-radius:4px;cursor:grab;box-shadow:0 0 0 2px var(--navy) inset}
    .prb-region:active{cursor:grabbing}
    .prb-handle{position:absolute;top:0;bottom:0;width:14px;background:#fff;border:1px solid var(--blue);border-radius:3px;cursor:ew-resize}
    .prb-handle.l{left:-7px}
    .prb-handle.r{right:-7px}
    .prb-head{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--gold);box-shadow:0 0 0 1px var(--navy),0 0 4px rgba(0,0,0,.4)}
    .prb-ruler{display:flex;justify-content:space-between;font-size:11px;color:var(--muted)}
    .prb-ruler b{color:var(--blue);font-variant-numeric:tabular-nums}
  `],
})
export class PartRangeBar {
  @Input() duration = 0;
  @Input() start = 0;
  @Input() end = 0;
  @Input() occupied: TimeRange[] = [];
  @Input() position: number | null = null;

  @Output() startChange = new EventEmitter<number>();
  @Output() endChange = new EventEmitter<number>();

  @ViewChild('track', { static: true }) trackRef!: ElementRef<HTMLElement>;

  private readonly gap = 1;
  private drag?: { mode: 'l' | 'r' | 'body'; x0: number; s0: number; e0: number; width: number };

  pct(seconds: number) {
    return this.duration > 0 ? Math.max(0, Math.min(100, (seconds / this.duration) * 100)) : 0;
  }

  fmt(n: number) {
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  }

  showHead() {
    return this.position != null && this.position > 0 && this.position <= this.duration;
  }

  onTrackDown(_: PointerEvent) {
    // Click en zona libre: no hace nada (se arrastran los límites o la región).
  }

  down(event: PointerEvent, mode: 'l' | 'r' | 'body') {
    event.stopPropagation();
    event.preventDefault();
    this.drag = { mode, x0: event.clientX, s0: this.start, e0: this.end, width: this.end - this.start };
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
  }

  private move = (event: PointerEvent) => {
    if (!this.drag || !this.duration) return;
    const rectW = this.trackRef.nativeElement.getBoundingClientRect().width;
    const delta = ((event.clientX - this.drag.x0) / rectW) * this.duration;
    const blocks = [...this.occupied].sort((a, b) => a.start - b.start);
    const floor = blocks.filter(b => b.end <= this.drag!.s0).reduce((m, b) => Math.max(m, b.end), 0);
    const ceil = blocks.filter(b => b.start >= this.drag!.e0).reduce((m, b) => Math.min(m, b.start), this.duration);

    if (this.drag.mode === 'l') {
      const s = clamp(Math.round(this.drag.s0 + delta), floor, this.end - this.gap);
      this.startChange.emit(s);
    } else if (this.drag.mode === 'r') {
      const e = clamp(Math.round(this.drag.e0 + delta), this.start + this.gap, ceil);
      this.endChange.emit(e);
    } else {
      const s = clamp(Math.round(this.drag.s0 + delta), floor, ceil - this.drag.width);
      this.startChange.emit(s);
      this.endChange.emit(s + this.drag.width);
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
