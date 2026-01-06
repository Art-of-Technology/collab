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

    // For system app tokens, we skip the installation status check
    // since they don't have real installations
    const isSystemAppToken = (installation as any).isSystemAppToken === true;

    // Check if installation is active (skip for system app tokens)
    if (!isSystemAppToken && installation.status !== 'ACTIVE') {
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
 * Find app installation or system app token by access token
 * Now searches in AppToken table which supports:
 * 1. Multiple tokens per installation (regular apps)
 * 2. System app tokens (no installation required)
 */
async function findInstallationByAccessToken(token: string) {
  try {
    // Find tokens from active installations OR system app tokens
    const appTokens = await prisma.appToken.findMany({
      where: {
        isRevoked: false,
        OR: [
          // Regular app tokens (linked to installation)
          {
            installation: {
              status: 'ACTIVE'
            }
          },
          // System app tokens (no installation, linked directly to app and workspace)
          {
            installationId: null,
            appId: { not: null },
            workspaceId: { not: null }
          }
        ]
      },
      include: {
        installation: {
          include: {
            app: {
              select: {
                id: true,
                slug: true,
                name: true,
                status: true,
                isSystemApp: true
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
        },
        // Include direct app and workspace relations for system app tokens
        app: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            isSystemApp: true
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

    // Check each token's access token
    for (const appToken of appTokens) {
      try {
        if (!appToken.accessToken) continue;

        // Decrypt the stored token
        const storedTokenData = Buffer.from(appToken.accessToken, 'base64');
        const decryptedToken = await decryptToken(storedTokenData);

        // Compare with provided token
        if (decryptedToken === token) {
          // Check if this is a system app token (no installation)
          if (!appToken.installation && appToken.app && appToken.workspace) {
            // System app token - verify it's actually a system app
            if (!appToken.app.isSystemApp) {
              console.warn('Non-system app token found without installation:', appToken.id);
              continue;
            }

            // Return virtual installation data for system app
            return {
              id: `system_${appToken.id}`, // Virtual installation ID
              appId: appToken.app.id,
              workspaceId: appToken.workspace.id,
              installedById: appToken.userId || 'system',
              status: 'ACTIVE',
              scopes: appToken.scopes,
              tokenExpiresAt: appToken.tokenExpiresAt,
              app: appToken.app,
              workspace: appToken.workspace,
              installedBy: {
                id: appToken.userId || 'system',
                email: null,
                name: 'System'
              },
              isSystemAppToken: true
            };
          }

          // Regular installation-based token
          if (appToken.installation) {
            const installation = appToken.installation;

            // Fetch the user who generated this token (or fallback to installer for legacy tokens)
            const tokenUserId = appToken.userId || installation.installedById;
            const tokenUser = await prisma.user.findUnique({
              where: { id: tokenUserId },
              select: {
                id: true,
                email: true,
                name: true
              }
            });

            // If user not found, skip this token
            if (!tokenUser) {
              continue;
            }

            return {
              ...installation,
              // Use scopes from the token if available, fallback to installation scopes
              scopes: appToken.scopes.length > 0 ? appToken.scopes : installation.scopes,
              tokenExpiresAt: appToken.tokenExpiresAt,
              installedBy: tokenUser, // Now returns the token's user, not the installer
              isSystemAppToken: false
            };
          }
        }
      } catch (error) {
        // If decryption fails for this token, continue to next
        console.error('Failed to decrypt access token for appToken:', appToken.id, error);
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

    // Check for workspace override via query parameter (system apps only)
    // Supports both workspace slug (preferred) and workspace ID
    const url = new URL(request.url);
    const workspaceSlugOverride = url.searchParams.get('workspace');
    const workspaceIdOverride = url.searchParams.get('workspaceId');
    const workspaceOverride = workspaceSlugOverride || workspaceIdOverride;

    if (workspaceOverride) {
      // Only allow workspace switching for system apps
      const app = await prisma.app.findUnique({
        where: { id: authResult.context!.app.id },
        select: { isSystemApp: true }
      });

      if (!app?.isSystemApp) {
        return createAuthErrorResponse({
          code: 'workspace_switch_not_allowed',
          message: 'Only system apps can switch workspace context',
          statusCode: 403
        });
      }

      // Find workspace by slug or ID
      const targetWorkspace = await prisma.workspace.findFirst({
        where: workspaceSlugOverride
          ? { slug: workspaceSlugOverride }
          : { id: workspaceIdOverride! },
        select: { id: true, slug: true, name: true }
      });

      if (!targetWorkspace) {
        return createAuthErrorResponse({
          code: 'workspace_not_found',
          message: `Workspace '${workspaceOverride}' not found`,
          statusCode: 404
        });
      }

      // Skip if already in the target workspace
      if (targetWorkspace.id === authResult.context!.workspace.id) {
        return handler(request, authResult.context!, routeParams);
      }

      // Verify user has access to the target workspace
      const membership = await prisma.workspaceMember.findFirst({
        where: {
          userId: authResult.context!.user.id,
          workspaceId: targetWorkspace.id,
          status: 'ACTIVE'
        }
      });

      if (!membership) {
        return createAuthErrorResponse({
          code: 'workspace_access_denied',
          message: `User does not have access to workspace '${workspaceOverride}'`,
          statusCode: 403
        });
      }

      // Update context with the new workspace
      authResult.context!.workspace = {
        id: targetWorkspace.id,
        slug: targetWorkspace.slug,
        name: targetWorkspace.name
      };
      authResult.context!.installation.workspaceId = targetWorkspace.id;
    }

    return handler(request, authResult.context!, routeParams);
  };
}
