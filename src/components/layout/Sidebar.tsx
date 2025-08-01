"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, 
  Star, 
  ChevronDown, 
  ChevronRight, 
  Filter,
  Loader2,
  MoreHorizontal,
  Settings,
  LogOut,
  Users,
  FolderOpen,
  Eye,
  Plus,
  Hash,
  CheckSquare,
  MessageSquare,
  FileText,
  Clock,
  Home,
  Bookmark,
  Tag,
  Lightbulb,
  Calendar,
  Timer
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
  const router = useRouter();
  const { currentWorkspace, workspaces, isLoading, switchWorkspace } = useWorkspace();
  const { settings } = useWorkspaceSettings();
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

  // Local state for Linear-style sidebar
  const [viewSearchQuery, setViewSearchQuery] = useState("");
  const [showCreateViewModal, setShowCreateViewModal] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    teams: false,
    views: false
  });
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Record<string, boolean>>({});

  // Filter views for sidebar display - show favorites or latest 3
  const sidebarViews = useMemo(() => {
    if (!views.length) return [];
    
    // Filter by search query first
    let filteredViews = views;
    if (viewSearchQuery.trim()) {
      filteredViews = views.filter(view => 
        view.name.toLowerCase().includes(viewSearchQuery.toLowerCase())
      );
    }
    
    // If no search, show favorites or latest 3
    if (!viewSearchQuery.trim()) {
      const favoriteViews = views.filter(view => view.isFavorite);
      if (favoriteViews.length > 0) {
        return favoriteViews;
      } else {
        // Show latest 3 views by updatedAt
        return [...views]
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, 3);
      }
    }
    
    return filteredViews;
  }, [views, viewSearchQuery]);

  // Generate workspace navigation
  const workspaceNavigation = [
    {
      name: "Issues",
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/issues` : "#",
      icon: CheckSquare,
      current: pathname.includes("/issues"),
    },
    {
      name: "Projects", 
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/projects` : "#",
      icon: FolderOpen,
      current: pathname.includes("/projects"),
    },
    {
      name: "Views",
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/views` : "#", 
      icon: Eye,
      current: pathname.includes("/views"),
    },
  ];

  // Other workspace features
  const workspaceFeatures = [
      {
      name: "Posts",
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/timeline` : "#",
      icon: Clock,
      current: pathname.includes("/timeline"),
    },
    {
        name: "Timesheet",
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/timesheet` : "#",
      icon: Timer,
      current: pathname.includes("/timesheet"),
    },
      {
        name: "Notes",
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/notes` : "#",
      icon: FileText,
      current: pathname.includes("/notes"),
      },
      {
        name: "Bookmarks",
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/bookmarks` : "#",
      icon: Bookmark,
      current: pathname.includes("/bookmarks"),
      },
      {
        name: "Messages",
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/messages` : "#",
      icon: MessageSquare,
      current: pathname.includes("/messages"),
      },
      {
      name: "Tags",
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/tags` : "#",
      icon: Tag,
      current: pathname.includes("/tags"),
    },
    {
      name: "Feature Requests",
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/features` : "#",
      icon: Lightbulb,
      current: pathname.includes("/features"),
    },
  ];

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleWorkspace = (workspaceId: string) => {
    setCollapsedWorkspaces(prev => ({
      ...prev,
      [workspaceId]: !prev[workspaceId]
    }));
  };

  // Initialize workspace collapsed state (current workspace open by default)
  useEffect(() => {
    if (currentWorkspace && !collapsedWorkspaces.hasOwnProperty(currentWorkspace.id)) {
      setCollapsedWorkspaces(prev => ({
        ...prev,
        [currentWorkspace.id]: false // Current workspace is expanded by default
      }));
    }
  }, [currentWorkspace]);

  // Handle navigation with workspace switching
  const handleWorkspaceNavigation = async (workspaceId: string, href: string) => {
    // Close mobile sidebar if open
    if (window.innerWidth < 768 && toggleSidebar) {
      toggleSidebar();
    }

    // If it's a different workspace, switch first
    if (workspaceId !== currentWorkspace?.id && switchWorkspace) {
      try {
        // Extract the path part from href (e.g., "/issues" from "/workspace123/issues")
        const pathMatch = href.match(/\/[^\/]+(\/.+)$/);
        const targetPath = pathMatch ? pathMatch[1] : '/dashboard';
        
        // Switch workspace - this will handle navigation to the workspace
        await switchWorkspace(workspaceId);
        
        // After workspace switch completes, navigate to the specific path
        // Add a small delay to ensure workspace context is updated
        setTimeout(() => {
          const workspace = workspaces.find(w => w.id === workspaceId);
          const workspaceSlugOrId = workspace?.slug || workspaceId;
          router.push(`/${workspaceSlugOrId}${targetPath}`);
        }, 100);
      } catch (error) {
        console.error('Error switching workspace:', error);
        // Fallback: navigate directly if switching fails
        router.push(href);
      }
    } else {
      // Same workspace, just navigate
      router.push(href);
  }
  };

  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full">
        {/* Workspace selector - collapsed */}
        <div className="p-3 border-b border-[#1f1f1f]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full h-8 p-0">
                <div className="flex items-center justify-center">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={currentWorkspace?.logoUrl || ""} />
                    <AvatarFallback className="bg-[#1f1f1f] text-white text-xs font-semibold">
                      {currentWorkspace?.name?.charAt(0)?.toUpperCase() || "W"}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" className="w-64 bg-[#090909] border-[#1f1f1f]">
              <div className="px-2 py-1.5 text-xs font-medium text-gray-400">Your workspaces</div>
              {workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.id}
                  className="flex items-center justify-between p-2 text-gray-300 hover:text-white focus:bg-[#1f1f1f]"
                  onClick={() => {
                    if (workspace.id !== currentWorkspace?.id && switchWorkspace) {
                      switchWorkspace(workspace.id);
                    }
                  }}
                >
                  <div className="flex items-center">
                    <Avatar className="h-4 w-4 mr-2">
                      <AvatarImage src={workspace.logoUrl || ""} />
                      <AvatarFallback className="bg-[#1f1f1f] text-white text-[10px] font-semibold">
                        {workspace.name?.charAt(0)?.toUpperCase() || "W"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate">{workspace.name}</span>
                  </div>
                  {workspace.id === currentWorkspace?.id && (
                    <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Navigation - collapsed */}
        <div className="flex-1 p-2 space-y-1">
          {workspaceNavigation.map((item) => (
              <Button
                key={item.name}
              variant="ghost"
                size="icon"
                className={cn(
                  "w-full h-10 transition-colors",
                  item.current 
                  ? "bg-[#1f1f1f] text-white" 
                  : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]",
                  (!currentWorkspace?.id && isLoading) && "opacity-50 pointer-events-none"
                )}
              onClick={() => currentWorkspace?.id && handleWorkspaceNavigation(currentWorkspace.id, item.href)}
                disabled={!currentWorkspace?.id && isLoading}
                  title={item.name}
                >
              <item.icon className="h-5 w-5" />
              </Button>
            ))}
        </div>

        {/* User - collapsed */}
        <div className="p-3 border-t border-[#1f1f1f]">
          <Button
            variant="ghost"
            size="icon"
            className="w-full h-10 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header - Workspace Selector */}
      <div className="p-3 border-b border-[#1f1f1f]">
          <WorkspaceSelector />
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-6">
          {/* Teams Section */}
          <div>
            <Collapsible
              open={!collapsedSections.teams}
              onOpenChange={() => toggleSection('teams')}
            >
                <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between h-7 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f] text-xs font-medium"
                >
                  <div className="flex items-center">
                    <Users className="mr-2 h-3 w-3" />
                    Your workspaces
                  </div>
                  {collapsedSections.teams ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 mt-1">
                {/* All workspaces */}
                <div className="space-y-1">
                                    {workspaces.map((workspace) => {
                    const isWorkspaceExpanded = collapsedWorkspaces[workspace.id] !== undefined 
                      ? !collapsedWorkspaces[workspace.id] 
                      : workspace.id === currentWorkspace?.id;
                    return (
                      <Collapsible
                        key={workspace.id}
                        open={isWorkspaceExpanded}
                        onOpenChange={() => toggleWorkspace(workspace.id)}
                      >
                        <div className="flex items-center group">
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              className="flex-1 justify-start h-7 px-2 text-gray-300 hover:text-white hover:bg-[#1f1f1f]"
                            >
                              <div className="flex items-center">
                                <ChevronRight className={cn(
                                  "mr-1 h-3 w-3 transition-transform",
                                  isWorkspaceExpanded && "rotate-90"
                                )} />
                              <Avatar className="h-4 w-4 mr-2">
                                <AvatarImage src={workspace.logoUrl || ""} />
                                <AvatarFallback className="bg-[#1f1f1f] text-white text-[10px] font-semibold">
                                  {workspace.name?.charAt(0)?.toUpperCase() || "W"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm truncate">{workspace.name}</span>
                              {workspace.id === currentWorkspace?.id && (
                                <div className="ml-2 w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                              )}
                            </div>
                          </Button>
                        </CollapsibleTrigger>
                        
                        {/* Three dots menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white hover:bg-[#1f1f1f] transition-opacity"
                                  >
                              <MoreHorizontal className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-[#090909] border-[#1f1f1f]">
                            <DropdownMenuItem 
                              className="text-gray-300 hover:text-white"
                              onClick={() => {
                                window.open(`/workspaces/${workspace.id}`, '_blank');
                              }}
                            >
                              <Settings className="mr-2 h-4 w-4" />
                              Workspace settings
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-gray-300 hover:text-white">
                              <Star className="mr-2 h-4 w-4" />
                              Favorite workspace
                            </DropdownMenuItem>
                            {workspace.id !== currentWorkspace?.id && (
                              <>
                                <DropdownMenuSeparator className="bg-[#1f1f1f]" />
                                <DropdownMenuItem 
                                  className="text-gray-300 hover:text-white"
                                  onClick={() => {
                                    if (switchWorkspace) {
                                      switchWorkspace(workspace.id);
                                    }
                                  }}
                                >
                                  <ChevronRight className="mr-2 h-4 w-4" />
                                  Switch to workspace
                                </DropdownMenuItem>
                      </>
                    )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      
                      <CollapsibleContent className="space-y-0.5 mt-1">
                        {/* Workspace navigation - works for all workspaces */}
                        <div className="ml-6 space-y-0.5">
                          {(workspace.id === currentWorkspace?.id ? workspaceNavigation : [
                            {
                              name: "Issues",
                              href: `/${workspace.slug || workspace.id}/issues`,
                              icon: CheckSquare,
                              current: false,
                            },
                            {
                              name: "Projects", 
                              href: `/${workspace.slug || workspace.id}/projects`,
                              icon: FolderOpen,
                              current: false,
                            },
                            {
                              name: "Views",
                              href: `/${workspace.slug || workspace.id}/views`,
                              icon: Eye,
                              current: false,
                            },
                          ]).map((item) => (
                              <Button
                              key={item.name}
                                variant="ghost"
                                className={cn(
                                "w-full justify-start h-6 px-2 text-sm transition-colors",
                                item.current 
                                  ? "bg-[#1f1f1f] text-white" 
                                  : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                                )}
                              onClick={() => handleWorkspaceNavigation(workspace.id, item.href)}
                              disabled={!currentWorkspace?.id && isLoading}
                            >
                              <item.icon className="mr-2 h-3 w-3" />
                              {item.name}
                              {workspace.id !== currentWorkspace?.id && (
                                <span className="ml-auto text-[10px] text-gray-500">Switch</span>
                                  )}
                              </Button>
                          ))}
                        </div>
                                             </CollapsibleContent>
                     </Collapsible>
                          );
                        })}
                      </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Views Section */}
          <div>
            <Collapsible
              open={!collapsedSections.views}
              onOpenChange={() => toggleSection('views')}
            >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                  className="w-full justify-between h-7 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f] text-xs font-medium"
                >
                  <div className="flex items-center">
                    <Eye className="mr-2 h-3 w-3" />
                    Views
                  </div>
                  <div className="flex items-center">
                    {views.filter(v => v.isFavorite).length > 0 && (
                      <Badge variant="secondary" className="mr-2 h-4 px-1 text-[10px] bg-[#1f1f1f]">
                        {views.filter(v => v.isFavorite).length}
                      </Badge>
                    )}
                    {collapsedSections.views ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 mt-1">
                {/* Views search */}
                <div className="px-2 mb-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                    <Input
                      placeholder="Search views..."
                      value={viewSearchQuery}
                      onChange={(e) => setViewSearchQuery(e.target.value)}
                      className="h-7 pl-7 text-xs bg-[#1f1f1f] border-[#2a2a2a] focus:border-[#22c55e] text-white placeholder-gray-500"
                    />
                  </div>
              </div>

                {/* Views list */}
                <div className="space-y-0.5">
                  {isViewsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                  ) : sidebarViews.length > 0 ? (
                    sidebarViews.map((view) => (
                      <Button
                        key={view.id}
                        variant="ghost"
                        className={cn(
                          "w-full justify-start h-7 px-2 text-sm transition-colors",
                          pathname.includes(`/views/${view.id}`)
                            ? "bg-[#1f1f1f] text-white" 
                            : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                        )}
                        asChild
                      >
                        <Link href={`/${currentWorkspace?.slug || currentWorkspace?.id}/views/${view.id}`}>
                          <div className="flex items-center w-full">
                            {view.isFavorite && <Star className="mr-2 h-3 w-3 text-yellow-500 fill-current" />}
                            <span className="truncate flex-1">{view.name}</span>
                            {view._count?.issues && (
                              <Badge variant="secondary" className="ml-auto h-4 px-1 text-[10px] bg-[#2a2a2a]">
                                {view._count.issues}
                          </Badge>
                            )}
                        </div>
                        </Link>
                      </Button>
                    ))
                  ) : viewSearchQuery ? (
                    <div className="px-2 py-2 text-xs text-gray-500 text-center">
                      No views found for "{viewSearchQuery}"
                    </div>
                ) : (
                    <div className="px-2 py-2 text-xs text-gray-500 text-center">
                      No favorite views. Latest views will appear here.
                    </div>
                  )}
                  
                  {/* Create new view or see all views */}
                  <div className="pt-1 space-y-0.5">
                    <Button
                      variant="ghost"
                      onClick={() => setShowCreateViewModal(true)}
                      className="w-full justify-start h-7 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                    >
                      <Plus className="mr-2 h-3 w-3" />
                      Create view
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-7 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                      asChild
                    >
                      <Link href={`/${currentWorkspace?.slug || currentWorkspace?.id}/views`}>
                        <Eye className="mr-2 h-3 w-3" />
                        All views
                      </Link>
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Other workspace features */}
          <div className="space-y-0.5">
            <div className="px-2 mb-2">
              <div className="text-xs font-medium text-gray-500">More</div>
            </div>
            {workspaceFeatures.map((item) => (
            <Button
              key={item.name}
                variant="ghost"
                  className={cn(
                  "w-full justify-start h-7 px-2 text-sm transition-colors",
                    item.current 
                    ? "bg-[#1f1f1f] text-white" 
                    : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]",
                    (!currentWorkspace?.id && isLoading) && "opacity-50 pointer-events-none"
                  )}
              asChild
              disabled={!currentWorkspace?.id && isLoading}
            >
                <Link href={item.href}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.name}
              </Link>
            </Button>
          ))}
          </div>
        </div>
      </ScrollArea>

      {/* Footer - User menu */}
      <div className="border-t border-[#1f1f1f] p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
              className="w-full justify-start h-8 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
              >
                             {userData?.useCustomAvatar ? (
                 <CustomAvatar 
                   user={userData}
                   size="sm"
                   className="mr-2"
                 />
               ) : (
                <Avatar className="mr-2 h-5 w-5">
                  <AvatarImage src={userData?.image || ""} />
                  <AvatarFallback className="bg-[#1f1f1f] text-white text-xs">
                    {userData?.name?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className="truncate text-sm">{userData?.name || "User"}</span>
              <MoreHorizontal className="ml-auto h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 bg-[#090909] border-[#1f1f1f]">
              <DropdownMenuItem asChild>
                <Link 
                  href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/profile` : "/profile"} 
                  className="text-gray-300 hover:text-white"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Your Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/workspaces" className="text-gray-300 hover:text-white">
                  <Users className="mr-2 h-4 w-4" />
                  Manage Workspaces
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#1f1f1f]" />
              <DropdownMenuItem className="text-gray-300 hover:text-white">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
      </div>
      
      {/* Create View Modal */}
      {showCreateViewModal && (
      <CreateViewModal
        isOpen={showCreateViewModal}
        onClose={() => setShowCreateViewModal(false)}
        workspaceId={currentWorkspace?.id || ''}
          projects={projects}
      />
      )}
    </div>
  );
} 