import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { encryptToken, decryptToken } from '@/lib/apps/crypto';
import { z } from 'zod';

const prisma = new PrismaClient();

const SystemAppTokenSchema = z.object({
  workspaceId: z.string().cuid('Invalid workspace ID'),
  scopes: z.array(z.string()).optional().default(['read', 'write'])
});

/**
 * POST /api/apps/system/[slug]/token
 *
 * Generate a token for a system app to access a specific workspace.
 * This bypasses the normal OAuth flow for system apps.
 *
 * Authentication: Basic Auth with clientId:clientSecret
 *
 * Request Body:
 * {
 *   "workspaceId": "workspace-cuid",
 *   "scopes": ["read", "write"] // optional
 * }
 *
 * Response:
 * {
 *   "access_token": "collab_at_...",
 *   "token_type": "Bearer",
 *   "expires_in": 31536000,
 *   "scope": "read write"
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Parse Basic Auth credentials
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Basic ')) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Missing or invalid Authorization header. Use Basic Auth.' },
        { status: 401 }
      );
    }

    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const [clientId, clientSecret] = credentials.split(':');

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid credentials format' },
        { status: 401 }
      );
    }

    // Find the app by slug
    const app = await prisma.app.findUnique({
      where: { slug },
      include: {
        oauthClient: true
      }
    });

    if (!app) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'App not found' },
        { status: 404 }
      );
    }

    // Verify this is a system app
    if (!app.isSystemApp) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'This endpoint is only for system apps' },
        { status: 403 }
      );
    }

    // Verify app is published
    if (app.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'App is not published' },
        { status: 403 }
      );
    }

    // Verify OAuth client exists
    if (!app.oauthClient) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'App has no OAuth configuration' },
        { status: 400 }
      );
    }

    // Verify client credentials
    if (app.oauthClient.clientId !== clientId) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid client credentials' },
        { status: 401 }
      );
    }

    // Verify client secret
    if (!app.oauthClient.clientSecret) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Client secret not configured' },
        { status: 401 }
      );
    }

    try {
      const storedSecret = await decryptToken(Buffer.from(app.oauthClient.clientSecret));
      if (storedSecret !== clientSecret) {
        return NextResponse.json(
          { error: 'invalid_client', error_description: 'Invalid client credentials' },
          { status: 401 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Failed to verify credentials' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = SystemAppTokenSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Invalid request body', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { workspaceId, scopes } = validation.data;

    // Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Check if a token already exists for this app+workspace combination
    const existingToken = await prisma.appToken.findFirst({
      where: {
        appId: app.id,
        workspaceId: workspaceId,
        installationId: null, // System app tokens have no installation
        isRevoked: false
      }
    });

    // Generate new tokens
    const accessToken = generateAccessToken();
    const refreshToken = generateRefreshToken();
    const expiresIn = 365 * 24 * 3600; // 1 year
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Encrypt tokens
    const encryptedAccessToken = await encryptToken(accessToken);
    const encryptedRefreshToken = await encryptToken(refreshToken);

    if (existingToken) {
      // Update existing token
      await prisma.appToken.update({
        where: { id: existingToken.id },
        data: {
          accessToken: Buffer.from(encryptedAccessToken).toString('base64'),
          refreshToken: Buffer.from(encryptedRefreshToken).toString('base64'),
          tokenExpiresAt: expiresAt,
          scopes: scopes,
          updatedAt: new Date()
        }
      });

      console.log(`🔄 System App Token: Regenerated for ${app.name} in workspace ${workspace.name}`, {
        appId: app.id,
        workspaceId,
        tokenId: existingToken.id
      });
    } else {
      // Create new token for system app
      await prisma.appToken.create({
        data: {
          appId: app.id,
          workspaceId: workspaceId,
          installationId: null, // System apps don't have installations
          userId: null, // System tokens are not user-specific
          accessToken: Buffer.from(encryptedAccessToken).toString('base64'),
          refreshToken: Buffer.from(encryptedRefreshToken).toString('base64'),
          tokenExpiresAt: expiresAt,
          scopes: scopes,
          isRevoked: false
        }
      });

      console.log(`✨ System App Token: Created for ${app.name} in workspace ${workspace.name}`, {
        appId: app.id,
        workspaceId
      });
    }

    await prisma.$disconnect();

    return NextResponse.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: scopes.join(' ')
    });

  } catch (error) {
    console.error('System app token generation error:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Generate access token (same format as regular OAuth tokens)
function generateAccessToken(): string {
  const random = randomBytes(32).toString('base64url');
  const timestamp = Date.now().toString(36);
  return `collab_at_${timestamp}_${random}`;
}

// Generate refresh token
function generateRefreshToken(): string {
  const random = randomBytes(48).toString('base64url');
  const timestamp = Date.now().toString(36);
  return `collab_rt_${timestamp}_${random}`;
}
