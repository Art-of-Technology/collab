"use client";

import React, { useMemo } from "react";
import { usePathname } from "next/navigation";
import SimplifiedSidebar from "@/components/layout/SimplifiedSidebar";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { AIProvider } from "@/context/AIContext";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ChatBar } from "@/components/ai/ChatBar";

interface LayoutWithSidebarProps {
  children: React.ReactNode;
  pathname: string;
}

export default function LayoutWithSidebar({
  children,
  pathname: layoutPathname,
}: LayoutWithSidebarProps) {
  // The layout knows only its own segment; the menu marks the page being read, so it needs the whole path.
  const pathname = usePathname() ?? layoutPathname;
  const {
    isCollapsedDesktop,
    isMobileOpen,
    toggleDesktop,
    toggleMobile,
    closeMobile,
    isMdUp,
    isCollapsed,
  } = useSidebar();
  const sidebarLeft = useMemo(() => {
    if (isMdUp) return "calc(var(--sidebar-width) + 24px)";
    if (isMobileOpen) return "calc(var(--sidebar-open))";
    return "0px";
  }, [isMdUp, isMobileOpen]);

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
        <main className="main-content" inert={isMobileOpen}>
          <div className="app-page-scroll h-full w-full overflow-auto">
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
              onNavigate={closeMobile}
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

        {/* Desktop sidebar toggle */}
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

      <div className="app-toolbar" inert={isMobileOpen}>
        <ChatBar onOpenMenu={toggleMobile} />
      </div>
    </AIProvider>
  );
}
