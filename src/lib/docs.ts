import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lexer, type Token } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// Published documentation: Markdown files in content/docs, listed in content/docs/nav.json.
// The page, the plain Markdown, the index files, the search and the MCP tools all read it through here,
// so what a person sees and what an agent reads cannot differ.

export type DocHeading = { depth: 2 | 3; text: string; id: string };
export type DocPage = { slug: string; title: string; summary: string; markdown: string; headings: DocHeading[] };
export type DocsNavSection = { title: string; pages: { slug: string; title: string }[] };

// A slug is a path of lower-case words, so it can never name a file outside the folder.
const SLUG = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;
const root = () => join(process.cwd(), 'content', 'docs');

/** The address of a page for people. The page "index" is /docs itself. */
export const docHref = (slug: string) => (slug === 'index' ? '/docs' : `/docs/${slug}`);

// The words of a heading or paragraph without their inline Markdown: links keep their text, code and emphasis lose their marks.
const words = (tokens: Token[] = []): string => tokens.map(token => {
  if (token.type === 'html') return '';
  if ('tokens' in token && token.tokens) return words(token.tokens);
  if (token.type === 'text') return DOMPurify.sanitize(token.text.replace(/</g, '&lt;'), { RETURN_DOM: true }).textContent ?? '';
  return 'text' in token ? token.text : ' ';
}).join('');
const plain = (tokens?: Token[]) => words(tokens).replace(/\s+/g, ' ').trim();

// A heading may end with {#custom-id}. That id is used as written, so a heading can be reworded
// without breaking the addresses that already link to it.
const CUSTOM_ID = /\s*\{#([a-z0-9_-]+)\}\s*$/;
export const headingText = (text: string) => text.replace(CUSTOM_ID, '').trim();

export function headingId(text: string, seen: Map<string, number>, customId: string | null = text.match(CUSTOM_ID)?.[1] ?? null): string {
  const base = customId
    ?? (text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'section');
  let count = (seen.get(base) ?? 0) + 1;
  let id = count === 1 ? base : `${base}-${count}`;
  // "Example" twice and then "Example 2" would both want example-2.
  while (id !== base && seen.has(id)) id = `${base}-${++count}`;
  seen.set(base, count);
  if (id !== base) seen.set(id, 1);
  return id;
}

export function docPage(slug: string): DocPage | null {
  if (!SLUG.test(slug)) return null;
  let markdown: string;
  try {
    markdown = readFileSync(join(root(), `${slug}.md`), 'utf8');
  } catch {
    return null;
  }

  // Read with a Markdown parser, not line by line: code blocks, lists, quotes and rules are never mistaken
  // for a heading or for the summary. Only blocks at the top level of the page count.
  const headings: DocHeading[] = [];
  const seen = new Map<string, number>();
  let title: string | null = null;
  let summary: string | null = null;
  for (const token of lexer(markdown)) {
    if (token.type === 'heading') {
      const text = plain(token.tokens);
      if (token.depth === 1) title ??= text;
      else if (token.depth === 2 || token.depth === 3) {
        // The marker counts only as plain text at the end of the heading, not inside code, a link or emphasis.
        const last = token.tokens?.at(-1);
        const customId = last?.type === 'text' ? last.raw.match(CUSTOM_ID)?.[1] ?? null : null;
        headings.push({ depth: token.depth, text: customId ? headingText(text) : text, id: headingId(text, seen, customId) });
      }
    } else if (token.type === 'paragraph' && title !== null) {
      summary ??= plain(token.tokens);
    }
  }
  return { slug, title: title ?? '', summary: summary ?? '', markdown, headings };
}

function navSlugs(): { title: string; pages: string[] }[] {
  return JSON.parse(readFileSync(join(root(), 'nav.json'), 'utf8'));
}

function listed(slug: string): DocPage {
  const page = docPage(slug);
  if (!page) throw new Error(`content/docs/nav.json lists "${slug}", but content/docs/${slug}.md does not exist`);
  return page;
}

export function docsNav(): DocsNavSection[] {
  return navSlugs().map(section => ({
    title: section.title,
    pages: section.pages.map(slug => ({ slug, title: listed(slug).title })),
  }));
}

export function allDocs(): DocPage[] {
  return navSlugs().flatMap(section => section.pages.map(listed));
}
