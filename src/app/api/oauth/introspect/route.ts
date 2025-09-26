import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { decryptToken } from '@/lib/apps/crypto';

const prisma = new PrismaClient();

// OAuth 2.0 Token Introspection Endpoint (RFC 7662)
// Allows authorized clients to determine the state of an access token
export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    
    const token = body.get('token') as string;
    const tokenTypeHint = body.get('token_type_hint') as string; // 'access_token' or 'refresh_token'
    const clientId = body.get('client_id') as string;
    const clientSecret = body.get('client_secret') as string;

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

    // If client credentials are provided, verify them
    if (clientId || clientSecret) {
      if (!clientId || !clientSecret) {
        return NextResponse.json(
          {
            error: 'invalid_client',
            error_description: 'Both client_id and client_secret are required'
          },
          { status: 401 }
        );
      }

      // Verify OAuth client
      const oauthClient = await prisma.appOAuthClient.findUnique({
        where: { clientId },
        include: {
          app: {
            select: {
              id: true,
              slug: true,
              status: true
            }
          }
        }
      });

      if (!oauthClient || oauthClient.clientSecret !== clientSecret) {
        return NextResponse.json(
          {
            error: 'invalid_client',
            error_description: 'Invalid client credentials'
          },
          { status: 401 }
        );
      }

      // Check if app is active
      if (oauthClient.app.status !== 'PUBLISHED') {
        return NextResponse.json(
          {
            error: 'invalid_client',
            error_description: 'App is not active'
          },
          { status: 401 }
        );
      }
    }

    // Look up the token in app installations
    let tokenInfo = await introspectToken(token, tokenTypeHint);

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
  tokenTypeHint?: string
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
}> {
  try {
    // Search for access tokens first (or if hint suggests access_token)
    if (!tokenTypeHint || tokenTypeHint === 'access_token') {
      const accessTokenResult = await findTokenInInstallations(token, 'access');
      if (accessTokenResult.found) {
        return accessTokenResult.info;
      }
    }

    // Search for refresh tokens if access token not found (or if hint suggests refresh_token)
    if (!tokenTypeHint || tokenTypeHint === 'refresh_token') {
      const refreshTokenResult = await findTokenInInstallations(token, 'refresh');
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
  tokenType: 'access' | 'refresh'
): Promise<{
  found: boolean;
  info: any;
}> {
  try {
    const tokenField = tokenType === 'access' ? 'accessToken' : 'refreshToken';
    
    // Find all active installations that have tokens
    const installations = await prisma.appInstallation.findMany({
      where: {
        [tokenField]: { not: null },
        status: 'ACTIVE'
      },
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
