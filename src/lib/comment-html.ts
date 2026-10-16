import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

/** Render CLI Markdown and existing rich-editor HTML without changing stored content. */
export function commentHtml(content: string, html?: string | null): string {
  return DOMPurify.sanitize(html || marked.parse(content, { async: false, gfm: true, breaks: true }));
}
