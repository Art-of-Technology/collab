import { getWorkspaceSlug } from './client-slug-resolvers';

/**
 * Generate back navigation URL for issue detail pages
 * Handles cases with/without view context and resolves workspace slugs
 */
export async function generateBackNavigationUrl(
  workspaceId: string, 
  issue: { projectId: string; project?: { slug?: string } } | null,
  viewSlug?: string | null
): Promise<string> {
  try {
    // Get workspace slug instead of using ID
    const workspaceSlug = await getWorkspaceSlug(workspaceId) || workspaceId;

    // If we have viewSlug, use it with the workspace slug
    if (viewSlug) {
      return `/${workspaceSlug}/views/${viewSlug}`;
    }

    // If no viewSlug but we have an issue with projectId, try to find default view
    if (issue?.projectId) {
      try {
        const projectId = issue.projectId;
        const response = await fetch(`/api/projects/${projectId}/default-view`, { cache: 'no-store' });

        if (response.ok) {
          const defaultView = await response.json();
          if (defaultView?.slug) {
            return `/${workspaceSlug}/views/${defaultView.slug}`;
          }
        }
      } catch (error) {
        console.error('Error fetching default view:', error);
      }
      
      // Keep project context if its default view is unavailable.
      return issue.project?.slug
        ? `/${workspaceSlug}/projects/${issue.project.slug}`
        : `/${workspaceSlug}/views`;
    }

    // Final fallback to views list
    return `/${workspaceSlug}/views`;
  } catch (error) {
    console.error('Error generating back navigation URL:', error);
    
    // Last resort fallback
    if (viewSlug && workspaceId) {
      return `/${workspaceId}/views/${viewSlug}`;
    }
    
    if (workspaceId) {
      return `/${workspaceId}/views`;
    }
    
    return '/';
  }
}

/**
 * Generate proper view name for back button display
 */
export function generateBackButtonText(
  viewName?: string | null,
  projectName?: string,
  defaultText: string = 'Back to Views'
): string {
  if (viewName) {
    return `Back to ${viewName}`;
  }
  
  if (projectName) {
    return `Back to ${projectName}: Default`;
  }
  
  return defaultText;
}
