import { docsIndex } from '@/lib/docs';

// The search index the browser fetches when the docs search is first opened. Built with the app, from the same
// loader the agent API searches, so there is no generated file to keep up to date.
export const dynamic = 'force-static';

export function GET() {
  return Response.json(docsIndex());
}
