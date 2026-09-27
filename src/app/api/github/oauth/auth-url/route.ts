import { NextRequest, NextResponse } from 'next/server';
import { getGitHubAuthUrl } from '@/lib/github/oauth-config';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { createGitHubOAuthState, GITHUB_OAUTH_COOKIE, GITHUB_OAUTH_COOKIE_OPTIONS } from '@/lib/github/oauth-state';

// Legacy project: input is redirect metadata, never the provider-facing nonce.
export async function GET(request: NextRequest) {
  try {
    const actor = await getCurrentUser();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const input = searchParams.get('state') || '';
    if (searchParams.getAll('state').length > 1 || input.length > 264 || input === 'project:') {
      return NextResponse.json({ error: 'Invalid project state' }, { status: 400 });
    }
    const projectId = input.startsWith('project:') ? input.slice(8) : null;
    if (projectId && !await prisma.project.findFirst({
      where: { id: projectId, workspace: postWorkspaceAccessWhere(actor.id) }, select: { id: true },
    })) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const { state, cookie } = createGitHubOAuthState(actor.id, projectId);
    const response = NextResponse.json({ authUrl: getGitHubAuthUrl(state), state }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(GITHUB_OAUTH_COOKIE, cookie, GITHUB_OAUTH_COOKIE_OPTIONS);
    return response;
  } catch {
    return NextResponse.json({ error: 'Failed to generate authorization URL' }, { status: 500 });
  }
}
