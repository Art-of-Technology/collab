import { effectiveAppScopes } from '@/lib/oauth-scopes';
import { postWorkspaceAccessWhere } from "@/lib/post-access";
/**
 * OAuth Authentication Middleware for Third-Party App API Access
 * 
 * This middleware validates OAuth access tokens and extracts app installation
 * context for API requests from third-party applications.
 */

import { NextRequest, NextResponse } from 'next/server';
import { decryptToken, getEncryptionKey } from '@/lib/apps/crypto';
import { hasScope, hasAllScopes, hasAnyScope, normalizeScopes } from '@/lib/oauth-scopes';

import { prisma } from '@/lib/prisma';

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
  /**
   * How to evaluate required scopes:
   * - 'all' (default): Token must have ALL listed scopes
   * - 'any': Token must have at least ONE of the listed scopes
   */
  scopeMode?: 'all' | 'any';
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

function authenticationError(error: unknown): NonNullable<AuthMiddlewareResult['error']> {
  const codes = typeof error === 'object' && error !== null
    ? ['code' in error ? error.code : null, 'errorCode' in error ? error.errorCode : null] : [];
  const transientCode = codes.find((code): code is string => typeof code === 'string' && ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(code));
  const unavailable = transientCode !== undefined;
  console.error(unavailable ? `App authentication temporarily unavailable (${transientCode})` : 'App authentication error');
  return {
    code: unavailable ? 'temporarily_unavailable' : 'server_error',
    message: unavailable ? 'Authentication is temporarily unavailable' : 'Internal server error during authentication',
    statusCode: unavailable ? 503 : 500
  };
}

/**
 * Extract and validate OAuth access token from request
 */
export async function authenticateAppRequest(
  request: NextRequest,
  options: AuthMiddlewareOptions = {}
): Promise<AuthMiddlewareResult> {
  const { requiredScopes = [], scopeMode = 'all', allowExpired = false } = options;

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
      const hasRequiredScopes = scopeMode === 'any'
        ? hasAnyScope(normalizedRequired, installation.scopes)
        : hasAllScopes(normalizedRequired, installation.scopes);
      if (!hasRequiredScopes) {
        const modeLabel = scopeMode === 'any' ? 'one of' : 'all of';
        return {
          success: false,
          error: {
            code: 'insufficient_scope',
            message: `Insufficient scope. Required ${modeLabel}: ${normalizedRequired.join(', ')}`,
            statusCode: 403
          }
        };
      }
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: installation.workspaceId, ...postWorkspaceAccessWhere(installation.installedBy.id) },
      select: { id: true },
    });
    if (!workspace) {
      return { success: false, error: { code: 'workspace_access_denied', message: 'Workspace access denied', statusCode: 403 } };
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
    return {
      success: false,
      error: authenticationError(error)
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
  getEncryptionKey();
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
              isSystemApp: true,
              scopes: true
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
          isSystemApp: true,
          scopes: true
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
    if (!appToken.accessToken) continue;
    let decryptedToken: string;
    try {
      // Decrypt the stored token
      const storedTokenData = Buffer.from(appToken.accessToken, 'base64');
      decryptedToken = await decryptToken(storedTokenData);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'TOKEN_ENCRYPTION_CONFIGURATION') throw error;
      // A damaged token must not block other valid tokens.
      console.error('Failed to decrypt stored access token');
      continue;
    }

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
          scopes: effectiveAppScopes(appToken.scopes, appToken.app.scopes),
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
          // A token can never gain permissions from a wider installation or app.
          scopes: effectiveAppScopes(appToken.scopes, installation.app.scopes, installation.scopes),
          tokenExpiresAt: appToken.tokenExpiresAt,
          installedBy: tokenUser, // Now returns the token's user, not the installer
          isSystemAppToken: false
        };
      }
    }
  }

  return null;
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
      try {
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

        if (targetWorkspace.id !== authResult.context!.workspace.id) {
          const accessibleWorkspace = await prisma.workspace.findFirst({
            where: { id: targetWorkspace.id, ...postWorkspaceAccessWhere(authResult.context!.user.id) },
            select: { id: true },
          });
          if (!accessibleWorkspace) {
            return createAuthErrorResponse({ code: 'workspace_access_denied', message: 'Workspace access denied', statusCode: 403 });
          }

          // Update context with the new workspace
          authResult.context!.workspace = {
            id: targetWorkspace.id,
            slug: targetWorkspace.slug,
            name: targetWorkspace.name
          };
          authResult.context!.installation.workspaceId = targetWorkspace.id;
        }
      } catch (error) {
        return createAuthErrorResponse(authenticationError(error));
      }
    }

    return handler(request, authResult.context!, routeParams);
  };
}
