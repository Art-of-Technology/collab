import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

/** Render CLI Markdown and existing rich-editor HTML without changing stored content. */
export function commentHtml(content: string, html?: string | null): string {
  const rendered = DOMPurify.sanitize(html || marked.parse(content, { async: false, gfm: true, breaks: true }), { RETURN_DOM: true });
  for (const preview of rendered.querySelectorAll('div[data-type="link-preview"][data-url]')) {
    const url = preview.getAttribute('data-url');
    if (!url) continue;
    const link = rendered.ownerDocument.createElement('a');
    link.setAttribute('href', url);
    link.textContent = url;
    preview.replaceChildren(link);
  }
  return DOMPurify.sanitize(rendered.innerHTML);
}
