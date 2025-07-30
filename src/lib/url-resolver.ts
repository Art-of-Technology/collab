/**
 * Global URL Resolver Utility
 * 
 * This utility provides a centralized way to generate all URLs in the application.
 * It supports:
 * - Future localization (/es, /en prefixes)
 * - Slug-based URLs vs UUID-based URLs
 * - Consistent URL patterns
 * - Easy migration and updates
 */

import { isUUID } from './url-utils';

// Configuration types
interface UrlConfig {
  locale?: string;
  baseUrl?: string;
  useTrailingSlash?: boolean;
}

interface WorkspaceUrlParams {
  workspaceSlug: string;
  path?: string;
}

interface BoardUrlParams {
  workspaceSlug: string;
  boardSlug: string;
  view?: string;
}

interface TaskUrlParams {
  workspaceSlug: string;
  boardSlug: string;
  issueKey: string;
  view?: string;
}

interface FeatureUrlParams {
  workspaceSlug: string;
  featureId: string;
}

interface ProfileUrlParams {
  workspaceSlug: string;
  section?: string;
}

// Default configuration
const DEFAULT_CONFIG: UrlConfig = {
  locale: undefined, // No locale by default, ready for future i18n
  baseUrl: '',
  useTrailingSlash: false,
};

class UrlResolver {
  private config: UrlConfig;

  constructor(config: UrlConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update global configuration
   */
  configure(config: Partial<UrlConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Generate base path with locale support
   */
  private getBasePath(): string {
    const { locale } = this.config;
    return locale ? `/${locale}` : '';
  }

  /**
   * Format final URL with base URL and trailing slash if configured
   */
  private formatUrl(path: string): string {
    const { baseUrl, useTrailingSlash } = this.config;
    const basePath = this.getBasePath();
    let fullPath = `${basePath}${path}`;
    
    if (useTrailingSlash && !fullPath.endsWith('/') && !fullPath.includes('?')) {
      fullPath += '/';
    }
    
    return `${baseUrl}${fullPath}`;
  }

  // ========== Authentication URLs ==========

  login(): string {
    return this.formatUrl('/login');
  }

  register(): string {
    return this.formatUrl('/register');
  }

  home(): string {
    return this.formatUrl('/home');
  }

  // ========== Workspace URLs ==========

  workspace({ workspaceSlug, path = '/dashboard' }: WorkspaceUrlParams): string {
    return this.formatUrl(`/${workspaceSlug}${path}`);
  }

  workspaceDashboard(workspaceSlug: string): string {
    return this.workspace({ workspaceSlug, path: '/dashboard' });
  }

  workspaceTimeline(workspaceSlug: string): string {
    return this.workspace({ workspaceSlug, path: '/timeline' });
  }

  workspacePosts(workspaceSlug: string): string {
    return this.workspace({ workspaceSlug, path: '/posts' });
  }

  workspaceNotes(workspaceSlug: string): string {
    return this.workspace({ workspaceSlug, path: '/notes' });
  }

  workspaceSearch(workspaceSlug: string, query?: string): string {
    const base = this.workspace({ workspaceSlug, path: '/search' });
    return query ? `${base}?q=${encodeURIComponent(query)}` : base;
  }

  workspaceProfile({ workspaceSlug, section }: ProfileUrlParams): string {
    const path = section ? `/profile/${section}` : '/profile';
    return this.workspace({ workspaceSlug, path });
  }

  // ========== Board & Task URLs ==========

  tasks(workspaceSlug: string): string {
    return this.workspace({ workspaceSlug, path: '/tasks' });
  }

  board({ workspaceSlug, boardSlug, view = 'kanban' }: BoardUrlParams): string {
    return this.formatUrl(`/${workspaceSlug}/tasks?board=${boardSlug}&view=${view}`);
  }

  task({ workspaceSlug, boardSlug, issueKey, view = 'kanban' }: TaskUrlParams): string {
    return this.formatUrl(`/${workspaceSlug}/tasks?board=${boardSlug}&view=${view}&taskId=${issueKey}`);
  }

  // ========== Project Management URLs ==========

  milestones(workspaceSlug: string): string {
    return this.workspace({ workspaceSlug, path: '/milestones' });
  }

  milestone(workspaceSlug: string, milestoneId: string): string {
    return this.workspace({ workspaceSlug, path: `/milestones/${milestoneId}` });
  }

  epics(workspaceSlug: string): string {
    return this.workspace({ workspaceSlug, path: '/epics' });
  }

  epic(workspaceSlug: string, epicId: string): string {
    return this.workspace({ workspaceSlug, path: `/epics/${epicId}` });
  }

  stories(workspaceSlug: string): string {
    return this.workspace({ workspaceSlug, path: '/stories' });
  }

  story(workspaceSlug: string, storyId: string): string {
    return this.workspace({ workspaceSlug, path: `/stories/${storyId}` });
  }

  // ========== Feature Request URLs ==========

  features(workspaceSlug: string): string {
    return this.workspace({ workspaceSlug, path: '/features' });
  }

  feature({ workspaceSlug, featureId }: FeatureUrlParams): string {
    return this.workspace({ workspaceSlug, path: `/features/${featureId}` });
  }

  // ========== Communication URLs ==========

  messages(workspaceSlug: string): string {
    return this.workspace({ workspaceSlug, path: '/messages' });
  }

  conversation(workspaceSlug: string, conversationId: string): string {
    return this.workspace({ workspaceSlug, path: `/messages/${conversationId}` });
  }

  // ========== Management URLs ==========

  workspaces(): string {
    return this.formatUrl('/workspaces');
  }

  createWorkspace(): string {
    return this.formatUrl('/create-workspace');
  }

  workspaceInvitation(token: string): string {
    return this.formatUrl(`/workspace-invitation/${token}`);
  }

  workspaceSettings(workspaceSlug: string, section?: string): string {
    const path = section ? `/settings/${section}` : '/settings';
    return this.workspace({ workspaceSlug, path });
  }

  // ========== Utility URLs ==========

  welcome(): string {
    return this.formatUrl('/welcome');
  }

  terms(): string {
    return this.formatUrl('/terms');
  }

  privacyPolicy(): string {
    return this.formatUrl('/privacy-policy');
  }

  // ========== API URLs ==========

  api = {
    workspaces: () => '/api/workspaces',
    workspace: (workspaceId: string) => `/api/workspaces/${workspaceId}`,
    workspaceBoards: (workspaceId: string) => `/api/workspaces/${workspaceId}/boards`,
    boards: () => '/api/taskboards',
    board: (boardId: string) => `/api/tasks/boards/${boardId}`,
    tasks: () => '/api/tasks',
    task: (taskId: string) => `/api/tasks/${taskId}`,
    boardColumns: (boardId: string) => `/api/tasks/boards/${boardId}/columns`,
    taskComments: (taskId: string) => `/api/tasks/${taskId}/comments`,
    upload: () => '/api/upload',
    user: () => '/api/user',
    notifications: () => '/api/notifications',
    mentions: () => '/api/mentions',
    features: () => '/api/features',
    posts: () => '/api/posts',
    notes: () => '/api/notes',
  };

  // ========== Legacy Support ==========

  /**
   * Convert legacy UUID-based URLs to slug-based URLs
   * Used during migration period
   */
  migrateLegacyUrl(pathname: string, slugMappings: Record<string, string>): string {
    let newPathname = pathname;
    
    // Replace workspace UUIDs with slugs
    Object.entries(slugMappings).forEach(([uuid, slug]) => {
      if (isUUID(uuid)) {
        newPathname = newPathname.replace(`/${uuid}`, `/${slug}`);
        newPathname = newPathname.replace(`board=${uuid}`, `board=${slug}`);
        newPathname = newPathname.replace(`workspaceId=${uuid}`, `workspaceId=${slug}`);
      }
    });

    return this.formatUrl(newPathname);
  }

  /**
   * Check if URL needs migration from UUID to slug
   */
  needsMigration(pathname: string): boolean {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0];
    
    // Skip locale segment if present
    const workspaceSegment = this.config.locale && firstSegment === this.config.locale 
      ? segments[1] 
      : firstSegment;
    
    return Boolean(workspaceSegment && isUUID(workspaceSegment));
  }
}

// Create singleton instance
export const urlResolver = new UrlResolver();

// Export the class for custom instances if needed
export { UrlResolver };

// Export types for TypeScript support
export type {
  UrlConfig,
  WorkspaceUrlParams,
  BoardUrlParams,
  TaskUrlParams,
  FeatureUrlParams,
  ProfileUrlParams,
};

// Convenience functions (backwards compatibility)
export const urls = urlResolver; 