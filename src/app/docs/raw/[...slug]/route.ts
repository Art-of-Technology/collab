import { allDocs, docPage } from '@/lib/docs';

// A docs page as plain Markdown. People and agents reach it as /docs/<page>.md (the rewrite in next.config.js).
// Built ahead of time from the navigation, from the same loader call the page is rendered from.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return allDocs().map(page => ({ slug: page.slug.split('/') }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const page = docPage((await params).slug.join('/'));
  if (!page) return new Response('Not found\n', { status: 404 });
  return new Response(page.markdown, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
