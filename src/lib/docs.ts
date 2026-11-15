import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Lexer, type Token } from 'marked';

// Published documentation: Markdown files in content/docs, listed in content/docs/nav.json.
// The page, the plain Markdown, the index files, the search and the MCP tools all read it through here,
// so what a person sees and what an agent reads cannot differ.

export type DocHeading = { depth: 2 | 3; text: string; id: string };
export type DocPage = { slug: string; title: string; summary: string; markdown: string; headings: DocHeading[] };
export type DocsNavSection = { title: string; pages: { slug: string; title: string }[] };

// A slug is a path of lower-case words, so it can never name a file outside the folder.
const SLUG = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;
const root = () => join(process.cwd(), 'content', 'docs');

// Heading and summary text without its inline Markdown: links keep their words, code and emphasis lose their marks.
const plain = (text: string): string => {
  const words = (tokens: Token[]): string => tokens.map(token => {
    if ('tokens' in token && token.tokens) return words(token.tokens);
    return 'text' in token ? token.text : '';
  }).join('');
  return words(Lexer.lexInline(text)).trim();
};

export function headingId(text: string, seen: Map<string, number>): string {
  const base = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
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

  const headings: DocHeading[] = [];
  const seen = new Map<string, number>();
  const summary: string[] = [];
  let title = '';
  let fence = '';
  // Where the summary stands: before the title, looking for its paragraph, inside it, done.
  let stage: 'title' | 'gap' | 'summary' | 'done' = 'title';
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const mark = line.match(/^(`{3,}|~{3,})/)?.[1];
    if (!fence && mark) {
      fence = mark;
      if (stage === 'summary') stage = 'done';
      continue;
    }
    if (fence) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && line.slice(mark.length).trim() === '') fence = '';
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?$/);
    if (heading) {
      const depth = heading[1].length;
      if (depth === 1 && stage === 'title') {
        title = plain(heading[2]);
        stage = 'gap';
        continue;
      }
      if (stage === 'summary') stage = 'done';
      if (depth === 2 || depth === 3) {
        const text = plain(heading[2]);
        headings.push({ depth, text, id: headingId(text, seen) });
      }
      continue;
    }
    if (stage === 'gap' && line) stage = 'summary';
    if (stage === 'summary') {
      if (line) summary.push(line);
      else stage = 'done';
    }
  }
  return { slug, title, summary: plain(summary.join(' ')), markdown, headings };
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
