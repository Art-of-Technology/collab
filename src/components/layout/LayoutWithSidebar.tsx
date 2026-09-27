"use client";

import React, { useMemo } from "react";
import SimplifiedSidebar from "@/components/layout/SimplifiedSidebar";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { AIProvider } from "@/context/AIContext";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ChatBar } from "@/components/ai/ChatBar";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface LayoutWithSidebarProps {
  children: React.ReactNode;
  pathname: string;
  forgeProjectPaths?: string[];
}

export default function LayoutWithSidebar({
  children,
  pathname,
  forgeProjectPaths = [],
}: LayoutWithSidebarProps) {
  const {
    isCollapsedDesktop,
    isMobileOpen,
    toggleDesktop,
    toggleMobile,
    isMdUp,
    isCollapsed,
  } = useSidebar();
  const sidebarLeft = useMemo(() => {
    if (isMdUp) return "calc(var(--sidebar-width) + 24px)";
    if (isMobileOpen) return "calc(var(--sidebar-open))";
    return "0px";
  }, [isMdUp, isMobileOpen]);
  const currentPath = usePathname();
  const forgeProject = forgeProjectPaths.find(path => currentPath === path || currentPath?.startsWith(path + '/'));

  if (forgeProject) return <AIProvider>
    <div className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
      <nav aria-label="Project navigation" className="flex shrink-0 flex-wrap gap-4 border-b p-4 text-sm">
        <Link href={forgeProject + '/board'} className="underline underline-offset-4">Board</Link>
        <Link href={forgeProject + '/notes/memory'} className="underline underline-offset-4">Project memory</Link>
        <Link href={forgeProject + '/notes'} className="underline underline-offset-4">All notes</Link>
        <Link href={pathname + '/projects'} className="underline underline-offset-4">Projects</Link>
      </nav>
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  </AIProvider>;

  return (
    <AIProvider>
        <div className="app-layout">
        {/* Desktop Sidebar */}
        <div
          className="app-sidebar hidden md:block"
          data-collapsed={isCollapsedDesktop}
        >
          <div className="app-sidebar__content overflow-y-auto">
            <SimplifiedSidebar
              pathname={pathname}
              isCollapsed={isCollapsedDesktop}
            />
          </div>
        </div>

        {/* Main content area */}
        <main className="main-content">
          <div className="h-full w-full overflow-auto pb-14">
            {children}
          </div>
        </main>


        {/* Mobile overlay sidebar */}
        <div
          className="app-sidebar md:hidden"
          data-open={isMobileOpen}
          aria-modal="true"
          role="dialog"
        >
          <div className="h-full relative overflow-y-auto">
            <SimplifiedSidebar
              pathname={pathname}
              isCollapsed={false}
            />
          </div>
        </div>

        {/* Mobile backdrop overlay */}
        {isMobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
            onClick={toggleMobile}
          />
        )}

        {/* Desktop sidebar toggle - hidden on mobile since we have bottom nav */}
        <Button
          variant="ghost"
          size="icon"
          onClick={isMdUp ? toggleDesktop : toggleMobile}
          className="sidebar-toggle fixed top-1/2 -translate-y-1/2 z-40 w-[24px] hidden md:flex
                        bg-collab-950 border border-collab-700 hover:bg-collab-900
                        text-collab-500 hover:text-collab-50 rounded-r-md rounded-l-none border-l-0 transition-all duration-200"
          style={{ left: sidebarLeft }}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <ChevronLeftIcon className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Mobile Navigation */}
      <MobileBottomNav />

      {/* Persistent AI Chat Bar (unified search + AI) */}
      <ChatBar />
    </AIProvider>
  );
}
