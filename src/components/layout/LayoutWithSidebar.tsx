"use client";

import React, { useMemo } from "react";
import SimplifiedSidebar from "@/components/layout/SimplifiedSidebar";
import RightSidebar from "@/components/layout/RightSidebar";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { ViewFiltersProvider } from "@/context/ViewFiltersContext";
import { AIProvider } from "@/context/AIContext";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ChatBar } from "@/components/ai/ChatBar";

interface LayoutWithSidebarProps {
  children: React.ReactNode;
  pathname: string;
}

export default function LayoutWithSidebar({
  children,
  pathname,
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

  return (
    <AIProvider>
      <ViewFiltersProvider>
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

        {/* Right Sidebar */}
        <RightSidebar />

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
                        bg-[#070708] border border-[#1f1f22] hover:bg-[#101011]
                        text-[#75757a] hover:text-[#fafafa] rounded-r-md rounded-l-none border-l-0 transition-all duration-200"
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
      </ViewFiltersProvider>
    </AIProvider>
  );
}