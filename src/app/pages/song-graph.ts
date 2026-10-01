import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Parte, Song, TRACK_SHORT } from '../data.service';

const ROW_H = 56, NODE_R = 7, PAD_T = 18;
const LBL_W = 168;      // ancho de una etiqueta
const LBL_GAP = 12;     // separación nodo → su etiqueta
const LANE_GAP = 26;    // aire entre un carril y la etiqueta del carril de dentro (para la curva)
const COL_W = 2 * NODE_R + LBL_GAP + LBL_W + LANE_GAP; // ancho de una columna "carril + etiqueta"

type NodeKind = 'main' | 'branch-first' | 'branch-mid' | 'branch-last' | 'branch-single' | 'add';

interface GNode {
  key: string;
  x: number; y: number;
  color: string;
  kind: NodeKind;
  mainIndex?: number;
  ramaId?: string;
  partIndex?: number;
  part?: Parte;
  active?: boolean;   // nodo de rama: si la rama está activa
  shadowed?: boolean; // nodo principal sustituido por una rama activa
  lx: number;         // etiqueta: left px
  lw: number;         // etiqueta: ancho px
  lr: boolean;        // etiqueta alineada a la derecha (carriles a la izquierda de la línea)
}
interface GEdge { d: string; color: string; dim?: boolean }

@Component({
  selector: 'app-song-graph',
  imports: [CommonModule],
  template: `
@if (song.partes.length) {
@let g = build();
<div class="graph-scroll" [style.height.px]="g.h + 16">
<div class="graph" [style.height.px]="g.h" [style.width.px]="g.w">
  <svg [attr.width]="g.w" [attr.height]="g.h" class="graph-svg" #svg>
    @for (e of g.edges; track $index) {
      <path [attr.d]="e.d" [attr.stroke]="e.color" fill="none" stroke-width="3" stroke-linecap="round"
        [attr.opacity]="e.dim ? 0.28 : 0.85" [attr.stroke-dasharray]="e.dim ? '5 4' : null"/>
    }
    @if (snapY() !== null) {
      <line [attr.x1]="dragX()" [attr.y1]="dragY()" [attr.x2]="g.mainX" [attr.y2]="snapY()" stroke="var(--blue)" stroke-width="2" stroke-dasharray="4 3"/>
      <circle [attr.cx]="g.mainX" [attr.cy]="snapY()" r="12" fill="none" stroke="var(--blue)" stroke-width="2"/>
    }
    @if (insertGhost(); as ig) {
      <line [attr.x1]="g.mainX - 16" [attr.y1]="insertGapY(ig.index)" [attr.x2]="g.mainX + 16" [attr.y2]="insertGapY(ig.index)"
        stroke="var(--blue)" stroke-width="3" stroke-linecap="round"/>
      <circle [attr.cx]="g.mainX" [attr.cy]="insertGapY(ig.index)" r="4" fill="var(--blue)"/>
    }
    @for (n of g.nodes; track n.key) {
      @if (n.kind === 'add') {
        <circle class="g-hit" [attr.cx]="dragKey() === n.key ? dragX() : n.x" [attr.cy]="dragKey() === n.key ? dragY() : n.y" r="20" fill="transparent" (pointerdown)="down($event, n, true)"/>
        <circle class="g-node g-add"
          [attr.cx]="dragKey() === n.key ? dragX() : n.x"
          [attr.cy]="dragKey() === n.key ? dragY() : n.y"
          [attr.r]="dragKey() === n.key ? 10 : NODE_R + 1"
          fill="var(--card)" stroke="var(--blue)" stroke-width="2" stroke-dasharray="3 2" pointer-events="none"/>
        <path class="g-add-plus" [attr.transform]="'translate(' + (dragKey() === n.key ? dragX() : n.x) + ',' + (dragKey() === n.key ? dragY() : n.y) + ')'"
          d="M-4,0H4M0,-4V4" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" pointer-events="none"/>
      } @else {
        <circle class="g-hit" [attr.cx]="dragKey() === n.key ? dragX() : n.x" [attr.cy]="dragKey() === n.key ? dragY() : n.y" r="20" fill="transparent" (pointerdown)="down($event, n, true)"/>
        <circle class="g-node"
          [attr.cx]="dragKey() === n.key ? dragX() : n.x"
          [attr.cy]="dragKey() === n.key ? dragY() : n.y"
          [attr.r]="dragKey() === n.key ? 9 : NODE_R"
          [attr.fill]="n.color" stroke="#fff" stroke-width="2.5"
          [attr.opacity]="(n.shadowed || n.active === false) ? 0.38 : 1" pointer-events="none"/>
      }
    }
  </svg>
  @for (n of g.nodes; track n.key) {
    <button type="button" class="graph-label"
      [class.dim]="(dragKey() && dragKey() !== n.key) || n.shadowed || n.active === false"
      [class.is-add]="n.kind === 'add'"
      [class.ralign]="n.lr"
      [style.top.px]="n.y - 17" [style.left.px]="n.lx" [style.width.px]="n.lw"
      (pointerdown)="down($event, n, false)">
      @if (n.kind === 'add') {
        <strong>＋ Añadir parte</strong>
        <small>Púlsalo para añadir al final · arrastra la bola a un hueco para insertar</small>
      } @else if (n.part; as part) {
        <small>{{ fmt(part.start) }} — {{ fmt(part.end) }}</small>
        <strong>{{ part.name || 'Parte' }}</strong>
        <span class="graph-tags">
          @if (n.ramaId) {
            <em [class.tag-on]="n.active" [class.tag-off]="!n.active">{{ n.active ? 'en uso' : 'alternativa' }}</em>
          } @else if (n.shadowed) {
            <em class="tag-off">sustituida</em>
          }
          @for (t of part.tracks; track t.track) { <em>{{ short[t.track] }}</em> }
          @if (part.question || part.answer) { <em class="pink">{{ part.question ? 'Preg.' : 'Resp.' }}</em> }
          @if (part.desfase) { <em class="tag-desfase">Desf.</em> }
        </span>
      }
    </button>
  }
</div>
</div>
<p class="graph-hint">Toca una parte (bola o título) para escucharla · mantén pulsado para el menú (editar, reordenar, alternativa, …) · en escritorio también puedes mantener pulsada la <b>bola</b> y arrastrarla para reordenar o mover una rama, o arrastrar la bola «＋» a un hueco para insertar.</p>
}
  `,
  styles: [`
    :host{display:block;min-width:0}
    .graph-scroll{overflow-x:auto;overflow-y:hidden;max-width:100%;margin:6px 0;-webkit-overflow-scrolling:touch}
    .graph{position:relative;margin:0 auto}
    .graph-svg{display:block;touch-action:pan-y;overflow:visible}
    .g-node{pointer-events:none}
    .g-hit{cursor:grab;touch-action:none}
    .graph-label{position:absolute;display:grid;gap:1px;text-align:left;border:0;background:none;padding:4px 6px;border-radius:7px;cursor:pointer;box-sizing:border-box;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
    .graph-label.ralign{text-align:right}
    .graph-label.ralign .graph-tags{justify-content:flex-end}
    .graph-label:hover{background:var(--tint)}
    .graph-label.dim{opacity:.35}
    .graph-label.is-add{cursor:pointer}
    .graph-label.is-add strong{color:var(--blue)}
    .graph-label small{font-size:10px;color:var(--muted)}
    .graph-label strong{font-size:13px;color:var(--ink);line-height:1.2}
    .graph-tags{display:flex;gap:3px;flex-wrap:wrap;margin-top:2px}
    .graph-tags .tag-on{background:#dcfce7!important;color:#15803d!important}
    .graph-tags .tag-off{background:#f1ede6!important;color:var(--muted)!important}
    .graph-hint{font-size:11px;color:var(--muted);margin:8px 0 0}
  `],
})
export class SongGraph {
  @Input() song!: Song;
  @Output() editPart = new EventEmitter<{ ramaId: string | null; index: number | null }>();
  @Output() menu = new EventEmitter<{ ramaId: string | null; index: number; x: number; y: number }>();
  @Output() changed = new EventEmitter<void>();
  /** Toque en el nodo «＋»: añadir una parte al final. */
  @Output() addPart = new EventEmitter<void>();
  /** Nodo «＋» soltado sobre un hueco de la línea principal: insertar en este índice. */
  @Output() insertPart = new EventEmitter<{ index: number }>();
  /** Botón ▶ de un nodo: escuchar esa parte. */
  @Output() playPart = new EventEmitter<{ ramaId: string | null; index: number }>();

  short = TRACK_SHORT;
  readonly NODE_R = NODE_R;

  dragKey = signal<string | null>(null);
  dragX = signal(0);
  dragY = signal(0);
  snapY = signal<number | null>(null);
  insertGhost = signal<{ y: number; index: number } | null>(null);

  private press?: {
    node: GNode; x0: number; y0: number; timer: number; fromNode: boolean;
    mode: 'idle' | 'reorder' | 'from' | 'to' | 'add' | 'menu'; svgTop: number;
  };
  private snapIndex: number | null = null;
  private mainNodesCache: GNode[] = [];

  fmt(n: number) {
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  }

  /** Y del hueco (entre nodos principales) donde caería una parte insertada en `index`. */
  insertGapY(index: number): number {
    const m = this.mainNodesCache;
    if (!m.length) return PAD_T;
    if (index <= 0) return Math.max(4, m[0].y - ROW_H / 2);
    if (index >= m.length) return m[m.length - 1].y + ROW_H / 2;
    return (m[index - 1].y + m[index].y) / 2;
  }

  private gapIndexAt(localY: number): number {
    let idx = 0;
    for (const m of this.mainNodesCache) { if (localY > m.y) idx++; else break; }
    return idx;
  }

  build() {
    const partes = this.song.partes, ramas = this.song.ramas ?? [];
    const N = partes.length;
    const nodes: GNode[] = [];

    const rowY = (r: number) => PAD_T + NODE_R + r * ROW_H;
    const isActive = (r: { activa: boolean }) => r.activa !== false;
    /** nº de partes de la línea oficial que una rama sustituye (0 si solo se inserta). */
    const spanOf = (r: { desde: number; hasta: number }) => {
      const hastaIdx = r.hasta >= N ? N : r.hasta;
      return Math.max(0, hastaIdx - r.desde - 1);
    };

    // --- filas: las ramas más largas que su tramo empujan hacia abajo la reconciliación ---
    const extraBefore = new Array(N).fill(0);
    for (const rama of ramas) {
      if (rama.hasta >= N) continue;
      extraBefore[rama.hasta] += Math.max(0, rama.partes.length - spanOf(rama));
    }
    const mainRow: number[] = [];
    let row = 0;
    for (let mi = 0; mi < N; mi++) { row += extraBefore[mi] || 0; mainRow[mi] = row; row++; }
    const addRow = N ? mainRow[N - 1] + 1 : 0;

    const branchRows = new Map<string, number[]>();
    const extraCursor = new Array(N).fill(0);
    let bottomRow = addRow;
    for (const rama of ramas) {
      const S = spanOf(rama), bn = rama.partes.length;
      const openEnd = rama.hasta >= N;
      const rows: number[] = [];
      for (let bi = 0; bi < bn; bi++) {
        if (bi < S) rows.push(mainRow[rama.desde + 1 + bi]);
        else if (openEnd) rows.push(addRow + (bi - S));
        else {
          const base = mainRow[rama.hasta] - (extraBefore[rama.hasta] || 0) + extraCursor[rama.hasta];
          rows.push(base + (bi - S));
        }
      }
      if (!openEnd) extraCursor[rama.hasta] += Math.max(0, bn - S);
      branchRows.set(rama.id, rows);
      if (rows.length) bottomRow = Math.max(bottomRow, Math.max(...rows) + 1);
    }

    // --- carriles: ramas con filas solapadas → carriles distintos, alternando izquierda/derecha ---
    const ramaLane = new Map<string, number>();
    const laneMaxRow: number[] = [];
    for (const rama of ramas) {
      const rs = branchRows.get(rama.id)!;
      if (!rs.length) { ramaLane.set(rama.id, 0); continue; }
      const lo = Math.min(...rs), hi = Math.max(...rs);
      let lane = 0;
      while (lane < laneMaxRow.length && laneMaxRow[lane] >= lo) lane++;
      ramaLane.set(rama.id, lane);
      laneMaxRow[lane] = hi;
    }
    let maxLeft = -1, maxRight = -1;
    for (const lane of ramaLane.values()) {
      if (lane % 2 === 0) maxLeft = Math.max(maxLeft, lane >> 1);
      else maxRight = Math.max(maxRight, lane >> 1);
    }

    // --- geometría horizontal: línea principal centrada; alternativas a ambos lados ---
    const sideExt = (maxDepth: number) => maxDepth < 0 ? 0 : LANE_GAP + maxDepth * COL_W + 2 * NODE_R + LBL_GAP + LBL_W;
    const leftExt = Math.max(sideExt(maxLeft), NODE_R + 16);
    const rightExt = (NODE_R + LBL_GAP + LBL_W) + sideExt(maxRight);
    const mx = Math.max(leftExt, rightExt) + 8;
    const w = 2 * mx;
    const laneNodeX = (lane: number) => {
      const depth = lane >> 1;
      return lane % 2 === 0
        ? mx - LANE_GAP - depth * COL_W
        : mx + NODE_R + LBL_GAP + LBL_W + LANE_GAP + depth * COL_W;
    };
    const mainLabel = (x: number): [number, number, boolean] => [x + NODE_R + LBL_GAP, LBL_W, false];
    const laneLabel = (x: number, lane: number): [number, number, boolean] =>
      lane % 2 === 0 ? [x - NODE_R - LBL_GAP - LBL_W, LBL_W, true] : [x + NODE_R + LBL_GAP, LBL_W, false];

    // --- nodos ---
    partes.forEach((part, mi) => {
      const shadowed = ramas.some(r => isActive(r) && r.desde < mi && mi < r.hasta);
      const [lx, lw, lr] = mainLabel(mx);
      nodes.push({ key: 'm' + mi, x: mx, y: rowY(mainRow[mi]), color: part.color, kind: 'main', mainIndex: mi, part, shadowed, lx, lw, lr });
    });
    for (const rama of ramas) {
      const rs = branchRows.get(rama.id)!, last = rama.partes.length - 1;
      const lane = ramaLane.get(rama.id) ?? 0;
      const rx = laneNodeX(lane);
      const [lx, lw, lr] = laneLabel(rx, lane);
      rama.partes.forEach((bp, bi) => {
        const kind: NodeKind = rama.partes.length === 1 ? 'branch-single'
          : bi === 0 ? 'branch-first' : bi === last ? 'branch-last' : 'branch-mid';
        nodes.push({ key: rama.id + '-' + bi, x: rx, y: rowY(rs[bi]), color: bp.color, kind, ramaId: rama.id, partIndex: bi, part: bp, active: isActive(rama), lx, lw, lr });
      });
    }

    // --- aristas ---
    const edges: GEdge[] = [];
    if (N > 1) edges.push({ d: `M${mx},${rowY(mainRow[0])} L${mx},${rowY(mainRow[N - 1])}`, color: '#c9bdb2' });
    for (const rama of ramas) {
      const bnodes = nodes.filter(n => n.ramaId === rama.id);
      if (!bnodes.length) continue;
      const rx = bnodes[0].x;
      const col = rama.partes[0]?.color || '#910000';
      const dim = !isActive(rama);
      const dfrom = Math.max(0, Math.min(rama.desde, N - 1));
      const y0 = rowY(mainRow[dfrom]);
      const yFirst = bnodes[0].y, yLast = bnodes[bnodes.length - 1].y;
      edges.push({ d: `M${mx},${y0} C${mx},${(y0 + yFirst) / 2} ${rx},${(y0 + yFirst) / 2} ${rx},${yFirst}`, color: col, dim });
      if (bnodes.length > 1) edges.push({ d: `M${rx},${yFirst} L${rx},${yLast}`, color: col, dim });
      if (rama.hasta < N) {
        const ym = rowY(mainRow[rama.hasta]);
        edges.push({ d: `M${rx},${yLast} C${rx},${(yLast + ym) / 2} ${mx},${(yLast + ym) / 2} ${mx},${ym}`, color: col, dim });
      } else {
        edges.push({ d: `M${rx},${yLast} l0,18`, color: col, dim });
      }
    }

    this.mainNodesCache = nodes.filter(n => n.kind === 'main');

    const addY = rowY(addRow);
    const [alx, alw, alr] = mainLabel(mx);
    nodes.push({ key: 'add', x: mx, y: addY, color: 'var(--blue)', kind: 'add', lx: alx, lw: alw, lr: alr });
    if (N) edges.push({ d: `M${mx},${rowY(mainRow[N - 1])} L${mx},${addY}`, color: '#d9cfc4' });

    return {
      nodes, edges, w, mainX: mx,
      h: rowY(Math.max(bottomRow, addRow)) + NODE_R + PAD_T,
    };
  }

  /** `fromNode` = el gesto empezó en la bola (permite arrastrar). Desde el texto solo toque/menú. */
  down(e: PointerEvent, node: GNode, fromNode: boolean) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const isMouse = e.pointerType === 'mouse';
    e.stopPropagation();
    const svg = (e.currentTarget as Element).closest('.graph')!.querySelector('svg')!;
    const svgTop = svg.getBoundingClientRect().top;
    const listen = () => {
      window.addEventListener('pointermove', this.move);
      window.addEventListener('pointerup', this.up);
      window.addEventListener('pointercancel', this.up);
    };
    if (node.kind === 'add') {
      // desde la bola: arrastrar = insertar / toque = añadir. Desde el texto: solo toque = añadir.
      this.press = { node, x0: e.clientX, y0: e.clientY, svgTop, fromNode, mode: fromNode ? 'add' : 'idle', timer: 0 };
      listen();
      return;
    }
    this.press = {
      node, x0: e.clientX, y0: e.clientY, svgTop, fromNode, mode: 'idle',
      timer: window.setTimeout(() => {
        if (!this.press) return;
        // Arrastrar para reordenar es solo de ratón (escritorio): en táctil el dedo
        // se mueve al mantener pulsado y el gesto no llega a completarse nunca.
        // En móvil la pulsación larga siempre abre el menú (que lleva «Subir/Bajar»).
        if (isMouse && this.press.fromNode && node.kind !== 'add') {
          this.press.mode = node.kind === 'main' ? 'reorder'
            : (node.kind === 'branch-first' ? 'from' : 'to');
          this.dragKey.set(node.key);
          this.dragX.set(node.x); this.dragY.set(node.y);
        } else {
          // pulsación larga → menú (sin arrastre)
          this.press.mode = 'menu';
        }
      }, 300),
    };
    listen();
  }

  private move = (e: PointerEvent) => {
    const p = this.press;
    if (!p) return;
    const dist = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
    if (p.mode === 'idle' || p.mode === 'menu') {
      // moverse antes de que salte el arrastre/menú = está haciendo scroll → cancelar
      if (dist > 10) { clearTimeout(p.timer); this.end(); }
      return;
    }
    if (p.mode === 'add') {
      if (!p.fromNode) { if (dist > 10) { clearTimeout(p.timer); this.end(); } return; }
      if (dist <= 8 && !this.insertGhost()) return;
      e.preventDefault();
      const y = e.clientY - p.svgTop;
      this.dragKey.set('add');
      this.dragX.set(p.node.x);
      this.dragY.set(y);
      this.insertGhost.set({ y: Math.max(4, y), index: this.gapIndexAt(y) });
      return;
    }
    e.preventDefault();
    const localY = e.clientY - p.svgTop;
    this.dragX.set(p.node.x);
    this.dragY.set(localY);

    let best: GNode | null = null, bestD = Infinity;
    for (const m of this.mainNodesCache) {
      const d = Math.abs(m.y - localY);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (p.mode === 'reorder') {
      this.snapIndex = best ? best.mainIndex! : 0;
      this.snapY.set(best ? best.y : null);
    } else if (p.mode === 'from') {
      this.snapIndex = best ? best.mainIndex! : 0;
      this.snapY.set(best ? best.y : null);
    } else {
      const lastMain = this.mainNodesCache[this.mainNodesCache.length - 1];
      if (lastMain && localY > lastMain.y + ROW_H * 0.6) {
        this.snapIndex = this.song.partes.length;
        this.snapY.set(lastMain.y + ROW_H);
      } else {
        this.snapIndex = best ? best.mainIndex! : this.song.partes.length;
        this.snapY.set(best ? best.y : null);
      }
    }
  };

  private up = (e: PointerEvent) => {
    const p = this.press;
    const ghost = this.insertGhost();
    this.end();
    if (!p) return;
    if (p.mode === 'menu') { this.maybeMenu(p, e); return; }
    if (p.mode === 'add') {
      if (ghost) this.insertPart.emit({ index: ghost.index });
      else this.addPart.emit();
      return;
    }
    if (p.mode === 'idle') {
      if (p.node.kind === 'add') { this.addPart.emit(); return; }
      // toque simple = escuchar la parte; para editar, mantén pulsado → menú
      this.playPart.emit({
        ramaId: p.node.ramaId ?? null,
        index: p.node.kind === 'main' ? p.node.mainIndex! : p.node.partIndex!,
      });
      return;
    }
    const target = this.snapIndex;
    this.snapIndex = null;
    this.snapY.set(null);
    if (target === null) { this.maybeMenu(p, e); return; }

    if (p.mode === 'reorder') {
      const from = p.node.mainIndex!, to = Math.min(target, this.song.partes.length - 1);
      if (from !== to) {
        const arr = [...this.song.partes];
        const [m] = arr.splice(from, 1);
        arr.splice(to, 0, m);
        this.song.partes = arr;
        for (const r of this.song.ramas) {
          r.desde = this.remap(r.desde, from, to);
          r.hasta = this.remap(r.hasta, from, to);
        }
        this.changed.emit();
      } else {
        this.maybeMenu(p, e);
      }
    } else {
      const rama = this.song.ramas.find(r => r.id === p.node.ramaId);
      if (!rama) return;
      if (p.mode === 'from') {
        rama.desde = Math.max(0, Math.min(target, rama.hasta - 1));
      } else {
        rama.hasta = Math.max(rama.desde + 1, Math.min(target, this.song.partes.length));
      }
      this.changed.emit();
    }
  };

  private maybeMenu(p: NonNullable<typeof this.press>, e: PointerEvent) {
    this.menu.emit({
      ramaId: p.node.ramaId ?? null,
      index: p.node.kind === 'main' ? p.node.mainIndex! : p.node.partIndex!,
      x: Math.min(e.clientX, window.innerWidth - 210),
      y: Math.min(e.clientY, window.innerHeight - 170),
    });
  }

  private remap(v: number, from: number, to: number) {
    if (v === from) return to;
    if (from < to && v > from && v <= to) return v - 1;
    if (from > to && v >= to && v < from) return v + 1;
    return v;
  }

  private end() {
    if (this.press) clearTimeout(this.press.timer);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    this.press = undefined;
    this.dragKey.set(null);
    this.snapY.set(null);
    this.insertGhost.set(null);
  }
}
