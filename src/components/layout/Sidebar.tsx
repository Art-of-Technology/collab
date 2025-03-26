"use client";

import Link from "next/link";
import {
  HomeIcon,
  HashtagIcon,
  UserGroupIcon,
  PlusIcon,
  EnvelopeIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { LightBulbIcon, UserIcon } from "@heroicons/react/24/outline";
import { ChatBubbleLeftRightIcon as MessageSquare } from "@heroicons/react/24/outline";
import { UsersIcon } from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface SidebarProps {
  pathname?: string;
}

export default function Sidebar({ pathname = "" }: SidebarProps) {
  const { data: session } = useSession();
  const isActive = (path: string) => pathname.startsWith(path);

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

  return (
    <Card className="sticky top-20 bg-card/95 backdrop-blur-sm border-none shadow-md">
      <CardContent className="p-4">
        <div className="space-y-1">
          {navigation.map((item) => (
            <Button
              key={item.name}
              variant={item.current ? "secondary" : "ghost"}
              className={`w-full justify-start transition-colors hover-effect ${
                item.current ? "bg-secondary" : ""
              }`}
              asChild
            >
              <Link
                href={item.href}
                aria-current={item.current ? "page" : undefined}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 ${
                    item.current ? "text-primary" : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.name}</span>
              </Link>
            </Button>
          ))}
        </div>

        <div className="border-t border-border pt-4 mt-4">
          <Button className="w-full bg-primary hover:bg-primary/90" size="sm" asChild>
            <Link href="/timeline">
              <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              New Post
            </Link>
          </Button>
        </div>

        {session?.user && (
          <div className="border-t border-border pt-4 mt-4">
            <div className="flex items-center space-x-3">
              <Avatar className="border-2 border-primary/10">
                {session.user.image ? (
                  <AvatarImage
                    src={session.user.image}
                    alt={session.user.name || "User"}
                  />
                ) : (
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {session.user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {session.user.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {session.user.role || "Developer"}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 