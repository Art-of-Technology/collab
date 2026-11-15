/**
 * Third-Party App API: Documentation
 * GET /api/apps/auth/docs?query=...&limit=... - Search the published documentation
 * GET /api/apps/auth/docs?slug=...            - One page as Markdown, with its headings
 *
 * The same pages and the same search as /docs in the browser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAppAuth } from '@/lib/apps/auth-middleware';
import { docPage, docsIndex } from '@/lib/docs';
import { searchDocs, type DocsIndexEntry } from '@/lib/docs-search';

// The pages are files in the image, so the index is read once per server process, and the search built on it is reused.
let index: DocsIndexEntry[] | undefined;

export const GET = withAppAuth(
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    if (slug !== null) {
      const page = docPage(slug);
      return page
        ? NextResponse.json(page)
        : NextResponse.json({ error: 'not_found', error_description: 'No documentation page has that slug.' }, { status: 404 });
    }
    const query = searchParams.get('query');
    if (!query?.trim()) {
      return NextResponse.json({ error: 'invalid_request', error_description: 'Supply query to search, or slug to read a page.' }, { status: 400 });
    }
    // 8 when no number is given; any number is cut to a whole one from 1 to 20, so 0 asks for one hit, not eight.
    const given = searchParams.get('limit');
    const asked = given?.trim() ? Number(given) : NaN;
    const limit = Number.isNaN(asked) ? 8 : Math.min(20, Math.max(1, Math.trunc(asked)));
    return NextResponse.json({ results: searchDocs(index ??= docsIndex(), query, limit) });
  },
  // The documentation is public: any valid token may read it, whatever its scopes.
  { requiredScopes: [] }
);
