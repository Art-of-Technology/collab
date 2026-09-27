import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { exchangeCodeForToken, getGitHubUser } from '@/lib/github/oauth-config';
import { prisma } from '@/lib/prisma';
import { EncryptionService } from '@/lib/encryption';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { readGitHubOAuthState, GITHUB_OAUTH_COOKIE, GITHUB_OAUTH_COOKIE_OPTIONS } from '@/lib/github/oauth-state';

export async function GET(request: NextRequest) {
  const redirectUrl = new URL('/projects', request.url);
  const finish = () => {
    const response = NextResponse.redirect(redirectUrl);
    response.headers.set('Cache-Control', 'no-store');
    // Browser consumption only; a copied cookie can race another callback.
    response.cookies.set(GITHUB_OAUTH_COOKIE, '', { ...GITHUB_OAUTH_COOKIE_OPTIONS, maxAge: 0 });
    return response;
  };
  try {
    const actor = await getCurrentUser();
    if (!actor) { redirectUrl.pathname = '/login'; return finish(); }
    const { searchParams } = new URL(request.url);
    const state = searchParams.getAll('state').length === 1
      ? readGitHubOAuthState(request.cookies.get(GITHUB_OAUTH_COOKIE)?.value, searchParams.get('state'), actor.id)
      : null;
    if (!state || searchParams.getAll('code').length > 1 || searchParams.getAll('error').length > 1) {
      redirectUrl.searchParams.set('github_error', 'Invalid or expired authorization state');
      return finish();
    }
    const project = state.projectId ? await prisma.project.findFirst({
      where: { id: state.projectId, workspace: postWorkspaceAccessWhere(actor.id) },
      select: { slug: true, workspace: { select: { slug: true } } },
    }) : null;
    if (state.projectId && !project) {
      redirectUrl.searchParams.set('github_error', 'Project access changed');
      return finish();
    }
    if (searchParams.has('error')) {
      redirectUrl.searchParams.set('github_error', 'GitHub authorization was not completed');
      return finish();
    }
    const code = searchParams.get('code');
    if (!code) {
      redirectUrl.searchParams.set('github_error', 'No authorization code received');
      return finish();
    }
    const accessToken = await exchangeCodeForToken(code);
    const githubUser = await getGitHubUser(accessToken);
    await prisma.user.update({
      where: { id: actor.id },
      data: { githubId: githubUser.id.toString(), githubUsername: githubUser.login, githubAccessToken: EncryptionService.encrypt(accessToken) },
    });
    redirectUrl.searchParams.set('github_connected', 'true');
    redirectUrl.searchParams.set('github_user', githubUser.login);
    if (project) {
      redirectUrl.pathname = `/${project.workspace.slug}/projects/${project.slug}/settings`;
      redirectUrl.searchParams.set('tab', 'github');
    }
    return finish();
  } catch {
    redirectUrl.searchParams.set('github_error', 'OAuth authentication failed');
    return finish();
  }
}
