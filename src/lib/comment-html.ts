import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

/** Render CLI Markdown and existing rich-editor HTML without changing stored content. */
export function commentHtml(content: string, html?: string | null, visibleOnly = false): string {
  // RETURN_DOM with the default HTML options returns a body element.
  const rendered = DOMPurify.sanitize(html || marked.parse(content, { async: false, gfm: true, breaks: true }), { RETURN_DOM: true }) as HTMLBodyElement;
  for (const preview of rendered.querySelectorAll('div[data-type="link-preview"][data-url]')) {
    const url = preview.getAttribute('data-url');
    if (!url) continue;
    const escapedUrl = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    preview.replaceChildren(DOMPurify.sanitize(`<a href="${escapedUrl}">${escapedUrl}</a>`, { RETURN_DOM_FRAGMENT: true }));
  }
  if (visibleOnly) {
    for (const element of rendered.querySelectorAll<HTMLElement>('*')) {
      if (element.hidden || element.style.display === 'none' || element.style.visibility === 'hidden' || element.style.visibility === 'collapse' || element.style.opacity === '0') element.remove();
    }
  }
  return DOMPurify.sanitize(rendered.innerHTML);
}
