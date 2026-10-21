import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { generateAuthorizationCode } from '@/lib/apps/crypto';
import { normalizeScopes, filterGrantedScopes, scopesToString, validateScopes, isAllowedRedirectUri } from '@/lib/oauth-scopes';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { postWorkspaceAccessWhere } from '@/lib/post-access';

// OAuth 2.0 Authorization Endpoint
// Handles authorization requests from third-party apps
export async function authorize(request: NextRequest, systemOnly = false) {
  try {
    const approving = request.method === 'POST';
    let approvalToken: string | null = null;
    let searchParams = new URL(request.url).searchParams;
    if (approving) {
      const origin = new URL(process.env.NEXTAUTH_URL || request.url).origin;
      if (request.headers.get('origin') !== origin || !request.headers.get('content-type')?.startsWith('application/json')) {
        return NextResponse.json({ error: 'access_denied', error_description: 'Same-origin approval required' }, { status: 403 });
      }
      const body = await request.json();
      if (body.approve !== true || typeof body.consent_token !== 'string') {
        return NextResponse.json({ error: 'access_denied', error_description: 'Explicit approval required' }, { status: 403 });
      }
      approvalToken = body.consent_token;
      searchParams = new URLSearchParams();
      for (const key of ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'workspace_id', 'installation_id', 'code_challenge', 'code_challenge_method']) {
        if (body[key] != null) {
          if (typeof body[key] !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
          searchParams.set(key, body[key]);
        }
      }
    }

    // Extract OAuth parameters
    const clientId = searchParams.get('client_id');
    const redirectUri = searchParams.get('redirect_uri');
    const responseType = searchParams.get('response_type');
    const scope = searchParams.get('scope') || "";
    const state = searchParams.get('state');
    const workspaceId = searchParams.get('workspace_id'); // Custom parameter for workspace context
    const installationId = searchParams.get('installation_id'); // Installation ID from the flow
    const code_challenge = searchParams.get('code_challenge');
    const code_challenge_method = searchParams.get('code_challenge_method');

    if ((code_challenge && !/^[A-Za-z0-9_-]{43}$/.test(code_challenge)) || (code_challenge && code_challenge_method !== 'S256')) {
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
    const actor = await getCurrentUser();
    if (!actor) {
      if (approving || request.headers.get('x-collab-consent') === 'prepare') {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      // Redirect to login with return URL
      // Use the public URL from headers or environment to avoid Docker internal URLs
      const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
      const protocol = request.headers.get('x-forwarded-proto') || 'https';
      const publicBaseUrl = host ? `${protocol}://${host}` : process.env.NEXTAUTH_URL || request.url;

      const currentPath = new URL(request.url).pathname + new URL(request.url).search;
      const callbackUrl = `${publicBaseUrl}${currentPath}`;

      const loginUrl = new URL('/login', publicBaseUrl);
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

    if (systemOnly && !oauthClient.app.isSystemApp) {
      return NextResponse.json({ error: 'invalid_client' }, { status: 400 });
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
    if (oauthClient.clientType === 'public' || systemOnly) {
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

    // A navigation can only open the consent screen, never issue an authorization code.
    if (!approving && request.headers.get('x-collab-consent') !== 'prepare') {
      const consentUrl = new URL('/auth/mcp', process.env.NEXTAUTH_URL || request.url);
      consentUrl.search = searchParams.toString();
      consentUrl.searchParams.set('endpoint', systemOnly ? 'mcp' : 'regular');
      return NextResponse.redirect(consentUrl);
    }
    if (!workspaceId) {
      return NextResponse.json({ error: 'invalid_request', error_description: 'Select a workspace' }, { status: 400 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, ...postWorkspaceAccessWhere(actor.id) },
      select: { id: true }
    });

    if (!workspace) {
      return NextResponse.json(
        {
          error: 'access_denied',
          error_description: 'User does not have access to the specified workspace'
        },
        { status: 403 }
      );
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
            workspaceId,
            status: { in: ['PENDING', 'ACTIVE'] } // Allow both PENDING and ACTIVE during OAuth flow
          }
        });
      } else {
        // Fallback to existing installation lookup (for existing apps)
        installation = await prisma.appInstallation.findFirst({
          where: {
            appId: oauthClient.app.id,
            workspaceId,
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

    const appScopes = oauthClient.app.scopes.map((s: { scope: string }) => s.scope);
    const availableScopes = isSystemApp ? normalizeScopes(appScopes) : filterGrantedScopes(installation!.scopes, appScopes);
    const grantedScopes = scope.trim() ? normalizeScopes(scope) : availableScopes;
    if (!grantedScopes.length || grantedScopes.some(s => !availableScopes.includes(s))) {
      return NextResponse.json({ error: 'invalid_scope', error_description: 'Requested scopes exceed the app or installation grant' }, { status: 400 });
    }
    const binding = {
      clientId, userId: actor.id, workspaceId,
      installationId: isSystemApp ? null : installation!.id,
      redirectUri, scope: scopesToString(grantedScopes), state,
      code_challenge, code_challenge_method,
    };
    if (!approving) {
      // Pending approval is deliberately marked used and cannot be exchanged for a token.
      const consentToken = generateAuthorizationCode();
      await prisma.appOAuthAuthorizationCode.create({ data: {
        ...binding, code: consentToken, nonce: 'consent_pending', used: true,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      } });
      return NextResponse.json({ consent_token: consentToken, appName: oauthClient.app.name,
        scope: binding.scope, workspace_id: binding.workspaceId, redirect_uri: binding.redirectUri, state: binding.state,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Generate authorization code
    const authorizationCode = generateAuthorizationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store authorization code
    const issued = await prisma.$transaction(async (tx) => {
      const currentAccess = await tx.workspace.findFirst({
        where: { id: workspaceId, ...postWorkspaceAccessWhere(actor.id) },
        select: { id: true }
      });
      if (!currentAccess) return false;
      const consumed = await tx.appOAuthAuthorizationCode.deleteMany({ where: {
        ...binding, code: approvalToken!, nonce: 'consent_pending', used: true,
        expiresAt: { gt: new Date() },
      } });
      if (consumed.count !== 1) return false;
      await tx.appOAuthAuthorizationCode.create({ data: {
        ...binding, code: authorizationCode, nonce: 'consent_approved', used: false, expiresAt,
      } });
      return true;
    });

    if (!issued) {
      return NextResponse.json(
        { error: 'access_denied', error_description: 'Workspace access changed before authorization' },
        { status: 403 }
      );
    }

    // Log authorization for audit trail
    console.log(`OAuth authorization granted: app=${oauthClient.app.slug}, user=${actor.id}, workspace=${workspaceId}, installation=${isSystemApp ? 'system_app' : installation!.id}, scopes=${scopesToString(grantedScopes)}`);

    // Redirect back to app with authorization code
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', authorizationCode);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }
    // Include workspace_id in callback for third-party apps
    callbackUrl.searchParams.set('workspace_id', workspaceId);
    // Only include installation_id for non-system apps
    if (!isSystemApp && installation) {
      callbackUrl.searchParams.set('installation_id', installation.id);
    }

    return NextResponse.json({ redirect: callbackUrl.toString() }, { headers: { 'Cache-Control': 'no-store' } });

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
  }
}
