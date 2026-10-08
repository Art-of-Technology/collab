import { NextRequest, NextResponse } from 'next/server';
import { withAppAuth } from '@/lib/apps/auth-middleware';
import { searchProjectContent } from '@/lib/agent-search';
import { SearchError, searchQuerySchema } from '@/lib/agent-search-query';

export const GET = withAppAuth(async (request: NextRequest, context) => {
  const params = new URL(request.url).searchParams;
  params.delete('workspace');
  params.delete('workspaceId');
  const query = searchQuerySchema.safeParse(Object.fromEntries(params));
  if (!query.success) return NextResponse.json({ error: 'invalid_query', error_description: query.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
  try {
    return NextResponse.json(await searchProjectContent(context, query.data));
  } catch (error) {
    if (error instanceof SearchError) return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
    console.error('Agent search failed');
    return NextResponse.json({ error: 'search_failed', error_description: 'Search is temporarily unavailable' }, { status: 503 });
  }
}, { requiredScopes: ['issues:read', 'context:read'], scopeMode: 'any' });
