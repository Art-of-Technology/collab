import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { exchangeCodeForToken, getGitHubUser } from "@/lib/github/oauth-config";
import { prisma } from "@/lib/prisma";

/**
 * Handle GitHub OAuth callback
 * GET /api/github/oauth/callback?code=xxx&state=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      const errorDescription = searchParams.get('error_description') || error;
      const redirectUrl = new URL('/projects', request.url);
      redirectUrl.searchParams.set('github_error', errorDescription);
      return NextResponse.redirect(redirectUrl);
    }

    if (!code) {
      const redirectUrl = new URL('/projects', request.url);
      redirectUrl.searchParams.set('github_error', 'No authorization code received');
      return NextResponse.redirect(redirectUrl);
    }

    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);
    
    // Get GitHub user profile
    const githubUser = await getGitHubUser(accessToken);

    // Store or update GitHub connection for the user
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        githubId: githubUser.id.toString(),
        githubUsername: githubUser.login,
        githubAccessToken: accessToken, // In production, encrypt this
      },
    });

    // Redirect to repository selection page with success
    const redirectUrl = new URL('/projects', request.url);
    redirectUrl.searchParams.set('github_connected', 'true');
    redirectUrl.searchParams.set('github_user', githubUser.login);
    
    // If state contains project info, redirect to that project's settings
    if (state && state.startsWith('project:')) {
      const projectId = state.replace('project:', '');
      
      // Fetch project with workspace info to build correct URL
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          slug: true,
          workspace: {
            select: {
              slug: true,
            },
          },
        },
      });

      if (project) {
        const correctPath = `/${project.workspace.slug}/projects/${project.slug}/settings`;
        console.log(`Redirecting to correct project settings URL: ${correctPath}`);
        redirectUrl.pathname = correctPath;
        redirectUrl.searchParams.set('tab', 'github');
      } else {
        // Fallback if project not found
        console.warn(`Project not found for ID: ${projectId}`);
        redirectUrl.pathname = '/projects';
      }
    }

    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    
    const redirectUrl = new URL('/projects', request.url);
    redirectUrl.searchParams.set('github_error', 
      error instanceof Error ? error.message : 'OAuth authentication failed'
    );
    
    return NextResponse.redirect(redirectUrl);
  }
}

