import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { validateClientAssertion, getTokenEndpointUrl } from '@/lib/apps/jwt-assertion';
import { decryptToken } from '@/lib/apps/crypto';
import { TokenEndpointAuthMethod } from '@/lib/apps/types';

const prisma = new PrismaClient();

/**
 * OAuth client type representing the structure returned from the database
 * with the included app relation
 */
export interface OAuthClientWithApp {
  id: string;
  appId: string;
  clientId: string;
  clientSecret: Buffer | null;
  clientType: string | null;
  tokenEndpointAuthMethod: TokenEndpointAuthMethod | null;
  jwksUri: string | null;
  jwksValidated: boolean;
  secretRevealed: boolean;
  apiKey: string | null;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  responseTypes: string[];
  grantTypes: string[];
  app: {
    id: string;
    slug: string;
    name: string;
    status: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'SUSPENDED' | 'REJECTED';
  };
}

export interface ClientAuthResult {
  valid: boolean;
  error?: string;
  errorDescription?: string;
  statusCode?: number;
  oauthClient?: OAuthClientWithApp;
}

/**
 * Parse HTTP Basic Authentication header
 */
export function parseBasicAuth(header: string | null): { headerClientId: string | null; basicSecret: string | null } {
  if (!header?.startsWith("Basic ")) return { headerClientId: null, basicSecret: null };
  const [id, secret] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
  return { headerClientId: id ?? null, basicSecret: secret ?? null };
}

/**
 * Authenticate OAuth client using any of the supported methods:
 * - none (public clients)
 * - client_secret_basic (confidential clients with HTTP Basic Auth)
 * - private_key_jwt (confidential clients with JWT assertion)
 */
export async function authenticateOAuthClient(
  request: NextRequest,
  body: FormData,
  options: {
    requireAuth?: boolean; // Whether authentication is required (default: true)
    allowPublic?: boolean; // Whether public clients are allowed (default: true)
  } = {}
): Promise<ClientAuthResult> {
  const { requireAuth = true, allowPublic = true } = options;

  try {
    // Extract client credentials from body and headers
    const client_id = body.get('client_id') as string;
    const client_assertion_type = body.get('client_assertion_type') as string;
    const client_assertion = body.get('client_assertion') as string;

    // Parse Basic Auth header
    const { headerClientId, basicSecret } = parseBasicAuth(request.headers.get("Authorization"));
    const clientId = headerClientId || client_id;
    const clientSecret = basicSecret || null;

    if (!clientId) {
      return {
        valid: false,
        error: "invalid_request",
        errorDescription: "Missing client_id",
        statusCode: 400
      };
    }

    // Verify OAuth client exists
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
    }) as OAuthClientWithApp | null;

    if (!oauthClient) {
      return {
        valid: false,
        error: "invalid_client",
        errorDescription: "Invalid client credentials: No oauth client found",
        statusCode: 401
      };
    }

    // Check if app is active
    if (oauthClient.app.status !== 'PUBLISHED') {
      return {
        valid: false,
        error: "invalid_client",
        errorDescription: "App is not active",
        statusCode: 401
      };
    }

    // Determine authentication method
    const authMethod = oauthClient.tokenEndpointAuthMethod || 
      (oauthClient.clientType === 'public' ? 'none' : 'client_secret_basic');

    // Handle authentication based on client type and method
    if (oauthClient.clientType === 'public') {
      if (!allowPublic) {
        return {
          valid: false,
          error: "invalid_client",
          errorDescription: "Public clients not allowed for this endpoint",
          statusCode: 401
        };
      }

      // Public clients must use 'none' authentication
      if (authMethod !== 'none') {
        return {
          valid: false,
          error: "invalid_client",
          errorDescription: "Public clients must use 'none' authentication method",
          statusCode: 401
        };
      }
      
      // Public clients should not provide client_secret or client_assertion
      if (clientSecret || client_assertion) {
        return {
          valid: false,
          error: "invalid_request",
          errorDescription: "Public clients must not provide client credentials",
          statusCode: 400
        };
      }
      
    } else if (oauthClient.clientType === 'confidential') {
      if (requireAuth) {
        if (authMethod === 'client_secret_basic') {
          // Confidential clients with client_secret_basic require client_secret
          if (!clientSecret) {
            return {
              valid: false,
              error: "invalid_request",
              errorDescription: "Client secret required for client_secret_basic authentication",
              statusCode: 400
            };
          }

          // Verify client secret by decrypting stored secret
          if (!oauthClient.clientSecret) {
            return {
              valid: false,
              error: "invalid_client",
              errorDescription: "No client secret configured",
              statusCode: 401
            };
          }

          try {
            const storedSecret = await decryptToken(Buffer.from(oauthClient.clientSecret));
            if (storedSecret !== clientSecret) {
              return {
                valid: false,
                error: "invalid_client",
                errorDescription: "Invalid client credentials",
                statusCode: 401
              };
            }
          } catch (error) {
            return {
              valid: false,
              error: "invalid_client",
              errorDescription: "Failed to verify client credentials",
              statusCode: 401
            };
          }
          
        } else if (authMethod === 'private_key_jwt') {
          // Confidential clients with private_key_jwt require client_assertion
          if (!client_assertion || client_assertion_type !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer') {
            return {
              valid: false,
              error: "invalid_client",
              errorDescription: "Missing client_assertion or client_assertion_type",
              statusCode: 401
            };
          }

          if (!oauthClient.jwksUri) {
            return {
              valid: false,
              error: "invalid_client",
              errorDescription: "No JWKS URI configured for JWT authentication",
              statusCode: 401
            };
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
            return {
              valid: false,
              error: "invalid_client",
              errorDescription: `JWT assertion validation failed: ${assertionResult.error}`,
              statusCode: 401
            };
          }

          // Client secret should not be provided with JWT authentication
          if (clientSecret) {
            return {
              valid: false,
              error: "invalid_request",
              errorDescription: "Client secret must not be provided with JWT authentication",
              statusCode: 400
            };
          }
        }
      }
    }

    return {
      valid: true,
      oauthClient
    };

  } catch (error) {
    console.error('OAuth client authentication error:', error);
    return {
      valid: false,
      error: "server_error",
      errorDescription: "Internal server error during client authentication",
      statusCode: 500
    };
  }
}

/**
 * Create OAuth error response
 */
export function oauthError(error: string, description?: string, status = 400) {
  return {
    error,
    error_description: description,
    status
  };
}
