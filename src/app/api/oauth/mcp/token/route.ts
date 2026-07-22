import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { encryptToken, decryptToken } from '@/lib/apps/crypto';

const prisma = new PrismaClient();

/**
 * OAuth Token Endpoint for MCP/System Apps
 *
 * Exchanges an authorization code for a system app token.
 * Unlike regular OAuth tokens, these are stored directly in AppToken
 * without an installation record.
 *
 * Supports:
 * - authorization_code grant (exchange code for token)
 * - refresh_token grant (refresh expired token)
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let body: Record<string, string>;

    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      // Form URL encoded
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    }

    const grantType = body.grant_type;
    const clientId = body.client_id;

    if (!grantType || !clientId) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Missing required parameters: grant_type, client_id'
        },
        { status: 400 }
      );
    }

    // Verify OAuth client exists and is a system app
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

    if (!oauthClient || !oauthClient.app.isSystemApp) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'Invalid client or not a system app'
        },
        { status: 400 }
      );
    }

    if (oauthClient.app.status !== 'PUBLISHED') {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'App is not available'
        },
        { status: 400 }
      );
    }

    if (grantType === 'authorization_code') {
      return handleAuthorizationCodeGrant(body, oauthClient);
    } else if (grantType === 'refresh_token') {
      return handleRefreshTokenGrant(body, oauthClient);
    } else {
      return NextResponse.json(
        {
          error: 'unsupported_grant_type',
          error_description: 'Supported grant types: authorization_code, refresh_token'
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('MCP OAuth token error:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Internal server error'
      },
      { status: 500 }
    );
  }
}

async function handleAuthorizationCodeGrant(
  body: Record<string, string>,
  oauthClient: any
) {
  const { code, redirect_uri, code_verifier } = body;

  if (!code || !redirect_uri) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        error_description: 'Missing required parameters: code, redirect_uri'
      },
      { status: 400 }
    );
  }

  // Find the authorization code
  const authCode = await prisma.appOAuthAuthorizationCode.findUnique({
    where: { code }
  });

  if (!authCode) {
    return NextResponse.json(
      {
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code'
      },
      { status: 400 }
    );
  }

  // Check if code has expired
  if (authCode.expiresAt < new Date()) {
    await prisma.appOAuthAuthorizationCode.delete({ where: { code } });
    return NextResponse.json(
      {
        error: 'invalid_grant',
        error_description: 'Authorization code has expired'
      },
      { status: 400 }
    );
  }

  // Verify redirect URI matches
  if (authCode.redirectUri !== redirect_uri) {
    return NextResponse.json(
      {
        error: 'invalid_grant',
        error_description: 'Redirect URI mismatch'
      },
      { status: 400 }
    );
  }

  // Verify client ID matches
  if (authCode.clientId !== oauthClient.clientId) {
    return NextResponse.json(
      {
        error: 'invalid_grant',
        error_description: 'Client ID mismatch'
      },
      { status: 400 }
    );
  }

  // Verify PKCE if code challenge was provided
  if (authCode.code_challenge) {
    if (!code_verifier) {
      return NextResponse.json(
        {
          error: 'invalid_grant',
          error_description: 'Code verifier required for PKCE'
        },
        { status: 400 }
      );
    }

    // Verify code challenge
    const computedChallenge = createHash('sha256')
      .update(code_verifier)
      .digest('base64url');

    if (computedChallenge !== authCode.code_challenge) {
      return NextResponse.json(
        {
          error: 'invalid_grant',
          error_description: 'Invalid code verifier'
        },
        { status: 400 }
      );
    }
  }

  // Delete the authorization code (single use)
  await prisma.appOAuthAuthorizationCode.delete({ where: { code } });

  // Get workspace info
  const workspace = await prisma.workspace.findUnique({
    where: { id: authCode.workspaceId },
    select: { id: true, name: true, slug: true }
  });

  if (!workspace) {
    return NextResponse.json(
      {
        error: 'invalid_grant',
        error_description: 'Workspace not found'
      },
      { status: 400 }
    );
  }

  // Generate tokens
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  const expiresIn = 365 * 24 * 3600; // 1 year
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // Encrypt tokens
  const encryptedAccessToken = await encryptToken(accessToken);
  const encryptedRefreshToken = await encryptToken(refreshToken);

  // Parse scopes
  const scopes = authCode.scope?.split(' ').filter(Boolean) || [];

  // Check if token already exists for this app+workspace+user
  const existingToken = await prisma.appToken.findFirst({
    where: {
      appId: oauthClient.app.id,
      workspaceId: workspace.id,
      userId: authCode.userId,
      installationId: null,
      isRevoked: false
    }
  });

  if (existingToken) {
    // Update existing token
    await prisma.appToken.update({
      where: { id: existingToken.id },
      data: {
        accessToken: Buffer.from(encryptedAccessToken).toString('base64'),
        refreshToken: Buffer.from(encryptedRefreshToken).toString('base64'),
        tokenExpiresAt: expiresAt,
        scopes,
        updatedAt: new Date()
      }
    });

    console.log(`MCP Token: Updated for ${oauthClient.app.name} in ${workspace.name} by user ${authCode.userId}`);
  } else {
    // Create new system app token
    await prisma.appToken.create({
      data: {
        appId: oauthClient.app.id,
        workspaceId: workspace.id,
        userId: authCode.userId,
        installationId: null, // System apps don't have installations
        accessToken: Buffer.from(encryptedAccessToken).toString('base64'),
        refreshToken: Buffer.from(encryptedRefreshToken).toString('base64'),
        tokenExpiresAt: expiresAt,
        scopes,
        isRevoked: false
      }
    });

    console.log(`MCP Token: Created for ${oauthClient.app.name} in ${workspace.name} by user ${authCode.userId}`);
  }

  await prisma.$disconnect();

  return NextResponse.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: scopes.join(' '),
    workspace_id: workspace.id,
    workspace_name: workspace.name
  });
}

async function handleRefreshTokenGrant(
  body: Record<string, string>,
  oauthClient: any
) {
  const { refresh_token } = body;

  if (!refresh_token) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        error_description: 'Missing refresh_token'
      },
      { status: 400 }
    );
  }

  // Find the token by refresh token
  const appTokens = await prisma.appToken.findMany({
    where: {
      appId: oauthClient.app.id,
      installationId: null, // System app tokens
      isRevoked: false
    },
    include: {
      workspace: {
        select: { id: true, name: true, slug: true }
      }
    }
  });

  // Find matching token
  let matchedToken = null;
  for (const appToken of appTokens) {
    if (!appToken.refreshToken) continue;

    try {
      const storedRefreshToken = Buffer.from(appToken.refreshToken, 'base64');
      const decryptedRefresh = await decryptToken(storedRefreshToken);

      if (decryptedRefresh === refresh_token) {
        matchedToken = appToken;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!matchedToken) {
    return NextResponse.json(
      {
        error: 'invalid_grant',
        error_description: 'Invalid refresh token'
      },
      { status: 400 }
    );
  }

  // Generate new access token
  const newAccessToken = generateAccessToken();
  const expiresIn = 365 * 24 * 3600; // 1 year
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // Encrypt new access token
  const encryptedAccessToken = await encryptToken(newAccessToken);

  // Update token
  await prisma.appToken.update({
    where: { id: matchedToken.id },
    data: {
      accessToken: Buffer.from(encryptedAccessToken).toString('base64'),
      tokenExpiresAt: expiresAt,
      updatedAt: new Date()
    }
  });

  await prisma.$disconnect();

  return NextResponse.json({
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: matchedToken.scopes.join(' '),
    workspace_id: matchedToken.workspace?.id,
    workspace_name: matchedToken.workspace?.name
  });
}

function generateAccessToken(): string {
  const random = randomBytes(32).toString('base64url');
  const timestamp = Date.now().toString(36);
  return `collab_at_${timestamp}_${random}`;
}

function generateRefreshToken(): string {
  const random = randomBytes(48).toString('base64url');
  const timestamp = Date.now().toString(36);
  return `collab_rt_${timestamp}_${random}`;
}
