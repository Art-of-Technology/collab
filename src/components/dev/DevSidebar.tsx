"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Grid3X3,
  Book,
  Webhook,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import AppSwitcher from "./AppSwitcher";

interface DevSidebarProps {
  isCollapsed?: boolean;
}

export default function DevSidebar({
  isCollapsed = false,
}: DevSidebarProps) {
  const pathname = usePathname();

  // Navigation items
  const navigationItems = [
    {
      name: "Dashboard",
      href: "/dev",
      icon: LayoutDashboard,
      current: pathname === "/dev" || pathname === "/dev/",
    },
    {
      name: "My Apps",
      href: "/dev/apps",
      icon: Grid3X3,
      current: pathname.startsWith("/dev/apps"),
    },
    {
      name: "API Documentation",
      href: "/dev/docs",
      icon: Book,
      current: pathname.startsWith("/dev/docs"),
    },
    {
      name: "Webhooks Overview",
      href: "/dev/webhooks",
      icon: Webhook,
      current: pathname.startsWith("/dev/webhooks"),
    },
    {
      name: "Settings",
      href: "/dev/settings",
      icon: Settings,
      current: pathname.startsWith("/dev/settings"),
    },
  ];

  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full">
        {/* Header - Logo (collapsed) */}
        <div className="p-2 border-b border-[#1f1f1f]">
          <div className="flex justify-center">
            <Link href="/dev" className="flex items-center">
              <Image src="/logo-icon.svg" width={32} height={32} alt="Collab" className="h-8 w-auto" />
            </Link>
          </div>
        </div>

        {/* Navigation - collapsed */}
        <div className="flex-1 p-2 space-y-1">
          {navigationItems.map((item) => (
            <Button
              key={item.name}
              variant="ghost"
              size="icon"
              className={cn(
                "w-full h-10 hover:bg-[#1f1f1f] hover:text-white",
                item.current ? "bg-[#1f1f1f] text-white" : "text-gray-400"
              )}
              asChild
            >
              {item.href === "/docs" ? (
                <Link href={item.href} target="_blank" rel="noopener noreferrer" title={item.name}>
                  <item.icon className="h-5 w-5" />
                </Link>
              ) : (
                <Link href={item.href} title={item.name}>
                  <item.icon className="h-5 w-5" />
                </Link>
              )}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Header - Logo */}
      <div className="p-3 border-b border-[#1f1f1f]">
        <Link href="/dev" className="flex flex-col items-start gap-1">
          <Image src="/logo-text.svg" width={100} height={100} alt="Collab" className="h-6 w-auto" />
          <span className="text-xs text-muted-foreground font-medium">Developer Console</span>
        </Link>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="p-2 space-y-2">
          {/* App Switcher - only show on app detail pages */}
          {pathname.startsWith("/dev/apps/") && pathname !== "/dev/apps" && pathname !== "/dev/apps/new" && (
            <div className="pb-2 border-b border-[#1f1f1f]">
              <AppSwitcher />
            </div>
          )}
          
          <div className="space-y-0.5">
            {navigationItems.map((item) => (
              <Button
                key={item.name}
                variant="ghost"
                className={cn(
                  "w-full justify-start h-7 px-2 text-sm hover:bg-[#1f1f1f] hover:text-white",
                  item.current ? "bg-[#1f1f1f] text-white" : "text-gray-400"
                )}
                asChild
              >
                {item.href === "/docs" ? (
                  <Link href={item.href} target="_blank" rel="noopener noreferrer">
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.name}
                  </Link>
                ) : (
                  <Link href={item.href}>
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.name}
                  </Link>
                )}
              </Button>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

