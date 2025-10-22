/**
 * OAuth Authentication Middleware for Third-Party App API Access
 * 
 * This middleware validates OAuth access tokens and extracts app installation
 * context for API requests from third-party applications.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { decryptToken } from '@/lib/apps/crypto';
import { hasScope, hasAllScopes, normalizeScopes } from '@/lib/oauth-scopes';

const prisma = new PrismaClient();

export interface AppAuthContext {
  installation: {
    id: string;
    appId: string;
    workspaceId: string;
    userId: string;
    scopes: string[];
    status: string;
  };
  app: {
    id: string;
    slug: string;
    name: string;
    status: string;
  };
  workspace: {
    id: string;
    slug: string;
    name: string;
  };
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
  token: {
    type: 'access_token';
    scopes: string[];
    expiresAt: Date | null;
  };
}

export interface AuthMiddlewareOptions {
  requiredScopes?: string | string[];
  allowExpired?: boolean;
}

export interface AuthMiddlewareResult {
  success: boolean;
  context?: AppAuthContext;
  error?: {
    code: string;
    message: string;
    statusCode: number;
  };
}

/**
 * Extract and validate OAuth access token from request
 */
export async function authenticateAppRequest(
  request: NextRequest,
  options: AuthMiddlewareOptions = {}
): Promise<AuthMiddlewareResult> {
  const { requiredScopes = [], allowExpired = false } = options;

  try {
    // Extract Bearer token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        success: false,
        error: {
          code: 'missing_token',
          message: 'Missing or invalid Authorization header. Expected: Bearer <token>',
          statusCode: 401
        }
      };
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    if (!token) {
      return {
        success: false,
        error: {
          code: 'missing_token',
          message: 'Access token is required',
          statusCode: 401
        }
      };
    }

    // Find the installation with this access token
    const installation = await findInstallationByAccessToken(token);
    if (!installation || !installation.installedBy) {
      return {
        success: false,
        error: {
          code: 'invalid_token',
          message: 'Invalid or expired access token',
          statusCode: 401
        }
      };
    }

    // Check if token has expired (unless explicitly allowed)
    if (!allowExpired && installation.tokenExpiresAt && installation.tokenExpiresAt < new Date()) {
      return {
        success: false,
        error: {
          code: 'token_expired',
          message: 'Access token has expired',
          statusCode: 401
        }
      };
    }

    // Check if installation is active
    if (installation.status !== 'ACTIVE') {
      return {
        success: false,
        error: {
          code: 'installation_inactive',
          message: 'App installation is not active',
          statusCode: 403
        }
      };
    }

    // Check if app is published
    if (installation.app.status !== 'PUBLISHED') {
      return {
        success: false,
        error: {
          code: 'app_inactive',
          message: 'App is not active',
          statusCode: 403
        }
      };
    }

    // Validate required scopes
    const normalizedRequired = normalizeScopes(requiredScopes);
    if (normalizedRequired.length > 0) {
      const hasRequiredScopes = hasAllScopes(normalizedRequired, installation.scopes);
      if (!hasRequiredScopes) {
        return {
          success: false,
          error: {
            code: 'insufficient_scope',
            message: `Insufficient scope. Required: ${normalizedRequired.join(', ')}`,
            statusCode: 403
          }
        };
      }
    }

    // Build auth context
    const context: AppAuthContext = {
      installation: {
        id: installation.id,
        appId: installation.appId,
        workspaceId: installation.workspaceId,
        userId: installation.installedById,
        scopes: installation.scopes,
        status: installation.status
      },
      app: {
        id: installation.app.id,
        slug: installation.app.slug,
        name: installation.app.name,
        status: installation.app.status
      },
      workspace: {
        id: installation.workspace.id,
        slug: installation.workspace.slug,
        name: installation.workspace.name
      },
      user: {
        id: installation.installedBy.id,
        email: installation.installedBy.email,
        name: installation.installedBy.name
      },
      token: {
        type: 'access_token',
        scopes: installation.scopes,
        expiresAt: installation.tokenExpiresAt
      }
    };

    return {
      success: true,
      context
    };

  } catch (error) {
    console.error('App authentication error:', error);
    return {
      success: false,
      error: {
        code: 'server_error',
        message: 'Internal server error during authentication',
        statusCode: 500
      }
    };
  }
}

/**
 * Find app installation by access token
 */
async function findInstallationByAccessToken(token: string) {
  try {
    // Find installations that have access tokens
    const installations = await prisma.appInstallation.findMany({
      where: {
        accessToken: { not: null },
        status: 'ACTIVE'
      },
      include: {
        app: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true
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

    // Check each installation's access token
    for (const installation of installations) {
      try {
        if (!installation.accessToken) continue;

        // Decrypt the stored token
        const storedTokenData = Buffer.from(installation.accessToken, 'base64');
        const decryptedToken = await decryptToken(storedTokenData);

        // Compare with provided token
        if (decryptedToken === token) {
          // Fetch the user who installed the app separately since the relation doesn't exist in schema
          const installedByUser = await prisma.user.findUnique({
            where: { id: installation.installedById },
            select: {
              id: true,
              email: true,
              name: true
            }
          });

          // If user not found, skip this installation
          if (!installedByUser) {
            continue;
          }

          return {
            ...installation,
            installedBy: installedByUser
          };
        }
      } catch (error) {
        // If decryption fails for this installation, continue to next
        console.error('Failed to decrypt access token for installation:', installation.id, error);
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding installation by access token:', error);
    return null;
  }
}

/**
 * Create a standardized error response for authentication failures
 */
export function createAuthErrorResponse(error: { code: string; message: string; statusCode: number }) {
  return NextResponse.json(
    {
      error: error.code,
      error_description: error.message
    },
    { status: error.statusCode }
  );
}

/**
 * Helper function to check if context has specific scope
 */
export function contextHasScope(context: AppAuthContext, scope: string): boolean {
  return hasScope(scope, context.token.scopes);
}

/**
 * Helper function to check if context has all required scopes
 */
export function contextHasAllScopes(context: AppAuthContext, scopes: string | string[]): boolean {
  return hasAllScopes(scopes, context.token.scopes);
}

/**
 * Middleware wrapper for API routes that require app authentication
 */
export function withAppAuth(
  handler: (request: NextRequest, context: AppAuthContext, params?: any) => Promise<NextResponse>,
  options: AuthMiddlewareOptions = {}
) {
  return async (request: NextRequest, routeParams?: any) => {
    const authResult = await authenticateAppRequest(request, options);
    
    if (!authResult.success) {
      return createAuthErrorResponse(authResult.error!);
    }

    return handler(request, authResult.context!, routeParams);
  };
}
