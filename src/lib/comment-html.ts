import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

/** Render CLI Markdown and existing rich-editor HTML without changing stored content. */
export function commentHtml(content: string, html?: string | null, board = false): string {
  const restrictions = board ? {
    ALLOWED_TAGS: ['a', 'p', 'div', 'span', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'b', 'em', 'i', 's', 'del', 'u', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'title', 'style'],
    ALLOW_DATA_ATTR: false,
  } : {};
  let source = html || marked.parse(content, { async: false, gfm: true, breaks: true });
  if (board) {
    const inertDocument = (DOMPurify.sanitize('', { RETURN_DOM: true }) as HTMLBodyElement).ownerDocument;
    const template = inertDocument.createElement('template');
    template.innerHTML = source;
    for (const element of template.content.querySelectorAll('[style]')) {
      const color = (element as HTMLElement).style.color;
      element.removeAttribute('style');
      if (/^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]{1,20}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\))$/i.test(color)) {
        element.setAttribute('style', `color: ${color}`);
      }
    }
    for (const media of template.content.querySelectorAll('img, picture, video, audio, source, iframe, embed, object')) {
      const image = media.querySelector('img');
      const url = media.getAttribute('src') || media.querySelector('source')?.getAttribute('src') || image?.getAttribute('src') || media.getAttribute('data') || media.getAttribute('poster');
      const label = media.getAttribute('alt') || image?.getAttribute('alt') || media.textContent?.trim() || (media.tagName.toLowerCase() === 'img' ? 'Image' : 'Media');
      if (url) {
        const link = inertDocument.createElement('a');
        link.setAttribute('href', url);
        link.textContent = label;
        media.replaceWith(link);
      } else {
        media.replaceWith(inertDocument.createTextNode(label));
      }
    }
    for (const element of template.content.querySelectorAll('style, link, script, meta, base')) element.remove();
    for (const element of template.content.querySelectorAll('*')) {
      for (const attribute of ['src', 'srcset', 'poster', 'background', 'data', 'xlink:href']) element.removeAttribute(attribute);
      if (element.localName !== 'a') element.removeAttribute('href');
    }
    source = template.innerHTML;
  }
  // RETURN_DOM with the default HTML options returns a body element.
  const rendered = DOMPurify.sanitize(source, { ...restrictions, RETURN_DOM: true }) as HTMLBodyElement;
  for (const preview of rendered.querySelectorAll('div[data-type="link-preview"][data-url]')) {
    const url = preview.getAttribute('data-url');
    if (!url) continue;
    const escapedUrl = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    preview.replaceChildren(DOMPurify.sanitize(`<a href="${escapedUrl}">${escapedUrl}</a>`, { RETURN_DOM_FRAGMENT: true }));
  }
  return DOMPurify.sanitize(rendered.innerHTML, restrictions);
}
