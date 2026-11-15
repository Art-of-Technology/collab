import { allDocs } from '@/lib/docs';

// Every page of the navigation, in navigation order, as one Markdown file.
export const dynamic = 'force-static';

export function GET() {
  const text = allDocs().map(page => page.markdown.trim()).join('\n\n');
  return new Response(`${text}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
