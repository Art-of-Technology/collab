import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { isAllowedRedirectUri } from '@/lib/oauth-scopes';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { postWorkspaceAccessWhere } from '@/lib/post-access';

/**
 * OAuth Authorization Endpoint for MCP/System Apps
 *
 * This endpoint handles OAuth authorization for system apps like the MCP server.
 * Unlike regular OAuth, it doesn't require an existing app installation - it generates
 * a system app token directly.
 *
 * Flow:
 * 1. User visits /auth/mcp page
 * 2. User selects workspace and clicks Authorize
 * 3. User is redirected here
 * 4. We generate an authorization code
 * 5. Redirect to callback URL with code
 * 6. MCP server exchanges code for token at /api/oauth/mcp/token
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract OAuth parameters
    const clientId = searchParams.get('client_id');
    const redirectUri = searchParams.get('redirect_uri');
    const responseType = searchParams.get('response_type');
    const scope = searchParams.get('scope') || 'user:read workspace:read issues:read issues:write';
    const state = searchParams.get('state');
    const workspaceId = searchParams.get('workspace_id');
    const codeChallenge = searchParams.get('code_challenge');
    const codeChallengeMethod = searchParams.get('code_challenge_method');

    // Validate required parameters
    if (!clientId || !redirectUri || !responseType || !workspaceId) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Missing required parameters: client_id, redirect_uri, response_type, workspace_id'
        },
        { status: 400 }
      );
    }

    if (responseType !== 'code') {
      return NextResponse.json(
        {
          error: 'unsupported_response_type',
          error_description: 'Only authorization_code flow is supported'
        },
        { status: 400 }
      );
    }

    // Validate PKCE if provided
    if (codeChallenge && codeChallengeMethod !== 'S256') {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Unsupported code_challenge_method. Use S256.'
        },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const actor = await getCurrentUser();
    if (!actor) {
      const loginUrl = new URL('/auth/mcp', request.url);
      loginUrl.search = new URL(request.url).search;
      return NextResponse.redirect(loginUrl);
    }

    // Find the app by client_id (look up OAuth client)
    const oauthClient = await prisma.appOAuthClient.findUnique({
      where: { clientId },
      include: {
        app: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            isSystemApp: true
          }
        }
      }
    });

    if (!oauthClient) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'Invalid client_id'
        },
        { status: 400 }
      );
    }

    // Validate redirect URI using shared utility
    // System apps can use localhost with dynamic ports and custom protocols (cursor://, vscode://)
    if (!isAllowedRedirectUri(redirectUri, oauthClient.redirectUris, oauthClient.app.isSystemApp)) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid redirect_uri'
        },
        { status: 400 }
      );
    }

    // Verify app is a system app
    if (!oauthClient.app.isSystemApp) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'This authorization endpoint is only for system apps. Use /api/oauth/authorize for regular apps.'
        },
        { status: 400 }
      );
    }

    // Verify app is published
    if (oauthClient.app.status !== 'PUBLISHED') {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'App is not available'
        },
        { status: 400 }
      );
    }

    // Verify workspace exists and user has access
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, ...postWorkspaceAccessWhere(actor.id) },
      select: { id: true }
    });

    if (!workspace) {
      const exists = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
      return NextResponse.json(
        exists
          ? { error: 'access_denied', error_description: 'User does not have access to this workspace' }
          : { error: 'invalid_request', error_description: 'Workspace not found' },
        { status: exists ? 403 : 404 }
      );
    }

    // Generate authorization code
    const authorizationCode = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store authorization code for MCP
    const issued = await prisma.$transaction(async (tx) => {
      const currentAccess = await tx.workspace.findFirst({
        where: { id: workspaceId, ...postWorkspaceAccessWhere(actor.id) },
        select: { id: true }
      });
      if (!currentAccess) return false;
      await tx.appOAuthAuthorizationCode.create({
        data: {
          code: authorizationCode,
          clientId,
          userId: actor.id,
          workspaceId,
          installationId: null, // System apps don't have installations
          redirectUri,
          scope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          expiresAt,
          // Mark this as a system app authorization
          nonce: 'mcp_system_app'
        }
      });
      return true;
    });

    if (!issued) {
      return NextResponse.json(
        { error: 'access_denied', error_description: 'Workspace access changed before authorization' },
        { status: 403 }
      );
    }

    console.log(`MCP OAuth authorization: app=${oauthClient.app.slug}, user=${actor.id}, workspace=${workspaceId}`);

    // Redirect back with authorization code
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', authorizationCode);
    if (state) callbackUrl.searchParams.set('state', state);
    callbackUrl.searchParams.set('workspace_id', workspaceId);

    return NextResponse.redirect(callbackUrl);

  } catch (error) {
    console.error('MCP OAuth authorization error:', error);

    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Internal server error'
      },
      { status: 500 }
    );
  }
}
