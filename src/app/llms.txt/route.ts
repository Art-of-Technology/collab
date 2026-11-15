import { allDocs, docsNav } from '@/lib/docs';

// The index an agent reads first: every page of the navigation with its summary and its Markdown address.
export const dynamic = 'force-static';

const escapeText = (text: string) => text.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '\\$&');

export function GET() {
  // Full addresses when the public address is known, so a link still works once it is copied out of this file.
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  const docs = allDocs();
  const summaries = new Map(docs.map(page => [page.slug, page.summary]));
  const lines = [
    `# ${escapeText(docs[0].title)}`,
    '',
    `> ${escapeText(docs[0].summary)}`,
    '',
    `Each link is a page as plain Markdown. All pages in one file: ${base}/llms-full.txt`,
    ...docsNav().flatMap(section => [
      '',
      `## ${escapeText(section.title)}`,
      '',
      ...section.pages.map(page => `- [${escapeText(page.title)}](${base}/docs/${page.slug}.md): ${escapeText(summaries.get(page.slug)!)}`),
    ]),
  ];
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
