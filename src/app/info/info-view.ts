import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { renderMarkdown } from './markdown';

/** Renderiza Markdown con el estilo de la web. Se usa en la pestaña Información y en la vista previa del editor. */
@Component({
  selector: 'app-info-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
@if (html()) {
  <div class="md-doc" [innerHTML]="html()"></div>
} @else {
  <div class="md-empty">{{ emptyText() }}</div>
}
  `,
  styles: [`
.md-doc{color:var(--ink);font-size:15px;line-height:1.7;overflow-wrap:anywhere}
.md-doc>*:first-child{margin-top:0}.md-doc>*:last-child{margin-bottom:0}
.md-doc h1,.md-doc h2,.md-doc h3,.md-doc h4{line-height:1.25;color:var(--ink);letter-spacing:-.01em}
.md-doc h1{font-size:28px;margin:0 0 18px}
.md-doc h2{font-size:21px;margin:34px 0 14px;padding:0 0 9px 14px;border-bottom:1px solid var(--border);position:relative}
.md-doc h2::before{content:"";position:absolute;left:0;top:2px;bottom:11px;width:5px;border-radius:4px;background:var(--blue)}
.md-doc h3{font-size:16px;margin:26px 0 8px;color:var(--blue);text-transform:uppercase;letter-spacing:.9px;font-weight:800}
.md-doc h4{font-size:15px;margin:20px 0 6px}
.md-doc p{margin:0 0 14px}
.md-doc strong{font-weight:700}
.md-doc a{color:var(--blue);font-weight:600;text-decoration:underline;text-decoration-color:var(--tint-border);text-underline-offset:3px}
.md-doc a:hover{text-decoration-color:var(--blue)}
.md-doc ul,.md-doc ol{margin:0 0 16px;padding:0;list-style:none}
.md-doc li{position:relative;padding:3px 0 3px 28px}
.md-doc ul>li::before{content:"";position:absolute;left:9px;top:.95em;width:7px;height:7px;border-radius:50%;background:var(--blue)}
.md-doc ol{counter-reset:md}.md-doc ol>li{counter-increment:md}
.md-doc ol>li::before{content:counter(md);position:absolute;left:0;top:4px;width:21px;height:21px;border-radius:50%;background:var(--tint);color:var(--blue);font-size:11px;font-weight:800;display:grid;place-items:center}
.md-doc li>ul,.md-doc li>ol{margin:4px 0 4px}
.md-doc blockquote{margin:18px 0;padding:14px 18px;background:color-mix(in srgb,var(--gold) 38%,#fff);border:1px solid color-mix(in srgb,var(--gold) 80%,#c9a24a);border-left:5px solid var(--blue);border-radius:10px;color:var(--ink)}
.md-doc blockquote>*:last-child{margin-bottom:0}
.md-doc code{font-family:ui-monospace,Consolas,monospace;font-size:.88em;background:var(--tint);color:var(--tint-ink);padding:2px 6px;border-radius:6px}
.md-doc pre{background:#2a1418;color:#f7e9dc;padding:14px 16px;border-radius:10px;overflow:auto;margin:0 0 16px}
.md-doc pre code{background:none;color:inherit;padding:0}
.md-doc hr{border:0;height:1px;background:var(--border);margin:28px 0}
.md-doc .md-media{display:block;margin:18px 0}
.md-doc .md-media img,.md-doc .md-media video{display:block;max-width:100%;height:auto;border-radius:12px;border:1px solid var(--border);background:#2a1418;box-shadow:0 2px 10px #0000001a}
.md-doc .md-embed iframe{display:block;width:100%;aspect-ratio:16/9;border:1px solid var(--border);border-radius:12px;background:#2a1418}
.md-doc .md-audio{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px}
.md-doc .md-audio audio{display:block;width:100%}
.md-doc .md-cap{display:block;margin-top:8px;font-size:12px;color:var(--muted);text-align:center}
.md-doc .md-audio .md-cap{margin:0 0 8px;text-align:left;font-weight:700;color:var(--ink);font-size:13px}
.md-doc table{width:100%;border-collapse:separate;border-spacing:0;margin:0 0 18px;border:1px solid var(--border);border-radius:10px;overflow:hidden;font-size:14px}
.md-doc th{background:#faf6f0;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.6px;text-align:left}
.md-doc th,.md-doc td{padding:10px 14px;border-bottom:1px solid var(--border)}
.md-doc tr:last-child td{border-bottom:0}
.md-empty{border:1px dashed var(--border);border-radius:10px;text-align:center;color:var(--muted);padding:28px;font-size:13px}
  `],
})
export class InfoView {
  markdown = input<string>('');
  emptyText = input('Aún no hay información publicada.');
  private sanitizer = inject(DomSanitizer);
  // renderMarkdown ya sanea con DOMPurify; el saneador de Angular eliminaría vídeo, audio y el iframe de YouTube.
  html = computed(() => {
    const html = renderMarkdown(this.markdown());
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : '';
  });
}
