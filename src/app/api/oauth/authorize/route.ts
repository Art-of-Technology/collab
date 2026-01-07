import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { generateAuthorizationCode } from '@/lib/apps/crypto';
import { normalizeScopes, filterGrantedScopes, scopesToString, validateScopes, isAllowedRedirectUri } from '@/lib/oauth-scopes';

const prisma = new PrismaClient();

// OAuth 2.0 Authorization Endpoint
// Handles authorization requests from third-party apps
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract OAuth parameters
    const clientId = searchParams.get('client_id');
    const redirectUri = searchParams.get('redirect_uri');
    const responseType = searchParams.get('response_type');
    const scope = searchParams.get('scope') || "";
    const state = searchParams.get('state');
    const nonce = searchParams.get('nonce');
    const workspaceId = searchParams.get('workspace_id'); // Custom parameter for workspace context
    const installationId = searchParams.get('installation_id'); // Installation ID from the flow
    const code_challenge = searchParams.get('code_challenge');
    const code_challenge_method = searchParams.get('code_challenge_method');

    if (code_challenge && code_challenge_method !== 'S256') {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Unsupported code_challenge_method' },
        { status: 400 }
      );
    }

    // Validate required parameters
    if (!clientId || !redirectUri || !responseType) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          error_description: 'Missing required parameters: client_id, redirect_uri, response_type'
        },
        { status: 400 }
      );
    }

    // Only support authorization code flow
    if (responseType !== 'code') {
      return NextResponse.json(
        {
          error: 'unsupported_response_type',
          error_description: 'Only authorization_code flow is supported'
        },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      // Redirect to login with return URL
      // Use the public URL from headers or environment to avoid Docker internal URLs
      const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
      const protocol = request.headers.get('x-forwarded-proto') || 'https';
      const publicBaseUrl = host ? `${protocol}://${host}` : process.env.NEXTAUTH_URL || request.url;

      const currentPath = new URL(request.url).pathname + new URL(request.url).search;
      const callbackUrl = `${publicBaseUrl}${currentPath}`;

      const loginUrl = new URL('/auth/signin', publicBaseUrl);
      loginUrl.searchParams.set('callbackUrl', callbackUrl);
      redirect(loginUrl.toString());
    }

    // Verify OAuth client
    const oauthClient = await prisma.appOAuthClient.findUnique({
      where: { clientId },
      include: {
        app: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            iconUrl: true,
            isSystemApp: true,
            scopes: true
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

    // Verify redirect URI using shared utility
    // For system apps (like MCP), allows any localhost/127.0.0.1 callback URL with dynamic ports
    if (!isAllowedRedirectUri(redirectUri, oauthClient.redirectUris, oauthClient.app.isSystemApp)) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid redirect_uri'
        },
        { status: 400 }
      );
    }

    // Check if app is active
    if (oauthClient.app.status !== 'PUBLISHED') {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'App is not available'
        },
        { status: 400 }
      );
    }

    // Enforce PKCE for public clients
    if (oauthClient.clientType === 'public') {
      if (!code_challenge || !code_challenge_method) {
        return NextResponse.json(
          {
            error: 'invalid_request',
            error_description: 'Public clients must use PKCE (code_challenge and code_challenge_method required)'
          },
          { status: 400 }
        );
      }
    }

    // Verify workspace access if workspace_id is provided
    let targetWorkspaceId = workspaceId;
    if (workspaceId) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          members: {
            where: { userId: session.user.id }
          }
        }
      });

      if (!workspace || workspace.members.length === 0) {
        return NextResponse.json(
          {
            error: 'access_denied',
            error_description: 'User does not have access to the specified workspace'
          },
          { status: 403 }
        );
      }
    } else {
      // If no workspace specified, use user's first workspace
      const userWorkspace = await prisma.workspaceMember.findFirst({
        where: { userId: session.user.id },
        include: { workspace: true }
      });

      if (!userWorkspace) {
        return NextResponse.json(
          {
            error: 'access_denied',
            error_description: 'User is not a member of any workspace'
          },
          { status: 403 }
        );
      }

      targetWorkspaceId = userWorkspace.workspaceId;
    }

    // Check if app is a system app - system apps don't require installation
    const isSystemApp = oauthClient.app.isSystemApp;

    // Check if app is installed in the workspace (skip for system apps)
    let installation;

    if (!isSystemApp) {
      if (installationId) {
        // If installation_id is provided, use it directly (for new installations)
        installation = await prisma.appInstallation.findFirst({
          where: {
            id: installationId,
            appId: oauthClient.app.id,
            workspaceId: targetWorkspaceId!,
            status: { in: ['PENDING', 'ACTIVE'] } // Allow both PENDING and ACTIVE during OAuth flow
          }
        });
      } else {
        // Fallback to existing installation lookup (for existing apps)
        installation = await prisma.appInstallation.findFirst({
          where: {
            appId: oauthClient.app.id,
            workspaceId: targetWorkspaceId!,
            status: { in: ['PENDING', 'ACTIVE'] } // Allow both statuses
          }
        });
      }

      if (!installation) {
        return NextResponse.json(
          {
            error: 'access_denied',
            error_description: installationId
              ? 'Installation not found or invalid'
              : 'App is not installed in the specified workspace'
          },
          { status: 403 }
        );
      }
    }

    // Validate and normalize scopes using utility functions
    const scopeValidation = validateScopes(scope);
    if (!scopeValidation.valid && scope.trim()) {
      return NextResponse.json(
        {
          error: 'invalid_scope',
          error_description: `Invalid scopes: ${scopeValidation.invalidScopes.join(', ')}`
        },
        { status: 400 }
      );
    }

    // For system apps, use app scopes; for regular apps, use installation scopes
    const availableScopes = isSystemApp
      ? oauthClient.app.scopes.map((s: { scope: string }) => s.scope)
      : installation!.scopes;

    // If no scope requested, grant all available scopes; otherwise filter requested against available
    const grantedScopes = scope.trim()
      ? filterGrantedScopes(scope, availableScopes)
      : normalizeScopes(availableScopes);

    if (grantedScopes.length === 0) {
      return NextResponse.json(
        {
          error: 'invalid_scope',
          error_description: 'No valid scopes requested or granted'
        },
        { status: 400 }
      );
    }

    // Generate authorization code
    const authorizationCode = generateAuthorizationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store authorization code
    await prisma.appOAuthAuthorizationCode.create({
      data: {
        code: authorizationCode,
        clientId,
        userId: session.user.id,
        workspaceId: targetWorkspaceId!,
        installationId: isSystemApp ? null : installation!.id,
        redirectUri,
        scope: scopesToString(grantedScopes),
        state,
        code_challenge,
        code_challenge_method,
        nonce: isSystemApp ? 'system_app' : nonce, // Mark system app authorizations
        expiresAt
      }
    });

    // Log authorization for audit trail
    console.log(`OAuth authorization granted: app=${oauthClient.app.slug}, user=${session.user.id}, workspace=${targetWorkspaceId}, installation=${isSystemApp ? 'system_app' : installation!.id}, scopes=${scopesToString(grantedScopes)}`);

    // Redirect back to app with authorization code
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', authorizationCode);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }
    // Include workspace_id in callback for third-party apps
    callbackUrl.searchParams.set('workspace_id', targetWorkspaceId!);
    // Only include installation_id for non-system apps
    if (!isSystemApp && installation) {
      callbackUrl.searchParams.set('installation_id', installation.id);
    }

    return NextResponse.redirect(callbackUrl);

  } catch (error: any) {
    // Re-throw redirect errors - Next.js uses these for navigation
    if (error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    console.error('OAuth authorization error:', error);
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Internal server error'
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// POST endpoint for explicit user consent (optional)
// This can be used if you want to show a consent screen
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { approve, client_id, redirect_uri, scope, state, workspace_id, installation_id } = body;

    // Verify user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'unauthorized' },
        { status: 401 }
      );
    }

    if (!approve) {
      // User denied authorization
      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set('error', 'access_denied');
      callbackUrl.searchParams.set('error_description', 'User denied authorization');
      if (state) {
        callbackUrl.searchParams.set('state', state);
      }

      return NextResponse.json({
        redirect: callbackUrl.toString()
      });
    }

    // User approved - redirect to GET endpoint to generate code
    const authorizeUrl = new URL('/api/oauth/authorize', request.url);
    authorizeUrl.searchParams.set('client_id', client_id);
    authorizeUrl.searchParams.set('redirect_uri', redirect_uri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', scope);
    if (state) authorizeUrl.searchParams.set('state', state);
    if (workspace_id) authorizeUrl.searchParams.set('workspace_id', workspace_id);
    if (installation_id) authorizeUrl.searchParams.set('installation_id', installation_id);

    return NextResponse.json({
      redirect: authorizeUrl.toString()
    });

  } catch (error) {
    console.error('OAuth consent error:', error);
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Internal server error'
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}