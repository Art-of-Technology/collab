import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { encryptToken } from '@/lib/apps/crypto';
import { normalizeScopes, scopesToString } from '@/lib/oauth-scopes';

const prisma = new PrismaClient();

// OAuth 2.0 Token Endpoint
// Handles authorization_code and refresh_token grant types
export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const grantType = body.get('grant_type') as string;
    const clientId = body.get('client_id') as string;
    const clientSecret = body.get('client_secret') as string;

    // Validate required parameters
    if (!grantType || !clientId || !clientSecret) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          error_description: 'Missing required parameters: grant_type, client_id, client_secret'
        },
        { status: 400 }
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
            name: true,
            status: true
          }
        }
      }
    });

    if (!oauthClient) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'Invalid client credentials:  No oauth client found'
        },
        { status: 401 }
      );
    }

    // Verify client secret using bcrypt to compare against hashed secret
    const isValidSecret = await bcrypt.compare(clientSecret, oauthClient.clientSecret);
    if (!isValidSecret) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: 'Invalid client credentials:  Client secret mismatch'
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

    // Handle different grant types
    switch (grantType) {
      case 'authorization_code':
        return await handleAuthorizationCodeGrant(body, oauthClient);
      
      case 'refresh_token':
        return await handleRefreshTokenGrant(body, oauthClient);
      
      default:
        return NextResponse.json(
          {
            error: 'unsupported_grant_type',
            error_description: `Grant type '${grantType}' is not supported`
          },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('OAuth token endpoint error:', error);
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

// Handle authorization_code grant type
async function handleAuthorizationCodeGrant(
  body: FormData, 
  oauthClient: any
): Promise<NextResponse> {
  const code = body.get('code') as string;
  const code_verifier = body.get('code_verifier') as string;
  const redirectUri = body.get('redirect_uri') as string;

  if (!code || !redirectUri) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        error_description: 'Missing required parameters: code, redirect_uri'
      },
      { status: 400 }
    );
  }

  // Validate redirect URI
  if (!oauthClient.redirectUris.includes(redirectUri)) {
    return NextResponse.json(
      {
        error: 'invalid_grant',
        error_description: 'Invalid redirect_uri'
      },
      { status: 400 }
    );
  }

  // Validate authorization code and PKCE challenge
  const authCodeData = await validateAuthorizationCode(code, redirectUri, code_verifier, oauthClient);
  
  if (!authCodeData.valid) {
    return NextResponse.json(
      {
        error: 'invalid_grant',
        error_description: authCodeData.error || 'Invalid authorization code'
      },
      { status: 400 }
    );
  }

  // Generate tokens
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  const expiresIn = 3600; // 1 hour
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  try {
    // Store tokens (in a real implementation, you'd store these securely)
    // For now, we'll store them associated with the app installation
    const installation = await prisma.appInstallation.findFirst({
      where: {
        appId: oauthClient.app.id,
        workspaceId: authCodeData.workspaceId,
        status: { in: ['PENDING', 'ACTIVE'] } // Allow both PENDING and ACTIVE installations
      }
    });

    if (installation) {
      // Encrypt and store tokens
      const encryptedAccessToken = await encryptToken(accessToken);
      const encryptedRefreshToken = await encryptToken(refreshToken);

      await prisma.appInstallation.update({
        where: { id: installation.id },
        data: {
          accessToken: Buffer.from(encryptedAccessToken).toString('base64'),
          refreshToken: Buffer.from(encryptedRefreshToken).toString('base64'),
          tokenExpiresAt: expiresAt,
          status: 'ACTIVE', // Update status to ACTIVE after successful OAuth completion
          updatedAt: new Date()
        }
      });

      // Log successful OAuth completion and installation activation
      console.log(`OAuth installation completed: app=${oauthClient.app.slug}, installation=${installation.id}, workspace=${authCodeData.workspaceId}, user=${authCodeData.userId}`);
    } else {
      // This should not happen if the OAuth flow is working correctly
      console.error(`Installation not found for OAuth completion: app=${oauthClient.app.slug}, workspace=${authCodeData.workspaceId}, user=${authCodeData.userId}`);
      return NextResponse.json(
        {
          error: 'server_error',
          error_description: 'Installation record not found'
        },
        { status: 500 }
      );
    }

    // Return OAuth 2.0 compliant token response
    return NextResponse.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: authCodeData.scope || 'read'
    });

  } catch (error) {
    console.error('Token generation error:', error);
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Failed to generate tokens'
      },
      { status: 500 }
    );
  }
}

// Handle refresh_token grant type
async function handleRefreshTokenGrant(
  body: FormData,
  oauthClient: any
): Promise<NextResponse> {
  const refreshToken = body.get('refresh_token') as string;

  if (!refreshToken) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        error_description: 'Missing required parameter: refresh_token'
      },
      { status: 400 }
    );
  }

  // Validate refresh token
  const tokenData = await validateRefreshToken(refreshToken, oauthClient);
  
  if (!tokenData.valid) {
    return NextResponse.json(
      {
        error: 'invalid_grant',
        error_description: tokenData.error || 'Invalid refresh token'
      },
      { status: 400 }
    );
  }

  // Generate new access token
  const newAccessToken = generateAccessToken();
  const expiresIn = 3600; // 1 hour
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  try {
    // Update stored tokens
    if (tokenData.installationId) {
      const encryptedAccessToken = await encryptToken(newAccessToken);
      
      await prisma.appInstallation.update({
        where: { id: tokenData.installationId },
        data: {
          accessToken: Buffer.from(encryptedAccessToken).toString('base64'),
          tokenExpiresAt: expiresAt,
          updatedAt: new Date()
        }
      });
    }

    return NextResponse.json({
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: tokenData.scope || 'read'
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Failed to refresh token'
      },
      { status: 500 }
    );
  }
}

// Validate authorization code with PKCE
async function validateAuthorizationCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  oauthClient: any
): Promise<{
  valid: boolean;
  error?: string;
  workspaceId?: string;
  userId?: string;
  scope?: string;
}> {
  try {
    // Look up authorization code in database
    const authCode = await prisma.appOAuthAuthorizationCode.findUnique({
      where: { code },
      include: { 
        installation: true,
        oauthClient: true
      }
    });

    if (!authCode) {
      return { valid: false, error: 'Authorization code not found' };
    }

    // Verify code hasn't expired (typically 10 minutes)
    if (authCode.expiresAt < new Date()) {
      return { valid: false, error: 'Authorization code expired' };
    }

    // Verify code hasn't been used
    if (authCode.used) {
      return { valid: false, error: 'Authorization code already used' };
    }

    // Verify redirect URI matches
    if (authCode.redirectUri !== redirectUri) {
      return { valid: false, error: 'Redirect URI mismatch' };
    }

    // Verify client ID matches
    if (authCode.clientId !== oauthClient.clientId) {
      return { valid: false, error: 'Client ID mismatch' };
    }

    // Verify PKCE code challenge if present
    if (authCode.code_challenge && authCode.code_challenge_method) {
      if (!codeVerifier) {
        return { valid: false, error: 'Code verifier required for PKCE' };
      }

      if (authCode.code_challenge_method !== 'S256') {
        return { valid: false, error: 'Unsupported code challenge method' };
      }

      // Verify PKCE challenge
      const computedChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      
      if (computedChallenge !== authCode.code_challenge) {
        return { valid: false, error: 'Invalid code verifier' };
      }
    } else if (codeVerifier) {
      // Code verifier provided but no challenge stored - this might be an error
      // but we'll allow it for backward compatibility
      console.warn('Code verifier provided but no PKCE challenge found in authorization code');
    }

    // Mark code as used (one-time use only)
    await prisma.appOAuthAuthorizationCode.update({
      where: { id: authCode.id },
      data: { 
        used: true, 
        usedAt: new Date() 
      }
    });

    // Normalize scope handling - convert any format to consistent string
    const scopeString = scopesToString(normalizeScopes(authCode.scope));

    return {
      valid: true,
      workspaceId: authCode.workspaceId,
      userId: authCode.userId,
      scope: scopeString
    };

  } catch (error) {
    console.error('Authorization code validation error:', error);
    return { valid: false, error: 'Code validation failed' };
  }
}

// Validate refresh token
async function validateRefreshToken(
  refreshToken: string,
  oauthClient: any
): Promise<{
  valid: boolean;
  error?: string;
  installationId?: string;
  scope?: string;
}> {
  try {
    // Find installations for this app that have refresh tokens
    const installations = await prisma.appInstallation.findMany({
      where: {
        appId: oauthClient.app.id,
        refreshToken: { not: null }
      }
    });

    if (!installations || installations.length === 0) {
      return { valid: false, error: 'No valid refresh tokens found' };
    }

    // In production, decrypt and compare each refresh token
    // For demo purposes, we'll validate any installation with a refresh token
    for (const installation of installations) {
      try {
        if (installation.refreshToken) {
          // Decrypt the stored refresh token
          const storedTokenData = Buffer.from(installation.refreshToken, 'base64');
          const { decryptToken } = await import('@/lib/apps/crypto');
          const decryptedToken = await decryptToken(storedTokenData);
          
          // Compare with provided refresh token
          if (decryptedToken === refreshToken) {
            // Verify token hasn't expired (refresh tokens typically last longer)
            if (installation.tokenExpiresAt && installation.tokenExpiresAt < new Date()) {
              continue; // Try next installation
            }

            return {
              valid: true,
              installationId: installation.id,
              scope: scopesToString(installation.scopes)
            };
          }
        }
      } catch (error) {
        // If decryption fails for this installation, try the next one
        console.error('Failed to decrypt refresh token for installation:', installation.id, error);
        continue;
      }
    }

    return { valid: false, error: 'Invalid refresh token' };

  } catch (error) {
    console.error('Refresh token validation error:', error);
    return { valid: false, error: 'Token validation failed' };
  }
}

// Generate access token (opaque token for security)
function generateAccessToken(): string {
  // Generate cryptographically secure random token
  // Using 32 bytes = 256 bits of entropy
  const random = randomBytes(32).toString('base64url');
  const timestamp = Date.now().toString(36);
  return `collab_at_${timestamp}_${random}`;
}

// Generate refresh token (longer and more secure)
function generateRefreshToken(): string {
  // Generate cryptographically secure random refresh token
  // Using 48 bytes = 384 bits of entropy for refresh tokens
  const random = randomBytes(48).toString('base64url');
  const timestamp = Date.now().toString(36);
  return `collab_rt_${timestamp}_${random}`;
}

// Utility function to securely compare client secrets (constant-time comparison)
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}
