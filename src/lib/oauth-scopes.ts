/**
 * OAuth Scope Management Utilities
 * 
 * This module provides consistent handling of OAuth scopes throughout the application.
 * It addresses the inconsistency where scopes are stored as both strings and arrays
 * in different parts of the database and application.
 * 
 * SCOPE FORMAT STANDARDIZATION:
 * - Database storage: String arrays (AppInstallation.scopes: String[])
 * - OAuth responses: Space-separated strings (per OAuth 2.0 spec)
 * - Internal processing: Normalized string arrays
 * - Authorization codes: Space-separated strings (AppOAuthAuthorizationCode.scope: String)
 * 
 * This utility ensures all scope operations are consistent and type-safe.
 */

/**
 * Standard OAuth scopes supported by the platform
 */
export const SUPPORTED_SCOPES = [
  'user:read',
  'user:write',
  'issues:read',
  'issues:write',
  'posts:read',
  'posts:write',
  'workspace:read',
  'workspace:write',
  'profile:read',
  'profile:write',
  'comments:read',
  'comments:write',
  'leave:read',
  'leave:write',
  'projects:read',
  'projects:write',
  'views:read',
  'views:write',
  'labels:read',
  'labels:write',
  // Notes & Knowledge System (Phase 6)
  'notes:read',
  'notes:write',
  'knowledge:read',
  'prompts:read',
  'secrets:read',
] as const;

export type SupportedScope = typeof SUPPORTED_SCOPES[number];

/**
 * Normalize scopes from any input format to a consistent array of strings
 * 
 * @param scopes - Scopes in any format: string, string[], or mixed
 * @returns Normalized array of unique, valid scope strings
 */
export function normalizeScopes(scopes: string | string[] | null | undefined): string[] {
  if (!scopes) {
    return [];
  }

  let scopeArray: string[];

  if (Array.isArray(scopes)) {
    // Handle array of scopes
    scopeArray = scopes.flatMap(scope =>
      typeof scope === 'string' ? scope.split(/\s+/) : []
    );
  } else if (typeof scopes === 'string') {
    // Handle space-separated string of scopes
    scopeArray = scopes.split(/\s+/);
  } else {
    return [];
  }

  // Filter out empty strings and duplicates, return only valid scopes
  return [...new Set(
    scopeArray
      .map(scope => scope.trim())
      .filter(scope => scope.length > 0)
  )];
}

/**
 * Convert normalized scope array to space-separated string for OAuth responses
 * 
 * @param scopes - Array of scope strings
 * @returns Space-separated scope string
 */
export function scopesToString(scopes: string[]): string {
  return normalizeScopes(scopes).join(' ');
}

/**
 * Convert space-separated scope string to array for database storage
 * 
 * @param scopeString - Space-separated scope string
 * @returns Array of scope strings
 */
export function scopesFromString(scopeString: string): string[] {
  return normalizeScopes(scopeString);
}

/**
 * Validate that all provided scopes are supported by the platform
 * 
 * @param scopes - Scopes to validate (any format)
 * @returns Object with validation result and details
 */
export function validateScopes(scopes: string | string[] | null | undefined): {
  valid: boolean;
  validScopes: string[];
  invalidScopes: string[];
  normalizedScopes: string[];
} {
  const normalizedScopes = normalizeScopes(scopes);
  const validScopes: string[] = [];
  const invalidScopes: string[] = [];

  for (const scope of normalizedScopes) {
    if (SUPPORTED_SCOPES.includes(scope as SupportedScope)) {
      validScopes.push(scope);
    } else {
      invalidScopes.push(scope);
    }
  }

  return {
    valid: invalidScopes.length === 0 && validScopes.length > 0,
    validScopes,
    invalidScopes,
    normalizedScopes
  };
}

/**
 * Filter requested scopes against granted/available scopes
 * 
 * @param requestedScopes - Scopes being requested
 * @param availableScopes - Scopes that are available/granted
 * @returns Array of scopes that are both requested and available
 */
export function filterGrantedScopes(
  requestedScopes: string | string[] | null | undefined,
  availableScopes: string | string[] | null | undefined
): string[] {
  const normalizedRequested = normalizeScopes(requestedScopes);
  const normalizedAvailable = normalizeScopes(availableScopes);

  return normalizedRequested.filter(scope =>
    normalizedAvailable.includes(scope)
  );
}

/**
 * Check if a specific scope is included in a scope set
 * 
 * @param targetScope - The scope to check for
 * @param scopes - The scope set to check in
 * @returns True if the target scope is included
 */
export function hasScope(
  targetScope: string,
  scopes: string | string[] | null | undefined
): boolean {
  const normalizedScopes = normalizeScopes(scopes);
  return normalizedScopes.includes(targetScope);
}

/**
 * Check if all required scopes are present in the provided scope set
 * 
 * @param requiredScopes - Scopes that are required
 * @param providedScopes - Scopes that are provided
 * @returns True if all required scopes are present
 */
export function hasAllScopes(
  requiredScopes: string | string[],
  providedScopes: string | string[] | null | undefined
): boolean {
  const normalizedRequired = normalizeScopes(requiredScopes);
  const normalizedProvided = normalizeScopes(providedScopes);

  return normalizedRequired.every(scope =>
    normalizedProvided.includes(scope)
  );
}

/**
 * Get default scopes for new app installations
 * 
 * @returns Array of default scope strings
 */
export function getDefaultScopes(): string[] {
  return ['read'];
}

/**
 * Merge multiple scope sets into one normalized set
 * 
 * @param scopeSets - Multiple scope sets to merge
 * @returns Merged and normalized array of unique scopes
 */
export function mergeScopes(...scopeSets: (string | string[] | null | undefined)[]): string[] {
  const allScopes = scopeSets.flatMap(scopes => normalizeScopes(scopes));
  return [...new Set(allScopes)];
}

/**
 * Type guard to check if a scope is supported
 * 
 * @param scope - Scope to check
 * @returns True if scope is supported
 */
export function isSupportedScope(scope: string): scope is SupportedScope {
  return SUPPORTED_SCOPES.includes(scope as SupportedScope);
}

/**
 * Get human-readable descriptions for scopes
 * 
 * @param scope - The scope to describe
 * @returns Human-readable description
 */
export function getScopeDescription(scope: string): string {
  const descriptions: Record<string, string> = {
    'issues:read': 'Read access to issues',
    'issues:write': 'Create and modify issues',
    'posts:read': 'Read access to posts',
    'posts:write': 'Create and modify posts',
    'workspace:read': 'Read access to workspace information',
    'workspace:write': 'Modify workspace settings',
    'profile:read': 'Read access to user profiles',
    'profile:write': 'Modify user profiles',
    'comments:read': 'Read access to comments',
    'comments:write': 'Create and modify comments',
    'leave:read': 'Read access to leave requests',
    'leave:write': 'Create and modify leave requests',
    // Notes & Knowledge System (Phase 6)
    'notes:read': 'Read notes and knowledge base articles',
    'notes:write': 'Create and modify notes',
    'knowledge:read': 'Access knowledge base and documentation',
    'prompts:read': 'Read AI system prompts and context',
    'secrets:read': 'Read encrypted secrets (requires explicit grant)',
  };

  return descriptions[scope] || `Access to ${scope}`;
}

/**
 * Check if a redirect URI is a valid localhost callback URL.
 * Used for system apps (like MCP) that use dynamic ports.
 *
 * @param redirectUri - The redirect URI to validate
 * @returns True if it's a valid localhost callback URL
 */
export function isValidLocalhostRedirect(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    const isLocalhost = url.protocol === 'http:' &&
                        (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    const hasValidPort = /^\d+$/.test(url.port) &&
                         parseInt(url.port, 10) >= 1 &&
                         parseInt(url.port, 10) <= 65535;
    const hasCallbackPath = url.pathname === '/callback';

    return isLocalhost && hasValidPort && hasCallbackPath;
  } catch {
    return false;
  }
}

/**
 * Check if a redirect URI uses a custom protocol scheme (e.g., cursor://, vscode://).
 * These are used by desktop apps for OAuth callbacks.
 *
 * @param redirectUri - The redirect URI to validate
 * @returns True if it's a valid custom protocol callback URL
 */
export function isValidCustomProtocolRedirect(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    // Allow custom protocols (not http/https) that end with /callback or /oauth/callback
    const isCustomProtocol = !['http:', 'https:'].includes(url.protocol);
    const hasCallbackPath = url.pathname === '/callback' ||
                            url.pathname === '/oauth/callback' ||
                            url.pathname.endsWith('/callback');

    return isCustomProtocol && hasCallbackPath;
  } catch {
    return false;
  }
}

/**
 * Validate redirect URI against allowed URIs, with special handling for system apps.
 * System apps (like MCP) are allowed to use:
 * - Any localhost callback URL with dynamic ports (for CLI tools like Claude Code)
 * - Custom protocol schemes (for desktop apps like Cursor, VS Code)
 *
 * @param redirectUri - The redirect URI to validate
 * @param allowedUris - Array of allowed redirect URIs
 * @param isSystemApp - Whether this is a system app
 * @returns True if the redirect URI is allowed
 */
export function isAllowedRedirectUri(
  redirectUri: string,
  allowedUris: string[],
  isSystemApp: boolean
): boolean {
  // First check exact match against registered URIs
  if (allowedUris.includes(redirectUri)) {
    return true;
  }

  // For system apps, allow flexible redirect URIs
  if (isSystemApp) {
    // Allow localhost callbacks with dynamic ports (Claude Code, CLI tools)
    if (isValidLocalhostRedirect(redirectUri)) {
      return true;
    }
    // Allow custom protocol schemes (Cursor, VS Code, other desktop apps)
    if (isValidCustomProtocolRedirect(redirectUri)) {
      return true;
    }
  }

  return false;
}
