import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { decryptToken } from '@/lib/apps/crypto';
import { authenticateOAuthClient } from '@/lib/oauth-client-auth';

const prisma = new PrismaClient();

// OAuth 2.0 Token Revocation Endpoint (RFC 7009)
// Allows clients to notify the authorization server that a token is no longer needed
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

    // Client authentication is required for token revocation
    const clientId = body.get('client_id') as string;
    if (!clientId) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Missing client_id'
        },
        { status: 400 }
      );
    }

    // Authenticate client (required for revocation)
    const authResult = await authenticateOAuthClient(request, {
      requireAuth: true, // Authentication is required for revocation
      allowPublic: true  // Public clients can revoke tokens
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

    const oauthClient = authResult.oauthClient;

    // Attempt to revoke the token
    const revocationResult = await revokeToken(token, tokenTypeHint, oauthClient.app.id);

    if (revocationResult.success) {
      // Log successful revocation for audit trail
      console.log(`Token revoked successfully: app=${oauthClient.app.slug}, token_type=${revocationResult.tokenType}, installation=${revocationResult.installationId}`);
      
      // RFC 7009: The authorization server responds with HTTP status code 200
      // if the revocation is successful or if the client submitted an invalid token
      return new NextResponse(null, { status: 200 });
    }

    // Even if token wasn't found, return 200 as per RFC 7009
    // This prevents information disclosure about token existence
    return new NextResponse(null, { status: 200 });

  } catch (error) {
    console.error('Token revocation error:', error);
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

// Revoke token and return result
async function revokeToken(
  token: string, 
  tokenTypeHint: string | null,
  appId: string
): Promise<{
  success: boolean;
  tokenType?: 'access_token' | 'refresh_token';
  installationId?: string;
}> {
  try {
    // Search for access tokens first (or if hint suggests access_token)
    if (!tokenTypeHint || tokenTypeHint === 'access_token') {
      const accessTokenResult = await revokeTokenFromInstallations(token, 'access', appId);
      if (accessTokenResult.success) {
        return {
          success: true,
          tokenType: 'access_token',
          installationId: accessTokenResult.installationId
        };
      }
    }

    // Search for refresh tokens if access token not found (or if hint suggests refresh_token)
    if (!tokenTypeHint || tokenTypeHint === 'refresh_token') {
      const refreshTokenResult = await revokeTokenFromInstallations(token, 'refresh', appId);
      if (refreshTokenResult.success) {
        return {
          success: true,
          tokenType: 'refresh_token',
          installationId: refreshTokenResult.installationId
        };
      }
    }

    // Token not found - still return success as per RFC 7009
    return { success: false };

  } catch (error) {
    console.error('Token revocation failed:', error);
    return { success: false };
  }
}

// Helper function to revoke token from app installations
async function revokeTokenFromInstallations(
  token: string, 
  tokenType: 'access' | 'refresh',
  appId: string
): Promise<{
  success: boolean;
  installationId?: string;
}> {
  try {
    const tokenField = tokenType === 'access' ? 'accessToken' : 'refreshToken';
    
    // Find installations for this specific app that have tokens
    const installations = await prisma.appInstallation.findMany({
      where: {
        appId: appId,
        [tokenField]: { not: null }
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
          // Revoke the token by clearing it from the database
          const updateData: any = {
            updatedAt: new Date()
          };

          if (tokenType === 'access') {
            updateData.accessToken = null;
            updateData.tokenExpiresAt = null;
          } else {
            updateData.refreshToken = null;
          }

          // If revoking a refresh token, also revoke the access token for security
          if (tokenType === 'refresh') {
            updateData.accessToken = null;
            updateData.tokenExpiresAt = null;
          }

          await prisma.appInstallation.update({
            where: { id: installation.id },
            data: updateData
          });

          return {
            success: true,
            installationId: installation.id
          };
        }
      } catch (error) {
        // If decryption fails for this installation, continue to next
        console.error(`Failed to decrypt ${tokenType} token for installation:`, installation.id, error);
        continue;
      }
    }

    return { success: false };

  } catch (error) {
    console.error(`Error revoking ${tokenType} token:`, error);
    return { success: false };
  }
}
