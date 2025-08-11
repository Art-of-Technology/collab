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
  CheckSquare,
  MessageSquare,
  FileText,
  Clock,
  Bookmark,
  Tag,
  Lightbulb,
  Timer,
  Bell,
  Search as SearchIcon,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useProjects } from "@/hooks/queries/useProjects";
import { useViews } from "@/hooks/queries/useViews";
import CreateViewModal from "@/components/modals/CreateViewModal";
import NewIssueModal from "@/components/issue/NewIssueModal";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUiContext } from "@/context/UiContext";
import { useMention } from "@/context/MentionContext";
import { CollabText } from "@/components/ui/collab-text";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { CommandMenu } from "@/components/ui/command-menu";

interface SidebarProps {
  pathname?: string;
  isCollapsed?: boolean;
  toggleSidebar?: () => void;
  commandMenuOpen?: boolean;
  setCommandMenuOpen?: (open: boolean) => void;
}

export default function Sidebar({ 
  pathname = "", 
  isCollapsed = false, 
  toggleSidebar,
  commandMenuOpen = false,
  setCommandMenuOpen
}: SidebarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const { isChatOpen, toggleChat } = useUiContext();
  const { currentWorkspace, workspaces, isLoading, switchWorkspace } = useWorkspace();
  const { data: userData } = useCurrentUser();

  // Use Mention context for notifications
  const { 
    notifications, 
    unreadCount, 
    markNotificationAsRead, 
    markAllNotificationsAsRead,
    loading: notificationsLoading,
    refetchNotifications
  } = useMention();

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
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const [showCreateViewModal, setShowCreateViewModal] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    teams: false,
    views: false
  });
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Record<string, boolean>>({});
  
  // Notification and modal state
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNewIssueModal, setShowNewIssueModal] = useState(false);

  // Filter views for sidebar display - show favorites or latest 4
  const sidebarViews = useMemo(() => {
    if (!views.length) return [];
    
    // Filter by search query first
    let filteredViews = views;
    if (viewSearchQuery.trim()) {
      filteredViews = views.filter(view => 
        view.name.toLowerCase().includes(viewSearchQuery.toLowerCase())
      );
      // Limit search results to 4 items
      return filteredViews.slice(0, 4);
    }
    
    // If no search, show favorites or latest 4
    const favoriteViews = views.filter(view => view.isFavorite);
    if (favoriteViews.length > 0) {
      return favoriteViews.slice(0, 4);
    } else {
      // Show latest 4 views by updatedAt
      return [...views]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 4);
    }
  }, [views, viewSearchQuery]);

  // Filter workspaces for sidebar display - show maximum 4
  const sidebarWorkspaces = useMemo(() => {
    if (!workspaces.length) return [];
    
    // Filter by search query first
    let filteredWorkspaces = workspaces;
    if (workspaceSearchQuery.trim()) {
      filteredWorkspaces = workspaces.filter(workspace => 
        workspace.name.toLowerCase().includes(workspaceSearchQuery.toLowerCase())
      );
      // Limit search results to 4 items
      return filteredWorkspaces.slice(0, 4);
    }
    
    // If no search, show maximum 4 workspaces
    return workspaces.slice(0, 4);
  }, [workspaces, workspaceSearchQuery]);

  // Handle opening command menu
  const handleOpenCommandMenu = () => {
    setCommandMenuOpen?.(true);
  };

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
      console.error('Error formatting notification time:', error);
      return 'recently';
    }
  };
  
  // Generate notification URL based on type
  const getNotificationUrl = (notification: any): string => {
    const { type, postId, featureRequestId, taskId, epicId, storyId, milestoneId } = notification;
    const workspaceId = currentWorkspace?.id;

    if (!workspaceId) {
      return '/welcome'; // Fallback if no workspace
    }

    switch (type) {
      case 'post_mention':
      case 'post_comment':
      case 'post_reaction':
        return postId ? `/${workspaceId}/posts/${postId}` : `/${workspaceId}/timeline`;
      case 'comment_mention':
      case 'comment_reply':
      case 'comment_reaction':
        return postId ? `/${workspaceId}/posts/${postId}` : `/${workspaceId}/timeline`;
      case 'taskComment_mention':
        return taskId ? `/${workspaceId}/tasks/${taskId}` : `/${workspaceId}/tasks`;
      case 'feature_mention':
      case 'feature_comment':
      case 'feature_vote':
        return featureRequestId ? `/${workspaceId}/features/${featureRequestId}` : `/${workspaceId}/features`;
      case 'task_mention':
      case 'task_assigned':
      case 'task_status_change':
        return taskId ? `/${workspaceId}/tasks/${taskId}` : `/${workspaceId}/tasks`;
      case 'epic_mention':
        return epicId ? `/${workspaceId}/epics/${epicId}` : `/${workspaceId}/tasks`;
      case 'story_mention':
        return storyId ? `/${workspaceId}/stories/${storyId}` : `/${workspaceId}/tasks`;
      case 'milestone_mention':
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
        {/* Header - Logo and Actions (collapsed) */}
        <div className="p-2 border-b border-[#1f1f1f] space-y-2">
          {/* Logo */}
          <div className="flex justify-center">
            <Link href="/" className="flex items-center">
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
              onClick={handleOpenCommandMenu}
              title="Command Menu (Cmd+K)"
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
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 bg-[#090909] border-[#1f1f1f]" align="start" alignOffset={0} forceMount>
                  <div className="flex items-center justify-between p-3 border-b border-[#1f1f1f]">
                    <h3 className="font-medium text-white">Notifications</h3>
                    {unreadCount > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs h-7 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f]" 
                        onClick={() => markAllNotificationsAsRead()}
                      >
                        Mark all as read
                      </Button>
                    )}
                  </div>
                  
                  <ScrollArea className="h-80">
                    {notificationsLoading ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        Loading notifications...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        No notifications yet
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {notifications.map(notification => {
                          const url = getNotificationUrl(notification);
                          const isHtmlContent = /<[^>]+>/.test(notification.content);
                          return (
                            <div 
                              key={notification.id}
                              className={`flex items-start gap-3 p-3 hover:bg-[#1f1f1f] cursor-pointer border-b border-[#1f1f1f] ${!notification.read ? 'bg-[#22c55e]/5' : ''}`}
                              onClick={() => handleNotificationClick(notification.id, url)}
                            >
                              {/* Sender Avatar */}
                              {notification.sender.useCustomAvatar ? (
                                <CustomAvatar user={notification.sender} size="sm" />
                              ) : (
                                <Avatar className="h-8 w-8">
                                  <AvatarImage 
                                    src={notification.sender.image || undefined} 
                                    alt={notification.sender.name || "User"} 
                                  />
                                  <AvatarFallback className="bg-[#1f1f1f] text-white text-xs">
                                    {getInitials(notification.sender.name || "U")}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              
                              {/* Notification Content */}
                              <div className="flex-1 space-y-1">
                                <p className="text-sm">
                                  <span className="font-medium text-white">{notification.sender.name}</span>
                                  {' '}
                                  <span className="text-gray-400">
                                    {isHtmlContent ? (
                                      <MarkdownContent
                                        htmlContent={notification.content}
                                        className="inline text-sm"
                                        asSpan={true}
                                      />
                                    ) : (
                                      <CollabText
                                        content={notification.content}
                                        small
                                        asSpan
                                      />
                                    )}
                                  </span>
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatNotificationTime(notification.createdAt)}
                                </p>
                              </div>
                              
                              {/* Read Indicator */}
                              {!notification.read && (
                                <div className="h-2 w-2 rounded-full bg-[#22c55e] mt-1.5" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
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
                {isChatOpen && (
                  <span className="absolute -bottom-1 -right-1 bg-[#22c55e] rounded-full w-2 h-2" />
                )}
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
                  <div className="flex items-center">
                    <Avatar className="h-4 w-4 mr-2">
                      {workspace.logoUrl && <AvatarImage src={workspace.logoUrl} />}
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
      {/* Header - Logo and Actions */}
      <div className="p-3 border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between mb-3">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Image src="/logo-v2.png" width={100} height={100} alt="Collab" className="h-7 w-auto" />
          </Link>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            {/* Command Menu */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
              onClick={handleOpenCommandMenu}
              title="Command Menu (Cmd+K)"
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
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 bg-[#090909] border-[#1f1f1f]" align="start" alignOffset={0} forceMount>
                  <div className="flex items-center justify-between p-3 border-b border-[#1f1f1f]">
                    <h3 className="font-medium text-white">Notifications</h3>
                    {unreadCount > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs h-7 px-2 text-gray-400 hover:text-white hover:bg-[#1f1f1f]" 
                        onClick={() => markAllNotificationsAsRead()}
                      >
                        Mark all as read
                      </Button>
                    )}
                  </div>
                  
                  <ScrollArea className="h-80">
                    {notificationsLoading ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        Loading notifications...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        No notifications yet
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {notifications.map(notification => {
                          const url = getNotificationUrl(notification);
                          const isHtmlContent = /<[^>]+>/.test(notification.content);
                          return (
                            <div 
                              key={notification.id}
                              className={`flex items-start gap-3 p-3 hover:bg-[#1f1f1f] cursor-pointer border-b border-[#1f1f1f] ${!notification.read ? 'bg-[#22c55e]/5' : ''}`}
                              onClick={() => handleNotificationClick(notification.id, url)}
                            >
                              {/* Sender Avatar */}
                              {notification.sender.useCustomAvatar ? (
                                <CustomAvatar user={notification.sender} size="sm" />
                              ) : (
                                <Avatar className="h-8 w-8">
                                  <AvatarImage 
                                    src={notification.sender.image || undefined} 
                                    alt={notification.sender.name || "User"} 
                                  />
                                  <AvatarFallback className="bg-[#1f1f1f] text-white text-xs">
                                    {getInitials(notification.sender.name || "U")}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              
                              {/* Notification Content */}
                              <div className="flex-1 space-y-1">
                                <p className="text-sm">
                                  <span className="font-medium text-white">{notification.sender.name}</span>
                                  {' '}
                                  <span className="text-gray-400">
                                    {isHtmlContent ? (
                                      <MarkdownContent
                                        htmlContent={notification.content}
                                        className="inline text-sm"
                                        asSpan={true}
                                      />
                                    ) : (
                                      <CollabText
                                        content={notification.content}
                                        small
                                        asSpan
                                      />
                                    )}
                                  </span>
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatNotificationTime(notification.createdAt)}
                                </p>
                              </div>
                              
                              {/* Read Indicator */}
                              {!notification.read && (
                                <div className="h-2 w-2 rounded-full bg-[#22c55e] mt-1.5" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
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
                {isChatOpen && (
                  <span className="absolute -bottom-1 -right-1 bg-[#22c55e] rounded-full w-2 h-2" />
                )}
              </Button>
            )}
          </div>
        </div>
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
                {/* Workspaces search */}
                <div className="px-2 mb-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                    <Input
                      placeholder="Search workspaces..."
                      value={workspaceSearchQuery}
                      onChange={(e) => setWorkspaceSearchQuery(e.target.value)}
                      className="h-7 pl-7 text-xs bg-[#1f1f1f] border-[#2a2a2a] focus:border-[#22c55e] text-white placeholder-gray-500"
                    />
                  </div>
                </div>

                {/* All workspaces */}
        <div className="space-y-1">
                                    {sidebarWorkspaces.map((workspace) => {
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
                                {workspace.logoUrl && <AvatarImage src={workspace.logoUrl} />}
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

                  {/* Create workspace and see all workspaces */}
                  <div className="pt-1 space-y-0.5">
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-7 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                      asChild
                    >
                      <Link href="/create-workspace">
                        <Plus className="mr-2 h-3 w-3" />
                        Create workspace
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-7 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                      asChild
                    >
                      <Link href="/workspaces">
                        <Users className="mr-2 h-3 w-3" />
                        All workspaces
                      </Link>
                    </Button>
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
                          pathname.includes(`/views/${view.slug || view.id}`)
                            ? "bg-[#1f1f1f] text-white" 
                            : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                        )}
                        asChild
                      >
                        <Link href={`/${currentWorkspace?.slug || currentWorkspace?.id}/views/${view.slug || view.id}`}>
                          <div className="flex items-center w-full">
                            <Eye className="mr-2 h-3 w-3 opacity-60" />
                            {view.isFavorite && <Star className="mr-1 h-3 w-3 text-yellow-500 fill-current" />}
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
              <DropdownMenuItem asChild>
                <Link href="/workspaces" className="text-gray-300 hover:text-white">
                  <Users className="mr-2 h-4 w-4" />
                  Manage Workspaces
            </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#1f1f1f]" />
              <DropdownMenuItem 
                className="text-gray-300 hover:text-white cursor-pointer"
                onClick={handleSignOut}
              >
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
      
      {/* New Issue Modal */}
      <NewIssueModal
        open={showNewIssueModal}
        onOpenChange={setShowNewIssueModal}
        workspaceId={currentWorkspace?.id || ''}
        currentUserId={userData?.id}
        onCreated={(issueId) => {
          console.log('Issue created:', issueId);
          // Optionally navigate to the new issue
          // router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/issues/${issueId}`);
        }}
      />
      
      {/* Command Menu */}
      {setCommandMenuOpen && (
      <CommandMenu
        open={commandMenuOpen}
        onOpenChange={setCommandMenuOpen}
        onCreateIssue={() => setShowNewIssueModal(true)}
        onCreateView={() => setShowCreateViewModal(true)}
        onCreateProject={() => {
          // TODO: Implement new project modal trigger
          toast({
            title: "Coming soon", 
            description: "Create project functionality will be available soon",
          });
        }}
      />
      )}
    </div>
  );
} 