import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { decryptToken } from '@/lib/apps/crypto';
import { authenticateOAuthClient } from '@/lib/oauth-client-auth';

const prisma = new PrismaClient();

// OAuth 2.0 Token Introspection Endpoint (RFC 7662)
// Allows authorized clients to determine the state of an access token
export async function POST(request: NextRequest) {
  try {
    // Require form content-type
    if (!request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Use application/x-www-form-urlencoded" },
        { status: 400 }
      );
    }

    const body = await request.formData();
    
    const token = body.get('token') as string;
    const tokenTypeHint = body.get('token_type_hint') as string; // 'access_token' or 'refresh_token'

    // Validate required parameters
    if (!token) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          error_description: 'Missing required parameter: token'
        },
        { status: 400 }
      );
    }

    // Authenticate client (optional for introspection, but if provided must be valid)
    const clientId = body.get('client_id') as string;
    let oauthClient = null;
    
    if (clientId) {
      const authResult = await authenticateOAuthClient(request, {
        requireAuth: false, // Authentication is optional for introspection
        allowPublic: true
      });

      if (!authResult.valid) {
        return NextResponse.json(
          {
            error: authResult.error,
            error_description: authResult.errorDescription
          },
          { status: authResult.statusCode }
        );
      }

      oauthClient = authResult.oauthClient;
    }

    // Look up the token in app installations
    let tokenInfo = await introspectToken(token, tokenTypeHint, oauthClient);

    // Return introspection response
    return NextResponse.json(tokenInfo);

  } catch (error) {
    console.error('Token introspection error:', error);
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

// Introspect token and return its details
async function introspectToken(
  token: string, 
  tokenTypeHint?: string,
  oauthClient?: any
): Promise<{
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  aud?: string;
  workspace_id?: string;
  workspace_slug?: string;
}> {
  try {
    // Search for access tokens first (or if hint suggests access_token)
    if (!tokenTypeHint || tokenTypeHint === 'access_token') {
      const accessTokenResult = await findTokenInInstallations(token, 'access', oauthClient?.app?.id);
      if (accessTokenResult.found) {
        return accessTokenResult.info;
      }
    }

    // Search for refresh tokens if access token not found (or if hint suggests refresh_token)
    if (!tokenTypeHint || tokenTypeHint === 'refresh_token') {
      const refreshTokenResult = await findTokenInInstallations(token, 'refresh', oauthClient?.app?.id);
      if (refreshTokenResult.found) {
        return refreshTokenResult.info;
      }
    }

    // Token not found or invalid
    return { active: false };

  } catch (error) {
    console.error('Token introspection failed:', error);
    return { active: false };
  }
}

// Helper function to find token in app installations
async function findTokenInInstallations(
  token: string, 
  tokenType: 'access' | 'refresh',
  appId?: string
): Promise<{
  found: boolean;
  info: any;
}> {
  try {
    const tokenField = tokenType === 'access' ? 'accessToken' : 'refreshToken';
    
    // Find installations that have tokens (optionally filtered by app)
    const whereClause: any = {
      [tokenField]: { not: null },
      status: 'ACTIVE'
    };
    
    if (appId) {
      whereClause.appId = appId;
    }

    const installations = await prisma.appInstallation.findMany({
      where: whereClause,
      include: {
        app: {
          include: {
            oauthClient: true
          }
        },
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true
          }
        }
      }
    });

    // Check each installation's token
    for (const installation of installations) {
      try {
        const storedToken = installation[tokenField as keyof typeof installation] as string | null;
        if (!storedToken) continue;

        // Decrypt the stored token
        const storedTokenData = Buffer.from(storedToken, 'base64');
        const decryptedToken = await decryptToken(storedTokenData);

        // Compare with provided token
        if (decryptedToken === token) {
          // Check if token has expired
          const isExpired = installation.tokenExpiresAt && installation.tokenExpiresAt < new Date();
          
          if (isExpired) {
            return {
              found: true,
              info: { active: false }
            };
          }

          // Extract token timestamp if present (for issued_at)
          let issuedAt: number | undefined;
          let expiresAt: number | undefined;

          if (token.startsWith('collab_at_') || token.startsWith('collab_rt_')) {
            const parts = token.split('_');
            if (parts.length >= 3) {
              try {
                issuedAt = Math.floor(parseInt(parts[2], 36) / 1000); // Convert to Unix timestamp
              } catch (e) {
                // Ignore parsing errors
              }
            }
          }

          if (installation.tokenExpiresAt) {
            expiresAt = Math.floor(installation.tokenExpiresAt.getTime() / 1000);
          }

          return {
            found: true,
            info: {
              active: true,
              scope: installation.scopes.join(' '),
              client_id: installation.app.oauthClient?.clientId,
              token_type: tokenType === 'access' ? 'Bearer' : 'refresh_token',
              exp: expiresAt,
              iat: issuedAt,
              sub: installation.installedById, // subject (user ID)
              aud: installation.app.slug, // audience (app)
              workspace_id: installation.workspace.id,
              workspace_slug: installation.workspace.slug
            }
          };
        }
      } catch (error) {
        // If decryption fails for this installation, continue to next
        console.error(`Failed to decrypt ${tokenType} token for installation:`, installation.id, error);
        continue;
      }
    }

    return { found: false, info: { active: false } };

  } catch (error) {
    console.error(`Error finding ${tokenType} token:`, error);
    return { found: false, info: { active: false } };
  }
}
