/**
 * URL utility functions for user-friendly URLs
 * Transforms UUIDs into human-readable slugs and issue keys
 */

// URL Generation Functions

/**
 * Generate workspace URL using slug
 */
export function getWorkspaceUrl(workspaceSlug: string, path: string = '/dashboard'): string {
  return `/${workspaceSlug}${path}`;
}

/**
 * Generate board URL using workspace and board slugs
 */
export function getBoardUrl(workspaceSlug: string, boardSlug: string, view: string = 'kanban'): string {
  return `/${workspaceSlug}/tasks?board=${boardSlug}&view=${view}`;
}

/**
 * Generate task URL using workspace slug, board slug, and issue key
 */
export function getTaskUrl(workspaceSlug: string, boardSlug: string, issueKey: string, view: string = 'kanban'): string {
  return `/${workspaceSlug}/tasks?board=${boardSlug}&view=${view}&taskId=${issueKey}`;
}

/**
 * Generate issue key from prefix and number
 */
export function generateIssueKey(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

// URL Parsing Functions

/**
 * Extract workspace slug from URL path
 */
export function getWorkspaceSlugFromPath(pathname: string): string | null {
  if (!pathname) return null;
  
  // Match pattern: /{workspaceSlug}/... 
  const match = pathname.match(/^\/([^\/]+)(?:\/.*)?$/);
  if (match && match[1]) {
    const potentialSlug = match[1];
    // Exclude known non-workspace routes
    const nonWorkspaceRoutes = ['welcome', 'workspaces', 'create-workspace', 'workspace-invitation', 'login', 'home', 'terms', 'privacy-policy'];
    if (!nonWorkspaceRoutes.includes(potentialSlug)) {
      return potentialSlug;
    }
  }
  return null;
}

/**
 * Extract board slug from URL search params
 */
export function getBoardSlugFromParams(searchParams: URLSearchParams): string | null {
  return searchParams.get('board');
}

/**
 * Extract issue key from URL search params
 */
export function getIssueKeyFromParams(searchParams: URLSearchParams): string | null {
  return searchParams.get('taskId');
}

/**
 * Parse issue key into prefix and number
 */
export function parseIssueKey(issueKey: string): { prefix: string; number: number } | null {
  const match = issueKey.match(/^([A-Za-z]+)-(\d+)$/);
  if (match) {
    return {
      prefix: match[1],
      number: parseInt(match[2], 10)
    };
  }
  return null;
}

// Validation Functions

/**
 * Validate workspace slug format
 */
export function isValidWorkspaceSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && slug.length >= 2 && slug.length <= 50;
}

/**
 * Validate board slug format
 */
export function isValidBoardSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && slug.length >= 2 && slug.length <= 50;
}

/**
 * Validate issue key format
 */
export function isValidIssueKey(issueKey: string): boolean {
  return /^[A-Za-z]+-\d+$/.test(issueKey);
}

// Slug Generation Functions

/**
 * Generate slug from name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50); // Limit length
}

// Migration/Legacy URL Support

/**
 * Check if a string looks like a UUID (legacy workspace/board ID)
 */
export function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Check if we're dealing with a legacy URL that uses UUIDs
 */
export function isLegacyUrl(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return segments.length > 0 && isUUID(segments[0]);
} 