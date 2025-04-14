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
import WorkspaceSelector from "@/components/workspace/WorkspaceSelector";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { formatDistanceToNow } from "date-fns";
import { CollabText } from "@/components/ui/collab-text";
import { MarkdownContent } from "@/components/ui/markdown-content";

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
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
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
    const { type, postId, featureRequestId, taskId, epicId, storyId, milestoneId } = notification;

    switch (type) {
      case 'post_mention':
      case 'post_comment':
      case 'post_reaction':
        return postId ? `/posts/${postId}` : '/timeline';
      case 'comment_mention':
      case 'comment_reply':
      case 'comment_reaction':
        // If commentId exists, try to link to the parent post/feature
        // This might require fetching the comment details to get the post/feature ID
        // For now, linking to notifications as a fallback
        return postId ? `/posts/${postId}` : '/timeline'; // Placeholder, needs better logic
      case 'taskComment_mention': // Added this case
        return taskId ? `/tasks/${taskId}` : '/tasks';
      case 'feature_mention':
      case 'feature_comment':
      case 'feature_vote':
        return featureRequestId ? `/features/${featureRequestId}` : '/features';
      case 'task_mention':
      case 'task_assigned':
      case 'task_status_change':
        return taskId ? `/tasks/${taskId}` : '/tasks';
      case 'epic_mention':
        return epicId ? `/epics/${epicId}` : '/tasks'; // Assuming epic detail page
      case 'story_mention':
        return storyId ? `/stories/${storyId}` : '/tasks'; // Assuming story detail page
      case 'milestone_mention':
        return milestoneId ? `/milestones/${milestoneId}` : '/tasks'; // Assuming milestone detail page
      default:
        return '/timeline';
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
      <Avatar>
        {displayImage ? (
          <AvatarImage src={displayImage} alt={displayName || "User"} />
        ) : (
          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
        )}
      </Avatar>
    );
  };

  // Calculate email to show in dropdown
  const displayEmail = userEmail || session?.user?.email || '';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#191919] border-b border-[#2a2929] h-16 shadow-md">
      <div className="h-full px-2 md:px-4 flex items-center justify-between">
        {/* Left section: Mobile menu + search on mobile, Logo on desktop */}
        <div className="flex items-center gap-2">
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
                  className="md:hidden hover:bg-[#1c1c1c] text-gray-400"
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
        <div className="flex items-center gap-1 md:gap-2">
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
                      
                      <ScrollArea className="h-80">
                        {notificationsLoading ? (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            Loading notifications...
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            No notifications yet
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            {notifications.map(notification => {
                              const url = getNotificationUrl(notification);
                              const isHtmlContent = /<[^>]+>/.test(notification.content);
                              console.log(`Notification ID: ${notification.id}, Content contains tag? ${isHtmlContent}, Content:`, notification.content);
                              return (
                                <div 
                                  key={notification.id}
                                  className={`flex items-start gap-3 p-3 hover:bg-muted/40 cursor-pointer border-b border-border/20 ${!notification.read ? 'bg-primary/5' : ''}`}
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
                                      <AvatarFallback>
                                        {getInitials(notification.sender.name || "U")}
                                      </AvatarFallback>
                                    </Avatar>
                                  )}
                                  
                                  {/* Notification Content */}
                                  <div className="flex-1 space-y-1">
                                    <p className="text-sm">
                                      <span className="font-medium">{notification.sender.name}</span>
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
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>

                  {/* Chat toggle button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative hover:bg-[#1c1c1c] text-gray-400"
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
                  <Button variant="ghost" className="rounded-full p-0 h-8 w-8 md:h-10 md:w-10 overflow-hidden">
                    {renderAvatar()}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-[#1c1c1c] border-[#2a2929] text-gray-200" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{userName || session?.user?.name}</p>
                      <p className="text-xs leading-none text-gray-400">
                        {displayEmail}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[#2a2929]" />
                  <DropdownMenuGroup>
                    {hasWorkspaces && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/profile">Your Profile</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/my-posts">My Posts</Link>
                        </DropdownMenuItem>
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
            <Button variant="outline" className="border-[#2a2929] hover:bg-[#1c1c1c] text-gray-200">Sign In</Button>
          )}
        </div>
      </div>
    </nav>
  );
} 