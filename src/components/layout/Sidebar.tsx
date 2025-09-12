"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Star,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Settings,
  LogOut,
  Users,
  FolderOpen,
  Eye,
  Plus,
  MessageSquare,
  FileText,
  Clock,
  Bookmark,
  Tag,
  Lightbulb,
  Timer,
  Bell,
  Search as SearchIcon,
  Calendar,
  Book,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useProjects } from "@/hooks/queries/useProjects";
import { useViews } from "@/hooks/queries/useViews";
import CreateViewModal from "@/components/modals/CreateViewModal";
import CreateProjectModal from "@/components/modals/CreateProjectModal";
import NewIssueModal from "@/components/issue/NewIssueModal";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUiContext } from "@/context/UiContext";
import { useMention } from "@/context/MentionContext";
import { CollabText } from "@/components/ui/collab-text";
import { MarkdownContent } from "@/components/ui/markdown-content";

import WorkspaceSelector from "@/components/workspace/WorkspaceSelector";
import { usePermissions } from "@/hooks/use-permissions";
import { getRoleDisplayName } from "@/lib/permissions";
import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";

interface SidebarProps {
  pathname?: string;
  isCollapsed?: boolean;
  toggleSidebar?: () => void;
}

export default function Sidebar({
  pathname = "",
  isCollapsed = false,
  toggleSidebar,
}: SidebarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const { isChatOpen, toggleChat } = useUiContext();
  const { currentWorkspace, workspaces, isLoading, switchWorkspace } = useWorkspace();
  const { data: userData } = useCurrentUser();
  const { userPermissions } = usePermissions(currentWorkspace?.id);
  const { canManageLeave } = useWorkspacePermissions();

  const formatGlobalRole = (role?: string) =>
    role
      ? role
        .toString()
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
      : "";


  const displayRole = userPermissions?.role ? getRoleDisplayName(userPermissions.role as any) : formatGlobalRole(session?.user?.role) || "Member";

  // Use Mention context for notifications
  const {
    notifications,
    unreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    loading: notificationsLoading,
    refetchNotifications,
  } = useMention();

  // Fetch projects and views using the new hooks
  const { data: projects = [], isLoading: isProjectsLoading } = useProjects({
    workspaceId: currentWorkspace?.id,
    includeStats: true,
  });

  const { data: views = [], isLoading: isViewsLoading } = useViews({
    workspaceId: currentWorkspace?.id,
    includeStats: true,
  });

  // Local state for Linear-style sidebar
  const [viewSearchQuery, setViewSearchQuery] = useState("");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [showCreateViewModal, setShowCreateViewModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    projects: false,
    views: false,
  });

  // Notification and modal state
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNewIssueModal, setShowNewIssueModal] = useState(false);

  // Filter views for sidebar display - show favorites or latest 4
  const sidebarViews = useMemo(() => {
    if (!views.length) return [];

    // Filter by search query first
    let filteredViews = views;
    if (viewSearchQuery.trim()) {
      filteredViews = views.filter((view) => view.name.toLowerCase().includes(viewSearchQuery.toLowerCase()));
      // Limit search results to 4 items
      return filteredViews.slice(0, 4);
    }

    // If no search, show favorites or latest 4
    const favoriteViews = views.filter((view) => view.isFavorite);
    if (favoriteViews.length > 0) {
      return favoriteViews.slice(0, 4);
    } else {
      // Show latest 4 views by updatedAt
      return [...views].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 4);
    }
  }, [views, viewSearchQuery]);

  // Helper function to find default view for a project
  const getDefaultViewForProject = (projectId: string) => {
    return views.find(view => 
      view.projectIds.includes(projectId) && view.isDefault
    );
  };

  // Filter projects for sidebar display - show latest 4
  const sidebarProjects = useMemo(() => {
    if (!projects.length) return [];

    // Filter by search query first
    let filteredProjects = projects;
    if (projectSearchQuery.trim()) {
      filteredProjects = projects.filter((project) => project.name.toLowerCase().includes(projectSearchQuery.toLowerCase()));
      // Limit search results to 4 items
      return filteredProjects.slice(0, 4);
    }

    // If no search, show latest 4 projects by updatedAt
    return [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 4);
  }, [projects, projectSearchQuery]);



  // Handle sign out from Navbar
  const handleSignOut = async () => {
    await signOut({ redirect: false });
    toast({
      title: "Signed out successfully",
      description: "You have been signed out of your account",
    });
    router.push("/");
    router.refresh();
  };

  // Handle notification click - mark as read and navigate if needed
  const handleNotificationClick = async (id: string, url?: string) => {
    await markNotificationAsRead(id);

    if (url) {
      router.push(url);
    }

    // Close notifications popover on mobile
    if (window.innerWidth < 768) {
      setShowNotifications(false);
    }
  };

  // Format notification time
  const formatNotificationTime = (dateString: string): string => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (error) {
      console.error("Error formatting notification time:", error);
      return "recently";
    }
  };

  // Generate notification URL based on type
  const getNotificationUrl = (notification: any): string => {
    const { type, postId, featureRequestId, taskId, epicId, storyId, milestoneId } = notification;
    const workspaceId = currentWorkspace?.id;

    if (!workspaceId) {
      return "/welcome"; // Fallback if no workspace
    }

    switch (type) {
      case "post_mention":
      case "post_comment":
      case "post_reaction":
        return postId ? `/${workspaceId}/posts/${postId}` : `/${workspaceId}/timeline`;
      case "comment_mention":
      case "comment_reply":
      case "comment_reaction":
        return postId ? `/${workspaceId}/posts/${postId}` : `/${workspaceId}/timeline`;
      case "taskComment_mention":
        return taskId ? `/${workspaceId}/tasks/${taskId}` : `/${workspaceId}/tasks`;
      case "feature_mention":
      case "feature_comment":
      case "feature_vote":
        return featureRequestId ? `/${workspaceId}/features/${featureRequestId}` : `/${workspaceId}/features`;
      case "task_mention":
      case "task_assigned":
      case "task_status_change":
        return taskId ? `/${workspaceId}/tasks/${taskId}` : `/${workspaceId}/tasks`;
      case "epic_mention":
        return epicId ? `/${workspaceId}/epics/${epicId}` : `/${workspaceId}/tasks`;
      case "story_mention":
        return storyId ? `/${workspaceId}/stories/${storyId}` : `/${workspaceId}/tasks`;
      case "milestone_mention":
        return milestoneId ? `/${workspaceId}/milestones/${milestoneId}` : `/${workspaceId}/tasks`;
      default:
        return `/${workspaceId}/timeline`;
    }
  };

  // Get user initials for avatar
  const getInitials = (name: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  // Generate workspace navigation (core features)
  const workspaceNavigation = [
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
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };





  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full">
        {/* Header - Logo and Actions (collapsed) */}
        <div className="p-2 border-b border-[#1f1f1f] space-y-2">
          {/* Logo */}
          <div className="flex justify-center">
            <Link href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/dashboard` : "/dashboard"} className="flex items-center">
              <Image src="/logo-v2.png" width={32} height={32} alt="Collab" className="h-8 w-auto" />
            </Link>
          </div>

          {/* Actions */}
          <div className="space-y-1">
            {/* Command Menu */}
            <Button
              variant="ghost"
              size="icon"
              className="w-full h-8 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
              onClick={() => {
                const event = new KeyboardEvent('keydown', {
                  key: 'k',
                  metaKey: true,
                  bubbles: true
                });
                document.dispatchEvent(event);
              }}
              title="Search (Cmd+K)"
            >
              <SearchIcon className="h-4 w-4" />
            </Button>

            {/* Notifications */}
            {session && (
              <Popover open={showNotifications} onOpenChange={setShowNotifications}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative w-full h-8 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                    onClick={() => refetchNotifications()}
                    title="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 bg-[#090909] border-[#1f1f1f]" align="start" alignOffset={0} forceMount>
                  <div className="flex items-center justify-between p-3 border-b border-[#1f1f1f]">
                    <h3 className="font-medium text-white">Notifications</h3>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                        asChild
                      >
                        <Link href={`/${currentWorkspace?.slug || currentWorkspace?.id}/notifications`}>Open inbox</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                        onClick={() => markAllNotificationsAsRead()}
                      >
                        Read all
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="h-80">
                    {notificationsLoading ? (
                      <div className="p-4 text-center text-gray-400 text-sm">Loading notifications...</div>
                    ) : notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">No notifications yet</div>
                    ) : (
                      <div className="flex flex-col">
                        {notifications.map((notification) => {
                          const url = getNotificationUrl(notification);
                          const isHtmlContent = /<[^>]+>/.test(notification.content);
                          return (
                            <div
                              key={notification.id}
                              className={`flex items-start gap-3 p-3 hover:bg-[#1f1f1f] cursor-pointer border-b border-[#1f1f1f] ${!notification.read ? "bg-[#22c55e]/5" : ""
                                }`}
                              onClick={() => handleNotificationClick(notification.id, url)}
                            >
                              {/* Sender Avatar */}
                              {notification.sender.useCustomAvatar ? (
                                <CustomAvatar user={notification.sender} size="sm" />
                              ) : (
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={notification.sender.image || undefined} alt={notification.sender.name || "User"} />
                                  <AvatarFallback className="bg-[#1f1f1f] text-white text-xs">
                                    {getInitials(notification.sender.name || "U")}
                                  </AvatarFallback>
                                </Avatar>
                              )}

                              {/* Notification Content */}
                              <div className="flex-1 space-y-1">
                                <p className="text-sm">
                                  <span className="font-medium text-white">{notification.sender.name}</span>{" "}
                                  <span className="text-gray-400">
                                    {isHtmlContent ? (
                                      <MarkdownContent htmlContent={notification.content} className="inline text-sm" asSpan={true} />
                                    ) : (
                                      <CollabText content={notification.content} small asSpan />
                                    )}
                                  </span>
                                </p>
                                <p className="text-xs text-gray-500">{formatNotificationTime(notification.createdAt)}</p>
                              </div>

                              {/* Read Indicator */}
                              {!notification.read && <div className="h-2 w-2 rounded-full bg-[#22c55e] mt-1.5" />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                  <div className="p-2 border-t border-[#1f1f1f] bg-[#090909]">
                    <Button
                      variant="ghost"
                      className="w-full justify-center h-8 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                      asChild
                    >
                      <Link href={`/${currentWorkspace?.slug || currentWorkspace?.id}/notifications`}>Open Inbox</Link>
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Chat */}
            {session && (
              <Button
                variant="ghost"
                size="icon"
                className="relative w-full h-8 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                onClick={toggleChat}
                title="Chat"
              >
                <MessageSquare className="h-4 w-4" />
                {isChatOpen && <span className="absolute -bottom-1 -right-1 bg-[#22c55e] rounded-full w-2 h-2" />}
              </Button>
            )}
          </div>
        </div>

        {/* Workspace selector - collapsed */}
        <div className="p-3 border-b border-[#1f1f1f]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full h-8 p-0">
                <div className="flex items-center justify-center">
                  <Avatar className="h-8 w-8">
                    {currentWorkspace?.logoUrl && <AvatarImage src={currentWorkspace.logoUrl} />}
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
                  <div className="flex items-center min-w-0">
                    <Avatar className="h-4 w-4 mr-2">
                      {workspace.logoUrl && <AvatarImage src={workspace.logoUrl} />}
                      <AvatarFallback className="bg-[#1f1f1f] text-white text-[10px] font-semibold">
                        {workspace.name?.charAt(0)?.toUpperCase() || "W"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate">{workspace.name}</span>
                  </div>
                  {workspace.id === currentWorkspace?.id && <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Navigation - collapsed */}
        <div className="flex-1 p-2 space-y-1">
          {/* Core Navigation */}
          {workspaceNavigation.map((item) => (
            <Button
              key={item.name}
              variant="ghost"
              size="icon"
              className={cn(
                "w-full h-10 transition-colors",
                item.current ? "bg-[#1f1f1f] text-white" : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]",
                !currentWorkspace?.id && isLoading && "opacity-50 pointer-events-none"
              )}
              onClick={() => router.push(item.href)}
              disabled={!currentWorkspace?.id && isLoading}
              title={item.name}
            >
              <item.icon className="h-5 w-5" />
            </Button>
          ))}
          
          {/* Separator */}
          <div className="border-t border-[#1f1f1f] my-2" />
          
          {/* Workspace Features */}
          {workspaceFeatures.map((item) => (
            <Button
              key={item.name}
              variant="ghost"
              size="icon"
              className={cn(
                "w-full h-10 transition-colors",
                item.current ? "bg-[#1f1f1f] text-white" : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]",
                !currentWorkspace?.id && isLoading && "opacity-50 pointer-events-none"
              )}
              onClick={() => router.push(item.href)}
              disabled={!currentWorkspace?.id && isLoading}
              title={item.name}
            >
              <item.icon className="h-5 w-5" />
            </Button>
          ))}
        </div>

        {/* User - collapsed */}
        <div className="p-3 border-t border-[#1f1f1f]">
          <Button variant="ghost" size="icon" className="w-full h-10 text-gray-400 hover:text-white hover:bg-[#1f1f1f]">
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Header - Logo and Actions */}
      <div className="p-3 border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between mb-3">
          {/* Logo */}
          <Link href={`/${currentWorkspace?.slug || currentWorkspace?.id}/dashboard`} className="flex items-center">
            <Image src="/logo-v2.png" width={100} height={100} alt="Collab" className="h-7 w-auto" />
          </Link>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            {/* Command Menu */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
              onClick={() => {
                const event = new KeyboardEvent('keydown', {
                  key: 'k',
                  metaKey: true,
                  bubbles: true
                });
                document.dispatchEvent(event);
              }}
              title="Search (Cmd+K)"
            >
              <SearchIcon className="h-4 w-4" />
            </Button>

            {/* Notifications */}
            {session && (
              <Popover open={showNotifications} onOpenChange={setShowNotifications}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-8 w-8 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                    onClick={() => refetchNotifications()}
                    title="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 bg-[#090909] border-[#1f1f1f]" align="start" alignOffset={0} forceMount>
                  <div className="flex items-center justify-between p-3 border-b border-[#1f1f1f]">
                    <h3 className="font-medium text-white">Notifications</h3>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                        onClick={() => markAllNotificationsAsRead()}
                      >
                        Read all
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="h-80">
                    {notificationsLoading ? (
                      <div className="p-4 text-center text-gray-400 text-sm">Loading notifications...</div>
                    ) : notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">No notifications yet</div>
                    ) : (
                      <div className="flex flex-col">
                        {notifications.map((notification) => {
                          const url = getNotificationUrl(notification);
                          const isHtmlContent = /<[^>]+>/.test(notification.content);
                          return (
                            <div
                              key={notification.id}
                              className={`flex items-start gap-3 p-3 hover:bg-[#1f1f1f] cursor-pointer border-b border-[#1f1f1f] ${!notification.read ? "bg-[#22c55e]/5" : ""
                                }`}
                              onClick={() => handleNotificationClick(notification.id, url)}
                            >
                              {/* Sender Avatar */}
                              {notification.sender.useCustomAvatar ? (
                                <CustomAvatar user={notification.sender} size="sm" />
                              ) : (
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={notification.sender.image || undefined} alt={notification.sender.name || "User"} />
                                  <AvatarFallback className="bg-[#1f1f1f] text-white text-xs">
                                    {getInitials(notification.sender.name || "U")}
                                  </AvatarFallback>
                                </Avatar>
                              )}

                              {/* Notification Content */}
                              <div className="flex-1 space-y-1">
                                <p className="text-sm">
                                  <span className="font-medium text-white">{notification.sender.name}</span>{" "}
                                  <span className="text-gray-400">
                                    {isHtmlContent ? (
                                      <MarkdownContent htmlContent={notification.content} className="inline text-sm" asSpan={true} />
                                    ) : (
                                      <CollabText content={notification.content} small asSpan />
                                    )}
                                  </span>
                                </p>
                                <p className="text-xs text-gray-500">{formatNotificationTime(notification.createdAt)}</p>
                              </div>

                              {/* Read Indicator */}
                              {!notification.read && <div className="h-2 w-2 rounded-full bg-[#22c55e] mt-1.5" />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                  <div className="p-2 border-t border-[#1f1f1f] bg-[#090909]">
                    <Button
                      variant="ghost"
                      className="w-full justify-center h-8 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                      asChild
                    >
                      <Link href={`/${currentWorkspace?.slug || currentWorkspace?.id}/notifications`}>Show all notifications</Link>
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Chat */}
            {session && (
              <Button
                variant="ghost"
                size="icon"
                className="relative h-8 w-8 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                onClick={toggleChat}
                title="Chat"
              >
                <MessageSquare className="h-4 w-4" />
                {isChatOpen && <span className="absolute -bottom-1 -right-1 bg-[#22c55e] rounded-full w-2 h-2" />}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="p-2 space-y-4 max-w-[256px]">
          {/* Workspace Selector */}
          <div className="px-1">
            <WorkspaceSelector />
          </div>


          {/* Other workspace features */}
          <div className="space-y-0.5">
            {workspaceFeatures.map((item) => (
              <Button
                key={item.name}
                variant="ghost"
                className={cn(
                  "w-full justify-start h-7 px-2 text-sm transition-colors",
                  item.current ? "bg-[#1f1f1f] text-white" : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]",
                  !currentWorkspace?.id && isLoading && "opacity-50 pointer-events-none"
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


          {/* Projects Section */}
          <div>
            <Collapsible open={!collapsedSections.projects} onOpenChange={() => toggleSection("projects")}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between h-7 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f] text-sm font-medium"
                >
                  <div className="flex items-center">
                    Projects
                  </div>
                  <div className="flex items-center">
                    {projects.length > 0 && (
                      <Badge variant="secondary" className="mr-2 h-4 px-1 text-[10px] bg-[#1f1f1f]">
                        {projects.length}
                      </Badge>
                    )}
                    {collapsedSections.projects ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {/* Projects search */}
                <div className="px-2 mb-2 mt-1">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                    <Input
                      placeholder="Search projects..."
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                      className="h-7 pl-7 text-xs bg-[#1f1f1f] border-[#2a2a2a] focus:border-[#22c55e] text-white placeholder-gray-500"
                    />
                  </div>
                </div>

                {/* Projects list */}
                <div className="space-y-0.5">
                  {isProjectsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  ) : sidebarProjects.length > 0 ? (
                    sidebarProjects.map((project) => {
                      const defaultView = getDefaultViewForProject(project.id);
                      const href = defaultView 
                        ? `/${currentWorkspace?.slug || currentWorkspace?.id}/views/${defaultView.slug || defaultView.id}`
                        : `/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${project.slug || project.id}`;
                      
                      return (
                        <Button
                          key={project.id}
                          variant="ghost"
                          className={cn(
                            "w-full justify-start h-7 px-2 text-sm transition-colors",
                            (defaultView && pathname.includes(`/views/${defaultView.slug || defaultView.id}`)) ||
                            pathname.includes(`/projects/${project.slug || project.id}`)
                              ? "bg-[#1f1f1f] text-white"
                              : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                          )}
                          asChild
                        >
                          <Link href={href} className="min-w-0 block">
                            <div className="flex items-center w-full min-w-0">
                              <FolderOpen className="mr-2 h-3 w-3 flex-shrink-0" />
                              <span className="truncate flex-1 text-xs">{project.name}</span>
                              {project._count?.issues && (
                                <Badge variant="secondary" className="ml-auto h-4 px-1 text-[10px] bg-[#2a2a2a]">
                                  {project._count.issues}
                                </Badge>
                              )}
                            </div>
                          </Link>
                        </Button>
                      );
                    })
                  ) : projectSearchQuery ? (
                    <div className="px-2 py-2 text-xs text-gray-500 text-center">No projects found for "{projectSearchQuery}"</div>
                  ) : (
                    <div className="px-2 py-2 text-xs text-gray-500 text-center">No projects yet. Create your first project.</div>
                  )}

                  {/* Create new project or see all projects */}
                  <div className="pt-1 space-y-0.5">
                    <Button
                      variant="ghost"
                      onClick={() => setShowCreateProjectModal(true)}
                      className="w-full justify-start h-7 px-2 text-xs text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                    >
                      <Plus className="mr-2 h-3 w-3" />
                      Create project
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-7 px-2 text-xs text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                      asChild
                    >
                      <Link href={`/${currentWorkspace?.slug || currentWorkspace?.id}/projects`}>
                        <FolderOpen className="mr-2 h-3 w-3" />
                        All projects
                      </Link>
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Views Section */}
          <div>
            <Collapsible open={!collapsedSections.views} onOpenChange={() => toggleSection("views")}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between h-7 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f] text-sm font-medium"
                >
                  <div className="flex items-center">
                    Views
                  </div>
                  <div className="flex items-center">
                    {views.filter((v) => v.isFavorite).length > 0 && (
                      <Badge variant="secondary" className="mr-2 h-4 px-1 text-[10px] bg-[#1f1f1f]">
                        {views.filter((v) => v.isFavorite).length}
                      </Badge>
                    )}
                    {collapsedSections.views ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {/* Views search */}
                <div className="px-2 mb-2 mt-1">
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
                          pathname.includes(`/views/${view.slug || view.id}`)
                            ? "bg-[#1f1f1f] text-white"
                            : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                        )}
                        asChild
                      >
                        <Link href={`/${currentWorkspace?.slug || currentWorkspace?.id}/views/${view.slug || view.id}`} className="min-w-0 block">
                          <div className="flex items-center w-full min-w-0">
                            <Eye className="mr-2 h-3 w-3 flex-shrink-0" />
                            {view.isFavorite && <Star className="mr-1 h-3 w-3 text-yellow-500 fill-current" />}
                            <span className="truncate flex-1 text-xs">{view.name}</span>
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
                    <div className="px-2 py-2 text-xs text-gray-500 text-center">No views found for "{viewSearchQuery}"</div>
                  ) : (
                    <div className="px-2 py-2 text-xs text-gray-500 text-center">No favorite views. Latest views will appear here.</div>
                  )}

                  {/* Create new view or see all views */}
                  <div className="pt-1 space-y-0.5">
                    <Button
                      variant="ghost"
                      onClick={() => setShowCreateViewModal(true)}
                      className="w-full justify-start h-7 px-2 text-xs text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                    >
                      <Plus className="mr-2 h-3 w-3" />
                      Create view
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-7 px-2 text-xs text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
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
        </div>
      </ScrollArea>

      {/* Footer - User menu */}
      <div className="border-t border-[#1f1f1f] p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start h-8 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f]">
              {userData?.useCustomAvatar ? (
                <CustomAvatar user={userData} size="sm" className="mr-2" />
              ) : (
                <Avatar className="mr-2 h-5 w-5">
                  {userData?.image && <AvatarImage src={userData.image} />}
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
            {canManageLeave && (
              <DropdownMenuItem asChild>
                <Link
                  href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/leave-management` : "/leave-management"}
                  className="text-gray-300 hover:text-white"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Leave Management
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href="/workspaces" className="text-gray-300 hover:text-white">
                <Users className="mr-2 h-4 w-4" />
                Manage Workspaces
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/docs"  rel="noopener noreferrer" target="_blank" className="text-gray-300 hover:text-white">
                <Book className="mr-2 h-4 w-4" />
                API Documentation
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#1f1f1f]" />
            <DropdownMenuItem className="text-gray-300 hover:text-white cursor-pointer" onClick={handleSignOut}>
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
          workspaceId={currentWorkspace?.id || ""}
          projects={projects}
        />
      )}

      {/* Create Project Modal */}
      {showCreateProjectModal && (
        <CreateProjectModal
          isOpen={showCreateProjectModal}
          onClose={() => setShowCreateProjectModal(false)}
          workspaceId={currentWorkspace?.id || ""}
          onProjectCreated={(project) => {
            console.log("Project created:", project);
            // The useCreateProject hook will automatically invalidate queries
          }}
        />
      )}

      {/* New Issue Modal */}
      <NewIssueModal
        open={showNewIssueModal}
        onOpenChange={setShowNewIssueModal}
        workspaceId={currentWorkspace?.id || ""}
        currentUserId={userData?.id}
        onCreated={(issueId) => {
          console.log("Issue created:", issueId);
          // Optionally navigate to the new issue
          // router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/issues/${issueId}`);
        }}
      />


    </div>
  );
}
