"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  HomeIcon,
  HashtagIcon,
  UserGroupIcon,
  PlusIcon,
  EnvelopeIcon,
  Squares2X2Icon,
  RectangleStackIcon,
  DocumentTextIcon,
  ClockIcon
} from "@heroicons/react/24/outline";
import { LightBulbIcon, UserIcon } from "@heroicons/react/24/outline";
import { 
  Search, 
  Target, 
  Zap, 
  Archive, 
  Star, 
  ChevronDown, 
  ChevronRight, 
  Filter,
  Loader2,
  MoreHorizontal,
  Settings,
  Keyboard,
  LogOut
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import WorkspaceSelector from "@/components/workspace/WorkspaceSelector";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useProjects } from "@/hooks/queries/useProjects";
import { useViews } from "@/hooks/queries/useViews";
import CreateViewModal from "@/components/modals/CreateViewModal";
import { urls } from "@/lib/url-resolver";
import { cn } from "@/lib/utils";

interface SidebarProps {
  pathname?: string;
  isCollapsed?: boolean;
  toggleSidebar?: () => void;
}

export default function Sidebar({ pathname = "", isCollapsed = false, toggleSidebar }: SidebarProps) {
  const { data: session } = useSession();
  const { currentWorkspace, isLoading } = useWorkspace();
  const { settings } = useWorkspaceSettings();
  
  // Use TanStack Query hook to fetch user data
  const { data: userData } = useCurrentUser();

  // Fetch projects and views using the new hooks
  const { data: projects = [], isLoading: isProjectsLoading } = useProjects({
    workspaceId: currentWorkspace?.id,
    includeStats: true
  });
  
  const { data: views = [], isLoading: isViewsLoading } = useViews({
    workspaceId: currentWorkspace?.id,
    includeStats: true
  });

  // Local state for enhanced sidebar features
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    views: false,
    projects: false
  });
  const [showCreateViewModal, setShowCreateViewModal] = useState(false);

  // Generate navigation based on current workspace
  const getNavigation = () => {
    // Always provide navigation structure to prevent layout shifts
    // Use currentWorkspace.slug if available, or fallback to ID, or 'loading' as placeholder
    const workspaceSlug = currentWorkspace?.slug;
    const workspaceId = currentWorkspace?.id || 'loading';
    
    // Helper function to generate URLs with fallback
    const getUrl = (path: string) => {
      if (workspaceSlug) {
        // Use URL resolver for slug-based URLs
        switch (path) {
          case '/dashboard':
            return urls.workspaceDashboard(workspaceSlug);
          case '/timeline':
            return urls.workspaceTimeline(workspaceSlug);
          case '/tasks':
            return urls.tasks(workspaceSlug);
          case '/notes':
            return urls.workspaceNotes(workspaceSlug);
          case '/my-posts':
            return urls.workspace({ workspaceSlug, path: '/my-posts' });
          case '/bookmarks':
            return urls.workspace({ workspaceSlug, path: '/bookmarks' });
          case '/profile':
            return urls.workspaceProfile({ workspaceSlug });
          case '/messages':
            return urls.messages(workspaceSlug);
          case '/tags':
            return urls.workspace({ workspaceSlug, path: '/tags' });
          case '/features':
            return urls.features(workspaceSlug);
          case '/timesheet':
            return urls.workspace({ workspaceSlug, path: '/timesheet' });
          default:
            return urls.workspace({ workspaceSlug, path });
        }
      }
      // Fallback to legacy URL structure
      return `/${workspaceId}${path}`;
    };

    const baseNavigation = [
      {
        name: "Dashboard",
        href: getUrl('/dashboard'),
        icon: Squares2X2Icon,
        current: pathname === getUrl('/dashboard') || pathname === `/${workspaceId}/dashboard`,
      },
      {
        name: "Timeline",
        href: getUrl('/timeline'),
        icon: HomeIcon,
        current: pathname === getUrl('/timeline') || pathname === `/${workspaceId}/timeline`,
      },

    ];

    // Conditionally add Timesheet if time tracking is enabled
    if (settings?.timeTrackingEnabled) {
      baseNavigation.push({
        name: "Timesheet",
        href: getUrl('/timesheet'),
        icon: ClockIcon,
        current: pathname === getUrl('/timesheet') || pathname === `/${workspaceId}/timesheet`,
      });
    }

    // Add the rest of the navigation items
    baseNavigation.push(
      {
        name: "Notes",
        href: getUrl('/notes'),
        icon: DocumentTextIcon,
        current: pathname === getUrl('/notes') || pathname === `/${workspaceId}/notes`,
      },
      {
        name: "My Posts",
        href: getUrl('/my-posts'),
        icon: UserGroupIcon,
        current: pathname === getUrl('/my-posts') || pathname === `/${workspaceId}/my-posts`,
      },
      {
        name: "Bookmarks",
        href: getUrl('/bookmarks'),
        icon: PlusIcon,
        current: pathname === getUrl('/bookmarks') || pathname === `/${workspaceId}/bookmarks`,
      },
      {
        name: "Profile",
        href: getUrl('/profile'),
        icon: UserIcon,
        current: pathname === getUrl('/profile') || pathname === `/${workspaceId}/profile`,
      },
      {
        name: "Messages",
        href: getUrl('/messages'),
        icon: EnvelopeIcon,
        current: pathname === getUrl('/messages') || pathname === `/${workspaceId}/messages` || pathname.startsWith(getUrl('/messages') + '/') || pathname.startsWith(`/${workspaceId}/messages/`),
      },
      {
        name: "Tags",
        href: getUrl('/tags'),
        icon: HashtagIcon,
        current: pathname === getUrl('/tags') || pathname === `/${workspaceId}/tags`,
      },
      {
        name: "Feature Requests",
        href: getUrl('/features'),
        icon: LightBulbIcon,
        current: pathname === getUrl('/features') || pathname === `/${workspaceId}/features`,
      },
    );

    return baseNavigation;
  };

  const navigation = getNavigation();

  // Quick actions for Linear-style functionality
  const quickActions = [
    {
      id: 'new-issue',
      label: 'New Issue',
      shortcut: 'C',
      icon: PlusIcon,
      action: () => {
        // TODO: Open issue creation modal
        console.log('Create new issue');
      },
      color: '#3b82f6'
    },
    {
      id: 'search',
      label: 'Search',
      shortcut: '/',
      icon: Search,
      action: () => {
        // Focus search input
        document.querySelector('input[placeholder="Search issues..."]')?.focus();
      },
      color: '#6b7280'
    },
    {
      id: 'filter',
      label: 'Filter',
      shortcut: 'F',
      icon: Filter,
      action: () => {
        // TODO: Open filter panel
        console.log('Open filters');
      },
      color: '#8b5cf6'
    }
  ];

  // Get actual views from database
  const workspaceViews = views.filter(view => view.visibility === 'WORKSPACE' || view.visibility === 'SHARED');
  const personalViews = views.filter(view => view.visibility === 'PERSONAL');
  const favoriteViews = views.filter(view => view.isFavorite);

  // Filter projects based on search
  const filteredProjects = projects.filter(project => 
    !searchQuery || project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Toggle section collapse
  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  // Handle project selection
  const handleProjectSelect = (projectSlug: string) => {
    // Navigate to project's default view
    window.location.href = `/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${projectSlug}`;
    // Auto-close mobile sidebar
    if (window.innerWidth < 768 && toggleSidebar) {
      toggleSidebar();
    }
  };

  // Handle view selection
  const handleViewSelect = (viewId: string) => {
    // Navigate to view
    window.location.href = `/${currentWorkspace?.slug || currentWorkspace?.id}/views/${viewId}`;
    // Auto-close mobile sidebar
    if (window.innerWidth < 768 && toggleSidebar) {
      toggleSidebar();
    }
  };

  // Render the avatar based on user data
  const renderAvatar = () => {
    if (userData?.useCustomAvatar) {
      return <CustomAvatar user={userData} size="md" className="border-2 border-[#2a2929]" />;
    }

    return (
      <Avatar className="border-2 border-[#2a2929]">
        {session?.user?.image ? (
          <AvatarImage
            src={session.user.image}
            alt={session.user.name || "User"}
          />
        ) : (
          <AvatarFallback className="bg-gray-800 text-gray-200">
            {session?.user?.name?.charAt(0).toUpperCase() || "U"}
          </AvatarFallback>
        )}
      </Avatar>
    );
  };

  // Show loading state or "no workspace" only for non-workspace routes or true loading states
  const shouldShowEmptyState = !currentWorkspace?.id && !isLoading && !pathname.match(/^\/[^\/]+\//);
  
  if (shouldShowEmptyState) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p>No workspace selected</p>
      </div>
    );
  }

  if (isCollapsed) {
    return (
      <div className="h-full bg-[#0D1117] border-r border-[#21262d] flex flex-col">
        {/* Collapsed Quick Actions */}
        <div className="p-3 border-b border-[#21262d]">
          <div className="space-y-2">
            {quickActions.slice(0, 3).map((action) => (
              <Button
                key={action.id}
                variant="ghost"
                size="icon"
                onClick={action.action}
                className="w-full h-10 text-gray-400 hover:text-white hover:bg-[#21262d]"
                title={`${action.label} ${action.shortcut ? `(${action.shortcut})` : ''}`}
              >
                <action.icon className="h-5 w-5" />
              </Button>
            ))}
          </div>
        </div>

        {/* Collapsed Main Navigation */}
        <div className="flex-1 p-2">
          <div className="space-y-1">
            {navigation.map((item) => (
              <Button
                key={item.name}
                variant={item.current ? "secondary" : "ghost"}
                size="icon"
                className={cn(
                  "w-full h-10 transition-colors",
                  item.current 
                    ? "bg-[#1c2128] text-white border-l-2 border-blue-500" 
                    : "text-gray-400 hover:text-white hover:bg-[#21262d]",
                  (!currentWorkspace?.id && isLoading) && "opacity-50 pointer-events-none"
                )}
                asChild
                disabled={!currentWorkspace?.id && isLoading}
              >
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  onClick={() => {
                    if (window.innerWidth < 768 && toggleSidebar) {
                      toggleSidebar();
                    }
                  }}
                  title={item.name}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 flex-shrink-0",
                      item.current ? "text-blue-500" : "text-gray-400"
                    )}
                    aria-hidden="true"
                  />
                </Link>
              </Button>
            ))}
          </div>
        </div>

        {/* Collapsed Footer */}
        <div className="p-3 border-t border-[#21262d]">
          <Button
            variant="ghost"
            size="icon"
            className="w-full h-10 text-gray-400 hover:text-white hover:bg-[#21262d]"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#0D1117] border-r border-[#21262d] flex flex-col">
      {/* Header with workspace selector */}
      <div className="p-4 border-b border-[#21262d]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1 min-w-0">
        {/* Workspace selector for mobile */}
            <div className="md:hidden mb-2">
              <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">Workspace</div>
            </div>
          <WorkspaceSelector />
        </div>
        </div>

        {/* Search */}
        <div className={cn(
          "relative transition-all duration-200",
          searchFocused && "ring-1 ring-blue-500 rounded-md"
        )}>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search issues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className={cn(
              "pl-10 bg-[#21262d] border-[#30363d] text-gray-200 placeholder-gray-400",
              "focus:border-blue-500 focus:ring-0",
              "hover:bg-[#30363d] transition-colors"
            )}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-3 border-b border-[#21262d]">
        <div className="grid grid-cols-3 gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.id}
              variant="ghost"
              size="sm"
              onClick={action.action}
              className={cn(
                "h-8 px-2 text-xs text-gray-400 hover:text-white hover:bg-[#21262d]",
                "flex items-center gap-1.5 justify-start"
              )}
              title={`${action.label} ${action.shortcut ? `(${action.shortcut})` : ''}`}
            >
              <action.icon className="h-3.5 w-3.5" style={{ color: action.color }} />
              <span className="truncate">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Navigation Sections */}
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-4 py-4">
          {/* Views Section */}
          <div>
            <Collapsible
              open={!collapsedSections.views}
              onOpenChange={() => toggleSection('views')}
            >
              <div className="flex items-center justify-between px-2 mb-2 group">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1 text-xs font-medium text-gray-400 hover:text-white"
                  >
                    {collapsedSections.views ? (
                      <ChevronRight className="h-3 w-3 mr-1" />
                    ) : (
                      <ChevronDown className="h-3 w-3 mr-1" />
                    )}
                    Views
                  </Button>
                </CollapsibleTrigger>
                
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Create new view"
                  onClick={() => setShowCreateViewModal(true)}
                >
                  <PlusIcon className="h-3 w-3" />
                </Button>
              </div>

              <CollapsibleContent className="space-y-1">
                {isViewsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <>
                    {/* Favorite Views */}
                    {favoriteViews.length > 0 && (
                      <>
                        <div className="px-2 py-1">
                          <div className="text-xs text-gray-500">Favorites</div>
                        </div>
                        {favoriteViews.map((view) => (
                          <div key={view.id} className="group relative">
                            <Button
                              variant="ghost"
                              className={cn(
                                "w-full justify-start h-8 px-2 text-gray-300 hover:text-white hover:bg-[#21262d]",
                                pathname.includes(`/views/${view.id}`) && "bg-[#1c2128] text-white border-l-2 border-blue-500"
                              )}
                              onClick={() => handleViewSelect(view.id)}
                            >
                              <div className="flex items-center gap-2 w-full min-w-0">
                                <Star className="h-4 w-4 flex-shrink-0 text-yellow-500" />
                                <span className="truncate text-sm">{view.name}</span>
                                {view._count?.issues && view._count.issues > 0 && (
                                  <Badge 
                                    variant="secondary" 
                                    className="ml-auto text-xs bg-[#21262d] text-gray-400 border-0"
                                  >
                                    {view._count.issues}
                                  </Badge>
                                )}
                              </div>
                            </Button>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {/* Workspace Views */}
                    {workspaceViews.length > 0 && (
                      <>
                        {favoriteViews.length > 0 && <div className="border-t border-[#30363d] my-2"></div>}
                        <div className="px-2 py-1">
                          <div className="text-xs text-gray-500">Workspace</div>
                        </div>
                        {workspaceViews.map((view) => {
                          const getViewIcon = (displayType: string) => {
                            switch (displayType) {
                              case 'KANBAN': return Target;
                              case 'LIST': return RectangleStackIcon;
                              case 'TABLE': return Squares2X2Icon;
                              default: return Target;
                            }
                          };
                          const ViewIcon = getViewIcon(view.displayType);
                          
                          return (
                            <div key={view.id} className="group relative">
                              <Button
                                variant="ghost"
                                className={cn(
                                  "w-full justify-start h-8 px-2 text-gray-300 hover:text-white hover:bg-[#21262d]",
                                  pathname.includes(`/views/${view.id}`) && "bg-[#1c2128] text-white border-l-2 border-blue-500"
                                )}
                                onClick={() => handleViewSelect(view.id)}
                              >
                                <div className="flex items-center gap-2 w-full min-w-0">
                                  <ViewIcon 
                                    className="h-4 w-4 flex-shrink-0" 
                                    style={{ color: view.color || '#6b7280' }} 
                                  />
                                  <span className="truncate text-sm">{view.name}</span>
                                  {view._count?.issues && view._count.issues > 0 && (
                                    <Badge 
                                      variant="secondary" 
                                      className="ml-auto text-xs bg-[#21262d] text-gray-400 border-0"
                                    >
                                      {view._count.issues}
                                    </Badge>
                                  )}
                                </div>
                              </Button>
                            </div>
                          );
                        })}
                      </>
                    )}
                    
                    {/* Personal Views */}
                    {personalViews.length > 0 && (
                      <>
                        {(favoriteViews.length > 0 || workspaceViews.length > 0) && <div className="border-t border-[#30363d] my-2"></div>}
                        <div className="px-2 py-1">
                          <div className="text-xs text-gray-500">Personal</div>
                        </div>
                        {personalViews.map((view) => {
                          const getViewIcon = (displayType: string) => {
                            switch (displayType) {
                              case 'KANBAN': return Target;
                              case 'LIST': return RectangleStackIcon;
                              case 'TABLE': return Squares2X2Icon;
                              default: return Target;
                            }
                          };
                          const ViewIcon = getViewIcon(view.displayType);
                          
                          return (
                            <div key={view.id} className="group relative">
                              <Button
                                variant="ghost"
                                className={cn(
                                  "w-full justify-start h-8 px-2 text-gray-300 hover:text-white hover:bg-[#21262d]",
                                  pathname.includes(`/views/${view.id}`) && "bg-[#1c2128] text-white border-l-2 border-blue-500"
                                )}
                                onClick={() => handleViewSelect(view.id)}
                              >
                                <div className="flex items-center gap-2 w-full min-w-0">
                                  <ViewIcon 
                                    className="h-4 w-4 flex-shrink-0" 
                                    style={{ color: view.color || '#6b7280' }} 
                                  />
                                  <span className="truncate text-sm">{view.name}</span>
                                  {view._count?.issues && view._count.issues > 0 && (
                                    <Badge 
                                      variant="secondary" 
                                      className="ml-auto text-xs bg-[#21262d] text-gray-400 border-0"
                                    >
                                      {view._count.issues}
                                    </Badge>
                                  )}
                                </div>
                              </Button>
                            </div>
                          );
                        })}
                      </>
                    )}
                    
                    {/* No views state */}
                    {views.length === 0 && (
                      <div className="px-2 py-4 text-center">
                        <p className="text-xs text-gray-500">No views yet</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-7 text-xs text-gray-400 hover:text-white"
                          onClick={() => setShowCreateViewModal(true)}
                        >
                          <PlusIcon className="h-3 w-3 mr-1" />
                          New View
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Projects Section */}
          <div>
            <Collapsible
              open={!collapsedSections.projects}
              onOpenChange={() => toggleSection('projects')}
            >
              <div className="flex items-center justify-between px-2 mb-2">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1 text-xs font-medium text-gray-400 hover:text-white"
                  >
                    {collapsedSections.projects ? (
                      <ChevronRight className="h-3 w-3 mr-1" />
                    ) : (
                      <ChevronDown className="h-3 w-3 mr-1" />
                    )}
                    Projects
                  </Button>
                </CollapsibleTrigger>
                
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Create new project"
                >
                  <PlusIcon className="h-3 w-3" />
                </Button>
              </div>

              <CollapsibleContent className="space-y-1">
                {isProjectsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                ) : filteredProjects.length > 0 ? (
                  filteredProjects.map((project) => (
                    <div key={project.id} className="group relative">
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full justify-start h-8 px-2 text-gray-300 hover:text-white hover:bg-[#21262d]",
                          pathname.includes(`/projects/${project.slug}`) && "bg-[#1c2128] text-white border-l-2 border-blue-500"
                        )}
                        onClick={() => handleProjectSelect(project.slug)}
                      >
                        <div className="flex items-center gap-2 w-full min-w-0">
                          <div 
                            className="w-3 h-3 rounded flex-shrink-0" 
                            style={{ backgroundColor: project.color || '#6b7280' }}
                          />
                          <span className="truncate text-sm">{project.name}</span>
                          <Badge 
                            variant="secondary" 
                            className="ml-auto text-xs bg-[#21262d] text-gray-400 border-0"
                          >
                            {project._count?.issues || 0}
                          </Badge>
                        </div>
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="px-2 py-4 text-center">
                    <p className="text-xs text-gray-500">No projects yet</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 text-xs text-gray-400 hover:text-white"
                      onClick={() => {
                        // TODO: Open create project modal
                        console.log('Create new project');
                      }}
                    >
                      <PlusIcon className="h-3 w-3 mr-1" />
                      New Project
                    </Button>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Main Navigation Section */}
          <div>
            <div className="px-2 mb-2">
              <div className="text-xs font-medium text-gray-400">Workspace</div>
            </div>
        <div className="space-y-1">
          {navigation.map((item) => (
            <Button
              key={item.name}
              variant={item.current ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start h-8 px-2 transition-colors text-sm",
                    item.current 
                      ? "bg-[#1c2128] text-white border-l-2 border-blue-500" 
                      : "text-gray-300 hover:text-white hover:bg-[#21262d]",
                    (!currentWorkspace?.id && isLoading) && "opacity-50 pointer-events-none"
                  )}
              asChild
              disabled={!currentWorkspace?.id && isLoading}
            >
              <Link
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                onClick={() => {
                  // On mobile, close sidebar after navigation
                  if (window.innerWidth < 768 && toggleSidebar) {
                    toggleSidebar();
                  }
                }}
              >
                <item.icon
                      className={cn(
                        "mr-3 h-4 w-4 flex-shrink-0",
                    item.current ? "text-blue-500" : "text-gray-400"
                      )}
                  aria-hidden="true"
                />
                <span className="truncate">{item.name}</span>
              </Link>
            </Button>
          ))}
        </div>
          </div>
        </div>
      </ScrollArea>

      {/* Action Button Section */}
      <div className="border-t border-[#21262d] p-3">
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white" 
            size="sm" 
            asChild
            disabled={!currentWorkspace?.id}
          >
            <Link href={currentWorkspace?.slug ? urls.workspaceTimeline(currentWorkspace.slug) : `/${currentWorkspace?.id || 'loading'}/timeline`}>
              <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              New Post
            </Link>
          </Button>
        </div>

      {/* Footer with User Info */}
      <div className="border-t border-[#21262d] p-3">
        {session?.user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start h-10 px-3 text-gray-300 hover:text-white hover:bg-[#21262d]"
              >
                <div className="flex items-center gap-3 w-full min-w-0">
              {renderAvatar()}
              <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-gray-200 text-sm">
                  {session.user.name}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {session.user.role || "Developer"}
                </p>
              </div>
                  <MoreHorizontal className="h-4 w-4 ml-auto flex-shrink-0" />
            </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              className="w-56 bg-[#1c2128] border-[#30363d] text-gray-200"
            >
              <DropdownMenuItem className="hover:bg-[#21262d]">
                <UserIcon className="h-4 w-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="hover:bg-[#21262d]">
                <Settings className="h-4 w-4 mr-2" />
                Workspace Settings
              </DropdownMenuItem>
              <DropdownMenuItem className="hover:bg-[#21262d]">
                <Keyboard className="h-4 w-4 mr-2" />
                Keyboard Shortcuts
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#30363d]" />
              <DropdownMenuItem asChild className="hover:bg-[#21262d]">
                <Link href="/terms">Terms</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="hover:bg-[#21262d]">
                <Link href="/privacy-policy">Privacy</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#30363d]" />
              <DropdownMenuItem className="hover:bg-[#21262d] text-red-400">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        
        <div className="text-center mt-2 text-xs text-gray-500">
            © {new Date().getFullYear()} Collab by Weezboo
        </div>
      </div>
      
      {/* Create View Modal */}
      <CreateViewModal
        isOpen={showCreateViewModal}
        onClose={() => setShowCreateViewModal(false)}
        workspaceId={currentWorkspace?.id || ''}
        projects={projects.map(p => ({ id: p.id, name: p.name, color: p.color }))}
        onViewCreated={(view) => {
          console.log('View created:', view);
          // TODO: Optionally navigate to the new view
          setShowCreateViewModal(false);
        }}
      />
    </div>
  );
} 