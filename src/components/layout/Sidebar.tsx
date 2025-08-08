"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import WorkspaceSelector from "@/components/workspace/WorkspaceSelector";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { urls } from "@/lib/url-resolver";
import {
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  HashtagIcon,
  HomeIcon,
  LightBulbIcon,
  PlusIcon,
  RectangleStackIcon,
  Squares2X2Icon,
  UserGroupIcon,
  UserIcon
} from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import Link from "next/link";

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
      {
        name: "Tasks",
        href: getUrl('/tasks'),
        icon: RectangleStackIcon,
        current: pathname === getUrl('/tasks') || pathname === `/${workspaceId}/tasks`,
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
      <div>
        <div className="space-y-6 text-gray-300">
          <div className="space-y-1">
            {navigation.map((item) => (
              <Button
                key={item.name}
                variant={item.current ? "secondary" : "ghost"}
                className={`w-full justify-center p-3 transition-colors ${
                  item.current ? "bg-[#1c1c1c] text-white" : "text-gray-400 hover:text-gray-200 hover:bg-[#1c1c1c]"
                } ${(!currentWorkspace?.id && isLoading) ? "opacity-50 pointer-events-none" : ""}`}
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
                >
                  <item.icon
                    className={`h-5 w-5 flex-shrink-0 ${
                      item.current ? "text-blue-500" : "text-gray-400"
                    }`}
                    aria-hidden="true"
                  />
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-6 text-gray-300">
        {/* Workspace selector for mobile */}
        <div className="md:hidden mb-4">
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">Workspace</div>
          <WorkspaceSelector />
        </div>
        
        <div className="space-y-1">
          {navigation.map((item) => (
            <Button
              key={item.name}
              variant={item.current ? "secondary" : "ghost"}
              className={`w-full justify-start transition-colors ${
                item.current ? "bg-[#1c1c1c] text-white" : "text-gray-400 hover:text-gray-200 hover:bg-[#1c1c1c]"
              } ${(!currentWorkspace?.id && isLoading) ? "opacity-50 pointer-events-none" : ""}`}
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
                  className={`mr-3 h-5 w-5 flex-shrink-0 ${
                    item.current ? "text-blue-500" : "text-gray-400"
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.name}</span>
              </Link>
            </Button>
          ))}
        </div>

        <div className="border-t border-[#2a2929] pt-4">
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

        {session?.user && (
          <div className="border-t border-[#2a2929] pt-4">
            <div className="flex items-center space-x-3">
              {renderAvatar()}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-gray-200">
                  {session.user.name}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {session.user.role || "Developer"}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-[#2a2929] pt-4 mt-4 text-xs text-gray-500">
          <div className="flex justify-center space-x-3">
            <Link href="/terms" className="hover:text-gray-300 transition-colors">
              Terms
            </Link>
            <Link href="/privacy-policy" className="hover:text-gray-300 transition-colors">
              Privacy
            </Link>
          </div>
          <div className="text-center mt-2">
            © {new Date().getFullYear()} Collab by Weezboo
          </div>
        </div>
      </div>
    </div>
  );
} 