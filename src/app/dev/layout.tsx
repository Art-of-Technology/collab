"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Grid3X3,
  Book,
  Webhook,
  Settings,
  ArrowLeft,
  Shield,
  ClipboardCheck,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import AppSwitcher from "@/components/dev/AppSwitcher";

const navigationItems = [
  {
    name: "Dashboard",
    href: "/dev",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    name: "My Apps",
    href: "/dev/apps",
    icon: Grid3X3,
  },
  {
    name: "API Documentation",
    href: "/dev/docs",
    icon: Book,
  },
  {
    name: "Webhooks Overview",
    href: "/dev/webhooks",
    icon: Webhook,
  },
  {
    name: "Settings",
    href: "/dev/settings",
    icon: Settings,
  },
];

const adminItems = [
  {
    name: "App Review Queue",
    href: "/dev/manage",
    icon: ClipboardCheck,
  },
];

export default function DevLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isSystemAdmin = session?.user?.role === "SYSTEM_ADMIN";

  const relatedLinks = [
    ...(isSystemAdmin
      ? [
          {
            name: "Admin Dashboard",
            href: "/admin",
            icon: Shield,
          },
        ]
      : []),
  ];

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#090909] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#22c55e]" />
      </div>
    );
  }

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const showAppSwitcher =
    pathname.startsWith("/dev/apps/") &&
    pathname !== "/dev/apps" &&
    pathname !== "/dev/apps/new";

  const SidebarContent = () => (
    <>
      {/* Header - Collab Logo with Developer Console subtitle */}
      <div className="p-3 border-b border-[#1f1f1f]">
        <Link href="/dev" className="flex flex-col items-start gap-1">
          <Image
            src="/logo-text.svg"
            width={100}
            height={100}
            alt="Collab"
            className="h-6 w-auto"
          />
          <span className="text-xs text-gray-500 font-medium">
            Developer Console
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-3">
        {/* App Switcher - only show on app detail pages */}
        {showAppSwitcher && (
          <div className="pb-3 mb-3 border-b border-[#1f1f1f]">
            <AppSwitcher />
          </div>
        )}

        <nav className="space-y-0.5">
          {navigationItems.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start h-8 px-2 text-sm transition-colors",
                    active
                      ? "bg-[#1f1f1f] text-white"
                      : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                  )}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.name}
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Admin Section - only for SYSTEM_ADMIN */}
        {isSystemAdmin && (
          <>
            <div className="my-4 border-t border-[#1f1f1f]" />
            <div className="space-y-0.5">
              <p className="px-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Admin
              </p>
              {adminItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start h-8 px-2 text-sm transition-colors",
                        active
                          ? "bg-[#1f1f1f] text-white"
                          : "text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                      )}
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {item.name}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* Related Links */}
        {relatedLinks.length > 0 && (
          <>
            <div className="my-4 border-t border-[#1f1f1f]" />
            <div className="space-y-0.5">
              <p className="px-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Related
              </p>
              {relatedLinks.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start h-8 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.name}
                  </Button>
                </Link>
              ))}
            </div>
          </>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t border-[#1f1f1f]">
        <Link href="/">
          <Button
            variant="ghost"
            className="w-full justify-start h-8 px-2 text-sm text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Collab
          </Button>
        </Link>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#090909] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-[#1f1f1f] flex-col h-screen sticky top-0 bg-[#090909]">
        <SidebarContent />
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#090909] border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between p-3">
          <Link href="/dev" className="flex items-center gap-2">
            <Image
              src="/logo-icon.svg"
              width={32}
              height={32}
              alt="Collab"
              className="h-8 w-auto"
            />
            <span className="font-semibold text-sm">Developer Console</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="h-8 w-8"
          >
            {mobileMenuOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="md:hidden fixed top-[57px] left-0 bottom-0 w-64 bg-[#090909] border-r border-[#1f1f1f] z-50 flex flex-col">
            <SidebarContent />
          </aside>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto md:pt-0 pt-[57px]">
        <div className="max-w-6xl mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
