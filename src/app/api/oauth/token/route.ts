import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { validateClientAssertion, getTokenEndpointUrl } from '@/lib/apps/jwt-assertion';
import { encryptToken, decryptToken } from '@/lib/apps/crypto';
import { normalizeScopes, scopesToString } from '@/lib/oauth-scopes';

const prisma = new PrismaClient();
// OAuth 2.0 Token Endpoint
// Handles authorization_code and refresh_token grant types
export async function POST(request: NextRequest) {
  try {
    // Require form content-type
    if (!request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
      return oauthError("invalid_request", "Use application/x-www-form-urlencoded");
    }
    
    const body = await request.formData();
    const grant_type = body.get('grant_type') as string;
    const client_id = body.get('client_id') as string;
    const client_assertion_type = body.get('client_assertion_type') as string;
    const client_assertion = body.get('client_assertion') as string;

    // Identify client auth method from header or body
    const { headerClientId, basicSecret } = parseBasicAuth(request.headers.get("Authorization"));
    const clientId = headerClientId || client_id;
    const clientSecret = basicSecret || null;

    if (!clientId) return oauthError("invalid_request", "Missing client_id", 400);

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
      return oauthError("invalid_client", "Invalid client credentials: No oauth client found", 401);
    }

    // Handle client authentication based on client type and auth method
    const authMethod = oauthClient.tokenEndpointAuthMethod || 
      (oauthClient.clientType === 'public' ? 'none' : 'client_secret_basic');

    if (oauthClient.clientType === 'public') {
      // Public clients must use 'none' authentication
      if (authMethod !== 'none') {
        return oauthError("invalid_client", "Public clients must use 'none' authentication method", 401);
      }
      
      // Public clients should not provide client_secret or client_assertion
      if (clientSecret || client_assertion) {
        return oauthError("invalid_request", "Public clients must not provide client credentials", 400);
      }
      // PKCE verification is handled in the authorization code grant handler
      
    } else if (oauthClient.clientType === 'confidential') {
      if (authMethod === 'client_secret_basic') {
        // Confidential clients with client_secret_basic require client_secret
        if (!clientSecret) {
          return oauthError("invalid_request", "Client secret required for client_secret_basic authentication", 400);
        }

        // Verify client secret by decrypting stored secret
        if (!oauthClient.clientSecret) {
          return oauthError("invalid_client", "No client secret configured", 401);
        }

        try {
          const storedSecret = await decryptToken(Buffer.from(oauthClient.clientSecret));
          if (storedSecret !== clientSecret) {
            return oauthError("invalid_client", "Invalid client credentials", 401);
          }
        } catch (error) {
          return oauthError("invalid_client", "Failed to verify client credentials", 401);
        }
        
      } else if (authMethod === 'private_key_jwt') {
        // Confidential clients with private_key_jwt require client_assertion
        if (!client_assertion || client_assertion_type !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer') {
          return oauthError("invalid_client", "Missing client_assertion or client_assertion_type", 401);
        }

        if (!oauthClient.jwksUri) {
          return oauthError("invalid_client", "No JWKS URI configured for JWT authentication", 401);
        }

        // Validate JWT client assertion
        const tokenEndpoint = getTokenEndpointUrl(request);
        const assertionResult = await validateClientAssertion(
          client_assertion,
          clientId,
          oauthClient.jwksUri,
          tokenEndpoint
        );

        if (!assertionResult.valid) {
          return oauthError("invalid_client", `JWT assertion validation failed: ${assertionResult.error}`, 401);
        }

        // Client secret should not be provided with JWT authentication
        if (clientSecret) {
          return oauthError("invalid_request", "Client secret must not be provided with JWT authentication", 400);
        }
      }
    }

    // Check if app is active
    if (oauthClient.app.status !== 'PUBLISHED') {
      return oauthError("invalid_client", "App is not active", 401);
    }

    // Handle different grant types
    switch (grant_type) {
      case 'authorization_code':
        return await handleAuthorizationCodeGrant(body, oauthClient);
      
      case 'refresh_token':
        return await handleRefreshTokenGrant(body, oauthClient);
      
      default:
        return oauthError("unsupported_grant_type", `Grant type '${grant_type}' is not supported`, 400);
    }

  } catch (error) {
    console.error('OAuth token endpoint error:', error);
    return oauthError("server_error", "Internal server error", 500);
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
    return oauthError("invalid_request", "Missing required parameters: code, redirect_uri", 400);
  }

  // Validate redirect URI
  if (!oauthClient.redirectUris.includes(redirectUri)) {
    return oauthError("invalid_grant", "Invalid redirect_uri", 400);
  }

  // Validate authorization code and PKCE challenge
  const authCodeData = await validateAuthorizationCode(code, redirectUri, code_verifier, oauthClient);
  
  if (!authCodeData.valid) {
    return oauthError("invalid_grant", authCodeData.error || "Invalid authorization code", 400);
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
      return oauthError("server_error", "Installation record not found", 500);
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
    return oauthError("server_error", "Failed to generate tokens", 500);
  }
}

// Handle refresh_token grant type
async function handleRefreshTokenGrant(
  body: FormData,
  oauthClient: any
): Promise<NextResponse> {
  const refreshToken = body.get('refresh_token') as string;

  if (!refreshToken) {
    return oauthError("invalid_request", "Missing required parameter: refresh_token", 400);
  }

  // Validate refresh token
  const tokenData = await validateRefreshToken(refreshToken, oauthClient);
  
  if (!tokenData.valid) {
    return oauthError("invalid_grant", tokenData.error || "Invalid refresh token", 400);
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
    return oauthError('server_error', 'Failed to refresh token', 500);
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

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) return { headerClientId: null, basicSecret: null };
  const [id, secret] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
  return { headerClientId: id ?? null, basicSecret: secret ?? null };
}

function oauthError(error: string, description?: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status });
}
