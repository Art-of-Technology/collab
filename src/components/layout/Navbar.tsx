"use client";

import { useState } from "react";
import Image from "next/image"
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BellIcon,
  MagnifyingGlassIcon,
  Bars3Icon,
  /*SparklesIcon*/
} from "@heroicons/react/24/outline";
import { MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useUiContext } from "@/context/UiContext";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { useMention } from "@/context/MentionContext";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { formatDistanceToNow } from "date-fns";
import { CollabText } from "@/components/ui/collab-text";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";

interface NavbarProps {
  hasWorkspaces: boolean;
  shouldShowSearch: boolean;
  userEmail?: string;
  userName?: string;
  userImage?: string;
}

export default function Navbar({
  hasWorkspaces,
  shouldShowSearch,
  userEmail,
  userName,
  userImage
}: NavbarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const { isChatOpen, toggleChat, /*isAssistantOpen, toggleAssistant*/ } = useUiContext();
  const { toggleSidebar } = useSidebar();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Use TanStack Query hook to fetch user data
  const { data: userData } = useCurrentUser();
  const { currentWorkspace } = useWorkspace();
  const { canManageLeave } = useWorkspacePermissions();

  // Use Mention context for notifications
  const {
    notifications,
    unreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    loading: notificationsLoading,
    refetchNotifications
  } = useMention();

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchQuery.trim() && currentWorkspace?.id) {
      router.push(`/${currentWorkspace.id}/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setMobileSearchOpen(false);
    }
  };

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
    const { type, postId, featureRequestId, taskId, epicId, storyId, milestoneId, leaveRequestId } = notification;
    const workspaceId = currentWorkspace?.id;

    if (!workspaceId) {
      return '/welcome'; // Fallback if no workspace
    }

    switch (type) {
      case 'post_mention':
      case 'post_comment':
      case 'post_reaction':
      case 'POST_COMMENT_ADDED':
        return postId ? `/${workspaceId}/posts/${postId}` : `/${workspaceId}/timeline`;
      case 'comment_mention':
      case 'comment_reply':
      case 'comment_reaction':
        // If commentId exists, try to link to the parent post/feature
        // This might require fetching the comment details to get the post/feature ID
        // For now, linking to notifications as a fallback
        return postId ? `/${workspaceId}/posts/${postId}` : `/${workspaceId}/timeline`; // Placeholder, needs better logic
      case 'taskComment_mention': // Added this case
      case 'TASK_STATUS_CHANGED':
        return taskId ? `/${workspaceId}/tasks/${taskId}` : `/${workspaceId}/tasks`;
      case 'feature_mention':
      case 'feature_comment':
      case 'feature_vote':
        return featureRequestId ? `/${workspaceId}/features/${featureRequestId}` : `/${workspaceId}/features`;
      case 'task_mention':
      case 'task_assigned':
      case 'task_status_change':
      case 'TASK_ASSIGNED':
        return taskId ? `/${workspaceId}/tasks/${taskId}` : `/${workspaceId}/tasks`;
      case 'epic_mention':
        return epicId ? `/${workspaceId}/epics/${epicId}` : `/${workspaceId}/tasks`; // Assuming epic detail page
      case 'story_mention':
        return storyId ? `/${workspaceId}/stories/${storyId}` : `/${workspaceId}/tasks`; // Assuming story detail page
      case 'milestone_mention':
        return milestoneId ? `/${workspaceId}/milestones/${milestoneId}` : `/${workspaceId}/tasks`; // Assuming milestone detail page
      case 'LEAVE_REQUEST_STATUS_CHANGED':
      case 'LEAVE_REQUEST_EDITED':
        return `/${workspaceId}/dashboard`;
      case 'LEAVE_REQUEST_HR_ALERT':
      case 'LEAVE_REQUEST_MANAGER_ALERT':
        return `/${workspaceId}/leave-management`;
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

  // Render the avatar based on user data
  const renderAvatar = () => {
    if (userData?.useCustomAvatar) {
      return <CustomAvatar user={userData} size="md" />;
    }

    // Use server-provided values with fallback to session values for SSR
    const displayName = userName || session?.user?.name || '';
    const displayImage = userImage || session?.user?.image;

    return (
      <Avatar className="h-6 w-6 sm:h-10 sm:w-10">
        {displayImage ? (
          <AvatarImage src={displayImage} alt={displayName || "User"} />
        ) : (
          <AvatarFallback className="text-[8px] sm:text-sm">{getInitials(displayName)}</AvatarFallback>
        )}
      </Avatar>
    );
  };

  // Calculate email to show in dropdown
  const displayEmail = userEmail || session?.user?.email || '';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#090909] border-b border-[#1f1f1f] h-16 shadow-sm">
      <div className="h-full px-3 md:px-6 flex items-center justify-between">
        {/* Left section: Mobile menu + Logo */}
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle button - only on mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-gray-400 hover:bg-[#1f1f1f] hover:text-white h-8 w-8"
            onClick={toggleSidebar}
          >
            <Bars3Icon className="h-5 w-5" />
          </Button>

          {/* Logo */}
          {/*
            Compute a safe workspace path: use slug or id if available, otherwise fallback to '/dashboard'
          */}
          <Link
            href={
              currentWorkspace?.slug
                ? `/${currentWorkspace.slug}/dashboard`
                : currentWorkspace?.id
                ? `/${currentWorkspace.id}/dashboard`
                : `/dashboard`
            }
            className="flex items-center"
          >
            <Image src="/logo-text.svg" width={100} height={100} alt="Collab" className="h-7 w-auto" />
          </Link>
        </div>

        {/* Center section: Search */}
        <div className="flex-1 flex items-center justify-center px-4">
          {shouldShowSearch && (
            <>
              {/* Mobile search button */}
            <Dialog open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden hover:bg-[#1f1f1f] text-gray-400 hover:text-white h-8 w-8"
                >
                    <MagnifyingGlassIcon className="h-4 w-4" />
                </Button>
              </DialogTrigger>
                <DialogContent className="sm:max-w-md bg-[#090909] border-[#1f1f1f]">
                <DialogHeader>
                  <DialogTitle className="text-white">Search</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSearch} className="mt-2">
                  <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="search"
                      placeholder="Search..."
                        className="pl-10 bg-[#1f1f1f] border-[#2a2a2a] focus:border-[#22c55e] text-white placeholder-gray-500"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                      className="mt-3 w-full bg-[#22c55e] hover:bg-[#16a34a] text-white"
                  >
                    Search
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

          {/* Desktop search */}
              <div className="hidden md:block w-full max-w-md">
              <form onSubmit={handleSearch} className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  type="search"
                    placeholder="Search..."
                    className="pl-10 bg-[#1f1f1f] border-[#2a2a2a] focus:border-[#22c55e] text-white placeholder-gray-500 h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            </div>
            </>
          )}
        </div>

        {/* Right section: Notifications, chat, profile */}
        <div className="flex items-center gap-1">
          {session ? (
            <>
              {hasWorkspaces && (
                <>
                  {/* Notification bell with popover */}
                  <Popover open={showNotifications} onOpenChange={setShowNotifications}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative hover:bg-[#1c1c1c] text-gray-400"
                        onClick={() => refetchNotifications()}
                      >
                    <BellIcon className="h-4 w-4" />
                        {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                <PopoverContent className="w-80 p-0 bg-[#090909] border-[#1f1f1f]" align="end" alignOffset={-5} forceMount>
                  <div className="flex items-center justify-between p-3 border-b border-[#1f1f1f]">
                    <h3 className="font-medium text-white">Notifications</h3>
                        {unreadCount > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2"
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
                      <div className="p-3 border-t border-border/40 flex justify-center">
                        <Link href={`/${currentWorkspace?.id}/notifications`} className="w-full text-center">
                          View all notifications
                        </Link>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Chat toggle button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative hover:bg-[#1f1f1f] text-gray-400 hover:text-white h-8 w-8"
                    onClick={toggleChat}
                  >
                <MessageCircle className="h-4 w-4" />
                    {isChatOpen && (
                  <span className="absolute -bottom-1 -right-1 bg-[#22c55e] rounded-full w-2 h-2" />
                    )}
                  </Button>
                </>
              )}

              {/* Profile dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full overflow-hidden h-6 w-6 sm:h-10 sm:w-10">
                    {renderAvatar()}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-[#090909] border-[#1f1f1f]">
                  <DropdownMenuLabel className="text-white">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{userName || session?.user?.name}</p>
                      <p className="text-xs text-gray-400">{displayEmail}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[#2a2929]" />
                  <DropdownMenuGroup>
                    {hasWorkspaces && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href={currentWorkspace ? `/${currentWorkspace.id}/profile` : "/profile"}>Your Profile</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={currentWorkspace ? `/${currentWorkspace.id}/my-posts` : "/my-posts"}>My Posts</Link>
                        </DropdownMenuItem>
                        {canManageLeave && (
                          <DropdownMenuItem asChild>
                            <Link href={currentWorkspace ? `/${currentWorkspace.id}/leave-management` : "/leave-management"}>Leave Management</Link>
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href="/workspaces">Manage Workspaces</Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="bg-[#2a2929]" />
                  <DropdownMenuItem onClick={handleSignOut}>
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button 
              variant="outline" 
              className="border-[#1f1f1f] hover:bg-[#1f1f1f] text-gray-300 hover:text-white h-8 px-3 text-sm"
              asChild
            >
              <Link href="/login">Sign In</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
} 