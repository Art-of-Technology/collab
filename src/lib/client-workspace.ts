"use client";

/**
 * Client-side workspace utilities
 */

export function getWorkspaceIdFromClient(): string | null {
  // Try to extract workspace ID from current URL
  if (typeof window === 'undefined') return null;
  
  const pathname = window.location.pathname;
  const pathSegments = pathname.split('/').filter(Boolean);
  
  // Look for workspace pattern: /[workspaceId]/...
  if (pathSegments.length > 0) {
    const potentialWorkspaceId = pathSegments[0];
    
    // Skip common non-workspace routes
    const skipRoutes = ['login', 'register', 'home', 'privacy-policy', 'terms', 'create-workspace', 'workspaces', 'welcome'];
    if (!skipRoutes.includes(potentialWorkspaceId)) {
      return potentialWorkspaceId;
    }
  }
  
  return null;
}

export function getWorkspaceSlugFromUrl(): string | null {
  return getWorkspaceIdFromClient(); // Same logic for now
}