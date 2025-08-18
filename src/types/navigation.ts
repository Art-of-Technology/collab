import type { LucideIcon } from "lucide-react";

export interface NavigationWorkspace {
  id: string;
  name: string;
  slug: string;
  image?: string;
  isPersonal?: boolean;
}

export interface NavigationProject {
  id: string;
  name: string;
  slug: string;
  issuePrefix: string;
  color?: string;
  isDefault?: boolean;
  icon?: LucideIcon;
  issueCount?: number;
  activeIssueCount?: number;
}

export interface NavigationView {
  id: string;
  name: string;
  description?: string;
  type: 'SYSTEM' | 'PERSONAL' | 'SHARED';
  displayType: 'KANBAN' | 'LIST' | 'TABLE' | 'CALENDAR' | 'TIMELINE' | 'GANTT' | 'BOARD';
  visibility: 'PERSONAL' | 'WORKSPACE' | 'SHARED';
  icon?: LucideIcon;
  color?: string;
  issueCount?: number;
  filters?: ViewFilters;
  projectIds?: string[]; // For multi-project views
  isDefault?: boolean;
  isFavorite?: boolean;
  createdBy?: string;
  sharedWith?: string[]; // User IDs for shared views
}

export interface ViewFilters {
  // Issue properties
  types?: string[]; // EPIC, STORY, TASK, etc.
  statuses?: string[];
  priorities?: string[];
  assigneeIds?: string[];
  reporterIds?: string[];
  labelIds?: string[];
  
  // Date filters
  dueDateRange?: {
    start?: Date;
    end?: Date;
  };
  createdDateRange?: {
    start?: Date;
    end?: Date;
  };
  updatedDateRange?: {
    start?: Date;
    end?: Date;
  };
  
  // Text search
  searchQuery?: string;
  
  // Hierarchy filters
  parentId?: string;
  hasChildren?: boolean;
  
  // Advanced filters
  storyPointsRange?: {
    min?: number;
    max?: number;
  };
  progressRange?: {
    min?: number;
    max?: number;
  };
  
  // Custom filters
  customFields?: Record<string, any>;
}

export interface NavigationSection {
  id: string;
  title: string;
  type: 'VIEWS' | 'PROJECTS' | 'QUICK_ACTIONS' | 'SETTINGS';
  items: NavigationItem[];
  isCollapsible?: boolean;
  isCollapsed?: boolean;
  canCreate?: boolean;
  createLabel?: string;
  createAction?: () => void;
}

export interface NavigationItem {
  id: string;
  label: string;
  href?: string;
  icon?: LucideIcon;
  color?: string;
  count?: number;
  isActive?: boolean;
  isFavorite?: boolean;
  children?: NavigationItem[];
  type?: 'VIEW' | 'PROJECT' | 'ACTION' | 'LINK';
  metadata?: {
    view?: NavigationView;
    project?: NavigationProject;
    [key: string]: any;
  };
}

export interface QuickAction {
  id: string;
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  action: () => void;
  color?: string;
}

export interface NavigationState {
  // Current selections
  currentWorkspace?: NavigationWorkspace;
  currentProject?: NavigationProject;
  currentView?: NavigationView;
  
  // Navigation data
  workspaces: NavigationWorkspace[];
  projects: NavigationProject[];
  views: NavigationView[];
  sections: NavigationSection[];
  quickActions: QuickAction[];
  
  // UI state
  isCollapsed: boolean;
  activeSection?: string;
  searchQuery?: string;
  
  // Loading states
  isLoadingProjects: boolean;
  isLoadingViews: boolean;
  isLoadingWorkspaces: boolean;
}

export interface NavigationActions {
  // Workspace actions
  selectWorkspace: (workspace: NavigationWorkspace) => void;
  refreshWorkspaces: () => Promise<void>;
  
  // Project actions
  selectProject: (project: NavigationProject) => void;
  createProject: () => void;
  refreshProjects: () => Promise<void>;
  
  // View actions
  selectView: (view: NavigationView) => void;
  createView: (type?: NavigationView['displayType']) => void;
  favoriteView: (viewId: string) => void;
  refreshViews: () => Promise<void>;
  
  // UI actions
  toggleSidebar: () => void;
  toggleSection: (sectionId: string) => void;
  setSearchQuery: (query: string) => void;
  
  // Quick actions
  executeQuickAction: (actionId: string) => void;
} 