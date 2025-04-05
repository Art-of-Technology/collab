"use client";

import { useState } from "react";
import Link from "next/link";
import {
  HomeIcon,
  HashtagIcon,
  UserGroupIcon,
  PlusIcon,
  EnvelopeIcon,
  Squares2X2Icon,
  RectangleStackIcon
} from "@heroicons/react/24/outline";
import { LightBulbIcon, UserIcon } from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import WorkspaceSelector from "@/components/workspace/WorkspaceSelector";
import { useCurrentUser } from "@/hooks/queries/useUser";

interface SidebarProps {
  pathname?: string;
  isCollapsed?: boolean;
  toggleSidebar?: () => void;
}

export default function Sidebar({ pathname = "", isCollapsed = false, toggleSidebar }: SidebarProps) {
  const { data: session } = useSession();
  
  // Use TanStack Query hook to fetch user data
  const { data: userData } = useCurrentUser();

  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: Squares2X2Icon,
      current: pathname === "/dashboard",
    },
    {
      name: "Timeline",
      href: "/timeline",
      icon: HomeIcon,
      current: pathname === "/timeline",
    },
    {
      name: "Tasks",
      href: "/tasks",
      icon: RectangleStackIcon,
      current: pathname === "/tasks",
    },
    {
      name: "My Posts",
      href: "/my-posts",
      icon: UserGroupIcon,
      current: pathname === "/my-posts",
    },
    {
      name: "Bookmarks",
      href: "/bookmarks",
      icon: PlusIcon,
      current: pathname === "/bookmarks",
    },
    {
      name: "Profile",
      href: "/profile",
      icon: UserIcon,
      current: pathname === "/profile",
    },
    {
      name: "Messages",
      href: "/messages",
      icon: EnvelopeIcon,
      current: pathname === "/messages" || pathname.startsWith("/messages/"),
    },
    {
      name: "Tags",
      href: "/tags",
      icon: HashtagIcon,
      current: pathname === "/tags",
    },
    {
      name: "Feature Requests",
      href: "/features",
      icon: LightBulbIcon,
      current: pathname === "/features",
    },
  ];

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
                }`}
                asChild
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
              }`}
              asChild
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
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="sm" asChild>
            <Link href="/timeline">
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