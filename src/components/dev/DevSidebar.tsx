"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Grid3X3,
  Book,
  Webhook,
  Settings,
  ArrowLeft,
  Shield,
  ClipboardCheck,
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
  const { data: session } = useSession();
  const isSystemAdmin = session?.user?.role === 'SYSTEM_ADMIN';

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
      external: true,
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

  // Admin-only items
  const adminItems = [
    {
      name: "App Review Queue",
      href: "/dev/manage",
      icon: ClipboardCheck,
      current: pathname.startsWith("/dev/manage"),
    },
  ];

  // Related links
  const relatedLinks = [
    ...(isSystemAdmin ? [{
      name: "Admin Dashboard",
      href: "/admin",
      icon: Shield,
    }] : []),
  ];

  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full bg-[#090909]">
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
              {item.external ? (
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

          {/* Admin items */}
          {isSystemAdmin && (
            <>
              <div className="border-t border-[#1f1f1f] my-2" />
              {adminItems.map((item) => (
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
                  <Link href={item.href} title={item.name}>
                    <item.icon className="h-5 w-5" />
                  </Link>
                </Button>
              ))}
            </>
          )}
        </div>

        {/* Footer - Back to Collab */}
        <div className="p-2 border-t border-[#1f1f1f]">
          <Button
            variant="ghost"
            size="icon"
            className="w-full h-10 text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
            asChild
          >
            <Link href="/" title="Back to Collab">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-w-0 bg-[#090909]">
      {/* Header - Collab Logo with Developer Console subtitle */}
      <div className="p-3 border-b border-[#1f1f1f]">
        <Link href="/dev" className="flex flex-col items-start gap-1">
          <Image src="/logo-text.svg" width={100} height={100} alt="Collab" className="h-6 w-auto" />
          <span className="text-xs text-gray-500 font-medium">Developer Console</span>
        </Link>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="px-2 py-3 space-y-2">
          {/* App Switcher - only show on app detail pages */}
          {pathname.startsWith("/dev/apps/") && pathname !== "/dev/apps" && pathname !== "/dev/apps/new" && (
            <div className="pb-2 border-b border-[#1f1f1f]">
              <AppSwitcher />
            </div>
          )}

          {/* Main Navigation */}
          <nav className="space-y-0.5">
            {navigationItems.map((item) => (
              <Button
                key={item.name}
                variant="ghost"
                className={cn(
                  "w-full justify-start h-8 px-2 text-sm transition-colors",
                  item.current
                    ? "bg-[#1f1f1f] text-white"
                    : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                )}
                asChild
              >
                {item.external ? (
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
          </nav>

          {/* Admin Section - only for SYSTEM_ADMIN */}
          {isSystemAdmin && (
            <>
              <div className="my-4 border-t border-[#1f1f1f]" />
              <div className="space-y-0.5">
                <p className="px-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Admin
                </p>
                {adminItems.map((item) => (
                  <Button
                    key={item.name}
                    variant="ghost"
                    className={cn(
                      "w-full justify-start h-8 px-2 text-sm transition-colors",
                      item.current
                        ? "bg-[#1f1f1f] text-white"
                        : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                    )}
                    asChild
                  >
                    <Link href={item.href}>
                      <item.icon className="mr-2 h-4 w-4" />
                      {item.name}
                    </Link>
                  </Button>
                ))}
              </div>
            </>
          )}

          {/* Related Links - only show if there are any */}
          {relatedLinks.length > 0 && (
            <>
              <div className="my-4 border-t border-[#1f1f1f]" />
              <div className="space-y-0.5">
                <p className="px-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Related
                </p>
                {relatedLinks.map((item) => (
                  <Button
                    key={item.href}
                    variant="ghost"
                    className="w-full justify-start h-8 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                    asChild
                  >
                    <Link href={item.href}>
                      <item.icon className="mr-2 h-4 w-4" />
                      {item.name}
                    </Link>
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer - Back to Collab */}
      <div className="p-2 border-t border-[#1f1f1f]">
        <Button
          variant="ghost"
          className="w-full justify-start h-8 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
          asChild
        >
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Collab
          </Link>
        </Button>
      </div>
    </div>
  );
}
