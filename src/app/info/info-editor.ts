import { Component, ElementRef, inject, input, model, signal, viewChild } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { DataService } from '../data.service';
import { InfoView } from './info-view';
import { MEDIA_ACCEPT } from './markdown';

interface Action { label: string; title: string; before: string; after?: string; placeholder: string; block?: boolean }

const ACTIONS: Action[] = [
  { label: 'H2', title: 'Título de sección', before: '## ', placeholder: 'Título', block: true },
  { label: 'H3', title: 'Subtítulo', before: '### ', placeholder: 'Subtítulo', block: true },
  { label: 'B', title: 'Negrita', before: '**', after: '**', placeholder: 'texto' },
  { label: 'I', title: 'Cursiva', before: '*', after: '*', placeholder: 'texto' },
  { label: '•', title: 'Lista', before: '- ', placeholder: 'Elemento', block: true },
  { label: '1.', title: 'Lista numerada', before: '1. ', placeholder: 'Paso', block: true },
  { label: '❝', title: 'Aviso destacado', before: '> ', placeholder: 'Importante', block: true },
  { label: '🔗', title: 'Enlace', before: '[', after: '](https://)', placeholder: 'texto del enlace' },
  { label: '―', title: 'Separador', before: '---\n', placeholder: '', block: true },
];

/** Editor Markdown con vista previa en vivo. El texto vive en la canción (two-way `markdown`) y se guarda con ella. */
@Component({
  selector: 'app-info-editor',
  imports: [InfoView],
  template: `
<section class="card info-editor">
  <header class="ie-head">
    <div class="ie-icon">✎</div>
    <div class="ie-title">
      <p>INFORMACIÓN DE LA CANCIÓN</p>
      <h2>Tips e indicaciones</h2>
      <span>Escribe en Markdown. La vista previa es lo que verán los socios en la pestaña <b>Información</b> de esta canción. Se guarda junto con la canción.</span>
    </div>
  </header>

  <div class="ie-toolbar" role="toolbar" aria-label="Formato">
    @for (a of actions; track a.title) {
      <button type="button" [title]="a.title" [attr.aria-label]="a.title" (click)="apply(a)"><span [class.b]="a.label==='B'" [class.i]="a.label==='I'">{{ a.label }}</span></button>
    }
    <span class="ie-sep"></span>
    <label class="ie-attach" [class.busy]="uploading()" title="Subir imagen, vídeo o audio e incrustarlo">
      <input type="file" multiple [accept]="accept" [disabled]="uploading()" (change)="onFiles($event)">
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/></svg>
      {{ uploading() ? 'Subiendo…' : 'Adjuntar' }}
    </label>
    <button type="button" title="Incrustar vídeo de YouTube" (click)="apply(youtube)">▶ YouTube</button>
    <div class="ie-mode" role="tablist">
      <button type="button" [class.on]="mode()==='write'" (click)="mode.set('write')">Escribir</button>
      <button type="button" [class.on]="mode()==='preview'" (click)="mode.set('preview')">Vista previa</button>
    </div>
  </div>

  @if (error()) { <div class="ie-error">{{ error() }}</div> }

  <div class="ie-panes" [attr.data-mode]="mode()">
    <div class="ie-pane ie-write" [class.drop]="dragging()">
      <textarea #ta [value]="markdown()" (input)="markdown.set(ta.value)"
        (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)" (paste)="onPaste($event)"
        spellcheck="true" placeholder="## Un título&#10;&#10;Escribe aquí en Markdown…&#10;Arrastra imágenes, vídeos o audios para incrustarlos." aria-label="Contenido en Markdown"></textarea>
    </div>
    <div class="ie-pane ie-preview">
      <span class="ie-tag">Vista previa</span>
      <app-info-view [markdown]="markdown()" emptyText="La vista previa aparecerá aquí." />
    </div>
  </div>
  <p class="ie-hint">Imágenes: <code>![pie](url)</code> · Vídeo, audio y YouTube usan la misma sintaxis: se detectan por la extensión o el enlace.</p>
</section>
  `,
  styles: [`
:host{display:block;container-type:inline-size}
.info-editor{padding:20px;display:grid;gap:14px}
.ie-head{display:flex;gap:12px;align-items:flex-start}
.ie-icon{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:9px;background:var(--tint);color:var(--blue);font-size:20px}
.ie-title p{font-size:10px;letter-spacing:1.3px;font-weight:bold;color:var(--blue);margin:0 0 3px}
.ie-title h2{margin:0 0 4px;font-size:18px}
.ie-title span{font-size:12px;color:var(--muted)}
.ie-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ie-toolbar>button,.ie-attach{min-width:34px;height:34px;padding:0 10px;border:1px solid var(--border);background:#fff;color:var(--ink);border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:6px;line-height:1}
.ie-toolbar>button:hover,.ie-attach:hover{background:var(--tint);border-color:var(--tint-border);color:var(--blue)}
.ie-attach input{display:none}.ie-attach.busy{opacity:.6;pointer-events:none}
.ie-sep{width:1px;height:22px;background:var(--border);margin:0 4px}
.ie-toolbar .b{font-weight:900}.ie-toolbar .i{font-style:italic;font-family:Georgia,serif}
.ie-mode{margin-left:auto;display:none;background:#f2ede6;border-radius:9px;padding:3px;gap:2px}
.ie-mode button{border:0;background:none;padding:6px 11px;border-radius:7px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer}
.ie-mode button.on{background:#fff;color:var(--blue);box-shadow:0 1px 3px #0000001a}
.ie-error{background:#fef2f2;color:#b91c1c;border:1px solid #f0c9c9;border-radius:8px;padding:9px 12px;font-size:12px;font-weight:bold}
.ie-panes{display:grid;grid-template-columns:1fr 1fr;gap:14px;min-height:420px}
.ie-pane{min-width:0;border:1px solid var(--border);border-radius:10px;background:#fff}
.ie-write textarea{display:block;width:100%;height:100%;min-height:420px;border:0;border-radius:10px;resize:vertical;padding:16px;font-family:ui-monospace,Consolas,monospace;font-size:13.5px;line-height:1.65;background:#fffdf9;color:var(--ink);outline:none}
.ie-write:focus-within{border-color:var(--blue);box-shadow:0 0 0 3px var(--tint)}
.ie-write.drop{border-color:var(--blue);border-style:dashed;background:var(--tint)}
.ie-preview{position:relative;padding:26px 24px 22px;overflow:auto;max-height:640px;background:var(--bg)}
.ie-tag{position:absolute;top:8px;right:12px;font-size:9px;letter-spacing:1px;text-transform:uppercase;font-weight:800;color:var(--muted)}
.ie-hint{margin:0;font-size:11px;color:var(--muted)}.ie-hint code{background:var(--tint);color:var(--tint-ink);padding:1px 5px;border-radius:5px}
@container (max-width: 860px){
  .ie-mode{display:flex}
  .ie-panes{grid-template-columns:1fr}
  .ie-panes[data-mode=write] .ie-preview,.ie-panes[data-mode=preview] .ie-write{display:none}
}
  `],
})
export class InfoEditor {
  private data = inject(DataService);

  markdown = model('');
  /** Devuelve el id de la canción, creándola antes si todavía no existe (hace falta para subir archivos). */
  ensureSong = input.required<() => Observable<number>>();

  actions = ACTIONS;
  youtube: Action = { label: '', title: '', before: '![', after: '](https://www.youtube.com/watch?v=)', placeholder: 'Título del vídeo', block: true };
  accept = MEDIA_ACCEPT;

  private ta = viewChild.required<ElementRef<HTMLTextAreaElement>>('ta');
  mode = signal<'write' | 'preview'>('write');
  uploading = signal(false);
  dragging = signal(false);
  error = signal('');

  /** Inserta/envuelve la selección con la sintaxis Markdown de la acción. */
  apply(a: Action) {
    const el = this.ta().nativeElement;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.slice(start, end) || a.placeholder;
    const lead = a.block && start > 0 && el.value[start - 1] !== '\n' ? '\n' : '';
    this.replace(el, start, end, lead + a.before + selected + (a.after ?? ''));
    const from = start + lead.length + a.before.length;
    el.setSelectionRange(from, from + selected.length);
  }

  onFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    this.uploadAll(Array.from(input.files ?? []));
    input.value = '';
  }

  onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    this.dragging.set(true);
  }

  onDrop(e: DragEvent) {
    this.dragging.set(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    this.uploadAll(files);
  }

  onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    this.uploadAll(files);
  }

  private uploadAll(files: File[]) {
    if (!files.length || this.uploading()) return;
    this.error.set('');
    this.uploading.set(true);
    // Las inserciones van detrás del cursor de ese momento, una tras otra.
    const run = (i: number) => {
      if (i >= files.length) { this.uploading.set(false); return; }
      this.ensureSong()().pipe(switchMap(id => this.data.uploadInfoMedia(id, files[i]))).subscribe({
        next: r => { this.insertBlock(`![${r.name.replace(/\.[^.]+$/, '')}](${r.url})`); run(i + 1); },
        error: err => {
          this.uploading.set(false);
          this.error.set(`No se pudo subir "${files[i].name}": ` + (err?.error?.message || err?.message || 'error desconocido'));
        },
      });
    };
    run(0);
  }

  private insertBlock(text: string) {
    const el = this.ta().nativeElement;
    const pos = el.selectionEnd;
    const lead = pos > 0 && el.value[pos - 1] !== '\n' ? '\n\n' : pos > 0 ? '\n' : '';
    this.replace(el, pos, pos, lead + text + '\n\n');
  }

  private replace(el: HTMLTextAreaElement, start: number, end: number, text: string) {
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    el.value = next;
    this.markdown.set(next);
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  }
}
