import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { InfoService } from './info.service';
import { InfoView } from './info-view';

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

@Component({
  selector: 'app-info-editor',
  imports: [InfoView, DatePipe],
  template: `
<section class="card info-editor">
  <header class="ie-head">
    <div class="ie-icon">✎</div>
    <div class="ie-title">
      <p>SECCIÓN INFORMACIÓN</p>
      <h2>Tips e información del repertorio</h2>
      <span>Escribe en Markdown. La vista previa es lo que verán los socios en la pestaña <b>Información</b> de cada canción.</span>
    </div>
  </header>

  <div class="ie-toolbar" role="toolbar" aria-label="Formato">
    @for (a of actions; track a.title) {
      <button type="button" [title]="a.title" [attr.aria-label]="a.title" (click)="apply(a)"><span [class.b]="a.label==='B'" [class.i]="a.label==='I'">{{ a.label }}</span></button>
    }
    <div class="ie-mode" role="tablist">
      <button type="button" [class.on]="mode()==='write'" (click)="mode.set('write')">Escribir</button>
      <button type="button" [class.on]="mode()==='preview'" (click)="mode.set('preview')">Vista previa</button>
    </div>
  </div>

  <div class="ie-panes" [attr.data-mode]="mode()">
    <div class="ie-pane ie-write">
      <textarea #ta [value]="draft()" (input)="draft.set(ta.value)" (keydown)="onKey($event)"
        spellcheck="true" placeholder="## Un título&#10;&#10;Escribe aquí en Markdown…" aria-label="Contenido en Markdown"></textarea>
    </div>
    <div class="ie-pane ie-preview">
      <span class="ie-tag">Vista previa</span>
      <app-info-view [markdown]="draft()" emptyText="La vista previa aparecerá aquí." />
    </div>
  </div>

  <footer class="ie-foot">
    <span class="ie-state">
      @if (error()) { <span class="err">{{ error() }}</span> }
      @else if (dirty()) { Cambios sin guardar }
      @else if (info.updatedAt()) { Guardado · {{ info.updatedAt() | date:'dd/MM/yyyy HH:mm' }} }
    </span>
    <button type="button" class="ie-ghost" (click)="revert()" [disabled]="!dirty() || saving()">Descartar</button>
    <button type="button" class="primary-btn" (click)="save()" [disabled]="!dirty() || saving()">{{ saving() ? 'Guardando…' : 'Guardar información' }}</button>
  </footer>
</section>
  `,
  styles: [`
:host{display:block}
.info-editor{padding:20px;display:grid;gap:14px}
.ie-head{display:flex;gap:12px;align-items:flex-start}
.ie-icon{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:9px;background:var(--tint);color:var(--blue);font-size:20px}
.ie-title p{font-size:10px;letter-spacing:1.3px;font-weight:bold;color:var(--blue);margin:0 0 3px}
.ie-title h2{margin:0 0 4px;font-size:18px}
.ie-title span{font-size:12px;color:var(--muted)}
.ie-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ie-toolbar>button{min-width:34px;height:34px;padding:0 9px;border:1px solid var(--border);background:#fff;color:var(--ink);border-radius:8px;cursor:pointer;font-size:13px;font-weight:700}
.ie-toolbar>button:hover{background:var(--tint);border-color:var(--tint-border);color:var(--blue)}
.ie-toolbar .b{font-weight:900}.ie-toolbar .i{font-style:italic;font-family:Georgia,serif}
.ie-mode{margin-left:auto;display:none;background:#f2ede6;border-radius:9px;padding:3px;gap:2px}
.ie-mode button{border:0;background:none;padding:6px 11px;border-radius:7px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer}
.ie-mode button.on{background:#fff;color:var(--blue);box-shadow:0 1px 3px #0000001a}
.ie-panes{display:grid;grid-template-columns:1fr 1fr;gap:14px;min-height:420px}
.ie-pane{min-width:0;border:1px solid var(--border);border-radius:10px;background:#fff}
.ie-write textarea{display:block;width:100%;height:100%;min-height:420px;border:0;border-radius:10px;resize:vertical;padding:16px;font-family:ui-monospace,Consolas,monospace;font-size:13.5px;line-height:1.65;background:#fffdf9;color:var(--ink);outline:none}
.ie-write:focus-within{border-color:var(--blue);box-shadow:0 0 0 3px var(--tint)}
.ie-preview{position:relative;padding:26px 24px 22px;overflow:auto;max-height:640px;background:var(--bg)}
.ie-tag{position:absolute;top:8px;right:12px;font-size:9px;letter-spacing:1px;text-transform:uppercase;font-weight:800;color:var(--muted)}
.ie-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.ie-state{margin-right:auto;font-size:12px;color:var(--muted)}.ie-state .err{color:#b91c1c;font-weight:bold}
.ie-ghost{border:1px solid var(--border);background:#fff;color:var(--muted);padding:11px 16px;border-radius:9px;font-weight:bold;cursor:pointer}
.ie-ghost:disabled{opacity:.5;cursor:default}
@media(max-width:900px){
  .ie-mode{display:flex}
  .ie-panes{grid-template-columns:1fr}
  .ie-panes[data-mode=write] .ie-preview,.ie-panes[data-mode=preview] .ie-write{display:none}
}
  `],
})
export class InfoEditor implements OnInit {
  info = inject(InfoService);
  actions = ACTIONS;

  private ta = viewChild.required<ElementRef<HTMLTextAreaElement>>('ta');
  draft = signal('');
  mode = signal<'write' | 'preview'>('write');
  saving = signal(false);
  error = signal('');
  dirty = computed(() => this.draft() !== this.info.content());

  ngOnInit() {
    this.info.load().subscribe({
      next: r => this.draft.set(r.content),
      error: () => this.error.set('No se pudo cargar la información.'),
    });
  }

  save() {
    if (!this.dirty() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.info.save(this.draft()).subscribe({
      next: () => this.saving.set(false),
      error: () => { this.saving.set(false); this.error.set('No se pudo guardar. Inténtalo de nuevo.'); },
    });
  }

  revert() {
    this.draft.set(this.info.content());
    this.error.set('');
  }

  onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); }
  }

  /** Inserta/envuelve la selección con la sintaxis Markdown de la acción. */
  apply(a: Action) {
    const el = this.ta().nativeElement;
    const value = el.value;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || a.placeholder;
    // Las acciones de bloque empiezan en línea nueva.
    const lead = a.block && start > 0 && value[start - 1] !== '\n' ? '\n' : '';
    const text = lead + a.before + selected + (a.after ?? '');
    const next = value.slice(0, start) + text + value.slice(end);
    this.draft.set(next);
    el.value = next;
    el.focus();
    const from = start + lead.length + a.before.length;
    el.setSelectionRange(from, from + selected.length);
  }
}
