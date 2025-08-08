"use client";

import { useSidebar } from "@/components/providers/SidebarProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CollabText } from "@/components/ui/collab-text";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MarkdownContent } from "@/components/ui/markdown-content";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import WorkspaceSelector from "@/components/workspace/WorkspaceSelector";
import { useUiContext } from "@/context/UiContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useMarkAllNotificationsAsRead, useMarkNotificationAsRead, useNotificationsList, useUnreadNotificationsCount } from "@/hooks/queries/useNotifications";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { useToast } from "@/hooks/use-toast";
import {
  Bars3Icon,
  BellIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  userName}: NavbarProps) {
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

  // Use Mention context for notifications
  // Notifications hooks
  const { data: notifications = [], isLoading: notificationsLoading, refetch: refetchNotifications } = useNotificationsList(
    currentWorkspace?.id || "",
    { enabled: showNotifications, refetchInterval: 10000 }
  );
  // Limit to max 3 items for navbar preview
  const previewNotifications = notifications.slice(0, 3);
  const { data: unreadCount = 0 } = useUnreadNotificationsCount(currentWorkspace?.id || null);
  const markNotificationAsReadMutation = useMarkNotificationAsRead();
  const markAllNotificationsAsReadMutation = useMarkAllNotificationsAsRead();

  const markNotificationAsRead = async (id: string) => {
    try {
      await markNotificationAsReadMutation.mutateAsync(id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllNotificationsAsRead = async () => {
    try {
      if (currentWorkspace?.id) {
        await markAllNotificationsAsReadMutation.mutateAsync(currentWorkspace.id);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchQuery.trim() && currentWorkspace?.id) {
      router.push(`/${currentWorkspace.id}/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setMobileSearchOpen(false);
    }
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

    switch (type.toLowerCase()) {
      case 'post_mention':
      case 'post_comment':
      case 'post_reaction':
      case 'post_comment_added':
        return postId ? `/${workspaceId}/posts/${postId}` : `/${workspaceId}/timeline`;
      case 'comment_mention':
      case 'comment_reply':
      case 'comment_reaction':
        // If commentId exists, try to link to the parent post/feature
        // This might require fetching the comment details to get the post/feature ID
        // For now, linking to notifications as a fallback
        return postId ? `/${workspaceId}/posts/${postId}` : `/${workspaceId}/timeline`; // Placeholder, needs better logic
      case 'task_comment_mention': // Added this case
      case 'task_status_changed':
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
        return epicId ? `/${workspaceId}/epics/${epicId}` : `/${workspaceId}/tasks`; // Assuming epic detail page
      case 'story_mention':
        return storyId ? `/${workspaceId}/stories/${storyId}` : `/${workspaceId}/tasks`; // Assuming story detail page
      case 'milestone_mention':
        return milestoneId ? `/${workspaceId}/milestones/${milestoneId}` : `/${workspaceId}/tasks`; // Assuming milestone detail page
      case 'leave_request_status_changed':
      case 'leave_request_edited':
        return `/${workspaceId}/dashboard`;
      case 'leave_request_hr_alert':
      case 'leave_request_manager_alert':
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

  // Calculate email to show in dropdown

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#191919] border-b border-[#2a2929] h-16 shadow-md">
      <div className="h-full px-2 md:px-4 flex items-center justify-between">
        {/* Left section: Mobile menu + search on mobile, Logo on desktop */}
        <div className="flex items-center gap-0">
          {/* Mobile menu toggle button - only on mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-gray-400 hover:bg-[#1c1c1c]"
            onClick={toggleSidebar}
          >
            <Bars3Icon className="h-5 w-5" />
          </Button>

          {/* Mobile search dialog - only on mobile */}
          {shouldShowSearch && (
            <Dialog open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden hover:bg-[#1c1c1c] text-gray-400 -ml-1"
                >
                  <MagnifyingGlassIcon className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-[#1A1A1A] border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Search</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSearch} className="mt-2">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      type="search"
                      placeholder="Search..."
                      className="pl-9 pr-4 py-2 bg-[#252525] border-gray-700 text-white text-sm rounded-md w-full"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    className="mt-3 w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Search
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {/* Desktop Logo - only visible on desktop */}
          <div className="hidden md:flex items-center space-x-4">
            <Link href="/" className="flex items-center">
              <Image src="/logo-v2.png" width={100} height={100} alt="Collab" className="h-8 w-auto" />
            </Link>

            {/* Workspace selector in desktop - next to logo */}
            {hasWorkspaces && (
              <div className="flex items-center">
                <WorkspaceSelector />
              </div>
            )}
          </div>
        </div>

        {/* Center section: Logo - only on mobile */}
        <div className="md:hidden absolute left-1/2 transform -translate-x-1/2 flex items-center justify-center">
          <Link href="/" className="flex items-center">
            <Image src="/logo-v2.png" width={100} height={100} alt="Collab" className="h-8 w-auto" />
          </Link>
        </div>

        {/* Middle section for desktop: Search */}
        <div className="hidden md:flex flex-1 items-center justify-center space-x-4 px-4">
          {/* Desktop search */}
          {shouldShowSearch && (
            <div className="w-full max-w-lg">
              <form onSubmit={handleSearch} className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  type="search"
                  placeholder="Search posts, people, or tags"
                  className="pl-9 bg-[#1c1c1c] border-[#2a2929] text-gray-200 focus:border-gray-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            </div>
          )}
        </div>

        {/* Right section: Notifications, chat, profile */}
        <div className="flex items-center gap-0">
          {session ? (
            <>
              {hasWorkspaces && (
                <>
                  {/* Notification bell with popover */}
                  <Popover 
                    open={showNotifications} 
                    onOpenChange={(open) => {
                      setShowNotifications(open);
                      if (open) {
                        // Refetch notifications when opening
                        refetchNotifications();
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative hover:bg-[#1c1c1c] text-gray-400"
                      >
                        <BellIcon className="h-5 w-5" />
                        {unreadCount > 0 && (
                          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="end" alignOffset={-5} forceMount>
                      <div className="flex items-center justify-between p-3 border-b border-border/40">
                        <h3 className="font-medium">Notifications</h3>
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

                      <ScrollArea>
                        {notificationsLoading ? (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            Loading notifications...
                          </div>
                        ) : previewNotifications.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            No notifications yet
                          </div>
                        ) : (
                          <div className="flex flex-col justify-between h-full">
                            {previewNotifications.map(notification => {
                              const url = getNotificationUrl(notification);
                              const isHtmlContent = /<[^>]+>/.test(notification.content);

                              return (
                                <div
                                  key={notification.id}
                                  className={`flex items-start gap-3 p-3 hover:bg-muted/40 cursor-pointer border-b border-border/20 ${!notification.read ? 'bg-primary/5' : ''}`}
                                  onClick={() => handleNotificationClick(notification.id, url)}
                                >
                                  {/* Sender Avatar */}
                                  {notification.sender?.useCustomAvatar ? (
                                    <CustomAvatar user={notification.sender as any} size="sm" />
                                  ) : (
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage
                                        src={notification.sender?.image || undefined}
                                        alt={notification.sender?.name || "User"}
                                      />
                                      <AvatarFallback>
                                        {getInitials(notification.sender?.name || "U")}
                                      </AvatarFallback>
                                    </Avatar>
                                  )}

                                  {/* Notification Content */}
                                  <div className="flex-1 space-y-1">
                                    <p className="text-sm">
                                      <span className="font-medium">{notification.sender?.name || "Unknown User"}</span>
                                      {' '}
                                      <span className="text-muted-foreground">
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
                                    <p className="text-xs text-muted-foreground">
                                      {formatNotificationTime(notification.createdAt)}
                                    </p>
                                  </div>

                                  {/* Read Indicator */}
                                  {!notification.read && (
                                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="p-1 text-center text-sm">
                          <Button variant="link" className="text-xs text-foreground" onClick={() => {
                            setShowNotifications(false);
                            router.push(`/${currentWorkspace?.id}/notifications`);
                          }}>
                            Show more
                          </Button> 
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>

                  {/* Chat toggle button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative hover:bg-[#1c1c1c] text-gray-400 -ml-1"
                    onClick={toggleChat}
                  >
                    <MessageCircle className="h-5 w-5" />
                    {isChatOpen && (
                      <span className="absolute bottom-1 right-1 bg-blue-500 rounded-full w-2 h-2" />
                    )}
                  </Button>

                  {/* AI Assistant toggle button */}
                  {/* <Button
                    variant="ghost"
                    size="icon"
                    className="relative hover:bg-[#1c1c1c] text-gray-400"
                    onClick={toggleAssistant}
                  >
                    <SparklesIcon className="h-5 w-5" />
                    {isAssistantOpen && (
                      <span className="absolute bottom-1 right-1 bg-purple-500 rounded-full w-2 h-2" />
                    )}
                  </Button> */}
                </>
              )}

              {/* Profile dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full overflow-hidden h-6 w-6 sm:h-10 sm:w-10">
                    {userData?.useCustomAvatar ? (
                      <CustomAvatar user={userData} size="md" />
                    ) : (
                      <Avatar className="h-6 w-6 sm:h-10 sm:w-10">
                        <AvatarImage src={userData?.image || undefined} alt={userData?.name || "User"} />
                        <AvatarFallback className="text-[8px] sm:text-sm">{getInitials(userData?.name || "U")}</AvatarFallback>
                      </Avatar>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-[#1c1c1c] border-[#2a2929] text-gray-200" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{userName || session?.user?.name}</p>
                      <p className="text-xs leading-none text-gray-400">
                        {userEmail || session?.user?.email || ''}
                      </p>
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
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href="/workspaces">Manage Workspaces</Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="bg-[#2a2929]" />
                  <DropdownMenuItem onClick={() => signOut({ redirect: false })}>
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button variant="outline" className="border-[#2a2929] hover:bg-[#1c1c1c] text-gray-200">Sign In</Button>
          )}
        </div>
      </div>
    </nav>
  );
} 