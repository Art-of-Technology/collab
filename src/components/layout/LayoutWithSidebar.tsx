"use client";

import React, { useMemo } from "react";
import Sidebar from "@/components/layout/Sidebar";
import RightSidebar from "@/components/layout/RightSidebar";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { ViewFiltersProvider } from "@/context/ViewFiltersContext";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import AssistantWrapper from "@/components/layout/AssistantWrapper";
import { useCommandMenu, CommandMenu } from "@/components/ui/command-menu";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

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
  const { open: commandMenuOpen, setOpen: setCommandMenuOpen } = useCommandMenu();

  const sidebarLeft = useMemo(() => {
    if (isMdUp) return "calc(var(--sidebar-width))";
    if (isMobileOpen) return "calc(var(--sidebar-open))";
    return "0px";
  }, [isMdUp, isMobileOpen]);

  return (
    <ViewFiltersProvider>
      <div className="h-screen bg-[#101011]">
        <div className="app-layout">
          <div
            className="app-sidebar hidden md:block"
            data-collapsed={isCollapsedDesktop}
          >
            <div className="app-sidebar__content overflow-y-auto">
              <Sidebar
                pathname={pathname}
                isCollapsed={isCollapsedDesktop}
                toggleSidebar={toggleDesktop}
              />
            </div>
          </div>

          {/* Main content + right sidebar */}
          <main className="bg-[#090909] flex h-full md:overflow-auto">
            <div className="flex-1 p-2 min-w-0 md:overflow-auto">
              <div className="h-full bg-[#101011] border border-[#1f1f1f] rounded-md overflow-y-auto">
                {children}
              </div>
            </div>
            <RightSidebar />
          </main>

          {/* Mobile overlay sidebar */}
          <div
            className="app-sidebar md:hidden"
            data-open={isMobileOpen}
            aria-modal="true"
            role="dialog"
          >
            <div className="h-full relative overflow-y-auto">
              <Sidebar
                pathname={pathname}
                isCollapsed={false}
                toggleSidebar={toggleMobile}
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
                         bg-[#090909] border border-[#1f1f1f] hover:bg-[#1a1a1a]
                         text-gray-400 hover:text-white rounded-r-md rounded-l-none border-l-0 shadow-md transition-all duration-200"
            style={{ left: `calc(${sidebarLeft} + 8px)` }}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRightIcon className="h-4 w-4" />
            ) : (
              <ChevronLeftIcon className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* AI Assistant, Chatbox, and Navigation */}
        <AssistantWrapper />
        {/* <AppDock /> */}
        <MobileBottomNav onOpenCommandMenu={() => setCommandMenuOpen(true)} />
        
        {/* Global Command Menu */}
        <CommandMenu
          open={commandMenuOpen}
          onOpenChange={setCommandMenuOpen}
        />
      </div>
    </ViewFiltersProvider>
  );
}