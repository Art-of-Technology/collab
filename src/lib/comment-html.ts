import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

/** Render CLI Markdown and existing rich-editor HTML without changing stored content. */
export function commentHtml(content: string, html?: string | null): string {
  // RETURN_DOM with the default HTML options returns a body element.
  const rendered = DOMPurify.sanitize(html || marked.parse(content, { async: false, gfm: true, breaks: true }), { RETURN_DOM: true }) as HTMLBodyElement;
  for (const preview of rendered.querySelectorAll('div[data-type="link-preview"][data-url]')) {
    const url = preview.getAttribute('data-url');
    if (!url) continue;
    const escapedUrl = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    preview.replaceChildren(DOMPurify.sanitize(`<a href="${escapedUrl}">${escapedUrl}</a>`, { RETURN_DOM_FRAGMENT: true }));
  }
  return DOMPurify.sanitize(rendered.innerHTML);
}
