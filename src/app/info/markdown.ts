import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const VIDEO = /\.(mp4|webm)$/i;
const AUDIO = /\.(mp3|m4a|wav|ogg)$/i;
const YOUTUBE = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * La sintaxis de imagen `![pie](url)` incrusta, según la URL: imagen, vídeo, audio o vídeo de YouTube.
 * Se emite con <span> (no <figure>) porque marked la envuelve en un <p>.
 */
marked.use({
  renderer: {
    image({ href, text }) {
      const url = esc(href);
      const caption = text ? `<span class="md-cap">${esc(text)}</span>` : '';
      const yt = YOUTUBE.exec(href);
      if (yt) {
        return `<span class="md-media md-embed"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="${esc(text || 'Vídeo')}" loading="lazy" allowfullscreen></iframe>${caption}</span>`;
      }
      const path = href.split(/[?#]/)[0];
      if (VIDEO.test(path)) return `<span class="md-media"><video controls preload="metadata" playsinline src="${url}"></video>${caption}</span>`;
      if (AUDIO.test(path)) return `<span class="md-media md-audio">${caption}<audio controls preload="metadata" src="${url}"></audio></span>`;
      return `<span class="md-media"><img src="${url}" alt="${esc(text)}" loading="lazy">${caption}</span>`;
    },
  },
});

// Solo se admite el iframe de YouTube (nocookie); cualquier otro se elimina.
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe' && !(node as Element).getAttribute('src')?.startsWith('https://www.youtube-nocookie.com/embed/')) {
    node.parentNode?.removeChild(node);
  }
});
// Los enlaces del contenido se abren en pestaña nueva sin dar acceso a la ventana de origen.
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Convierte Markdown en HTML saneado (el contenido lo edita un administrador pero se trata como no confiable). */
export function renderMarkdown(source: string | null | undefined): string {
  const html = marked.parse(source ?? '', { async: false }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allowfullscreen', 'controls', 'playsinline', 'preload', 'loading'],
  });
}

export const MEDIA_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg,.mp4,.webm';
